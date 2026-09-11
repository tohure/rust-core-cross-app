# Construir la app

Todo lo necesario **antes** de poder correr la app: el toolchain de Rust para iOS, los dos
`.a` (dispositivo y simulador), los bindings Swift, el XCFramework y su enlace en el
proyecto de Xcode.

**Todos los comandos de este archivo se ejecutaron tal como están escritos**, y la salida
que sigue a cada uno es la que devolvieron. Ninguno está deducido.

## El pipeline, de un vistazo

```
rust-core/crates/ffi
   │
   ├── cargo build --release --target aarch64-apple-ios      ──> libcore_financiero.a (dispositivo)
   ├── cargo build --release --target aarch64-apple-ios-sim  ──> libcore_financiero.a (simulador)
   ├── cargo build --release (host, aarch64-apple-darwin)     ──> libcore_financiero.a (solo para bindgen)
   │
   └── uniffi-bindgen generate (lee el .a del HOST) ──> apps/ios/Generated/
                                                            core_financiero.swift
                                                            core_financieroFFI.h
                                                            core_financieroFFI.modulemap
                                                                     │
                              se reparten a sus dos destinos ────────┘
                                        │
                    ios-rust-test/Generated/core_financiero.swift  (carpeta sincronizada, la compila la app)
                    Generated/include/core_financieroFFI.h
                    Generated/include/module.modulemap              (renombrado — ver más abajo)
                                        │
              xcodebuild -create-xcframework -library <device> -headers include -library <sim> -headers include
                                        │
                         CoreFinanciero.xcframework (ios-arm64 + ios-arm64-simulator)
                                        │
        project.pbxproj: PBXBuildFile + PBXFileReference + Frameworks del target de app + grupo raíz
                                        │
                         ios-rust-test.app (enlace estático, sin "Embed")
```

Los tres directorios generados (`Generated/`, `ios-rust-test/Generated/`,
`CoreFinanciero.xcframework/`) están en el `.gitignore` y se regeneran. Nunca se editan a
mano: si algo generado está mal, se corrige en `rust-core` y se regenera desde ahí.

## Requisitos previos

Ya instalados en esta máquina, verificados antes de empezar:

```bash
cargo --version    # cargo 1.98.1 (797e8a9bc 2026-08-05)
rustc --version    # rustc 1.98.1 (48a229cea 2026-09-01)
xcodebuild -version
# Xcode 26.6
# Build version 17F113
xcodebuild -showsdks | grep -i ios
# iOS SDKs:
#     iOS 26.5                       -sdk iphoneos26.5
# iOS Simulator SDKs:
#     Simulator - iOS 26.5           -sdk iphonesimulator26.5
```

`cargo`/`rustc`/`rustup` están instalados vía `rustup` en `~/.cargo/bin`, que no viene en el
`PATH` por defecto de este shell: hace falta `export PATH="$HOME/.cargo/bin:$PATH"` antes de
cada uno de los comandos de Rust de este archivo.

### Simulador usado

"iPhone 17 Pro" existe en esta máquina (`xcrun simctl list devices available`), así que el
destino de todos los `xcodebuild test` de esta fase es, verbatim:

```
-destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Las tareas siguientes de la Fase 3 deben usar el mismo destino, para no introducir una
segunda variable al comparar resultados.

## Step 1 — Instalar los dos targets de Rust

```bash
export PATH="$HOME/.cargo/bin:$PATH"
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
rustup target list --installed
```

Qué se vio:

```
info: downloading 2 components
aarch64-apple-darwin
aarch64-apple-ios
aarch64-apple-ios-sim
aarch64-linux-android
armv7-linux-androideabi
x86_64-linux-android
```

Los dos targets de iOS quedaron instalados junto a los tres de Android y el del host que ya
estaban de la Fase 0/2.

## Step 4 — Compilar los dos `.a` de iOS y el del host

```bash
cd rust-core
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
cargo build --release          # el artefacto del HOST, solo para bindgen
ls -la target/aarch64-apple-ios/release/libcore_financiero.a \
       target/aarch64-apple-ios-sim/release/libcore_financiero.a
```

Qué se vio — los tres builds cerraron en verde:

```
Finished `release` profile [optimized] target(s) in 59.94s   # aarch64-apple-ios
Finished `release` profile [optimized] target(s) in 59.62s   # aarch64-apple-ios-sim
Finished `release` profile [optimized] target(s) in 17.72s   # host (ya tenía cache de dependencias)
```

Y los dos `.a`, binarios distintos, del tamaño esperado:

```
-rw-r--r--  69122328  target/aarch64-apple-ios-sim/release/libcore_financiero.a
-rw-r--r--  69061728  target/aarch64-apple-ios/release/libcore_financiero.a
```

## Step 5 — Generar los bindings Swift

```bash
cd rust-core
cargo run --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.a \
  --language swift --out-dir ../apps/ios/Generated
