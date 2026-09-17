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
./gradlew :app:testDebugUnitTest :core-financiero:testDebugUnitTest
```

**Son cuatro suites y no dos desde la Fase 6**, cuando el borde FFI se mudó al módulo
`:core-financiero`. Qué se debe ver — `BUILD SUCCESSFUL` y **36 tests de JVM, 0 failures**:

| Módulo | Clase | Tests |
|---|---|---|
| `:app` | `format.MoneyFormatterTest` | 3 |
| `:app` | `adapter.CoreFinancieroAdapterTest` | 2 |
| `:app` | `ui.arithmetic.ArithmeticViewModelTest` | 5 |
| `:app` | `ui.transfer.TransferViewModelTest` | 6 |
| `:app` | `ui.card.CardViewModelTest` | 7 |
| `:app` | `ui.benchmark.NativeBaselineTest` | 1 |
| `:app` | `ui.benchmark.BenchmarkViewModelTest` | 6 |
| `:app` | `UniffiRecordsAreNotMutatedTest` | 2 |
| **`:core-financiero`** | `adapter.ContractMessagesTest` | **4** |

`ContractMessagesTest` vive en el módulo y no en `:app` porque el mapeo de error a texto de
usuario se mudó ahí con el adapter. Sus cuatro tests incluyen que un `Throwable` que **no** es de
dominio no filtre su texto de diagnóstico a la pantalla.

```bash
# Instrumentados — necesitan un emulador o dispositivo conectado. Estos SÍ cruzan el FFI.
adb devices                              # debe listar uno como `device`
./gradlew :app:connectedDebugAndroidTest :core-financiero:connectedDebugAndroidTest
```

Qué se debe ver — `BUILD SUCCESSFUL` y **21 tests, 0 failures**:

| Módulo | Clase | Tests | Qué prueba |
|---|---|---|---|
| **`:core-financiero`** | `CoreSmokeTest` | 2 | que la `.so` carga y JNA resuelve símbolos |
| **`:core-financiero`** | `ContractAssetsTest` | 2 | que los dos JSON del contrato llegaron a los dos APK |
| **`:core-financiero`** | `contract.AssetSourcesTest` | 2 | que los seams leen los assets reales |
| **`:core-financiero`** | `adapter.UniffiCoreFinancieroTest` | 3 | que el `runCatching` del adapter **real** traduce un error del core a `Result.failure` |
| **`:core-financiero`** | **`ContractTest`** | **10** | **los 31 casos del contrato, más sus guardias** |
| **`:core-financiero`** | `FfiCostProbe` | 1 | nada: es la sonda del benchmark, y sin `-e probe true` devuelve sin medir |
| `:app` | `RotationTest` | 1 | que rotar no se lleve puesta la pestaña ni lo tecleado |

**Las 19 del módulo que asertan algo son las que no se pueden falsear**: cargan la librería
nativa de verdad. La 20.ª es la sonda, que no aserta y por eso está aparte en la tabla. La de
`:app` prueba presentación, que es lo único que le quedó a ese módulo.

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

**Y sobre un APK de release**, que es la otra mitad de la frase y durante tres fases estuvo mal.
Las dos columnas de abajo son el mismo aparato, la misma sonda, el mismo artefacto
`1.0.0+959025f` y el mismo minuto: lo único que cambia es la bandera `debuggable` del APK.

| Llamada | release p50 | release p95 | debug p50 | Qué agrega sobre la anterior |
|---|---|---|---|---|
| `coreVersion()` | **47,1 µs** | 62,7 µs | 181,9 µs | el **piso del cruce**: cero argumentos, cero parseo, devuelve un `&'static str` |
| `validateCard("41111")` | **113,1 µs** | 147,3 µs | 343,0 µs | +1 `String` de entrada, **y lanza** |
| `add("0.1", "0.2")` | **145,9 µs** | 202,2 µs | 433,4 µs | +2 `String` de entrada + `Decimal` |
| `NativeBaseline.add` | **2,1 µs** | 2,4 µs | 2,1 µs | — |

**La aritmética decimal es gratis.** Del piso de 47,1 µs a los 145,9 µs de `add` hay 98,8 µs
para dos `String`, o sea **~49 µs por argumento**. El trabajo de `rust_decimal` cae entero
dentro del ruido: **el costo es marshalling, no cómputo.**

**Y el camino de error cuesta aparte.** `validateCard("41111")` lleva un solo argumento, así que
debería dar `47 + 49 ≈ 96 µs`; mide 113. Esos ~17 µs de más son la excepción cruzando la
frontera. Es el mismo efecto que iOS exhibe mucho más marcado —allá el error cuesta **4×** un
`add` exitoso— y acá queda tapado porque lo que domina es la cantidad de argumentos.

