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
                    CoreFinancieroKit/Generated/core_financiero.swift  (carpeta sincronizada, la compila el KIT)
                    Generated/include/core_financieroFFI.h
                    Generated/include/module.modulemap              (renombrado — ver más abajo)
                                        │
              xcodebuild -create-xcframework -library <device> -headers include -library <sim> -headers include
                                        │
                         CoreFinanciero.xcframework (ios-arm64 + ios-arm64-simulator)
                                        │
        project.pbxproj: PBXBuildFile + PBXFileReference + Frameworks del target CoreFinancieroKit
                          y Frameworks del target ios-rust-test + grupo raíz
                                        │
              CoreFinancieroKit (framework estático) ── import CoreFinancieroKit ──> ios-rust-test.app
```

Los tres directorios generados (`Generated/`, `CoreFinancieroKit/Generated/`,
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

> **Esto envejeció, y hay que saberlo antes de copiar el destino de arriba.** Al instalarse un
> runtime de iOS más nuevo, `OS:latest` pasa a resolver a esa versión, y «iPhone 17 Pro» puede
> no existir para ella: `xcodebuild` corta con `Unable to find a device matching the provided
> destination specifier`. Hay que fijar el runtime a mano —`,OS=26.5`, o el que muestre
> `xcrun simctl list devices available`—. La instrucción vigente, con la salvedad, está en
> [README.md](README.md).

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
`strip = true`, y la salida fue leer el `.dylib` del host en su lugar. Aquí, contra lo
esperado, **el `.a` de release del host sí trajo la metadata de uniffi** y bindgen generó
los tres archivos sin error ni contingencia. No se investigó la causa exacta de la
diferencia (es plausible que `strip` afecte de forma distinta a un `staticlib` que a un
`cdylib`/`.so`), pero el hecho verificado es este: **en esta máquina, para este crate, el
comando del Step 5 del brief funcionó tal cual, sin necesitar leer el `.dylib`.** Se deja
constancia aquí porque el brief marcaba esto como punto de fricción esperado y no lo fue; si
una corrida futura sí da `No UniFFI metadata found`, la salida documentada en el brief
(leer `target/release/libcore_financiero.dylib` en vez del `.a`) sigue siendo válida.

## Step 6 — Repartir los tres archivos generados a sus dos destinos

El `.swift` lo compila **`CoreFinancieroKit`**, no la app — desde el split de la Task 2 del
plan `2026-09-17-ios-target-split`, el target que se lleva el borde FFI es el kit, y por eso
la carpeta sincronizada del Swift generado vive dentro de él. Los otros dos son headers del
XCFramework y se quedan afuera, en `Generated/include/`, porque eso lo consume
`xcodebuild -create-xcframework`, no el compilador de Swift.

**La trampa documentada, verificada:** `xcodebuild -create-xcframework -headers` exige que
el modulemap se llame exactamente `module.modulemap`. Con el nombre que genera uniffi
(`core_financieroFFI.modulemap`), el XCFramework se arma **sin error** y recién después
`import core_financieroFFI` no resuelve en Swift. La copia con el nombre correcto evita
descubrir esto en el Step 9.

```bash
cd apps/ios
mkdir -p Generated/include CoreFinancieroKit/Generated
mv Generated/core_financiero.swift     CoreFinancieroKit/Generated/
mv Generated/core_financieroFFI.h      Generated/include/
cp Generated/core_financieroFFI.modulemap Generated/include/module.modulemap
ls Generated Generated/include CoreFinancieroKit/Generated
```

Qué se vio:

```
Generated:
core_financieroFFI.modulemap
include

Generated/include:
core_financieroFFI.h
module.modulemap

CoreFinancieroKit/Generated:
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

## La estructura de targets

Desde el plan `2026-09-17-ios-target-split`, el proyecto deja de ser un único target y pasa a
dos:

| Target | Qué se lleva | Qué NO se lleva |
|---|---|---|
| **`CoreFinancieroKit`** | `Generated/core_financiero.swift` (el binding), `Adapter/` (el protocolo `CoreFinanciero`, `UniffiCoreFinanciero` y `ContractMessages`) y `Contract/` (`ContractSource`, `MessageSource` y sus implementaciones `Bundle*`) | Nada de `UI/`, ni `AppContainer`, ni el `Run Script` que copia los contratos |
| **`ios-rust-test`** (la app) | `UI/`, `Format/MoneyFormatter`, `AppContainer` y el `App` de SwiftUI | El `Generated/`, el adapter y el `Contract/` — ahora los consume vía `import CoreFinancieroKit` |

**`CoreFinancieroKit` es un framework estático** (`MACH_O_TYPE = staticlib`), no dinámico:
igual que la app misma enlaza el XCFramework de Rust sin "Embed", el kit tiene que enlazar
del mismo modo para no meter un segundo binario dinámico en el bundle de una POC que no
distribuye nada fuera del propio `.app`. La consecuencia práctica es que un framework
estático no embarca recursos — por eso el `Run Script` que copia `cases.json` y
`messages.es.json` al bundle de test **sigue viviendo en el target de la app**, no se movió
al kit. Es una divergencia deliberada con Android, donde los assets sí viven en el módulo
`:core-financiero`.

