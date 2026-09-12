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

Este mismo comando está envuelto en `package.json` como `pnpm run ubrn:android` — ver la
sección [Scripts](#scripts) más abajo. Los dos hacen exactamente lo mismo; a partir de acá
`BUILD.md` usa el script.

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
`jniLibs/*.a`) y `src/NativeCoreFinanciero.ts`. El paso de turbo-module escribe además
`src/bindings.tsx`, `CoreFinanciero.podspec` e `ios/CoreFinanciero.{h,mm}` — el podspec llevaba
comiteada la versión del esqueleto de bob hasta que la primera regeneración lo reescribió con la
suya, que es la que vale. Todo eso es artefacto generado — está en
`.gitignore` (no se comitea) y **nunca se edita a mano**: si algo ahí sale mal, se corrige en
`rust-core` o en `ubrn.config.yaml` y se vuelve a correr este mismo comando.

**`src/index.tsx` es la única excepción**, y a propósito no está en `.gitignore` ni se
commitea todavía: `ubrn` lo generó en esta primera corrida como reexport automático
(instala el crate en el runtime JSI y reexporta `src/generated/core_financiero`), pero una
tarea siguiente lo convierte en un archivo nuestro, escrito a mano — no lo toques hasta que
esa tarea defina cómo queda la configuración de `ubrn.config.yaml` para eso.

## Scripts

`package.json` envuelve los comandos de `ubrn` en cuatro scripts — son la interfaz que
`CONTEXT.md` documenta para el paquete:

```json
"ubrn:android": "ubrn build android --release --and-generate",
"ubrn:ios": "ubrn build ios --release --and-generate && (cd example/ios && pod install)",
"ubrn:wasm": "ubrn build wasm2 --release --and-generate",
"ubrn:clean": "rm -rf cpp/ src/generated src/generated-napi src/generated-wasm src/bindings.tsx"
```

Los tres primeros llevan `--release` por el mismo motivo de siempre: el Benchmark es el
centro de la demo y un core en debug distorsiona la comparación, y el perfil de release es
deliberado en todo el proyecto — el tamaño del binario es criterio de la demo.
`pnpm exec ubrn build wasm2 --help` confirma que `wasm2` acepta `-r`/`--release` igual que
`android` e `ios` (los tres subcomandos comparten los mismos `CommonBuildArgs` en el propio
código de `ubrn`); no hay ninguna razón para que ese tercero se quede en debug. `ubrn:ios` y
`ubrn:wasm` todavía no se corrieron ni una vez: se agregan los scripts porque el CONTEXT ya
los documenta como parte de la interfaz del paquete, pero generar para esas plataformas es
trabajo de otras tareas.

## Limpiar y regenerar — corrida real

**`ubrn:clean` no borra todo lo que `ubrn` genera, solo el material multiplataforma**
(`cpp/`, los tres `src/generated*` y `src/bindings.tsx`). No toca `android/build.gradle`,
`android/CMakeLists.txt`, `android/cpp-adapter.cpp` ni `android/src/` — esos se sobrescriben
solos en la próxima corrida de `ubrn build android --and-generate`, así que borrarlos en el
clean sería trabajo redundante, no protección extra.

```bash
$ pnpm run ubrn:clean
$ rm -rf cpp/ src/generated src/generated-napi src/generated-wasm src/bindings.tsx
```

Salida real — exit `0`, sin nada más que imprimir (`rm -rf` es silencioso). Verificado con
`ls` inmediatamente después:

```
$ ls cpp src/generated src/generated-napi src/generated-wasm src/bindings.tsx
ls: cpp: No such file or directory
ls: src/bindings.tsx: No such file or directory
ls: src/generated: No such file or directory
ls: src/generated-napi: No such file or directory
ls: src/generated-wasm: No such file or directory
```

`src/generated-napi`, `src/generated-wasm` y `src/bindings.tsx` ya no existían de entrada
—esta app todavía no generó para esos flavours—, y el `rm -rf` no falla por eso (la `-f`
hace que un path inexistente no sea error). Lo que sí existía y se borró de verdad fue
`cpp/` (los cuatro archivos de la Task 7 original) y `src/generated/` (`core_financiero.ts`
y `core_financiero-ffi.ts`).

