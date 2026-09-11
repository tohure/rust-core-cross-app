# Tests

Dos suites, y la distinción es la que más importa entender: **una corre en la JVM y no toca el
núcleo Rust; la otra corre sobre un dispositivo y sí lo toca.**

| | Dónde corre | Necesita | Cruza el FFI |
|---|---|---|---|
| `testDebugUnitTest` | JVM de tu máquina | nada | **no** — usa `FakeCoreFinanciero` |
| `connectedDebugAndroidTest` | emulador o teléfono | un dispositivo conectado | **sí** — carga `libcore_financiero.so` |

Esa diferencia no es un detalle de infraestructura: los tests de JVM verifican que los
ViewModels se comporten bien, y los instrumentados verifican que **Rust y Kotlin produzcan los
mismos strings**, que es la tesis de toda la POC.

## Correr las dos suites

Dos suites, y la distinción importa: una corre en la JVM y la otra **sobre un dispositivo**.

```bash
# JVM — rápidos, sin emulador. Usan FakeCoreFinanciero: NO cruzan el FFI.
./gradlew :app:testDebugUnitTest
```

Qué se debe ver — `BUILD SUCCESSFUL` y **25 tests, 0 failures**, en siete clases:

| Clase | Tests |
|---|---|
| `format.MoneyFormatterTest` | 3 |
| `adapter.ContractMessagesTest` | 3 |
| `adapter.CoreFinancieroAdapterTest` | 2 |
| `ui.arithmetic.ArithmeticViewModelTest` | 4 |
| `ui.transfer.TransferViewModelTest` | 6 |
| `ui.card.CardViewModelTest` | 6 |
| `ui.benchmark.NativeBaselineTest` | 1 |

```bash
# Instrumentados — necesitan un emulador o dispositivo conectado. Estos SÍ cruzan el FFI.
adb devices                              # debe listar uno como `device`
./gradlew :app:connectedDebugAndroidTest
```

Qué se debe ver — `BUILD SUCCESSFUL` y **15 tests, 0 failures**:

| Clase | Tests | Qué prueba |
|---|---|---|
| `CoreSmokeTest` | 2 | que la `.so` carga y JNA resuelve símbolos |
| `ContractAssetsTest` | 2 | que los dos JSON del contrato llegaron a los dos APK |
| `contract.AssetSourcesTest` | 2 | que los seams leen los assets reales |
| **`ContractTest`** | **9** | **los 28 casos del contrato, más sus guardias** |

Para acotar una corrida instrumentada a una clase, **`--tests` no sirve** —ese flag es de la
tarea de unit tests JVM y AGP 9 lo rechaza acá—. El equivalente que funciona:

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.ContractTest
```

### El test de contrato es el entregable, no un test de apoyo

`ContractTest` es el espejo Kotlin de `rust-core/crates/ffi/tests/contract.rs`. Compara con
`assertEquals` **sobre `String`**, nunca con tolerancia numérica. Que pase **es** la
demostración de la POC en esta plataforma.

Lleva las mismas guardias que el de Rust, y por el mismo motivo: un `for` sobre cero elementos
no aserta nada. Verificadas **por mutación**, no por lectura:

| Mutación en `contracts/cases.json` | Qué falló |
|---|---|
| `"cci": []` | `theContractHasTheExpectedNumberOfCases` y `contractCci`, por su contador |
| un campo extra en el `esperado` de `tj-001` | `contractCard`, nombrando el campo que sobra |
| se borra la entrada `"Cifrado"` de `messages.es.json` | `theMessagesAssetCoversTheNineErrorVariants`, nombrando la variante |

Es además el primer test de toda la POC que cruza el **borde FFI real**: el test de contrato de
`rust-core` llama a las nueve funciones como funciones Rust ordinarias, así que no prueba JNA,
ni `System.loadLibrary`, ni los símbolos que el `strip` pudo comerse. Eso lo prueba recién este.

## Lo que dice el benchmark, y lo que no

**Medido en un Pixel 6 (Android 17, arm64-v8a), no en el emulador.** La distinción importa: el
emulador de esta máquina corre arm64 nativo sobre Apple Silicon, cuyos cores son bastante más
rápidos que los de un teléfono. El número de emulador que este archivo traía antes —~150 µs—
era **optimista**, no pesimista.

| Llamada | p50 | p95 | Qué agrega sobre la anterior |
|---|---|---|---|
| `coreVersion()` | **172 µs** | 204 µs | el **piso del cruce**: cero argumentos, cero parseo, devuelve un `&'static str` |
| `validateCard("41111")` | **327 µs** | 370 µs | +1 `String` de entrada → **~155 µs por argumento** |
| `add("0.1", "0.2")` | **444 µs** | 536 µs | +2 `String` de entrada + `Decimal` |
| `NativeBaseline.add` | **3.7 µs** | 9.4 µs | — |