ls ../apps/ios/Generated
```

Qué se vio — funcionó **directo contra el `.a` de release del host**, sin necesitar la
contingencia del `.dylib`:

```
Compiling core_financiero v1.0.0 (.../rust-core/crates/ffi)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.03s
     Running `target/debug/uniffi-bindgen generate --library target/release/libcore_financiero.a --language swift --out-dir ../apps/ios/Generated`
```

```
Generated/core_financiero.swift
Generated/core_financieroFFI.h
Generated/core_financieroFFI.modulemap
```

**Nota sobre la contingencia documentada en el brief.** En Android (Fase 2), leer el
`.so`/`.a` de release falló con `No UniFFI metadata found` porque el perfil lleva
`strip = true`, y la salida fue leer el `.dylib` del host en su lugar. Acá, contra lo
esperado, **el `.a` de release del host sí trajo la metadata de uniffi** y bindgen generó
los tres archivos sin error ni contingencia. No se investigó la causa exacta de la
diferencia (es plausible que `strip` afecte de forma distinta a un `staticlib` que a un
`cdylib`/`.so`), pero el hecho verificado es este: **en esta máquina, para este crate, el
comando del Step 5 del brief funcionó tal cual, sin necesitar leer el `.dylib`.** Se deja
constancia acá porque el brief marcaba esto como punto de fricción esperado y no lo fue; si
una corrida futura sí da `No UniFFI metadata found`, la salida documentada en el brief
(leer `target/release/libcore_financiero.dylib` en vez del `.a`) sigue siendo válida.

## Step 6 — Repartir los tres archivos generados a sus dos destinos

El `.swift` lo compila la app, así que va dentro de la carpeta sincronizada; los otros dos
son headers del XCFramework y se quedan afuera.

**La trampa documentada, verificada:** `xcodebuild -create-xcframework -headers` exige que
el modulemap se llame exactamente `module.modulemap`. Con el nombre que genera uniffi
(`core_financieroFFI.modulemap`), el XCFramework se arma **sin error** y recién después
`import core_financieroFFI` no resuelve en Swift. La copia con el nombre correcto evita
descubrir esto en el Step 9.

```bash
cd apps/ios
mkdir -p Generated/include ios-rust-test/Generated
mv Generated/core_financiero.swift     ios-rust-test/Generated/
mv Generated/core_financieroFFI.h      Generated/include/
cp Generated/core_financieroFFI.modulemap Generated/include/module.modulemap
ls Generated Generated/include ios-rust-test/Generated
```

Qué se vio:

```
Generated:
core_financieroFFI.modulemap
include

Generated/include:
core_financieroFFI.h
module.modulemap

ios-rust-test/Generated:
core_financiero.swift
```

## Step 7 — Armar el XCFramework

`-headers` va una vez por cada `-library`, inmediatamente después del suyo.

```bash
cd rust-core
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a \
  -headers ../apps/ios/Generated/include \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a \
  -headers ../apps/ios/Generated/include \
  -output ../apps/ios/CoreFinanciero.xcframework
ls ../apps/ios/CoreFinanciero.xcframework
```

Qué se vio:

```
xcframework successfully written out to: .../apps/ios/CoreFinanciero.xcframework
```

```
Info.plist
ios-arm64
ios-arm64-simulator
```

Los dos slices están presentes. Si solo apareciera uno, faltaría un `.a` y la app no
correría en la mitad de los aparatos (dispositivo real o simulador, según cuál falte).

## Enlazar en Xcode y el smoke test

El XCFramework se declara a mano en `project.pbxproj` (los grupos sincronizados cubren
carpetas de fuentes, no `.xcframework`): sección `PBXBuildFile`, entrada en
`PBXFileReference`, `files` de la fase `Frameworks` del target de app, y el archivo en el
grupo raíz. Es una librería estática: no lleva "Embed", se enlaza y desaparece dentro del
binario. El detalle línea por línea está en el diff del commit de esta tarea.

El smoke test (`apps/ios/ios-rust-testTests/CoreSmokeTest.swift`) llama a `coreVersion()` y
verifica que el string no esté vacío y contenga `"+"`. Antes de enlazar el XCFramework,
`xcodebuild test` falla al compilar con `cannot find 'coreVersion' in scope`; después,
`CoreSmokeTest/coreVersionCrossesTheBoundary()` pasa. El detalle de ambas corridas está en
`.superpowers/sdd/2026-09-10-phase-3-app-ios/task-1-report.md`.

Nota de entorno: la primera corrida de `xcodebuild test` después de enlazar el framework
falló por un error del simulador ajeno al código (`Application failed preflight checks`,
`Busy`, sin ningún simulador booteado en ese momento). Repetir el mismo comando sin cambios
resolvió el problema. Si vuelve a aparecer, verificar `xcrun simctl list devices | grep
booted` y reintentar.

## Herramientas de agente

Tras cualquier movimiento estructural de archivos (como el reparto del Step 6 o el armado
del XCFramework del Step 7), correr `codegraph index --force`: el watcher no capta un `mv`
de árbol entero.