Se confirmó además que el `clean` **no tocó** lo que no debía —`android/build.gradle`,
`android/cpp-adapter.cpp`, `android/CMakeLists.txt`, los `.a` de `android/src/main/jniLibs/`,
los `.kt` de `android/src/main/java/`, `src/index.tsx`, `src/NativeCoreFinanciero.ts`— todos
seguían presentes después del `rm -rf`, con su mtime sin cambiar.

```bash
$ pnpm run ubrn:android
$ ubrn build android --release --and-generate
Running ... "--target" "arm64-v8a" ... "build" "--profile" "release"
    Building arm64-v8a (aarch64-linux-android)
   Compiling core_financiero v1.0.0 (.../rust-core/crates/ffi)
    Finished `release` profile [optimized] target(s) in 21.92s
Running ... "--target" "armeabi-v7a" ... "build" "--profile" "release"
    Building armeabi-v7a (armv7-linux-androideabi)
   Compiling core_financiero v1.0.0 (.../rust-core/crates/ffi)
    Finished `release` profile [optimized] target(s) in 19.22s
Running ... "--target" "x86_64" ... "build" "--profile" "release"
    Building x86_64 (x86_64-linux-android)
   Compiling core_financiero v1.0.0 (.../rust-core/crates/ffi)
    Finished `release` profile [optimized] target(s) in 17.29s
-- Copying into jniLibs directory
rm -Rf .../android/src/main/jniLibs
cp .../release/libcore_financiero.a .../jniLibs/arm64-v8a/libcore_financiero.a
cp .../release/libcore_financiero.a .../jniLibs/armeabi-v7a/libcore_financiero.a
cp .../release/libcore_financiero.a .../jniLibs/x86_64/libcore_financiero.a
Generating bindings and turbo module from lib file .../release/libcore_financiero.a
Skipping formatting C++. Is clang-format installed?
```

Mucho más rápido que la primera corrida (~1 min en total, contra los ~1 min 30 s de antes):
`cargo` ya tenía en caché todas las dependencias del workspace de `ubrn` y del crate
`core_financiero` de la corrida anterior; solo tuvo que recompilar `core_financiero` mismo
para las tres ABI. Exit `0`, sin `error`/`warning`/`panic`.

**Nada quedó sin regenerar.** `cpp/` volvió con sus cuatro archivos
(`banco-core-financiero.{cpp,h}`, `bindings/core_financiero.{cpp,hpp}`), `src/generated/`
volvió con los mismos dos archivos de siempre, y los tres `.a` de `jniLibs/` salieron
**byte por byte idénticos** a los de la corrida anterior (mismo tamaño exacto:
86 414 486 / 76 781 550 / 81 190 196 — build reproducible). Recontrasté el gate completo
sobre el archivo regenerado y no cambió nada: las nueve funciones siguen en `1`,
`DomainError_Tags` sigue siendo el mismo `enum` de nueve valores, `simulatedLatencyMs` sigue
siendo el único `number`. `ubrn:android` no toca `android/build.gradle`,
`CMakeLists.txt`, `cpp-adapter.cpp` ni `android/src/main/java/` como archivos *nuevos* — los
**reescribe** con el mismo contenido de siempre (mtime actualizado, contenido idéntico),
consistente con que es un `--and-generate` completo y determinístico, no incremental.

## El smoke JSI

El gate de la fase, y el equivalente exacto de lo que la Fase 2 probó con `System.loadLibrary`
y la Fase 3 con el slice `aarch64-apple-ios`: que el Turbo Module se registra y que los
símbolos del core resuelven. Antes de esto, ninguna pantalla significa nada.

```bash
cd apps/react-native/example
adb devices                                        # un aparato o emulador en estado `device`
pnpm exec react-native start --reset-cache &       # Metro, en otra terminal
pnpm exec react-native run-android --no-packager
```

**Qué se debe ver en la pantalla del aparato:** un único string con forma `1.0.0+<sha corto>`,
centrado, y nada más. Corrida real sobre un emulador Pixel 9 Pro API 36 (arm64-v8a):

