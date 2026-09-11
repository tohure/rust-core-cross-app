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

Qué se debe ver — `BUILD SUCCESSFUL` y **20 tests, 0 failures**, en siete clases:

| Clase | Tests |
|---|---|
| `format.MoneyFormatterTest` | 3 |
| `adapter.ContractMessagesTest` | 3 |
| `adapter.UniffiCoreFinancieroContractTest` | 2 |
| `ui.arithmetic.ArithmeticViewModelTest` | 4 |
| `ui.transfer.TransferViewModelTest` | 5 |
| `ui.card.CardViewModelTest` | 2 |
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

Cruzar el FFI cuesta **~150 µs por llamada** en este emulador, contra ~4 µs de una suma en
`Double`. JNA es reflexivo y tiene sobrecosto real; un emulador además es lento.

**No invalida la guía de llamar al core de forma síncrona**: 150 µs es un sexto de un frame a
60 fps, y cada interacción hace una o dos llamadas. Pero el número conviene tenerlo escrito, en
vez de repetir "microsegundos" sin medirlo.

Lo que el benchmark **sí** exhibe es lo otro: `NativeBaseline` es más rápido y **da mal el
resultado**. Su test aserta que *diverge* del core; si alguna vez deja de fallar contra `0.30`,
deja de servir para la demo.

