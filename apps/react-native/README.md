# app-react-native

App de React Native que **no contiene ni una sola regla de negocio**. Todo el cálculo
—decimales, transferencias, validación de tarjetas, cifrado— lo resuelve un núcleo escrito en
Rust que las otras tres apps de la POC (Android, iOS, Angular) consumen **sin reescribirlo**.

Lo que esta app hace con los datos es pedirlos y mostrarlos.

Es además el **único subproyecto que produce tres salidas** del mismo crate: el turbo module
JSI que consume la app, los bindings N-API con que el test de contrato llama al core desde
Node, y el **`.wasm` del que depende la Fase 5** — `apps/web-angular` no consume `rust-core`
directamente, consume lo que se construye aquí.

Lo que esta app **no** tiene, y conviene saberlo de entrada: **ninguna prueba automatizada
cruza JSI.** El cruce se verifica con un smoke manual. El porqué está en
[TESTING.md](TESTING.md#qué-no-prueba-nada-de-esto).

| | |
|---|---|
| **Lenguaje / UI** | TypeScript 6.0 · React 19.2 · React Native 0.87 (Fabric) |
| **Runtime de JS** | Hermes |
| **Puente al núcleo** | `uniffi-bindgen-react-native` 0.31.0-5 — turbo module **JSI** |
| **Núcleo** | Rust, enlazado **dentro** de `libbanco-core-financiero.so` / del framework de iOS |
| **Paquete** | `@banco/core-financiero` (librería) + `example/` (la app) |
| **Gestor** | pnpm, workspace declarado en `pnpm-workspace.yaml` |

---

## Arquitectura

No es una app suelta: es una **librería más un `example/`**, que es la forma que impone
`react-native-builder-bob`. La librería es el paquete que envuelve al core; `example/` es la
app que lo consume, y es donde viven las pantallas.

```mermaid
flowchart LR
    subgraph core["rust-core"]
        domain["crates/domain"] --> ffi["crates/ffi"]
    end

    ffi -->|"pnpm ubrn:android · ubrn:ios"| jsi["turbo module JSI"]
    ffi -->|"pnpm napi:generate"| napi["bindings N-API"]
    ffi -->|"pnpm wasm:generate"| wasm["packages/<br/>core-financiero-wasm"]

    jsi --> index["src/index.tsx"]
    index --> ejemplo["example/<br/>hooks y pantallas"]
    napi --> tnapi["contract.napi.test.ts"]
    wasm --> twasm["contract.wasm.test.ts"]
    wasm --> angular["apps/web-angular"]

    pkg["packages/contract"] --> index
    pkg --> ejemplo
    contrato[("contracts/")] --> ejemplo
    contrato -.-> tnapi
    contrato -.-> twasm
```

**Leyenda**

Esta app es la única que produce **tres salidas** del mismo crate, y el diagrama existe
sobre todo para mostrarlas.

| Caja | Qué es |
|---|---|
| `crates/domain` · `crates/ffi` | El núcleo en Rust: la lógica pura y la fachada uniffi de nueve funciones. |
| `turbo module JSI` | La salida que usa la app. **JSI** es *JavaScript Interface*, la capa que deja a JavaScript llamar funciones de C++ directamente, sin serializar los datos como JSON por un puente asíncrono. |
| `bindings N-API` | La salida que usa el test de contrato desde **Node**. *Node-API* es la interfaz con que Node carga librerías nativas. Existe porque **ninguna prueba automatizada cruza JSI**: Jest mockea los nativos, así que el contrato se verifica por este camino. |
| `packages/core-financiero-wasm` | La tercera salida: el `.wasm` más su fachada tipada. **De esta rama depende la app Angular**, que no consume nada más de este proyecto. |
| `src/index.tsx` | La superficie pública del paquete de React Native. |
| `packages/contract` | El mapeo de variante de error a nombre del contrato y a texto de usuario. **No cruza el FFI**, así que vive en un paquete neutral que comparten esta app, el paquete WASM y Angular. |
| `example/` | La app de demostración: los cuatro hooks, las cuatro pantallas y el pie con `coreVersion()`. |
| `contracts/` | Los dos JSON compartidos, en la raíz del repo. |


**`FfiCostProbe` no está en el diagrama**: es una sonda de medición con overlay en pantalla,
apagada con `PROBE_ON = false`, no una pieza de la arquitectura.


### Qué es cada pieza y por qué existe

| Pieza | Qué hace | Por qué existe |
|---|---|---|
| `crates/domain` | La lógica: decimales, ITF, Luhn, ChaCha20-Poly1305 | Rust puro, sin uniffi. Un `#[uniffi::export]` ahí **no compila**: la frontera la sostiene el compilador |
| `crates/ffi` | Las nueve funciones públicas | La única superficie que cruza a TypeScript |
| `src/bindings.tsx` | Entrypoint que genera `ubrn` | Registra el crate con Hermes. **Se reescribe entero en cada `--and-generate`**: no se edita |
| `src/index.tsx` | La superficie pública del paquete | Reexporta `bindings` y `contractName`, que ahora vive en `@banco/contract` y no aquí |
| `packages/contract` | `CONTRACT_NAMES`/`contractName`/`messageFor`: variante de `DomainError` → nombre del contrato → mensaje de usuario | Ese mapeo **no cruza el FFI**. Vive en un paquete neutral (fuera de `apps/react-native`) porque lo necesitan también el paquete WASM y Angular — dos copias se desincronizan |
| `src/guard.ts` | asserts `DomainError['tag'] ≡ ContractTag` | La tabla vive en un paquete que no puede depender de ningún flavour generado; la equivalencia contra el tipo real se aserta aquí. No exporta nada en runtime, existe sólo para que `tsc` lo mire — ver [TESTING.md](TESTING.md#guardia-4-ya-no-la-sostiene-un-satisfies-local-la-sostiene-srcguardts) |
| `example/src/adapter/core.ts` | Reexporta las nueve funciones | **No traduce nombres ni tipos**: una segunda nomenclatura se desincroniza en la primera regeneración |
| `example/src/contract/sources.ts` | Lee `cases.json` y reexporta `messageFor` de `@banco/contract` | Las cuentas, la clave y el nonce son **datos del contrato**, no constantes de la app; `messageFor` ya no se reimplementa aquí, era una copia exacta |
| `userMessage`, de `@banco/contract` | `DomainError` → texto de usuario, en el borde de UI | **Ya no vive en esta app.** Era `example/src/adapter/ContractMessages.ts`, una copia casi idéntica de la de Angular; el arreglo de la Fase 6 —que el diagnóstico dejara de llegar a la pantalla— hubo que aplicarlo en los dos lugares. Ahora los hooks lo importan del paquete |
| `example/src/format/money.ts` | `S/` y separadores, **sobre el string** | Nunca convierte a `number`. Escrito a mano y no con `Intl`: ver [PENDING.md](PENDING.md#intlnumberformat-y-por-qué-el-formateador-está-escrito-a-mano) |
| `__benchmarks__/baseline.ts` | Aritmética IEEE-754 sobre montos | **La excepción**, y existe para exhibir el fallo. Su test comprueba que diverge del contrato |

---

## Antes de correr la demo

**El binario de Rust se genera primero, para las cuatro apps a la vez.** La secuencia
completa, en orden, vive en
[rust-core/BUILD.md](../../rust-core/BUILD.md#generar-el-core-que-consumen-las-cuatro-apps);
aquí abajo están solo los pasos puntuales que le tocan a esta app (Android e iOS del turbo
module, y el `.wasm` del que depende Angular).

Ya instalado y verificado en esta máquina: Node 22.16, pnpm, Java 21 LTS, Xcode, NDK
30.0.16248370, Rust 1.98.1 con los targets de Android e iOS.

```bash
# desde la raíz del repo — en un clone limpio el flag NO es opcional
pnpm install --ignore-scripts

cd apps/react-native
pnpm exec ubrn --help          # prueba que el CLI compiló (este build no tiene --version)
```

**El `--ignore-scripts` no es un detalle, y la causa está en esta misma app:** el
`prepare: bob build` de este `package.json` se dispara en cualquier `pnpm install` del
workspace e intenta generar los `.d.ts` desde `src/generated/`, que todavía no existe. El
porqué completo y qué se pierde al saltearlo están en
[el Paso 0 del README raíz](../../README.md#paso-0-dejar-el-repo-listo).

Los artefactos generados **no están en git**, así que hay que producirlos al menos una vez.
Son dos grupos, y **hacen falta cosas distintas según lo que se quiera**: correr los tests no
pide lo mismo que instalar la app en un aparato.

**Para `pnpm test`** alcanza con esto, y **no hace falta ningún toolchain móvil**:

```bash
pnpm napi:generate             # el .dylib del host + los bindings N-API
pnpm wasm:generate             # el .wasm y su fachada; ~40 s
```

**`napi:generate` es el que más fácil se olvida.** Sin él la suite da **90 de 129 con 3 suites
rotas**, y ninguno de los errores dice qué falta: `Cannot find module
'../src/generated-napi/core_financiero'`. Cae también `BancoApp.test.tsx`, y **por el mismo
módulo**: `jest.config.js` remapea `./bindings` a `src/generated-napi/core_financiero`, así que
ninguna suite toca lo que producen `ubrn:android`/`ubrn:ios`.

Sin `wasm:generate` faltan otras dos suites —`facade.test.ts` y `contract.wasm.test.ts`— y la
suite da **92**. Con los dos comandos, **129 de 129 en verde desde un clone limpio**.

**Para correr la app en un aparato** hacen falta además el toolchain nativo y el codegen:

```bash
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/30.0.16248370"
pnpm ubrn:android              # 3 ABIs + bindings, y deja src/bindings.tsx
pnpm ubrn:ios                  # incluye pod install
pnpm exec bob build --target codegen   # android/generated/ e ios/generated/
```

**Los tiempos dependen de la caché de cargo, y la diferencia es grande.** Con cargo tibio,
`ubrn:android` tarda ~1:01 y `ubrn:ios` ~12 s. Desde un clone limpio, que es el caso de quien
lee esto por primera vez, fueron **3:21 y 3:05** — el primero compila el propio `ubrn` más los
tres targets desde cero, y el segundo descarga ~55 MB de tarballs de Hermes.

**El paso de codegen no es opcional y no lo hace `ubrn`.** Lo hace `bob`, dentro del `prepare`
que el `pnpm install --ignore-scripts` del Paso 0 se saltea; ver
[el Paso 0 del README raíz](../../README.md#paso-0-dejar-el-repo-listo). Sin él el build de
Android muere con `Unresolved reference 'NativeCoreFinancieroSpec'` y el de iOS con
`fatal error: 'CoreFinancieroSpec.h' file not found`, y ninguno de los dos nombra la causa.

En iOS hay que **repetir `pod install`** después del codegen: el que corre `ubrn:ios` sucede
antes de que `ios/generated/` exista, así que no lo integra al proyecto de Xcode.

### Dónde se cablea, y qué **no** hay que editar

Una duda razonable: «¿y dónde le digo a la app cómo se llama lo que generó Rust?». **En ningún
lado.** No hay que tocar ningún archivo de configuración: el cableado está fijo en el código del
proyecto y los artefactos caen en rutas fijas. Si están en su lugar, compila.

| | |
|---|---|
| **Los archivos que lo cablean** | `ubrn.config.yaml` para el turbo module, y `ubrn.wasm.yaml` para el `.wasm` |
| **Dónde caen los bindings TS** | `src/generated/` |
| **Dónde cae el C++ del turbo module** | `cpp/` y `ios/` — los dos gitignored |
| **Dónde caen los de N-API** | `src/generated-napi/`, que es lo que usa el test de contrato desde Node |
| **Qué NO se toca** | Los dos `.yaml` ya están escritos y versionados. No hay que editarlos para construir |

**Ojo con `android/generated` e `ios/generated`: ésos no son de `ubrn`.** Los produce el
**Codegen de React Native** a partir del `codegenConfig` del `package.json`, y los genera Gradle
o CocoaPods en tiempo de build. Son dos generadores distintos escribiendo en carpetas de nombre
parecido; confundirlos hace buscar el error en el lado equivocado.

Esta app es la única que produce **tres** salidas del mismo crate: el turbo module JSI que usa
la app, los bindings N-API con que el test de contrato llama al core desde Node, y el `.wasm`
del que depende Angular.

---

## Correr la demo

Los comandos de abajo son los que **efectivamente se corrieron** para cerrar esta fase.

```bash
# Metro, en su propia terminal. Tras reconstruir nativo, --reset-cache no es opcional.
cd apps/react-native/example
pnpm exec react-native start --reset-cache

# Android (emulador Pixel 9 Pro API 36, arm64-v8a)
pnpm exec react-native run-android --no-packager        # ~27 s

# iOS (simulador iPhone 17 Pro)
pnpm exec react-native run-ios --no-packager --simulator "iPhone 17 Pro"   # ~20 s
```

**Metro muere con la terminal que lo lanzó.** Si la app arranca en pantalla roja diciendo
`loadJSBundleFromAssets`, no es un fallo del build: es que no hay Metro.

### En Android 17 la app pide permiso de red local al arrancar, y no es esta app

En un aparato con **Android 17 (API 37)** el build de debug muestra un diálogo pidiendo acceso
a dispositivos de la red local. **No lo pide esta POC: lo pide React Native**, y sólo para
alcanzar a Metro.

El permiso es `android.permission.ACCESS_LOCAL_NETWORK`, y está declarado en el manifiesto del
*source set* de **debug del propio framework** —`ReactAndroid/src/debug/AndroidManifest.xml`—,
no en el de esta app. Quien dispara el diálogo es `LocalNetworkPermissionUtil` de
`com.facebook.react.devsupport`. Android 17 estrenó el control de acceso a la red local; en
versiones anteriores llegar a una IP de la LAN no requería pedir nada, y por eso el diálogo es
nuevo aunque el código no haya cambiado.

**En release no aparece**, y conviene saberlo antes de la demo. Los manifiestos fusionados de
esta app, comparados:

| Build | Permisos |
|---|---|
| `debug` | `INTERNET`, `ACCESS_LOCAL_NETWORK`, `SYSTEM_ALERT_WINDOW` y el receptor dinámico |
| `release` | `INTERNET` y el receptor dinámico, nada más |

`ACCESS_LOCAL_NETWORK` y `SYSTEM_ALERT_WINDOW` —el del overlay de las pantallas rojas— existen
**sólo en debug**. El APK de la demo no los lleva y no pregunta nada.

Se comprueba sin creerle a este texto, después de un build:

```bash
# desde apps/react-native/example/android/, tras ./gradlew assembleDebug assembleRelease
grep -o 'uses-permission[^/]*' \
  app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
```

**Lo único que esta app declara a mano es `INTERNET`**, en
`example/android/app/src/main/AndroidManifest.xml`, y viene de la plantilla de React Native: la
POC no hace red. La app nativa de Android, en comparación, no declara **ningún** permiso.

Para leer la pantalla de Android sin mirarla —útil por ssh o en CI—:

```bash
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb shell cat /sdcard/ui.xml | tr '>' '>\n' | grep -o 'text="[^"]*"' | grep -v 'text=""'
```

---

## Correr los tests

```bash
cd apps/react-native
pnpm test              # 129 tests, 16 suites, en dos proyectos de Jest
pnpm exec tsc --noEmit # sin errores
pnpm lint              # sin errores
```

Son **dos proyectos de Jest y la separación no es cosmética** — el detalle está en
[TESTING.md](TESTING.md):

| Proyecto | Entorno | Qué corre ahí |
|---|---|---|
| `napi` | Node puro | El contrato por N-API y por WASM, y la divergencia de la baseline. Carga un `.dylib` nativo de verdad |
| `react-native` | Preset de RN | Los hooks y los componentes, con `@testing-library/react-native` |

```bash
pnpm jest __tests__/contract.napi.test.ts     # el contrato por N-API
pnpm jest __tests__/contract.wasm.test.ts     # los mismos 31 por WASM
pnpm jest __benchmarks__                      # la baseline de TS diverge del contrato
```

**Lo que estos tests NO prueban es el cruce de JSI.** Eso lo prueba el smoke manual de
[BUILD.md](BUILD.md#el-smoke-jsi), y es una diferencia real con Android —que tiene 15 tests
instrumentados— y con iOS.

### La verificación completa de la fase

Corrida entera al cerrar, sobre `b5b1388`. Son los números reales, no los que el plan esperaba:

| Base | Comando | Resultado |
|---|---|---|
| `rust-core` | `cargo test --workspace` | **67** |
| `apps/android` | `./gradlew :app:testDebugUnitTest --rerun` | **31** |
| `apps/android` | `./gradlew :app:connectedDebugAndroidTest` | **15** (Pixel 9 Pro API 36) |
| `apps/ios` | `xcodebuild test -scheme ios-rust-test -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` | **47** |
| `apps/react-native` | `pnpm test` | **129**, 16 suites |

**El `--rerun` de Android no es decorativo.** Sin él, Gradle contesta `BUILD SUCCESSFUL` en
405 ms con la tarea `UP-TO-DATE`: **no corrió nada**, reusó un resultado cacheado. Un verde así
no prueba nada el día que importa. El conteo de arriba se cruzó además contra los XML de
`app/build/test-results/`.

Y el pie de `coreVersion()` en las cuatro pantallas —Android nativo, iOS nativo, y React Native
en Android y en iOS— decía **`1.0.0+b5b1388`**, idéntico en las cuatro.

---

## Qué se puede hacer, pantalla por pantalla

Los labels son los de [`docs/ui-spec.md`](../../docs/ui-spec.md), **textuales**: la demo pone
las cuatro apps lado a lado y las compara carácter por carácter. Cambiar uno aquí obliga a
cambiarlo en las cuatro.

### Aritmética — el float rompe el dinero

Con `0.1` y `0.2`, `Sumar`: el bloque rojo muestra `0.30000000000000004` y el verde `0.30`.
Es la única pantalla donde se permite el tipo flotante nativo, y existe justamente para eso.

### Transferencia — el dinero se conserva

Origen `00219100123456789047`, destino `01122000987654321065`, monto `100.00`. El botón pasa a
spinner mientras corre la latencia simulada —**no hay red**; el número lo devuelve el core— y
después: `Comisión ITF S/ 0.01`, `Total debitado S/ 100.01`,
`Comprobante TRF-9047-1065-10000`, y los saldos en `S/ 4,899.99` y `S/ 1,300.50`.

Tipear `0.001` en el monto: **el campo no deja escribir el tercer decimal.** Es un filtro de
texto, no una validación — quien rechaza el monto sigue siendo el core, y el caso `tr-007` del
contrato lo prueba.

### Tarjeta — cifrado, y que se note que es cifrado

Con `4111111111111111`, `Validar y cifrar`: `Visa`, `4111 **** **** 1111`, el hex
`bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd` y, debajo, el número **de
vuelta**. Esa última fila no es decoración: sin ella el hex es indistinguible de un hash.

El bloque de abajo es la demostración en vivo de la tesis. Pegar ahí el hex que produjo la app
de Android o la de iOS y sale el mismo número, porque las cuatro comparten clave, nonce y
algoritmo desde el mismo core.

### Benchmark — cuánto cuesta cruzar la frontera

Medido con `FfiCostProbe` en **release, sobre aparatos físicos** —un Pixel 6 y un iPhone 12—
contra el artefacto `1.0.0+959025f`. `add("0.1","0.2")`, p50:

| | piso del cruce | `add` | baseline JS |
|---|---|---|---|
| React Native / Android — Pixel 6 | 4,23 µs | **9,44 µs** | 1,18 µs |
| React Native / iOS — iPhone 12 | 2,29 µs | **4,71 µs** | 0,67 µs |
| *app nativa de Android, mismo Pixel 6* | *47,10 µs* | *145,9 µs* | *2,12 µs* |
| *app nativa de iOS, mismo iPhone 12* | *0,062 µs* | *0,42 µs* | *0,15 µs* |

**El core es más lento que la baseline, y está bien: es el argumento.** Lo que la pantalla exhibe
es que la baseline, siendo más rápida, **da mal el resultado**.

Pero el dato que se lleva la discusión es otro: **el orden se da vuelta según la plataforma.** En
el Pixel 6 esta app cruza **15× más barato** que la app nativa de Kotlin, porque JSI llama a C++
directo y Kotlin paga JNA. En el iPhone es al revés: la nativa cruza **11× más barato**, porque
enlaza el `.a` estáticamente. *No hay un ganador de plataforma; hay un puente caro, y es JNA.*

Y como esta app usa **el mismo puente en los dos teléfonos**, sus dos filas son el único control
de hardware que tiene la POC: 1,8× de diferencia. Eso es lo que permite afirmar que la brecha
entre las dos apps nativas no la explica el aparato. Cuadro completo en
[docs/cross-app-pending.md](../../docs/cross-app-pending.md); cómo se prende la sonda, en
[BUILD.md](BUILD.md).

Los números que este archivo traía antes —3,96 µs en Android, 8,75 en iOS— eran de **emulador y
simulador**, y eran optimistas: el mismo `add` en el Pixel 6 físico cuesta 9,44.

---

## Por qué el turbo module es agnóstico del bundler

Es la pregunta que la demo va a recibir, y conviene tenerla contestada antes.

**A un turbo module no lo bundlea nadie.** Es código nativo que enlazan Gradle y CocoaPods, y
que se registra contra el runtime de JavaScript cuando la app arranca. Metro, Re.Pack, rspack y
webpack bundlean **JavaScript**: lo que pasa por ellos es el `.ts` generado que llama al
módulo, no el módulo. Por eso cambiar de bundler no toca esta pieza.

**Y el core no se puede federar.** Viaja dentro del `.apk` y del `.ipa`, porque es una librería
nativa enlazada en tiempo de build. Se pueden federar las **pantallas** que lo llaman; el core,
nunca. Quien pida Module Federation para el núcleo está pidiendo algo que la plataforma no
permite, no algo que esta POC no hizo.

---

## Qué NO se puede hacer, y por qué

- **Ni una regla de negocio en TypeScript.** Ni un Luhn, ni una tasa, ni una multiplicación
  sobre un monto. Escribir aritmética sobre dinero aquí es hacer lo contrario
  de lo que la POC demuestra.
- **Ningún monto pasa por `number`.** Ni `parseFloat`, ni `Number()`, ni `+`. Son strings desde
  `rust_decimal` hasta el `<Text>`. La única excepción son las dos baselines, y existen para
  exhibir el problema.
- **Ninguna librería de decimales** (`decimal.js`, `big.js`). Necesitarla es señal de que el
  cálculo está en el lugar equivocado.
- **Sin red, sin persistencia, sin I/O.** Las cuentas se reinician al cerrar la app.
- **Los generados no se editan a mano.** `src/generated*`, `cpp/`, `src/bindings.tsx`,
  `src/NativeCoreFinanciero.ts` y el podspec los reescribe `ubrn` en cada regeneración. Si algo
  generado está mal, se corrige en `rust-core` y se regenera.

---

## Glosario

| Término | Qué es |
|---|---|
| **Fabric** | El renderer nuevo de React Native. Aplana en el árbol nativo las vistas que sólo aportan layout — por eso los contenedores compartidos llevan `collapsable={false}`: sin eso, insertar un bloque descoloca las filas de abajo. |
| **Hermes** | El motor de JavaScript que React Native embarca, y el que carga el turbo module. |
| **Turbo Module** | Un módulo nativo de la arquitectura nueva: se registra con Hermes y se llama por JSI, sin el puente asíncrono serializado de la arquitectura vieja. |
| **Metro** | El empaquetador de JavaScript de React Native. Corre en su propia terminal y le sirve el bundle al dispositivo; después de reconstruir lo nativo hay que arrancarlo con `--reset-cache`. |
| **`ubrn`** | *uniffi-bindgen-react-native*: el CLI que genera las tres salidas de este proyecto —turbo module, N-API y WASM— desde el mismo crate de Rust. |
| **`wasm2`** | El *flavour* de `ubrn` que compila el crate a WebAssembly. Necesita su propio `--config` o pisa los bindings de JSI. |
| **`bob`** | *react-native-builder-bob*, el empaquetador de librerías de React Native. Es el `prepare` de este `package.json`, y el que obliga al `--ignore-scripts` en un clone limpio. |

## Dónde está el resto

| Archivo | Qué contesta |
|---|---|
| [CONTEXT.md](CONTEXT.md) | El stack, la estructura y las prohibiciones del subproyecto |
| [BUILD.md](BUILD.md) | Toolchain, los tres flavours de `ubrn`, el smoke JSI, y **las siete incompatibilidades de pnpm que hubo que arreglar** |
| [TESTING.md](TESTING.md) | Qué prueba y qué **no** prueba cada suite, y las cinco guardias del contrato |
| [PENDING.md](PENDING.md) | La deuda: el WASM, el `catch_unwind` que no existe ahí, y lo que queda abierto |
| [../../docs/ui-spec.md](../../docs/ui-spec.md) | Los labels exactos, normativos para las cuatro apps |
| [../../docs/demo-runbook.md](../../docs/demo-runbook.md) | El guion de la demo |
