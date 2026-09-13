# app-react-native

App de React Native que **no contiene ni una sola regla de negocio**. Todo el cálculo
—decimales, transferencias, validación de tarjetas, cifrado— lo resuelve un núcleo escrito en
Rust que las otras tres apps de la POC (Android, iOS, Angular) consumen **sin reescribirlo**.

Lo que esta app hace con los datos es pedirlos y mostrarlos.

Es además el **único subproyecto que produce tres salidas** del mismo crate: el turbo module
JSI que consume la app, los bindings N-API con que el test de contrato llama al core desde
Node, y el **`.wasm` del que depende la Fase 5** — `apps/web-angular` no consume `rust-core`
directamente, consume lo que se construye acá.

**Estado:** funcional. Las cuatro pantallas andando en Android y en iOS, el pie de
`coreVersion()` visible en las cuatro, y **109 tests en verde**, con el contrato **28/28 por
N-API y 28/28 por WASM**.

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

## Cómo está armada

No es una app suelta: es una **librería más un `example/`**, que es la forma que impone
`react-native-builder-bob`. La librería es el paquete que envuelve al core; `example/` es la
app que lo consume, y es donde viven las pantallas.

```mermaid
flowchart TD
    subgraph core["rust-core/ — el único lugar con lógica de negocio"]
        domain["crates/domain<br/>Rust puro · 7 módulos"]
        ffi["crates/ffi · core_financiero<br/>fachada uniffi · 9 funciones"]
        domain --> ffi
    end

    ffi -->|"pnpm ubrn:android / ubrn:ios"| jsi["src/generated/ + cpp/<br/>turbo module JSI"]
    ffi -->|"pnpm napi:generate"| napi["src/generated-napi/<br/>cdylib + N-API"]
    ffi -->|"pnpm wasm:generate"| wasmgen["packages/core-financiero-wasm/generated/<br/>.wasm + bindings, @ts-nocheck"]

    jsi --> bindings["src/bindings.tsx<br/>generado, no se edita"]
    bindings --> index["src/index.tsx<br/>superficie pública<br/>reexporta bindings + contractName"]
    index --> adapter["example/src/adapter/core.ts<br/>reexporta, no traduce"]
    adapter --> hooks["useArithmetic · useTransfer<br/>useCard · useBenchmark"]
    hooks --> screens["cuatro pantallas<br/>+ pie coreVersion()"]

    wasmgen --> wasmfacade["packages/core-financiero-wasm/src/index.ts<br/>fachada tipada · nueve funciones + initCore"]

    napi --> tnapi["__tests__/contract.napi.test.ts<br/>28/28"]
    wasmfacade --> twasm["__tests__/contract.wasm.test.ts<br/>28/28"]
    wasmfacade -.->|"esbuild --bundle · dist/index.js"| angular["apps/web-angular"]

    contratoPkg[("packages/contract<br/>CONTRACT_NAMES · contractName · messageFor")]
    contratoPkg -->|"export { contractName }"| index
    contratoPkg -->|"export { messageFor }"| fuentes
    bindings -.->|"import type DomainError"| guard["src/guard.ts<br/>guardia 4 · sólo tipos, nada en runtime"]
    contratoPkg -.->|"import type ContractTag"| guard
    guard -.->|"DomainError['tag'] ≡ ContractTag"| index

    contrato[("contracts/<br/>cases.json · messages.es.json")]
    contrato --> fuentes["example/src/contract/sources.ts"]
    fuentes --> hooks
    contrato -.->|"verifica 28 casos"| tnapi
    contrato -.->|"verifica 28 casos"| twasm
```

### Qué es cada pieza y por qué existe