```
1.0.0+288ee44
```

El campo de error tiene que quedar **vacío**. Si aparece texto ahí, o si la pantalla queda en
blanco, el Turbo Module no se registró o los símbolos no resolvieron.

Para leer la pantalla sin mirarla —útil en CI o por ssh—:

```bash
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb shell cat /sdcard/ui.xml | tr '>' '>\n' | grep -o 'text="[^"]*"' | grep -v 'text=""'
```

### El SHA en pantalla puede ser anterior al HEAD, y es correcto

```bash
git rev-parse --short HEAD
```

`core_version()` **congela el SHA del momento en que se compiló el core**, no el del HEAD
actual. En la corrida de arriba la pantalla decía `288ee44` con HEAD en `21b4553`: el `.a` se
construyó bajo `288ee44` y los commits posteriores no tocaron `rust-core/`, cosa verificable:

```bash
git diff --stat 288ee44..HEAD -- rust-core/     # vacío ⇒ el core no cambió
```

O sea que el binario es funcionalmente el de HEAD y solo difiere el string. **Antes de la demo
eso no alcanza:** los cuatro artefactos tienen que regenerarse desde el mismo HEAD para que los
cuatro pies coincidan, que es el primer paso del [runbook](../../docs/demo-runbook.md).

### Por qué este gate es manual y no una suite

**React Native no tiene corredor de tests en dispositivo.** Jest mockea los módulos nativos, así
que nada automatizado cruza JSI: un test verde en Jest no prueba absolutamente nada sobre el
puente. Lo único que lo probaría es un e2e con Detox — una pila entera (build gris, servidor,
sincronización de UI) que esta POC no necesita y que está fuera de alcance.

Es una diferencia real con las otras dos apps, y conviene decirla en la demo: Android tiene
`connectedAndroidTest` y iOS tiene XCTest sobre aparato, los dos cruzando la frontera de verdad.
Acá el cruce se verifica a ojo, una vez, y lo que queda automatizado son las dos rutas de
contrato por Node —N-API y WASM—, que sí corren en Jest.

## Lo que hubo que arreglar para que el example compile

El esqueleto que dejó `react-native-builder-bob` asume un monorepo de **yarn/npm con
`node_modules` aplanado** y una línea base de toolchain más vieja que la de este repo. Nada de
esto es opcional ni cosmético: sin cada una de estas piezas el build se cae. Están acá porque
quien regenere el proyecto dentro de seis meses las va a volver a encontrar.

| Qué falla | Por qué | Dónde quedó el arreglo |
|---|---|---|
| Metro no arranca: `No 'workspaces' field found` | `withMetroConfig` espera el campo `workspaces` de yarn/npm; pnpm los declara en `pnpm-workspace.yaml` y no escribe nada en ningún `package.json` | opción `workspaces` explícita en `example/metro.config.js` |
| `Unable to resolve module @babel/runtime/helpers/…` | pnpm enlaza al store de la **raíz del repo**; Metro resuelve por realpath y no sirve archivos fuera de sus raíces vigiladas | `config.watchFolders` extendido con la raíz del repo, en `example/metro.config.js` |
| lo mismo, pero desde `src/bindings.tsx` | la librería se consume **como fuente**, así que babel le inyecta helpers que resuelve desde `apps/react-native/`, donde no había `@babel` | `@babel/runtime` declarado en `dependencies` de la librería |
| Gradle: `Included build '…/@react-native/gradle-plugin' does not exist` | es dependencia **transitiva** de `react-native` y pnpm no la aplana, así que no existe en `example/node_modules/` | declarada como `devDependency` directa del example, pinneada a la misma versión que `react-native` |
| `Minimum supported Gradle version is 9.4.1` | AGP entra **sin versión** (`classpath("com.android.tools.build:gradle")`) y resuelve a 9.x; la plantilla congeló Gradle 9.3.1 | wrapper del example a **9.6.0**, la misma que ya usa `apps/android` |
| `Cannot add extension with name 'kotlin'` | AGP 9 trae Kotlin integrado y registra él mismo esa extensión; la plantilla aplica `kotlin-android` encima | `android.builtInKotlin=false` + `android.newDsl=false` en `example/android/gradle.properties` |
| `getDefaultProguardFile('proguard-android.txt') is no longer supported` | otro cambio rompiente de AGP 9 | `proguard-android-optimize.txt` en `example/android/app/build.gradle` |
| ninja: falta `libcore_financiero.a`, y `fatal error: 'CoreFinancieroImpl.h' file not found` | **los dos son la misma causa**: ver abajo | tres claves borradas de `react-native.config.js` |
| `pnpm test`: `SyntaxError: Cannot use import statement outside a module` | el `transformIgnorePatterns` del preset de RN está escrito para `node_modules` aplanado | `transformIgnorePatterns` propio en el `jest` de `package.json` |
| Gradle: `Cannot find module '.../@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js'` | transitiva de `react-native`; la dispara cualquier librería con `codegenConfig` | declarada como `devDependency` directa del example |