**La aritmética decimal es gratis.** Si cada `String` cuesta ~150 µs, entonces
`172 + 2×150 ≈ 472` y `add` mide 444: el trabajo de Rust cae dentro del ruido. **El costo es
marshalling, no cómputo.**

**No invalida la guía de llamar al core de forma síncrona**: 444 µs es el 2,7% de un frame a
60 fps, y cada interacción hace una o dos llamadas. Pero el número conviene tenerlo escrito, y
medido en el aparato donde se va a hacer la demo.

### De dónde sale ese piso de 172 µs

**No de reflexión en el despacho**, que es lo que este archivo decía antes y es falso para
uniffi 0.32. El binding generado usa **direct mapping** de JNA:

```kotlin
Native.register(UniffiLib::class.java, findLibraryName(componentName = "core_financiero"))
external fun uniffi_core_financiero_fn_func_add(a: RustBuffer.ByValue, ...)
```

`Native.register` + `external fun` significa que cada función queda enlazada como método nativo
de verdad y se invoca por la transición JNI normal. No hay despacho reflexivo por llamada.

Lo que sí cuesta, y explica la magnitud:

- **`RustBuffer` y `UniffiRustCallStatus` son `Structure` de JNA.** Ahí sí hay reflexión de
  campos y asignación de memoria nativa, **por llamada**.
- **Devolver un `String` implica un cruce extra**: el buffer se asigna del lado de Rust, Kotlin
  lo lee, y después hay que llamar a `rustbuffer_free`. Una llamada que devuelve texto son dos
  cruces, no uno.

Todo eso vive en código generado, que no se edita. **El veredicto sobre qué se puede optimizar
y qué no está en [PENDING.md](PENDING.md).**

### Cómo se midió, para poder repetirlo

Con una sonda instrumentada desechable —no quedó en el repositorio a propósito: es una medición
no determinista que no tiene sentido correr en cada suite—. Un `@Test` en `androidTest/` que
cronometra con `System.nanoTime()`, con 2.000 iteraciones de calentamiento y 20.000 medidas por
caso, corrido **aislado** para que el proceso esté limpio:

```bash
adb logcat -c
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.FfiCostProbe
adb logcat -d -s FfiCostProbe:I
```

**Salvedad:** el APK medido es el de **debug**; el `.so` sí es release. No debería cambiar mucho
en esta ruta —el camino del binding no lleva instrumentación de debug— pero no se verificó.

Lo que el benchmark **sí** exhibe es lo otro: `NativeBaseline` es más rápido y **da mal el
resultado**. Su test aserta que *diverge* del core; si alguna vez deja de fallar contra `0.30`,
deja de servir para la demo.

### La primera llamada al núcleo es lenta, y se paga una sola vez por proceso

Los 444 µs son el **estado estacionario**. La primera llamada del proceso cuesta mucho más, y
después decae rápido. Medido en el Pixel 6:

```
primera llamada (fría) = 33109 µs      ← 33 ms
llamadas 2..10         = 1691, 1571, 1569, 1414, 1414, 1590, 1558, 1315, 1366 µs
estado estacionario    = 444 µs
```

Ahí se pagan `System.loadLibrary`, el `Native.register` de JNA que enlaza todos los métodos
nativos de una, y el arranque interpretado de ART antes de que el JIT compile la ruta. Ninguna
de las tres se repite.

**Son 33 ms, no un segundo.** Este archivo afirmaba antes que el tirón perceptible de la primera
operación era el FFI; **es falso**, y la medición lo desmiente. 33 ms no se perciben. Si al
abrir la app y tocar `Calcular` de inmediato se siente un retraso mayor, **eso no es el núcleo**:
es primera composición de Compose y carga de clases de ART, y habría que medirlo aparte.

Dos detalles que descartan las sospechas más comunes:

- **La `.so` ya está cargada antes de que toques Aritmética.** El pie llama
  `container.core.coreVersion()` durante la primera composición, así que `System.loadLibrary` y
  el `Native.register` se pagaron en el primer frame, no en tu primer `Calcular`.
- **Cambiar el radio button no llama al núcleo.** `ArithmeticViewModel.operationChanged()` solo
  actualiza el estado y limpia el error. Si el cambio de operación se siente lento, eso es
  recomposición de Compose.

**Predicción para iOS, verificable en la Fase 3:** si el piso de 172 µs son estructuras de JNA
más un cruce extra para liberar el buffer, iOS —que enlaza el `.a` estáticamente y no tiene JNA
en ningún lado— debería estar en **otro orden de magnitud**. Eso deja de ser una nota al pie y
pasa a ser un punto fuerte de la demo: el mismo núcleo, y el puente elegido cuesta 10× o 20×.

