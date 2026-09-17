# Tests

**Una sola suite, y esa es la diferencia con Android.** Allá hay dos —los tests de JVM no
pueden cargar la `.so`, los instrumentados sí— y esa separación la fuerza la plataforma. Aquí
el core está enlazado **estáticamente** en el binario de la app, así que los tres niveles
corren en el mismo bundle:

| Nivel | Qué verifica | Cruza el FFI |
|---|---|---|
| Unitarios (`MoneyFormatter`, `ContractMessages`) | lógica de presentación pura | no |
| ViewModels | transiciones de estado, con `FakeCoreFinanciero` | no |
| **Contrato y smoke** | **que Rust y Swift produzcan los mismos strings** | **sí** |

La consecuencia está en [PENDING.md](PENDING.md): como nada obliga a que el seam exista, la
disciplina de inyectar `CoreFinanciero` la sostiene la revisión, no el compilador.

## Correr la suite

```bash
cd apps/ios
xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

> Si `xcodebuild` responde `Unable to find a device matching the provided destination
> specifier`: el modelo "iPhone 17 Pro" no existe en todos los runtimes de simulador
> instalados. Verificado el 2026-09-17: en esa máquina `OS:latest` resolvía a iOS 27.0, y ese
> modelo solo existía para el runtime 26.5 — agregar `,OS=26.5` a la `-destination` lo resolvió.
> Es un desajuste de entorno, no del proyecto; correr `xcrun simctl list devices available`
> dice qué runtime tiene ese modelo en tu máquina.

Qué se debe ver — `** TEST SUCCEEDED **` y
**`Test run with 54 tests in 13 suites passed`**:

| Archivo | Tests | Qué prueba |
|---|---|---|
| `FfiCostProbe` | 1 | nada: es la sonda del benchmark, y sin `PROBE=1` queda *skipped* |
| **`ContractTest`** | **11** | **los 31 casos del contrato, más sus cinco guardias** |
| `CoreSmokeTest` | 4 | que el `.a` está enlazado, que el adapter reexporta y que propaga el error crudo |
| `ContractFixtures` | 2 | que los dos JSON del contrato llegaron al bundle de test |
| `ContractMessagesTest` | 5 | el mapeo variante → texto de usuario, con placeholders **crudos**, y que un `Error` que **no** es de dominio no filtre su texto de diagnóstico |
| `MoneyFormatterTest` | 5 | `S/`, separadores, y que **nunca redondea** |
| `ArithmeticViewModelTest` | 5 | |
| `TransferViewModelTest` | 5 | |
| `CardViewModelTest` | 6 | |
| `BenchmarkViewModelTest` | 9 | |
| `ios_rust_testTests` | 1 | |

Los 24 de ViewModel usan `FakeCoreFinanciero` y **no** cruzan el FFI: prueban el ViewModel, no
el core. Quien prueba el core es `ContractTest`, contra los 31 casos reales.

Para acotar a una suite:

```bash
xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:ios-rust-testTests/CardViewModelTest
```

### Hay un test lento, y es a propósito

`BenchmarkViewModelTest` tarda ~1,05 s mientras el resto de la suite corre en 0,03 s. El
culpable es `aSampleLongerThanASecondIsNotTruncated`, que duerme 1,05 s en una sola iteración
para probar que `measure()` no descarta el componente `seconds` de la duración. Vale la
espera: antes del fix, ese pico de 1,05 s se reportaba como **53 182 µs** —el resto
sub-segundo— y desaparecía del p95, que es justo el número que esa pantalla existe para
mostrar.

## El test de contrato es el entregable, no un test de apoyo

`ContractTest` es el espejo Swift de `rust-core/crates/ffi/tests/contract.rs` y de
`ContractTest.kt` de Android. Compara con `#expect` **sobre `String`**, nunca con tolerancia
numérica. Que pase **es** la demostración de la POC en esta plataforma.

Sus 11 tests son **5 guardias + 6 grupos parametrizados**; los grupos expanden a los 31 casos
(`@Test(arguments:)` cuenta como un test, no como uno por caso):

| Grupo | Casos |
|---|---|
| `aritmetica` | 6 |
| `cci` | 4 |
| `itf` | 5 |
| `tarjeta` | 6 |
| `transferencia` | 7 |

### Las cinco guardias, y por qué existen

Un `for` sobre cero elementos no aserta nada y pasa en verde. Las guardias existen para que un
contrato vacío, truncado o renombrado **falle ruidoso** en vez de pasar silencioso:

| Guardia | Qué rompe |
|---|---|
| 1 — versión y moneda esperadas | que alguien bump-ee `cases.json` sin mirar esta app |
| 2 — cada grupo tiene su cantidad | `"cci": []` pasaría los 4 tests de cci sin ejecutar ninguno |
| 3 — las claves de primer nivel son exactamente las conocidas | un grupo nuevo que nadie consume, o uno que desapareció |
| 4 — las nueve variantes de `DomainError` tienen nombre de contrato distinto | un `contractName()` duplicado colapsaría dos errores en uno |
| 5 — `messages.es.json` cubre las nueve variantes | un error sin mensaje mostraría texto de diagnóstico |

**La guardia 3 lee el JSON crudo con `JSONSerialization`, no el modelo `Decodable`**, y eso es
lo que la hace real: `Decodable` ignora claves desconocidas en silencio, así que una guardia
escrita sobre el modelo no detectaría un grupo nuevo. Chequea las dos direcciones —claves
desconocidas y faltantes—. La guardia 4 no lleva `default` en su `switch`: agregar una variante
a `DomainError` rompe la compilación en vez de pasar desapercibida.

El camino de fixtures no tiene fallback silencioso: ni `try?` ni `?? []`. Un contrato malformado
revienta ruidoso en vez de generar cero casos.

**Honestidad sobre la verificación:** de las cinco guardias, **solo la 2 se verificó mutando
de verdad** `cases.json` (`"cci": []` → falla nombrando el contador). Las otras cuatro se
derivaron leyendo el código durante la revisión, no ejecutándolas contra una mutación. Es
menos evidencia de la que tiene Android, donde las tres mutaciones de su tabla sí se
corrieron.

### La otra mutación que sí se corrió

Al cerrar la revisión del dispatch de pantallas se probó por mutación el hueco de cobertura del
bloque de pegado de Tarjeta: con `decryptPasted()` mandando `ciphertextHex: "MUTANTE"` al core
en vez del hex que pegó el usuario, el test nuevo falla y **los otros cinco de la suite siguen
pasando**. Eso es lo que probó que el hueco era real y no cosmético.

## Lo que esta suite NO prueba

- **El slice de device, si se corre solo en simulador.** Esa corrida ya se hizo (ver abajo),
  pero no es automática: cada vez que cambie el core hay que repetirla.
- **Que la UI se comporte.** No hay XCUITest. Los filtros de texto, en particular, pueden dejar
  la tecla rechazada visible en el `TextField` sin que ningún test se entere; ver
  [PENDING.md](PENDING.md).
- **Que `isLoading` llegue a ser `true`.** Solo se aserta que vuelve a `false`.

## La corrida sobre hardware: ✅ ejecutada

El simulador enlaza `aarch64-apple-ios-sim`. **El slice que se embarca es otro binario**
—`aarch64-apple-ios`—, compilado aparte, y hasta el cierre de la fase nunca se había
ejecutado. Ya corrió:

```bash
xcrun devicectl list devices          # tiene que figurar `available`, no `unavailable`
cd apps/ios
xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination 'id=<identificador del aparato>' -allowProvisioningUpdates
```

Resultado: **`Test run with 54 tests in 13 suites passed` · `** TEST SUCCEEDED **`** — el mismo
conteo y el mismo verde que el simulador. Corrió sobre dos aparatos distintos: un **iPad Air
(5.ª gen, `iPad13,16`) con iPadOS 26.6.1** al cerrar la Fase 3, y un **iPhone 12 (`iPhone13,2`)
con iOS 18** al medir el benchmark de verdad. Con eso queda probado lo que ninguna corrida de simulador podía probar: que el
`.a` del slice de device está enlazado, que sus símbolos resuelven, y que el `strip` del perfil
release no se comió nada. El test de contrato pasa **31/31 en el aparato**.

Si falla aquí y no en el simulador, el problema está en el slice de device del XCFramework:
volver al Step 7 de la Task 1 y verificar que el `.xcframework` traiga los dos.

### Las dos cosas que trabaron esa corrida, para que no cuesten dos veces

1. **`error: No profiles for 'dev.tohure.ios-rust-test' were found`.** Los perfiles instalados
   no incluían el aparato. Se resuelve pasando **`-allowProvisioningUpdates`**, que registra el
   dispositivo y genera el perfil. Ojo: es una cuenta gratuita, así que **los perfiles vencen a
   los 7 días** y hay que repetirlo.