### Por qué `android.builtInKotlin=false` y no la migración que recomienda Google

La migración oficial a AGP 9 es quitar `kotlin-android` de cada módulo. Acá no se puede: el
módulo librería lo genera `ubrn` (`apps/react-native/android/build.gradle`) y lo aplica en su
plantilla. Editar ese archivo a mano lo perdería en el siguiente `--and-generate`, y este
proyecto no edita generados. El opt-out es la salida que la propia guía prevé.

**Horizonte: AGP 10 elimina el opt-out.** Para entonces la salida tiene que venir de `ubrn`
generando un módulo sin `kotlin-android`, no de un parche nuestro.

### Las tres claves `cxxModule*` de `react-native.config.js`

El esqueleto de bob declaraba la librería como **C++ TurboModule**:

```js
cxxModuleCMakeListsModuleName: 'banco-core-financiero',
cxxModuleCMakeListsPath: 'CMakeLists.txt',
cxxModuleHeaderName: 'CoreFinancieroImpl',
```

**Y no lo es.** `ubrn` genera un TurboModule **Kotlin** (`CoreFinancieroModule.kt`) cuyo
`installRustCrate()` instala los bindings JSI; no existe ninguna clase `CoreFinancieroImpl` ni
el header que esa declaración prometía, y `ubrn` no menciona `cxxModule` en ninguna parte de sus
templates ni de sus docs.

Declararlas rompía de dos maneras a la vez, que es por qué aparecían como dos errores distintos:

1. El autolinking metía nuestro `android/CMakeLists.txt` como **subdirectorio del build CMake de
   la app** (`add_subdirectory(… CoreFinancieroSpec_cxxmodule_autolinked_build)`). Ahí
   `CMAKE_SOURCE_DIR` deja de apuntar a nuestro módulo y pasa a apuntar al `default-app-setup`
   de React Native, así que la línea `${CMAKE_SOURCE_DIR}/src/main/jniLibs/…` del CMakeLists
   generado buscaba el `.a` de Rust en un directorio de React Native.
2. Generaba un `autolinking.cpp` con `#include <CoreFinancieroImpl.h>`, que no compila.

Sin esas claves, el módulo librería construye su propio `.so` con su `externalNativeBuild`
—tareas `:banco_core-financiero:`—, que es el camino para el que `ubrn` genera ese CMakeLists y
donde `CMAKE_SOURCE_DIR` sí es el correcto. Se conserva `cmakeListsPath`, que apunta al
CMakeLists del codegen de React Native y es legítimo.

### La trampa: `autolinking.json` está cacheado y no se invalida solo

**Editar `react-native.config.js` y reconstruir no tiene ningún efecto visible.**
`autolinkLibrariesFromCommand()` cachea su salida en `android/build/generated/autolinking/` y no
la invalida cuando ese archivo cambia. El síntoma es cruel: el build sigue fallando con el error
viejo y parece que el arreglo no sirvió. Hay que borrarla a mano:

```bash
cd apps/react-native/example
rm -rf android/build/generated/autolinking \
       android/app/build/generated/autolinking \
       android/app/.cxx
```

Ojo con el primero: el que manda es `android/build/…` (raíz del proyecto Gradle), no el de
`android/app/…`.

