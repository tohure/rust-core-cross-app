# Construir los bindings JSI y generarlos

Todo lo que hace falta para pasar de `rust-core/crates/ffi` a `src/generated/core_financiero.ts`
y al Turbo Module de Android. **Todos los comandos de acá se ejecutaron tal como están
escritos**, desde `apps/react-native/`, en la primera corrida real de `ubrn` sobre este
proyecto. Ninguno está deducido del [CONTEXT.md](CONTEXT.md).

## Requisitos previos verificados

```bash
node --version   # v22.16.0
pnpm --version   # 11.21.0
cargo --version  # cargo 1.98.1 (797e8a9bc 2026-08-05)
rustup target list --installed
```

```
aarch64-apple-darwin
aarch64-apple-ios
aarch64-apple-ios-sim
aarch64-linux-android
armv7-linux-androideabi
x86_64-linux-android
```

Los tres targets Android (`aarch64-linux-android`, `armv7-linux-androideabi`,
`x86_64-linux-android`) ya estaban instalados desde la Fase 2. `ubrn` no instala targets de
Rust por sí solo: si faltara alguno, `cargo ndk` falla con un error de toolchain, no con un
mensaje de `ubrn`.

```bash
ls "$HOME/Library/Android/sdk/ndk/"
```

```
29.0.14033849
30.0.14904198
30.0.16248370
```

Se usó **30.0.16248370**, que cumple el requisito de r27+. Con un NDK anterior a r27 la
librería compila igual pero crashea al cargar en dispositivos con páginas de 16 KB — y de
hecho el `CMakeLists.txt` que `ubrn` generó (ver más abajo) ya agrega
`-Wl,-z,max-page-size=16384` al linker por su cuenta.

`ubrn` no tiene flag `--version`. La versión instalada se confirma indirectamente:

```bash
pnpm ls uniffi-bindgen-react-native
```

```
@banco/core-financiero@0.1.0 /Users/tohure/Documents/Projects/rust-core-cross-app/apps/react-native
└── uniffi-bindgen-react-native@0.31.0-5
```

`0.31.0-5` empareja con uniffi `0.31.2` del core (`ubrn` fija `=0.31`; por eso el core está en
0.31 y no en 0.32). Ese emparejamiento es deliberado y no se toca.

## `ubrn.config.yaml`, línea por línea

```yaml
rust:
  directory: ../../rust-core
  manifestPath: crates/ffi/Cargo.toml
bindings:
  cpp: cpp/bindings
  ts: src/generated
android:
  targets: [arm64-v8a, armeabi-v7a, x86_64]
```

- **`rust.directory`**: raíz del workspace Rust, relativa a este archivo. `../../rust-core`
  apunta a la raíz del repo — `apps/react-native/../../rust-core` resuelve a `rust-core/`.
- **`rust.manifestPath`**: el `Cargo.toml` del crate a exportar, relativo a `rust.directory`.
  Es **`crates/ffi`**, nunca `crates/domain` — `domain` no declara uniffi y no tiene macros
  `#[uniffi::export]`; es `ffi` el único crate con la fachada.
- **`bindings.cpp`**: dónde `ubrn` escribe el puente C++ que compila el Turbo Module
  (`cpp/bindings/`, ver más abajo). Artefacto generado, no se edita.
- **`bindings.ts`**: dónde `ubrn` escribe los bindings TypeScript. Predicho como
  `src/generated` en el CONTEXT y así se usó; el nombre del **archivo** dentro de ese
  directorio lo decide `ubrn` a partir del crate, no este YAML — ver el resultado real en la
  sección siguiente.
- **`android.targets`**: los tres ABI que empaqueta la demo (`arm64-v8a`, `armeabi-v7a`,
  `x86_64`), en la nomenclatura de Android — no la tripleta de Rust (`aarch64-linux-android`,
  etc.). `ubrn` traduce internamente.

## Construir y generar para Android

