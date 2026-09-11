# Construir el núcleo y exportarlo

Todo lo que hay que hacer **antes** de que una app pueda consumir el core: el toolchain, la
compilación, y la generación de los bindings por plataforma.

Si solo querés correr los tests, no necesitás este archivo — [TESTING.md](TESTING.md)
alcanza.

**Todos los comandos de acá se ejecutaron tal como están escritos**, desde `rust-core/`.
Ninguno está deducido del [CONTEXT.md](CONTEXT.md).

## Requisitos previos

```bash
rustup --version          # rustup 1.29.1
rustc --version           # rustc 1.98.1
cargo --version
```

**El toolchain se agrega por fase, no de golpe**, y cada instalación se verifica antes de
seguir. Esta tabla es la de [`CLAUDE.md`](../CLAUDE.md) y es la fuente de verdad:

| Fase | Qué agrega | Cómo se verifica |
|---|---|---|
| 0 | `rustup` + stable + clippy + rustfmt | `cargo --version` |
| 1 | nada — los dos crates se testean en el host | `cargo test --workspace` → 67 passed |
| 2 | `cargo install cargo-ndk` + 3 targets Android | `cargo ndk --version` |
| 3 | 2 targets iOS (`aarch64-apple-ios`, `-sim`) | `rustup target list --installed` |
| 4 | `uniffi-bindgen-react-native` (desde `apps/react-native`) | `npx ubrn --version` |
| 5 | target `wasm32-unknown-unknown` | `rustc --print cfg --target wasm32-unknown-unknown` |

## Compilar

```bash
cargo build --release              # artefactos del host: .dylib + .a
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

El perfil de release es `opt-level = "z"`, `lto = true`, `codegen-units = 1`,
`strip = true` y **`panic = "unwind"`**. Ese último no se cambia: con `abort` se desactiva
el `catch_unwind` de uniffi y cualquier pánico mata la app en vez de volver como error del
FFI. El detalle y la salvedad de wasm están en [README.md](README.md#reglas-que-no-se-negocian).

Los comandos de exportación por plataforma —`cargo ndk`, `xcodebuild -create-xcframework`,
`ubrn build android|ios|web`— viven en [CONTEXT.md](CONTEXT.md), que es su fuente única.

## Generar los bindings

No hace falta NDK ni targets de iOS para esto: `uniffi-bindgen` es el `[[bin]]` del propio
paquete `core_financiero` y lee la librería del host.

```bash
cargo build --release -p core_financiero
ls -la target/release/ | grep -E 'libcore_financiero\.(a|dylib)$'
```

Qué se debe ver — **dos** artefactos, porque `crates/ffi` declara
`crate-type = ["cdylib", "staticlib", "lib"]`:

```
-rw-r--r--@   1 tohure  staff  69281640 Sep 10 09:43 libcore_financiero.a
-rwxr-xr-x@   1 tohure  staff    442784 Sep 10 09:43 libcore_financiero.dylib
```

El **`.dylib`** (cdylib) es el que consume Android como `.so` y el que alimenta el
`uniffi-bindgen` de acá abajo: ~432 KB con el perfil de release del workspace
(`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "unwind"`).
La primera compilación en limpio tarda alrededor de 1 m 05 s.

El **`.a`** (staticlib) es el que pide `xcodebuild -create-xcframework -library` en la Fase
3. Sus ~66 MB no contradicen los 432 KB del `.dylib`: un staticlib es un archivo de objetos
con toda la `std` adentro y sin `strip`, y el linker se queda solo con lo que se usa al
armar la app. Genera los mismos bindings que el `.dylib`, byte por byte — verificado con
`diff` sobre los tres archivos Swift.

> **`crate-type` no se elige por target: el `.a` se construye para TODOS.** Solo iOS lo
> necesita, pero cargo emite los tres tipos de crate en cada build, para cada target. En la
> Fase 2 eso son **tres `.a` de ~66 MB con LTO** —uno por ABI de Android
> (`arm64-v8a`, `armeabi-v7a`, `x86_64`)— que nadie va a usar; en la Fase 5, uno más para
> wasm. Se paga en tiempo de build y en espacio de `target/`, no en el tamaño del `.so` que
> se embarca. Está escrito acá para que, cuando `cargo ndk` se ponga lento, nadie salga a
> buscarle la culpa al NDK ni a la máquina. Si molesta lo suficiente, la salida es un
> `--crate-type` en la línea de comandos o una feature de Cargo — **no** sacar `staticlib`
> del `Cargo.toml`, que es lo que rompería la Fase 3.

```bash
mkdir -p target/bindings-smoke/kotlin
cargo run --quiet --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language kotlin --no-format \
  --out-dir target/bindings-smoke/kotlin