### El APK, medido

```bash
cd apps/react-native/example/android
APK=$(find . -name "app-debug.apk" | head -1)
ls -lh "$APK"
unzip -l "$APK" | grep -E "\.a$|\.so$"
```

**95 MB en debug**, contra los 32 MB del APK de debug de `apps/android`. La diferencia no es el
core: son las tres ABIs completas de React Native (`libreactnative.so` sola pesa 23 MB en
arm64) más Hermes, todo sin strippear.

**Cero archivos `.a` en el APK**, que es lo que había que confirmar: `ubrn` deja en
`android/src/main/jniLibs/` el *staticlib* de Rust —de 73 a 82 MB por ABI— y `jniLibs/` es justo
el directorio que Gradle empaqueta. No se cuelan porque el merge de nativos de AGP filtra por
`**/*.so`. El core viaja enlazado **dentro** de `libbanco-core-financiero.so`, 4,0 MB en arm64.

Las ABIs empaquetadas son tres y **tienen que ser exactamente las de `android.targets` de
`ubrn.config.yaml`**. La plantilla traía además `x86`, que `ubrn` no compila, y el APK salía con
un `lib/x86/` **sin** `libbanco-core-financiero.so` adentro: un slice que instala y crashea al
cargar el core. Alinearlas bajó el APK de 125 MB a 95 MB. El criterio es el mismo del
`abiFilters` de `apps/android`.

### `pnpm test` no corría, y la causa era la misma

```bash
cd apps/react-native
pnpm test
```

Se esperan **2 tests en verde** (`src/__tests__/jest-setup.test.ts`). Hasta este cambio la suite
no arrancaba: moría al cargar con `SyntaxError: Cannot use import statement outside a module`,
antes de correr un solo test.

El `transformIgnorePatterns` que trae `@react-native/jest-preset` es:

```
node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)
```

«Ignorá todo bajo `node_modules/`, salvo que justo después venga `react-native/` o
`@react-native/`». Con `node_modules` aplanado eso funciona. Con pnpm el paquete real vive en

```
node_modules/.pnpm/@react-native+jest-preset@0.87.0_…/node_modules/@react-native/jest-preset/…
```

y hay **dos** `node_modules/`. El patrón matchea en el **primero**, porque lo que le sigue es
`.pnpm/`, que no está en la lista blanca. Y a `transformIgnorePatterns` le alcanza con que el
patrón matchee en cualquier parte de la ruta, así que el segundo —el que sí va seguido de
`@react-native/`— nunca se evalúa. Resultado: Babel no toca `jest/setup.js`, que está en ESM, y
como corre en `setupFiles` —antes que cualquier test— se lleva puesta la suite entera.

El arreglo agrega un solo *lookahead*, `(?!\.pnpm/)`, para que ese primer `node_modules/` no
dispare nada y la decisión la tome el segundo. Conserva la lista blanca del preset tal cual:

```json
"transformIgnorePatterns": [
  "node_modules/(?!\\.pnpm/)(?!((jest-)?react-native|@react-native(-community)?)/)"
]
```

Verificado por mutación: quitándolo, la suite vuelve a morir con el mismo `SyntaxError`.

**En el mismo cambio se corrigió `customExportConditions`**, que traía
`"<%- project.sourceCondition -%>"` —un placeholder de plantilla que el andamio de bob nunca
renderizó— donde debía decir `banco-core-financiero-source`. **No arregla nada observable**, y
conviene decirlo con todas las letras: romperlo a propósito no cambia la resolución. Lo que
gobierna que Jest cargue el paquete desde `src/` y no desde `lib/` es la clave
`banco-core-financiero-source` del `exports` de `package.json` — borrarla sí manda la resolución
a `lib/module/index.js`, y hay un test que lo guarda. El placeholder se corrigió porque una
plantilla sin renderizar en un archivo de configuración está mal igual, no porque hiciera algo.

## El mismo smoke en iOS

```bash
cd apps/react-native
export PATH="$HOME/.cargo/bin:$PATH"
pnpm run ubrn:ios        # build en release + pod install

cd example
pnpm exec react-native start --reset-cache &
pnpm exec react-native run-ios --no-packager
```