| Pieza | Qué hace | Por qué existe |
|---|---|---|
| `crates/domain` | La lógica: decimales, ITF, Luhn, ChaCha20-Poly1305 | Rust puro, sin uniffi. Un `#[uniffi::export]` ahí **no compila**: la frontera la sostiene el compilador |
| `crates/ffi` | Las nueve funciones públicas | La única superficie que cruza a TypeScript |
| `src/bindings.tsx` | Entrypoint que genera `ubrn` | Registra el crate con Hermes. **Se reescribe entero en cada `--and-generate`**: no se edita |
| `src/index.tsx` | La superficie pública del paquete | Reexporta `bindings` y `contractName`, que ahora vive en `@banco/contract` y no acá |
| `packages/contract` | `CONTRACT_NAMES`/`contractName`/`messageFor`: variante de `DomainError` → nombre del contrato → mensaje de usuario | Ese mapeo **no cruza el FFI**. Vive en un paquete neutral (fuera de `apps/react-native`) porque lo necesitan también el paquete WASM y Angular — dos copias se desincronizan |
| `src/guard.ts` | La guardia 4: aserta `DomainError['tag'] ≡ ContractTag` | La tabla vive en un paquete que no puede depender de ningún flavour generado; la equivalencia contra el tipo real se aserta acá. No exporta nada en runtime, existe sólo para que `tsc` lo mire — ver [TESTING.md](TESTING.md#guardia-4-ya-no-la-sostiene-un-satisfies-local-la-sostiene-srcguardts) |
| `example/src/adapter/core.ts` | Reexporta las nueve funciones | **No traduce nombres ni tipos**: una segunda nomenclatura se desincroniza en la primera regeneración |
| `example/src/contract/sources.ts` | Lee `cases.json` y reexporta `messageFor` de `@banco/contract` | Las cuentas, la clave y el nonce son **datos del contrato**, no constantes de la app; `messageFor` ya no se reimplementa acá, era una copia exacta |
| `example/src/format/money.ts` | `S/` y separadores, **sobre el string** | Nunca convierte a `number`. Escrito a mano y no con `Intl`: ver [PENDING.md](PENDING.md#intlnumberformat-y-por-qué-el-formateador-está-escrito-a-mano) |
| `__benchmarks__/baseline.ts` | Aritmética IEEE-754 sobre montos | **La excepción**, y existe para exhibir el fallo. Su test comprueba que diverge del contrato |

---

## Antes de correrla

Ya instalado y verificado en esta máquina: Node 22.16, pnpm, Java 21 LTS, Xcode, NDK
30.0.16248370, Rust 1.98.1 con los targets de Android e iOS.

```bash
cd apps/react-native
pnpm install
pnpm exec ubrn --help          # prueba que el CLI compiló (este build no tiene --version)
```

Los artefactos nativos **no están en git**. Hay que generarlos al menos una vez:

```bash
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/30.0.16248370"
pnpm ubrn:android              # ~1:01 — 3 ABIs + bindings
pnpm ubrn:ios                  # ~12 s con cargo cacheado; incluye pod install
```

---

## Correrla

Los comandos de abajo son los que **efectivamente se corrieron** para cerrar esta fase.

```bash
# Metro, en su propia terminal. Si acabás de reconstruir nativo, --reset-cache no es opcional.
cd apps/react-native/example
pnpm exec react-native start --reset-cache

# Android (emulador Pixel 9 Pro API 36, arm64-v8a)
pnpm exec react-native run-android --no-packager        # ~27 s

# iOS (simulador iPhone 17 Pro)
pnpm exec react-native run-ios --no-packager --simulator "iPhone 17 Pro"   # ~20 s
```

**Metro muere con la terminal que lo lanzó.** Si la app arranca en pantalla roja diciendo
`loadJSBundleFromAssets`, no es un fallo del build: es que no hay Metro.

Para leer la pantalla de Android sin mirarla —útil por ssh o en CI—:

```bash
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb shell cat /sdcard/ui.xml | tr '>' '>\n' | grep -o 'text="[^"]*"' | grep -v 'text=""'
```

---

## Correr los tests

```bash
cd apps/react-native
pnpm test              # 109 tests, 12 suites, en dos proyectos de Jest
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
pnpm jest __tests__/contract.wasm.test.ts     # los mismos 28 por WASM
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
| `apps/android` | `./gradlew :app:testDebugUnitTest --rerun` | **28** |
| `apps/android` | `./gradlew :app:connectedDebugAndroidTest` | **15** (Pixel 9 Pro API 36) |
| `apps/ios` | `xcodebuild test -scheme ios-rust-test -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` | **47** |
| `apps/react-native` | `pnpm test` | **109**, 12 suites |

**El `--rerun` de Android no es decorativo.** Sin él, Gradle contesta `BUILD SUCCESSFUL` en
405 ms con la tarea `UP-TO-DATE`: **no corrió nada**, reusó un resultado cacheado. Un verde así
no prueba nada el día que importa. El conteo de arriba se cruzó además contra los XML de
`app/build/test-results/`.

Y el pie de `coreVersion()` en las cuatro pantallas —Android nativo, iOS nativo, y React Native
en Android y en iOS— decía **`1.0.0+b5b1388`**, idéntico en las cuatro.

---

## Qué se puede hacer, pantalla por pantalla

Los labels son los de [`docs/ui-spec.md`](../../docs/ui-spec.md), **textuales**: la demo pone
las cuatro apps lado a lado y las compara carácter por carácter. Cambiar uno acá obliga a
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

Con `1000` iteraciones, medido en el emulador Pixel 9 Pro API 36 y en el simulador de
iPhone 17 Pro:

| | p50 | p95 |
|---|---|---|
| Android — core | 3,96 µs | 5,00 µs |
| Android — float nativo | 0,62 µs | 0,67 µs |
| iOS — core | 8,75 µs | 10,83 µs |
| iOS — float nativo | 0,87 µs | 1,00 µs |

**El core es más lento, y está bien: es el argumento.** Lo que la pantalla exhibe es que la
baseline, siendo más rápida, **da mal el resultado**. Números provisionales —emulador y
simulador, no aparatos— y **no comparables sin más con los de Android e iOS nativos**: ver
[PENDING.md](PENDING.md).

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
  sobre un monto. Si estás escribiendo aritmética sobre dinero acá, estás haciendo lo contrario
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

## Dónde está el resto

| Archivo | Qué contesta |
|---|---|
| [CONTEXT.md](CONTEXT.md) | El stack, la estructura y las prohibiciones del subproyecto |
| [BUILD.md](BUILD.md) | Toolchain, los tres flavours de `ubrn`, el smoke JSI, y **las siete incompatibilidades de pnpm que hubo que arreglar** |
| [TESTING.md](TESTING.md) | Qué prueba y qué **no** prueba cada suite, y las cinco guardias del contrato |
| [PENDING.md](PENDING.md) | La deuda: el WASM, el `catch_unwind` que no existe ahí, y lo que queda abierto |
| [../../docs/ui-spec.md](../../docs/ui-spec.md) | Los labels exactos, normativos para las cuatro apps |
| [../../docs/demo-runbook.md](../../docs/demo-runbook.md) | El guion de la demo |