**No invalida la guía de llamar al core de forma síncrona**: 145,9 µs es el **0,9%** de un frame
a 60 fps, y cada interacción hace una o dos llamadas.

### El APK de debug castiga el cruce ~3,5×, y hasta la Fase 7 no se sabía

Este archivo afirmaba que medir sobre el APK de debug «no debería cambiar mucho en esta ruta,
porque el camino del binding no lleva instrumentación de debug». **Es falso.** El piso del cruce
pasa de 47,1 a 181,9 µs, y `add` de 145,9 a 433,4: entre **3,0× y 3,9×**.

Tiene sentido cuando se mira qué es ese camino: casi todo es trabajo del lado de la JVM
—`RustBuffer` y `UniffiRustCallStatus` son `Structure` de JNA, con reflexión de campos y
asignación de memoria nativa por llamada—, y un APK `debuggable` le pide al ART que no optimice
agresivamente para que el depurador pueda parar donde quiera.

**El control que lo prueba es `NativeBaseline.add`: 2,1 µs en los dos builds**, hasta la segunda
cifra. Mismo bucle, mismo aparato, mismo instante. Lo único que se movió de lugar fue el FFI. Por
eso la sonda imprime `debuggable=true/false` en su primera línea: la bandera es **la** variable,
y la medición anterior se tomó sin registrarla.

### De dónde sale ese piso de 47 µs

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

### Cómo se mide, para poder repetirlo

Con `FfiCostProbe`, en `core-financiero/src/androidTest/`. Cronometra con `System.nanoTime()`,
2.000 iteraciones de calentamiento y 20.000 medidas por caso, y se corre **aislada** para que el
proceso esté limpio. **Esto es lo que se ejecutó** para llenar la tabla de arriba:

```bash
cd apps/android
adb logcat -c
./gradlew :core-financiero:connectedReleaseAndroidTest -PprobeRelease \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.FfiCostProbe \
  -Pandroid.testInstrumentationRunnerArguments.probe=true
adb logcat -d -s FfiCostProbe:I
```

Qué se debe ver — cinco líneas, y la primera es la que valida a las otras cuatro:

```
=== artefacto 1.0.0+959025f · debuggable=false ===
coreVersion()            p50=   47.69 us  p95=   63.60 us
validateCard("41111")    p50=  113.08 us  p95=  147.26 us
add("0.1", "0.2")        p50=  145.10 us  p95=  200.77 us
NativeBaseline.add       p50=    2.08 us  p95=    2.36 us
```

**Si dice `debuggable=true`, el número no sirve** y falta `-PprobeRelease`. Para medir el debug a
propósito —la columna de comparación— se corre lo mismo sin esa propiedad y con
`connectedDebugAndroidTest`.

Las dos piezas que lo hacen repetible:

- **`-PprobeRelease`** manda los instrumentados al build type `release`
  ([core-financiero/build.gradle.kts](core-financiero/build.gradle.kts)). Sin la propiedad corren
  contra `debug`, como siempre.
- **El release va firmado con el keystore de debug**
  ([app/build.gradle.kts](app/build.gradle.kts)). AGP lo emite sin firmar y un APK sin firma no
  instala; esa firma existe **sólo** para poder medir, no para distribuir.

**La sonda vive en el repositorio, y es un cambio deliberado respecto de la Fase 6**, que la
borró después de medir. Borrarla salió caro exactamente una vez: repetir la medición obligó a
reescribirla, y una sonda reescrita no mide lo mismo que la original —hay que volver a discutir
si el calentamiento alcanza, si el lambda se inlinea, si el percentil se calcula igual—. El
código de una medición que hay que poder repetir **es parte de la medición**.

Apagada no cuesta nada: sin `-e probe true` loguea que no midió y devuelve. Es el 20.º test
instrumentado de `:core-financiero` y el único que no aserta.

### El APK de release: medido en tamaño y en velocidad

La Fase 6 construyó los dos y los pesó:

```bash
cd apps/android && ./gradlew :app:assembleDebug :app:assembleRelease
ls -l app/build/outputs/apk/debug/*.apk app/build/outputs/apk/release/*.apk
```

| APK | Bytes | |
|---|---:|---|
| `app-debug.apk` | 32 695 932 | ~31,2 MiB |
| `app-release.apk` | 25 563 936 | ~24,4 MiB |

De dónde sale el peso, en el de release: **22,9 MB son los dos `classes.dex`**; todo lo nativo
junto son 1,9 MB, y de eso 1,4 MB son los tres slices de `libcore_financiero.so` —uno por ABI— y
458 KB las `.so` de JNA.