`ubrn:ios` produce `BancoCoreFinancieroFramework.xcframework/` con **los dos slices**, igual que
la Fase 3:

```
BancoCoreFinancieroFramework.xcframework/
├── ios-arm64/libcore_financiero.a             ← aparato
├── ios-arm64-simulator/libcore_financiero.a   ← simulador
└── Info.plist
```

Después corre `pod install` — **87 pods**, cerca de un minuto.

**Qué se debe ver en el simulador:** el mismo string que Android, carácter por carácter. Corrida
real sobre un iPhone 17 Pro (iOS 26.5):

```
1.0.0+05a4195      ← iOS
1.0.0+05a4195      ← Android, regenerado desde el mismo HEAD
```

Esa igualdad **es** la verificación: si difieren, uno de los dos artefactos se construyó desde
otro HEAD. Es justo el modo de fallar que el pie de `coreVersion()` existe para exhibir, y es el
primer paso del [runbook de la demo](../../docs/demo-runbook.md).

Para leer la pantalla sin mirarla:

```bash
xcrun simctl io <udid> screenshot /tmp/gate.png
```

### `run-ios` cierra con `error code '65'` y aun así funcionó

El CLI construye para el simulador, instala, lanza —hasta ahí todo bien, y la app queda
corriendo— y **después** arranca una segunda pasada contra un **aparato físico** que nadie pidió,
eligiéndolo de la lista de destinos disponibles. Esa segunda falla por firma y devuelve 65.

O sea que el `error` final no dice nada sobre el gate. Lo que hay que mirar en el log es:

```
▸ Build Succeeded
success Successfully built the app
success Successfully launched the app
```

y confirmar que la app está instalada donde corresponde:

```bash
xcrun simctl listapps <udid> | grep banco.corefinanciero.example
```

Para evitar la segunda pasada se le puede pasar el destino a mano con
`--simulator "iPhone 17 Pro"`.

### Qué se comitea de todo esto

`pod install` toca tres archivos **trackeados** del proyecto Xcode del example —`RCTNewArchEnabled`
en el `Info.plist`, la agregación del manifiesto de privacidad, y `CLANG_CXX_LANGUAGE_STANDARD` a
c++20 en el `pbxproj`—. Son configuración del proyecto, no artefactos: se comitean.

Lo que **no** se comitea, por el mismo criterio que el resto del *glue*:

- `BancoCoreFinancieroFramework.xcframework/` — lo produce `ubrn:ios`, igual que los `.a` de Android.
- `example/ios/CoreFinancieroExample.xcworkspace` — lo crea `pod install` y referencia `Pods/`, que ya estaba ignorado.

`Podfile.lock` y `Gemfile.lock` **sí** se comitean: este repo comitea sus lockfiles
—`pnpm-lock.yaml`, `Cargo.lock`— para que el build sea el mismo en otra máquina, y no hay razón
para tratar a CocoaPods distinto.

## La ruta N-API — cómo Jest llama al core de verdad

Jest corre en Node y **no puede cargar el turbo module**, que es C++ atado a JSI. La ruta N-API
entra al **mismo** `cdylib` de Rust por la puerta de addons nativos de Node, así que los tests
del host cruzan a Rust de verdad en vez de ir contra un doble. Es lo que permite verificar los
28 casos de `contracts/cases.json` sin un aparato conectado.

```bash
cd apps/react-native
export PATH="$HOME/.cargo/bin:$PATH"
pnpm run napi:generate
pnpm test
```

Qué se debe ver en `src/generated-napi/`:

```
core_financiero-ffi.ts     capa de soporte
core_financiero.ts         las nueve funciones
index.ts
libcore_financiero.dylib   el cdylib del host, copiado al lado
```

El `.dylib` es de macOS. En Linux sería `.so`, y el script habría que ajustarlo; esta POC se
construye en macOS.

### El comando del plan no funcionaba, por dos razones

```bash
# ✗ como estaba en el plan
pnpm exec ubrn generate napi bindings \
  --library src/generated-napi/libcore_financiero.dylib \
  --ts-dir src/generated-napi --lib-colocated
```