**El flag `-r`/`--release` no es opcional para este proyecto.** La pantalla de Benchmark
compara el core contra una baseline de punto flotante nativo, y es el centro de la demo:
medir un core compilado en debug lo haría ver mucho más lento de lo que realmente es y
distorsionaría justo la comparación que la POC existe para mostrar. Además el perfil de
release (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`) es deliberado
en todo el proyecto, y el tamaño del binario es criterio de la demo.

```bash
cd apps/react-native
export PATH="$HOME/.cargo/bin:$PATH"
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/30.0.16248370"
pnpm exec ubrn build android --release --and-generate
```

**La primera vez, esto compila `ubrn` mismo con cargo** antes de poder generar nada — el CLI
`uniffi-bindgen-react-native` es un binario Rust (`uniffi_bindgen`, `uniffi_udl`, `askama`,
etc. aparecen en la lista de crates que compila), no un script JS. Esa compilación de la
propia herramienta se ve entremezclada con la del crate `core_financiero` en la salida; no es
un paso aparte.

Salida real (recortada — compila el workspace de `ubrn` y luego, para cada uno de los tres
ABI, `core_financiero` y `domain`, en perfil `release`):

```
Running cd ".../apps/react-native/../../rust-core/crates/ffi" && \
  CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
  "cargo" "ndk" "--manifest-path" ".../crates/ffi/Cargo.toml" \
  "--target" "arm64-v8a" "--platform" "23" "--" "build" "--release"
    Building arm64-v8a (aarch64-linux-android)
   Compiling proc-macro2 v1.0.107
   ...
   Compiling core_financiero v1.0.0 (.../rust-core/crates/ffi)
   Compiling domain v1.0.0 (.../rust-core/crates/domain)
   Compiling uniffi_bindgen v0.31.2
    Finished `release` profile [optimized] target(s) in ...
Running ... "--target" "armeabi-v7a" ... "--release"
    Building armeabi-v7a (armv7-linux-androideabi)
   ...
Running ... "--target" "x86_64" ... "--release"
    Building x86_64 (x86_64-linux-android)
   ...
    Finished `release` profile [optimized] target(s) in 52.99s
-- Copying into jniLibs directory
rm -Rf .../apps/react-native/android/src/main/jniLibs
cp .../rust-core/target/aarch64-linux-android/release/libcore_financiero.a .../jniLibs/arm64-v8a/libcore_financiero.a
cp .../rust-core/target/x86_64-linux-android/release/libcore_financiero.a  .../jniLibs/x86_64/libcore_financiero.a
cp .../rust-core/target/armv7-linux-androideabi/release/libcore_financiero.a .../jniLibs/armeabi-v7a/libcore_financiero.a
Generating bindings and turbo module from lib file .../target/aarch64-linux-android/release/libcore_financiero.a
Skipping formatting C++. Is clang-format installed?
```

Exit code `0`. Sin `error`, sin `warning`, sin `panic` en el log completo (verificado con
`grep -inE "error|warning|panic"`).

Tamaños reales de lo que copia a `jniLibs/` (el `.a` que se enlaza estáticamente dentro del
`.so` del Turbo Module — ver más abajo):

```
arm64-v8a/libcore_financiero.a     86 414 486 bytes  (~82 MB)
armeabi-v7a/libcore_financiero.a   76 781 550 bytes  (~73 MB)
x86_64/libcore_financiero.a        81 190 196 bytes  (~77 MB)
```

Bastante más chicos que los ~250 MB por ABI del build en `dev` profile (el error que se
corrigió acá), y del mismo orden que los ~66 MB del `.a` de release con LTO que documenta
`rust-core/BUILD.md` para el host. Cargo también deja un `.so` (cdylib) en
`rust-core/target/<triple>/release/`, mucho más chico —524 KB / 320 KB / 576 KB por ABI,
comparable al `.dylib` del host—, pero **no es el que `ubrn` usa**: el pipeline de Android
de `ubrn` enlaza el `.a` (staticlib) dentro de su propio `libbanco-core-financiero.so`, vía
CMake, en vez de cargar el cdylib suelto como hace `apps/android` con JNA.

**Un intento anterior sin `--release` construyó en perfil `dev` (`unoptimized + debuginfo`,
~250 MB por `.a`) y quedó documentado acá como advertencia**: `ubrn build android` sin el
flag construye en debug por defecto (`pnpm exec ubrn build android --help` lo confirma:
`-r, --release  Build a release build`, opcional, y `-p, --profile <PROFILE>` para un perfil
específico). El comando de arriba, con `--release`, es el que hay que usar siempre.

## Qué se debe ver después

```bash
ls src/generated/
```

```
core_financiero-ffi.ts
core_financiero.ts
```

`core_financiero.ts` es el archivo con la superficie pública (las nueve funciones, los cinco
Records, `DomainError` / `DomainError_Tags`); `core_financiero-ffi.ts` es una capa inferior de
soporte (tipos de callback de futuros de Rust) que ese primer archivo importa. El nombre
coincide con lo que el CONTEXT venía prediciendo.

`ubrn --and-generate` no solo escribe `src/generated/`: también reescribe por completo
`android/CMakeLists.txt` (enlaza estáticamente el `.a` de cada ABI dentro de un único
`.so` de Turbo Module, en vez de cargarlo suelto con JNA como hace `apps/android`), y crea
`android/build.gradle`, `android/cpp-adapter.cpp`, todo `android/src/`
(`CoreFinancieroModule.kt`, `CoreFinancieroPackage.kt`, el `AndroidManifest.xml` y los
`jniLibs/*.a`) y `src/NativeCoreFinanciero.ts`. Todo eso es artefacto generado — está en
`.gitignore` (no se comitea) y **nunca se edita a mano**: si algo ahí sale mal, se corrige en
`rust-core` o en `ubrn.config.yaml` y se vuelve a correr este mismo comando.

**`src/index.tsx` es la única excepción**, y a propósito no está en `.gitignore` ni se
commitea todavía: `ubrn` lo generó en esta primera corrida como reexport automático
(instala el crate en el runtime JSI y reexporta `src/generated/core_financiero`), pero una
tarea siguiente lo convierte en un archivo nuestro, escrito a mano — no lo toques hasta que
esa tarea defina cómo queda la configuración de `ubrn.config.yaml` para eso.

## Limpiar

```bash
pnpm run ubrn:clean   # rm -rf cpp/ src/generated src/generated-napi src/generated-wasm
```