2. **`The Developer App Certificate is not trusted`.** La app se instala pero no lanza. Es un
   paso **manual en el aparato**, una vez por certificado: *Ajustes → General → VPN y Gestión
   de Dispositivos → APP DE DESARROLLADOR → `Apple Development: <cuenta>` → Confiar*.

## El benchmark: medido en un iPhone, y en release

**Medido en un iPhone 12 (`iPhone13,2`, A14) con iOS 18**, artefacto `1.0.0+959025f`, sonda de
2.000 iteraciones de calentamiento y 20.000 medidas. La medición anterior —un iPad Air M1, en
Debug— quedó reemplazada: era un chip de tablet y una configuración que penaliza el cruce.

| Llamada | Release | Debug | Android release (Pixel 6) |
|---|---|---|---|
| `coreVersion()` — piso del cruce | **0,062 µs** | 0,38 µs | 47,1 µs |
| `add("0.1","0.2")` | **0,42 µs** | 1,31 µs | 145,9 µs |
| `validateCard("41111")` — **lanza** | **3,58 µs** | 4,54 µs | 113,1 µs |
| `NativeBaseline.add` | **0,15 µs** | 0,41 µs | 2,1 µs |

Las dos primeras filas son **medias por lote**, no percentiles, y la razón está en la sección
siguiente. Las otras dos son p50.

### El piso del cruce cae debajo de la resolución del reloj

`ContinuousClock` va sobre `mach_absolute_time`, cuyo tick en los Ax/Mx es de **~41,67 ns**. Ese
número no es teórico: la sonda lo mide, cronometrando un cuerpo vacío.

```
(reloj, cuerpo vacío)   p50=    0.04 us
coreVersion()           p50=    0.08 us     ← dos ticks
```

**Un cruce que mide dos ticks está midiendo el reloj, no el cruce.** Por eso la sonda cronometra
además **lotes de 1.000 llamadas y divide**, que es exactamente el recurso que usa la app Angular
contra el `performance.now()` cuantizado del navegador. Por lotes, el piso da **0,062 µs**.

Consecuencia para la demo: **en iOS el cruce no se puede medir llamada por llamada.** Cualquier
cifra de iOS cercana a 0,04 µs hay que mirarla con desconfianza, y la pantalla de Benchmark
—que mide por llamada, como las otras tres apps— está en ese régimen.

### Release contra Debug: acá también cambia, y bastante

Android descubrió que su APK de debug castiga el cruce entre 3 y 4 veces. iOS tiene el mismo
efecto, más chico pero del mismo orden: **6,1× en el piso del cruce y 3,1× en `add`**.

La lectura importante es que **la brecha contra Android no se achica al pasar los dos a release,
se agranda**: iOS también mejora. Con las dos plataformas en release y el mismo tipo de sonda, el
piso del cruce cuesta **47,1 µs en Android contra 0,062 µs en iOS**.

### Lo que el número dice, y lo que no

**El 760× que sale de dividir 47,1 entre 0,062 es correcto pero no es el número que conviene
decir**, porque mezcla tres cosas: el puente, el runtime y el teléfono. Se pueden separar, y están
medidas:

- **El aparato explica ~1,8×.** React Native usa el mismo puente JSI en los dos teléfonos, así que
  sirve de control del hardware: su piso del cruce va 4,23 µs en el Pixel 6 contra 2,29 en el
  iPhone 12 (**1,8×**), y su baseline de JS, 1,18 contra 0,67 (**1,76×**). Dos medidas
  independientes que coinciden.
- **El puente se aísla comparando a aparato fijo.** En el mismo iPhone, con el mismo núcleo,
  `add` cuesta **0,42 µs por el `.a` estático contra 4,71 µs por JSI**: 11×. En el mismo Pixel 6,
  **9,44 µs por JSI contra 145,9 µs por JNA**: 15×.

**La versión defendible es la de aparato fijo**, porque no necesita ninguna salvedad. La tabla
completa de los cuatro puentes está en
[docs/cross-app-pending.md](../../docs/cross-app-pending.md).

Y se entiende por qué: Android paga JNA —`Structure` con reflexión de campos y memoria nativa
por llamada, más un cruce extra para liberar el `RustBuffer` de la respuesta—, mientras iOS
enlaza el `.a` estáticamente y Swift llama la función de C directo.

### En cada plataforma manda un costo distinto

En Android el costo es *marshalling*: el piso son 47,1 µs y cada `String` suma ~49 µs, así que
`add` con dos argumentos da 145,9 y **la aritmética decimal cae dentro del ruido**.