find target/bindings-smoke/kotlin -name '*.kt'
```

Qué se debe ver — exit 0 y **un** `.kt`, en el paquete `uniffi.core_financiero`:

```
target/bindings-smoke/kotlin/uniffi/core_financiero/core_financiero.kt
```

```bash
mkdir -p target/bindings-smoke/swift
cargo run --quiet --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language swift --no-format \
  --out-dir target/bindings-smoke/swift
ls -la target/bindings-smoke/swift
```

Qué se debe ver — exit 0 y **los tres** archivos. Los tres importan: sin el `.h` y sin el
modulemap, el XCFramework de la Fase 3 compila pero no expone un solo símbolo.

```
total 144
drwxr-xr-x@ 5 tohure  staff    160 Sep 10 09:27 .
drwxr-xr-x@ 4 tohure  staff    128 Sep 10 09:27 ..
-rw-r--r--@ 1 tohure  staff  37913 Sep 10 09:27 core_financiero.swift
-rw-r--r--@ 1 tohure  staff  24652 Sep 10 09:27 core_financieroFFI.h
-rw-r--r--@ 1 tohure  staff    146 Sep 10 09:27 core_financieroFFI.modulemap
```

`--no-format` evita depender de `ktlint` / `swift-format`, que no están instalados. En las
Fases 2 y 3, si se quiere el código formateado, se saca el flag y se instala el formateador.

Los bindings salen a `target/`, que está en `.gitignore` (`/rust-core/target/`): son
artefactos generados y no se commitean. Corriendo desde `rust-core/`, el path es relativo a
ese directorio —`git status --porcelain target`, no `rust-core/target`, que desde acá sería
`rust-core/rust-core/` y solo devuelve un warning—; después de generar los bindings devuelve
vacío.

### Verificar que las nueve funciones cruzaron

Un chequeo por substring cuenta archivos, no declaraciones (`add` matchea también
`InvalidAmount`). Este verifica la **declaración real** en los tres artefactos, incluido el
símbolo de scaffolding del header C:

```bash
for f in add:add subtract:subtract execute_transfer:executeTransfer validate_cci:validateCci \
         calculate_itf:calculateItf validate_card:validateCard encrypt:encrypt decrypt:decrypt \
         core_version:coreVersion; do
  snake=${f%%:*}; camel=${f##*:}
  k=$(grep -c "fun \`$camel\`(" target/bindings-smoke/kotlin/uniffi/core_financiero/core_financiero.kt)
  s=$(grep -c "public func $camel(" target/bindings-smoke/swift/core_financiero.swift)
  h=$(grep -c "uniffi_core_financiero_fn_func_$snake(" target/bindings-smoke/swift/core_financieroFFI.h)
  printf "%-20s kotlin:%s swift:%s header:%s\n" "$snake" "$k" "$s" "$h"
done
```

Qué se debe ver — 9/9 en las tres columnas, ningún `0`:

```
add                  kotlin:1 swift:1 header:1
subtract             kotlin:1 swift:1 header:1
execute_transfer     kotlin:1 swift:1 header:1
validate_cci         kotlin:1 swift:1 header:1
calculate_itf        kotlin:1 swift:1 header:1
validate_card        kotlin:1 swift:1 header:1
encrypt              kotlin:1 swift:1 header:1
decrypt              kotlin:1 swift:1 header:1
core_version         kotlin:1 swift:1 header:1
```

Todos los montos cruzan como `String` / `kotlin.String`: **ninguna de las nueve firmas ni
ninguno de los cinco Records usa `Double`, `Float` ni `number`**. Ojo con verificar esto con
un `grep Double` sobre el archivo entero: da positivo (3 veces en el `.kt`, más
`readFloat`/`writeFloat` en el `.swift`) porque el **scaffolding** de uniffi trae los
lectores de todos los tipos que sabe serializar, los use este core o no. Lo que importa es
la superficie pública, y ahí no hay ninguno. `Vec<Account>` se mapea a `List<Account>` en Kotlin y
`[Account]` en Swift. Ojo con el nombre del enum de error, que **difiere por lenguaje**:
`DomainException` en Kotlin, `DomainError` en Swift.

### El `.so` de Android NO sirve para generar bindings

Verificado en la Fase 2, y vale la pena porque el error no dice la causa. El comando que uno
escribiría —apuntarle al `.so` que produjo `cargo ndk`— falla así:

```
No UniFFI metadata found in target/aarch64-linux-android/release/libcore_financiero.so
```

Dos razones independientes, cualquiera de las dos alcanza:

1. **El perfil de release lleva `strip = true`**, que borra los símbolos de metadata que
   `uniffi-bindgen` necesita leer. El `.so` que se embarca en el APK está stripeado a
   propósito —el tamaño del binario es criterio de la demo—, así que esto no se "arregla":
   se evita.
2. **En macOS el host no produce `.so`, produce `.dylib`.** Cualquier comando que diga
   `target/release/libcore_financiero.so` no puede funcionar en esta máquina, porque ese
   archivo no existe. `rust-core/CONTEXT.md` lo decía así y estaba roto; se corrigió.

**Se usa siempre el `.dylib` del host, para Kotlin y para Swift.** Los bindings que emite
uniffi no dependen de la arquitectura: son el mismo archivo salga de donde salga. Es el mismo
razonamiento que ya estaba escrito para iOS, donde bindgen lee el `.a` del host y los `.a`
por arquitectura existen solo para armar el XCFramework.

La consecuencia práctica es que **hay que haber construido el host al menos una vez** antes
de generar bindings para cualquier plataforma:

```bash
cargo build --release            # produce target/release/libcore_financiero.dylib
```

Los comandos de exportación completos, con su salida real, están en
[apps/android/README.md](../apps/android/README.md).

### El modulemap de Swift no se llama `module.modulemap`

uniffi 0.32 nombra el modulemap según el crate: genera **`core_financieroFFI.modulemap`**.
Pero `xcodebuild -create-xcframework -headers <dir>` exige que el directorio de headers
contenga un archivo llamado **`module.modulemap`**. Con el nombre generado tal cual, el
XCFramework se construye sin error y después `import core_financieroFFI` no resuelve — el
síntoma es "el XCFramework no exporta nada", y cuesta una tarde de debugging.

La Fase 3 tiene que renombrar o copiar el archivo dentro del directorio de headers:

```bash
cp target/bindings-smoke/swift/core_financieroFFI.modulemap \
   target/bindings-smoke/swift/module.modulemap
ls target/bindings-smoke/swift
cat target/bindings-smoke/swift/module.modulemap
```

Qué se debe ver — cuatro archivos, con `module.modulemap` presente, y adentro el módulo:

```
core_financiero.swift
core_financieroFFI.h
core_financieroFFI.modulemap
module.modulemap

module core_financieroFFI {
    header "core_financieroFFI.h"
    export *
    use "Darwin"
    use "_Builtin_stdbool"
    use "_Builtin_stdint"
}
```