1. **`--library` es un flag booleano**, no una opción con valor: significa «tratá la entrada como
   librería». La ruta va como **argumento posicional** al final.
2. **Hay que correrlo desde un directorio con `Cargo.toml`.** `ubrn` ejecuta `cargo metadata` en
   el cwd pase lo que pase, y `apps/react-native` no tiene manifiesto, así que muere con
   ``manifest path `Cargo.toml` does not exist`` antes de mirar los argumentos. No lo salva
   `--crate`, probado.

La forma que sí anda, y que quedó en el script `napi:generate`:

```bash
RN=$PWD
cargo build --release --manifest-path ../../rust-core/Cargo.toml
mkdir -p src/generated-napi
cp ../../rust-core/target/release/libcore_financiero.dylib src/generated-napi/
cd ../../rust-core/crates/ffi
ubrn generate napi bindings --library \
  --ts-dir "$RN/src/generated-napi" \
  --lib-colocated "$RN/src/generated-napi/libcore_financiero.dylib"
```

### `import.meta` y por qué el arreglo va en `babel.config.js`

Los bindings generados resuelven la ruta del `.dylib` con `callerUrl: import.meta.url`, que
**sólo existe en ESM**. Jest corre sus módulos como CommonJS, así que revienta con
`Cannot use 'import.meta' outside a module`.

`--lib-absolute` no lo evita: agrega un `override` con la ruta absoluta pero **sigue emitiendo la
línea de `import.meta`**, verificado. Así que el arreglo va del lado de Babel — un plugin de diez
líneas que traduce `import.meta` a su equivalente CJS.

Va bajo **`env.test`**, y eso no es un detalle: Jest define `NODE_ENV=test`, Metro y `bob build`
no. Reescribir `import.meta` en el bundle de React Native sería meterse con Hermes por una razón
que sólo existe en los tests.

### Dos proyectos de Jest, no uno

`jest.config.js` declara dos *projects* porque los entornos son incompatibles y los dos hacen
falta:

| Proyecto | Entorno | Tests | Por qué |
|---|---|---|---|
| `napi` | `node` | `__tests__/**` | Carga un `.dylib` nativo. El entorno de React Native **mockea los nativos**, así que acá cruzaría a un fake y el contrato no probaría nada. |
| `react-native` | preset de RN | `src/__tests__/**` | Lo necesitan las pruebas de hooks (`@testing-library/react-native`, `renderHook`). |

Correrlos es un solo `pnpm test`; la salida los distingue por `displayName`.

**No se usa `ts-jest`.** `babel.config.js` ya transpila TypeScript vía el preset de bob, y una
segunda pila de transformación al lado de babel-jest es la clase de cosa que después nadie sabe
por qué está.

## Construir el WASM

El artefacto que consumirá Angular en la Fase 5.

```bash
cd apps/react-native
export PATH="$HOME/.cargo/bin:$PATH"
rustup target add wasm32-unknown-unknown          # la primera vez
pnpm exec ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml
```

Qué se debe ver en `src/generated-wasm/`: los `.ts` generados y un `core_financiero.wasm` de
**178 KB** en release.

**El `--config ubrn.wasm.yaml` no es opcional.** Todos los flavours de `ubrn` escriben en el
directorio que diga `bindings.ts`, así que correrlo con `ubrn.config.yaml` **pisa los bindings JSI**
de `src/generated/`: el build de la app queda roto y el síntoma aparece lejos del comando que lo
causó. Ese archivo existe sólo para apuntar a `src/generated-wasm`.

**Y el `.wasm` que sirve es el que `--and-generate` *stagea*,** no el que deja cargo en
`rust-core/target/wasm32-unknown-unknown/`. El de cargo es la salida cruda y le faltan los símbolos
que inyecta el paso de wasm-bindgen; cargarlo falla con
`required export "__ubrn_alloc" not found in wasm module`.

Todo lo que hizo falta para que esto funcionara —tres correcciones al plan, el cambio de
`chacha20poly1305` que **sí** tocó a las cuatro plataformas, y el bloqueante de tipos que queda
abierto— está en [PENDING.md](PENDING.md).