**No hizo falta ningún plan B del enlace.** La preocupación de entrada era que
`CoreFinanciero.xcframework` — que ya estaba enlazado por la app — no resolviera también
para el kit, o que hiciera falta separar el enlace del framework de Rust (declararlo solo en
un target y reexportarlo al otro, o recurrir a `-force_load`). No pasó: el XCFramework quedó
declarado en la fase `Frameworks` de **los dos** targets — el kit lo necesita para ver el
modulemap de `core_financieroFFI` al compilar `UniffiCoreFinanciero.swift`, y la app lo
necesita porque ahí ocurre el enlace final del binario—, y compiló y linkeó a la primera en
las tres corridas que lo ejercitaron (kit solo, simulador completo, aparato físico). El
detalle línea por línea de cómo quedó declarado está en el diff del commit `92b8b3c`.

**Por qué `ios-rust-testTests` no declara `CoreFinancieroKit` en su fase `Frameworks`, y por
qué eso no es un olvido.** El bundle de test es el único de los tres que **no** enlaza el kit
directamente — a diferencia de `ios-rust-test` y del propio `CoreFinancieroKit`, que sí lo
declaran cada uno en la suya. La próxima persona que abra el `pbxproj` y compare las tres fases
`Frameworks` va a leer esa ausencia como algo roto y va a querer "completarla". No hay que
hacerlo, y el motivo es la combinación de dos hechos ya establecidos en esta sección: el kit es
estático, y el bundle de test hostea **dentro de la app** vía `TEST_HOST` / `BUNDLE_LOADER`
(ver `DD8323A43053A1B00038F99E` en el `pbxproj`, la config `Debug` de `ios-rust-testTests`).
Como la app ya enlaza `CoreFinancieroKit` estáticamente, el código del kit —sus símbolos, su
metadata de tipos Swift, sus inicializadores estáticos— ya está adentro del binario de
`ios-rust-test.app` en el momento en que el test corre alojado ahí. Enlazar el kit **otra vez**
en el `.xctest` no le daría al test nada que no tenga ya: le agregaría una **segunda copia**
de esos mismos objetos —metadata de tipos duplicada, inicializadores estáticos corriendo dos
veces—, que es exactamente la clase de problema que un framework estático enlazado en más de
un lugar del mismo proceso puede producir. Lo único que el bundle de test necesita para que
`import CoreFinancieroKit` compile es el `.swiftmodule` del kit en `BUILT_PRODUCTS_DIR`, y eso
ya está disponible porque el kit es una dependencia de build de la app y las tres comparten el
mismo `BUILT_PRODUCTS_DIR` de la corrida. Enlazar es un problema de runtime (resolver
símbolos); importar para compilar es un problema de build (encontrar el módulo) — aquí solo
hace falta el segundo.

**Diagnóstico rápido si el borde FFI se rompe:** compilar el kit solo, sin la app ni las
pantallas de por medio:

```bash
xcodebuild build -project ios-rust-test.xcodeproj -target CoreFinancieroKit \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5'
```

Qué se debe ver: `** BUILD SUCCEEDED **`. Si falla aquí, el problema está en el binding
generado o en el XCFramework — no hace falta compilar las cinco pantallas para descartar
capas.

El `,OS=26.5` no es parte del comando original de la Fase 3 (ahí bastaba `name=iPhone 17
Pro` sin más): en esta máquina, al ejecutar este split, "OS:latest" resolvió a iOS 27.0 y el
simulador "iPhone 17 Pro" solo existe en el runtime 26.5, no en el 27.0. El síntoma es
`xcodebuild: error: Unable to find a device matching the provided destination specifier`. Si
en otra máquina "iPhone 17 Pro" sí existe en el runtime "latest", el `-destination` sin `OS=`
funciona igual; si no, ejecute `xcrun simctl list devices available` y agregue el `OS=` del
runtime donde ese modelo exista. El mismo ajuste aplica a los comandos de
[README.md](README.md) y [TESTING.md](TESTING.md).

Esto es lo que reemplaza al script de Ruby que creó el target nuevo con la gem `xcodeproj`:
ese script no se commitea porque no es re-ejecutable — corre una vez sobre un `.pbxproj` que
todavía no tiene el target, y correrlo dos veces duplicaría entradas. Lo que queda como
fuente de verdad reproducible es el `project.pbxproj` resultante (en git) y esta sección.

## Enlazar en Xcode y el smoke test

