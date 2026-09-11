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

- **El slice de device.** Ver abajo: es el pendiente que bloquea el cierre de la fase.
- **Que la UI se comporte.** No hay XCUITest. Los filtros de texto, en particular, pueden dejar
  la tecla rechazada visible en el `TextField` sin que ningún test se entere; ver
  [PENDING.md](PENDING.md).
- **Que `isLoading` llegue a ser `true`.** Solo se aserta que vuelve a `false`.

## ⚠️ La corrida sobre hardware: **no ejecutada**

El simulador enlaza `aarch64-apple-ios-sim`. **El slice que se embarca es otro binario**
—`aarch64-apple-ios`— y en toda la Fase 3 nunca se ejecutó. Esta sección se completa cuando
haya aparato conectado; hasta entonces queda dicho que no corrió, porque no se marca en verde
algo que no corrió.

```bash
xcrun devicectl list devices          # tiene que figurar `connected`, no `unavailable`
cd apps/ios
xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination "platform=iOS,name=Carlo’s iPhone"
```

Esperado: **el mismo conteo y el mismo verde.** Si falla aquí y no en el simulador, el problema
está en el slice de device del XCFramework.

## ⚠️ El benchmark: **no medido**

La pantalla funciona y sus tests pasan, pero **nadie tomó todavía el número en esta
plataforma**, así que aquí no hay tabla que escribir. Android está medido en un Pixel 6 y
descompuesto en [`../android/TESTING.md`](../android/TESTING.md):

| | Android (Pixel 6) |
|---|---|
| `coreVersion()` — piso del cruce | 172 µs |
| `add("0.1","0.2")` | 444 µs |
| baseline nativa | 3,7 µs |

Ese piso de 172 µs **no es cómputo**: son `Structure` de JNA con reflexión de campos y memoria
nativa por llamada, más un cruce extra para liberar el `RustBuffer`. **iOS no tiene nada de
eso**: enlaza el `.a` estáticamente y Swift llama la función de C directo. La hipótesis es que
esté en otro orden de magnitud — **hipótesis, no resultado**, y se escribe como resultado
recién cuando alguien la mida.

Se mide **en el aparato, no en el simulador**: el simulador corre arm64 nativo de macOS, sin el
scheduler ni el térmico del teléfono, y daría un número optimista. Android aprendió lo mismo:
su cifra de emulador —~150 µs— estaba inflada y la tabla de arriba es la corregida.