> **El de release NO está minificado, así que ese número no es el de un build embarcable.** El
> `buildTypes.release` de este proyecto lleva `optimization { enable = false }`, o sea que R8 no
> corre: no hay shrinking ni ofuscación, y por eso la diferencia con debug es sólo del 22 %. Con
> R8 la mayor parte de esos 22,9 MB de dex se iría. Está así a propósito —es una POC y un APK
> minificado complica leer un stack trace en la demo—, pero cualquiera que cite este tamaño como
> «lo que pesa la app» se va a equivocar por un factor grande.

**Los percentiles en release ya están medidos**, y son la columna principal de la tabla de más
arriba. Lo que faltaba eran dos cosas de infraestructura, las dos resueltas: AGP emitía el release
sin firmar, y no había teléfono. Con la firma de debug aplicada, el APK instala y la sonda corre
con `-PprobeRelease`.

Además se midió **la pantalla de Benchmark**, que es la que ve la audiencia y no la sonda. Mismo
Pixel 6, n = 1000, el default de la pantalla:

| Build | core p50, 1.ª corrida | core p50 estacionario | core p95 estacionario | nativa p50 |
|---|---|---|---|---|
| debug | 363–365 µs | 233–246 µs | 278–305 µs | ~2,3 µs |
| **release** | 100 µs | **58–63 µs** | **75–77 µs** | ~2,3 µs |

Dos lecturas que la sonda no da, porque la sonda calienta 2.000 iteraciones antes de medir y la
pantalla no:

- **La primera corrida es ~1,6× la estacionaria**, en los dos builds. Con n = 1000 el
  calentamiento del JIT todavía pesa dentro de la muestra. Quien haga la demo debería tocar
  **Ejecutar dos veces** y citar la segunda.
- **La pantalla en release da 58–63 µs y la sonda 145,9 µs para el mismo `add`.** La diferencia
  es reproducible y **no está explicada**. Lo que sí está descartado, midiéndolo:

  | Sospecha | Cómo se descartó |
  |---|---|
  | la cantidad de muestras | la sonda con `warmup=0 runs=1000` —la forma de la pantalla— da 150 µs, no 60 |
  | la capa del adapter | `UniffiCoreFinanciero.add` en la sonda da 128 µs, **menos** que la llamada cruda |
  | el hilo | la misma llamada en un `Thread` aparte da 125 µs |
  | la velocidad del core de CPU | `NativeBaseline.add` da 2,1 µs en la sonda y 2,3 µs en la pantalla: si la pantalla corriera en cores más rápidos, esto también bajaría |

  Lo que queda en pie es **el proceso**: la sonda corre en el APK de test y la pantalla en el de
  la app. El candidato es la presión de GC —JNA asigna un `Memory` nativo por llamada, y esos
  objetos son de los que el recolector sigue— contra heaps de tamaño distinto. No se persiguió
  más allá: no cambia ninguna conclusión de la POC.

  **La consecuencia práctica sí importa: los números de un instrumento no se citan al lado de los
  del otro.** La comparación válida es siempre dentro de la misma columna.

Lo que el benchmark **sí** exhibe es lo otro: `NativeBaseline` es más rápido y **da mal el
resultado**. Su test aserta que *diverge* del core; si alguna vez deja de fallar contra `0.30`,
deja de servir para la demo.

### La primera llamada al núcleo es lenta, y se paga una sola vez por proceso

El estado estacionario —47 µs el piso, 146 el `add`— se paga recién después de la primera
llamada, que cuesta muchísimo más y decae rápido. Medido en el Pixel 6 **con el APK de debug**,
que es cuando el estacionario daba 444 µs:

```
primera llamada (fría) = 33109 µs      ← 33 ms
llamadas 2..10         = 1691, 1571, 1569, 1414, 1414, 1590, 1558, 1315, 1366 µs
estado estacionario    = 444 µs        ← en release son 146
```

**Los 33 ms de la primera llamada no se re-midieron en release, y no hace falta**: los domina
`System.loadLibrary` más el `Native.register` de JNA, que es trabajo de carga y enlazado, no la
ruta de llamada que el `debuggable` penaliza.

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

**La predicción que este archivo hacía se cumplió, y por más margen del que anticipaba.** Decía
que si el piso del cruce son estructuras de JNA más un cruce extra para liberar el buffer,
entonces iOS —que enlaza el `.a` estáticamente y no tiene JNA en ningún lado— debería estar en
otro orden de magnitud, «10× o 20×». Medido: **47,1 µs contra 0,062 µs**.

Y hay una confirmación más fuerte todavía, que no estaba prevista: **React Native, corriendo en
este mismo Pixel 6, cruza en 4,23 µs** —11× más barato que la app nativa de Kotlin— porque usa
JSI en vez de JNA. Mismo teléfono, mismo sistema, mismo núcleo: lo único que cambia es el puente.
Eso descarta que la diferencia contra iOS sea el aparato. Cuadro completo en
[docs/cross-app-pending.md](../../docs/cross-app-pending.md).

