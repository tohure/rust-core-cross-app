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

Qué se debe ver — `** TEST SUCCEEDED **` y
**`Test run with 47 tests in 12 suites passed`**:

| Archivo | Tests | Qué prueba |
|---|---|---|
| **`ContractTest`** | **10** | **los 28 casos del contrato, más sus cinco guardias** |
| `CoreSmokeTest` | 4 | que el `.a` está enlazado, que el adapter reexporta y que propaga el error crudo |
| `ContractFixtures` | 2 | que los dos JSON del contrato llegaron al bundle de test |
| `ContractMessagesTest` | 3 | el mapeo variante → texto de usuario, con placeholders **crudos** |
| `MoneyFormatterTest` | 5 | `S/`, separadores, y que **nunca redondea** |
| `ArithmeticViewModelTest` | 5 | |
| `TransferViewModelTest` | 5 | |
| `CardViewModelTest` | 6 | |
| `BenchmarkViewModelTest` | 6 | |
| `ios_rust_testTests` | 1 | |

Los 22 de ViewModel usan `FakeCoreFinanciero` y **no** cruzan el FFI: prueban el ViewModel, no
el core. Quien prueba el core es `ContractTest`, contra los 28 casos reales.

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

Sus 10 tests son **5 guardias + 5 grupos parametrizados**; los grupos expanden a los 28 casos
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

Resultado: **`Test run with 47 tests in 12 suites passed` · `** TEST SUCCEEDED **`** — el mismo
conteo y el mismo verde que el simulador, sobre un **iPad Air (5.ª gen, `iPad13,16`) con
iPadOS 26.6.1**. Con eso queda probado lo que ninguna corrida de simulador podía probar: que el
`.a` del slice de device está enlazado, que sus símbolos resuelven, y que el `strip` del perfil
release no se comió nada. El test de contrato pasa **28/28 en el aparato**.

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

## El benchmark: medido, con una salvedad que importa

**Medido en un iPad Air (5.ª gen, M1) con iPadOS 26.6.1**, n = 1000, contra el artefacto
`1.0.0+b719da3`. Android está medido en un **Pixel 6**, un teléfono. **No son aparatos
comparables**, y más abajo está por qué la conclusión se sostiene igual.

| Llamada | iOS (iPad Air 5, M1) | Android (Pixel 6) | Relación |
|---|---|---|---|
| `coreVersion()` — piso del cruce | **0,33 µs** | 172 µs | **521×** |
| `validateCard("41111")` | **7,08 µs** | 327 µs | 46× |
| `add("0.1","0.2")` | **1,58 µs** | 444 µs | **281×** |
| baseline nativa en `Double` | **0,38 µs** | 3,7 µs | 10× |

### La hipótesis se confirma, y no por poco

El piso del cruce —una función sin argumentos, sin parseo, que devuelve un `&'static str`—
cuesta **0,33 µs en iOS contra 172 µs en Android: 521 veces menos.**

**Entre un M1 y un Pixel 6 hay un factor de 2× o 3×, no de 521×.** Por eso la salvedad del
aparato no alcanza a explicar la brecha: aunque el número de iOS se multiplicara por diez para
castigarlo por correr en un chip de escritorio, seguiría siendo dos órdenes de magnitud más
barato. **La diferencia es el puente, no la CPU**, que es exactamente lo que la pantalla existe
para aislar.

Y se entiende por qué: Android paga JNA —`Structure` con reflexión de campos y memoria nativa
por llamada, más un cruce extra para liberar el `RustBuffer` de la respuesta—, mientras iOS
enlaza el `.a` estáticamente y Swift llama la función de C directo.

### Lo que sale de comparar las dos columnas con cuidado

**En cada plataforma manda un costo distinto, y no es el mismo.**

En Android el costo es *marshalling*: el piso son 172 µs y cada `String` suma ~150 µs, así que
`add` con dos argumentos da 444 y **la aritmética decimal cae dentro del ruido**.

En iOS no: el piso es 0,33 µs, o sea prácticamente gratis, y ahí el que manda es el trabajo
real. `add` cuesta 1,58 µs —apenas **4,2×** la baseline nativa, contra 120× en Android— porque
lo que se está midiendo ya es casi todo `rust_decimal` y no el cruce.

El caso que más lo delata es `validateCard("41111")`, que **lanza** un error de longitud:
7,08 µs, **cuatro veces más caro que un `add` exitoso**. En Android pasa al revés (327 contra
444), porque allá lo que domina es la cantidad de argumentos. **En iOS lo caro es el camino de
error**, no los datos que cruzan.

### ⚠️ Falta re-medir en un iPhone

Esta tabla queda **provisional**. Hay que repetirla en un teléfono con iOS 17 o superior para
tener una comparación pareja contra el Pixel 6; ver [PENDING.md](PENDING.md). La conclusión
principal no debería moverse —la brecha es demasiado grande—, pero las cifras exactas sí.

### Cómo se tomó, para poder repetirlo

No se leyó de la pantalla: se corrió un test temporal en el bundle de tests, sobre el aparato,
usando el mismo reloj y la misma forma que `BenchmarkViewModel.measure()` —muestras en enteros
de nanosegundos, percentiles sobre el array ordenado—. El archivo se borró después de medir;
esto es lo que hacía:

```swift
private func measure(_ n: Int, _ body: () -> Void) -> (p50: String, p95: String) {
    var samples: [Int64] = []
    samples.reserveCapacity(n)
    for _ in 0..<n {
        let start = ContinuousClock.now
        body()
        let e = (ContinuousClock.now - start).components
        samples.append(e.seconds * 1_000_000_000 + e.attoseconds / 1_000_000_000)
    }
    samples.sort()
    func at(_ p: Double) -> String {
        let index = min(max(Int(Double(n) * p), 0), n - 1)
        return String(format: "%.2f µs", Double(samples[index]) / 1000)
    }
    return (at(0.50), at(0.95))
}
```

Se corrió con `-only-testing:ios-rust-testTests/DeviceBenchmark` contra el `id` del aparato.
**No se mide en simulador**: corre arm64 nativo de macOS y da un número aún más optimista.