El XCFramework se declara a mano en `project.pbxproj` (los grupos sincronizados cubren
carpetas de fuentes, no `.xcframework`): sección `PBXBuildFile`, entrada en
`PBXFileReference`, `files` de la fase `Frameworks` de **cada** target que lo necesita —
`CoreFinancieroKit` y `ios-rust-test`—, y el archivo en el grupo raíz. Es una librería
estática: no lleva "Embed", se enlaza y desaparece dentro del binario. El detalle línea por
línea está en el diff del commit de esta tarea.

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

## Sacar el `coreVersion()` del `.a` a mano: un footgun verificado

Cuando hace falta confirmar el SHA de un artefacto **sin** correr la app ni el smoke
test —por ejemplo, para comparar contra otra plataforma antes de una demo—, la tentación es
leerlo directo del binario con `strings`. Hay una forma de hacerlo mal que **no falla
ruidoso**: devuelve un SHA con forma correcta y plausible, que no existe.

```bash
strings CoreFinanciero.xcframework/ios-arm64/libcore_financiero.a \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]{7,}' | sort -u
# → 1.0.0+959025fca   ← FALSO POSITIVO
```

**La causa:** `strings` no separa por terminador nulo los literales `&'static str` de un
binario de Rust — quedan empaquetados contiguos, sin ningún byte no imprimible entre uno y
el siguiente. El string de versión real está pegado, carácter a carácter, al próximo literal
del binario, que aquí resulta ser un mensaje de pánico:

```
1.0.0+959025fcalled `Result::unwrap()` on an `Err` valueFromUtf8Error...
```

El patrón `[0-9a-f]{7,}` — sin límite superior — es codicioso: seguía leyendo mientras
encontrara hex válido, y `c` y `a` de `called` lo son. Se comió dos caracteres del literal
siguiente y los pegó al SHA. El resultado, `959025fca`, tiene la forma exacta de un SHA
corto y no dispara ninguna alarma — tiene 9 caracteres, así que nada en el comando ni en la
salida avisa que está mal. Eso es lo que lo hace caro: la próxima persona que lo corra va a
asumir que el artefacto cambió, cuando no cambió.

**Acotar el cuantificador a `{7}` no arregla esto — reintroduce el mismo fallo.** La tentación
es pensar que 7 es "el largo exacto de un short SHA de git", pero no lo es:
`rust-core/crates/ffi/build.rs` arma el sufijo con `git rev-parse --short HEAD`, que respeta
`core.abbrev`. Su default es `auto` — el piso son 7 caracteres, pero **crece con la cantidad de
objetos del repositorio** en cuanto 7 dejan de alcanzar para ser únicos. El día que este
repositorio acumule los objetos suficientes para que `git rev-parse --short HEAD` empiece a
devolver 8 o más caracteres, `{7}` va a truncar en silencio ese SHA más largo y a devolver un
SHA de forma perfecta que no es el del artefacto — exactamente la clase de fallo que esta
sección denuncia, solo que provocado por el propio comando que se ofrece como corrección.

**La forma que no miente no extrae, compara.** En vez de recortar el string con una expresión
regular y confiar en que el largo coincida, hay que buscar el SHA conocido —el que devuelve
`git rev-parse --short HEAD` ahora mismo— como substring literal. Si no aparece, el comando no
imprime nada: "sin salida" es una señal inequívoca de que no coincide, porque el comando nunca
arma un SHA por su cuenta, solo confirma o no la presencia del que ya se le dio.

```bash
strings CoreFinanciero.xcframework/ios-arm64/libcore_financiero.a \
  | grep -F "1.0.0+$(git -C ../.. rev-parse --short HEAD)"
```

Corrido contra el estado de este repositorio al escribir esta sección, con HEAD en `bd1962d`:
no devuelve nada, y eso es lo correcto, no un fallo del comando. El XCFramework que hay en el
árbol quedó congelado en el commit `959025f` —el mismo que documenta el bloque anterior— y esta
tanda de arreglos es solo documentación, así que no se regeneró. Corrido contra el SHA que sí
tiene el artefacto, confirma:

```bash
strings CoreFinanciero.xcframework/ios-arm64/libcore_financiero.a | grep -F "1.0.0+959025f"
# → 1.0.0+959025fcalled `Result::unwrap()` on an `Err` value...   ← coincide, hay línea
```

El comando de arriba hay que correrlo recién **después** de regenerar el XCFramework desde el
HEAD que se quiere verificar. Si se corre contra un artefacto viejo, como aquí, la ausencia de
salida es la señal correcta de que hace falta reconstruir — no hay que "arreglarlo" para que
devuelva algo.

**El artefacto es una pista, no la autoridad.** Si alguna vez este comando y la pantalla
discrepan, lo que vale es lo que se ve en pantalla — `strings` sobre un binario de Rust puede
mentir de esta forma silenciosa; una captura o una corrida de la app no.

## Herramientas de agente

Tras cualquier movimiento estructural de archivos (como el reparto del Step 6 o el armado
del XCFramework del Step 7), correr `codegraph index --force`: el watcher no capta un `mv`
de árbol entero.