En iOS no: el piso es 0,062 µs, o sea prácticamente gratis, y ahí el que manda es el trabajo
real. `add` cuesta 0,42 µs —**2,8×** la baseline nativa, contra 70× en Android— porque lo que se
está midiendo ya es casi todo `rust_decimal` y no el cruce.

El caso que más lo delata es `validateCard("41111")`, que **lanza** un error de longitud: 3,58 µs,
**ocho veces más caro que un `add` exitoso**. En Android pasa al revés (113 contra 146), porque
allá lo que domina es la cantidad de argumentos. **En iOS lo caro es el camino de error**, no los
datos que cruzan.

### Cómo se mide, para poder repetirlo

Con `FfiCostProbe`, en `ios-rust-testTests/`. **Vive en el repositorio**, apagada por defecto: sin
`PROBE=1` queda *skipped* y la suite no la paga. Esto es lo que se ejecutó:

```bash
cd apps/ios
TEST_RUNNER_PROBE=1 xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -configuration Release ENABLE_TESTABILITY=YES \
  -destination 'id=<identificador del aparato>' -allowProvisioningUpdates \
  -only-testing:ios-rust-testTests/FfiCostProbe
```

Qué se debe ver — la primera línea valida a las demás, porque dice el artefacto **y la
configuración**:

```
=== artefacto 1.0.0+959025f · Release · warmup=2000 runs=20000 ===
(reloj, cuerpo vacío)    p50=    0.04 us  p95=    0.04 us
coreVersion()            p50=    0.08 us  p95=    0.08 us
validateCard("41111")    p50=    3.58 us  p95=    3.71 us
add("0.1", "0.2")        p50=    0.42 us  p95=    0.46 us
NativeBaseline.add       p50=    0.17 us  p95=    0.17 us
coreVersion() x1000      media=   0.062 us  (lotes de 1000)
add x1000                media=   0.416 us  (lotes de 1000)
NativeBaseline.add x1000 media=   0.148 us  (lotes de 1000)
```

Tres cosas de ese comando que cuestan una tarde si no están escritas:

1. **`TEST_RUNNER_PROBE=1` va como variable de shell, no como build setting.** `xcodebuild` le
   saca el prefijo `TEST_RUNNER_` y la inyecta en el proceso de test. Pasada como
   `xcodebuild ... PROBE=1` **no llega**, y la sonda queda saltada sin decir por qué —se ve como
   un test que pasó en 0,001 s—. Verificado imprimiendo el entorno adentro del aparato.
2. **`ENABLE_TESTABILITY=YES` es obligatorio en Release.** La sonda usa `@testable import` para
   llegar a `NativeBaseline`, y en Release esa bandera viene apagada:
   `error: Unable to resolve Swift module dependency to a compatible module: 'ios_rust_test'`.
   La salvedad honesta es que prender testabilidad limita algo la optimización entre módulos, así
   que el número de Release es, si acaso, **conservador**.
3. **No se mide en simulador**: corre arm64 nativo de macOS y da un número aún más optimista.

`PROBE_RUNS` y `PROBE_WARMUP` ajustan la forma de la medición, para poder reproducir la de otra
plataforma. La cantidad de muestras **cambia el resultado**.

### El split en dos targets no movió el número, y hay con qué probarlo

Partir la app en `CoreFinancieroKit` + `ios-rust-test` ponía en riesgo justamente esta cifra: si
el framework hubiera quedado **dinámico**, cada llamada al core pagaría indirección de `dyld` y
el piso de 0,062 µs dejaría de valer. Se eligió estático por eso, y después se volvió a medir en
el mismo iPhone 12, en Release, con la misma sonda:

| | Antes del split | Después |
|---|---|---|
| `coreVersion()` x1000 — **el piso del cruce** | 0,062 µs | **0,062 µs** |
| `add` x1000 | 0,416 µs | 0,410 µs |
| `NativeBaseline.add` x1000 | 0,148 µs | 0,146 µs |

**Lo que hace concluyente a esta tabla es la tercera fila, no la primera.** `NativeBaseline.add`
no cruza el FFI —es aritmética de `Double` en Swift— así que el split no puede haberla afectado
por ningún mecanismo. Se movió **−1,4 %, exactamente lo mismo que `add`**. Esa coincidencia
identifica la variación como ruido entre corridas y no como señal: si el framework hubiera
agregado indirección, `add` se habría movido y la baseline no.

Sin esa fila de control, un −1,4 % en `add` no se distingue de una regresión chica.
