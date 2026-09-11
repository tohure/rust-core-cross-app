# app-ios

App nativa iOS que consume `rust-core`. Espejo funcional de `apps/android`.

Stack: Swift, SwiftUI, iOS 17+, XCFramework.

## Regla central

Idéntica a Android: **cero reglas de negocio en esta app.** Toda validación y
todo cálculo se delega al core. Esta app solo pinta y formatea.

## La superficie del core: nueve funciones y cinco Records

Esto es **todo** lo que el core expone después de la Fase 1. No hay cronograma de cuotas,
no hay TCEA y no hay validación de RUC: se recortaron del alcance antes de implementar.
Si algo no está en esta lista, no existe.

Los nombres y las etiquetas de argumento de abajo se leyeron de los **bindings generados**
con `uniffi-bindgen --language swift` (uniffi 0.32), no se dedujeron: uniffi convierte el
`snake_case` de Rust a lowerCamelCase y emite funciones **globales** en el módulo que
compile `core_financiero.swift` —el de la app—, no dentro de un tipo. No las prefijes con
nada: `try encrypt(...)`, no `CoreFinancieroFFI.encrypt(...)`; ese `import
core_financieroFFI` lo hace el propio archivo generado para hablar con el XCFramework.

```swift
public func add(a: String, b: String) throws -> String
public func subtract(a: String, b: String) throws -> String
public func calculateItf(amount: String) throws -> String
public func validateCci(cci: String) throws -> ValidCci
public func validateCard(number: String) throws -> ValidCard
public func encrypt(text: String, keyHex: String, nonceHex: String) throws -> String
public func decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) throws -> String
public func executeTransfer(accounts: [Account], request: TransferRequest) throws -> TransferResult
public func coreVersion() -> String
```

`coreVersion()` es la única que no lanza.

```swift
public struct Account { public var id: String; public var holder: String; public var balance: String }
public struct TransferRequest { public var origin: String; public var destination: String; public var amount: String }
public struct TransferResult {
    public var accounts: [Account]
    public var itfFee: String
    public var totalDebited: String
    public var receipt: String
    public var simulatedLatencyMs: UInt32
}
public struct ValidCci { public var bankCode: String; public var bankName: String; public var branch: String; public var account: String }
public struct ValidCard { public var brand: String; public var masked: String }
```

Dos detalles que ahorran una tarde:

- **`simulatedLatencyMs` es `UInt32`, y es el único campo que no es `String`** en toda la
  superficie.
- **Los identificadores están en inglés; los nombres del contrato, en español.** El enum de
  error se llama `DomainError` en Swift (en Kotlin es `DomainException`) y sus nueve casos
  son `Length`, `CheckDigit`, `UnknownBank`, `InvalidAmount`, `AccountNotFound`,
  `SameAccount`, `InsufficientFunds`, `Encryption` y `OutOfRange` — con esa capitalización,
  que no es la convención de Swift pero es la que genera uniffi. `contracts/cases.json` los
  nombra en español (`"Longitud"`, `"DigitoControl"`, …) y **ese mapeo no cruza el FFI**:
  hay que escribirlo, nueve líneas, **en el test de contrato (Swift Testing), no en
  producción**, con un `switch` que cubra los nueve casos **sin `default`**, para que una
  décima variante rompa la compilación en vez de pasar en verde. Ver
  [rust-core/FFI.md](../../rust-core/FFI.md).

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el test de contrato. Si se decide darles pantalla, se agrega **en las cuatro apps a
la vez** — la paridad es la demo.

## Estructura

apps/ios/
├── CoreFinanciero.xcframework/    artefacto generado, no editar
├── Generated/include/             headers generados por uniffi, no editar
│                                  core_financieroFFI.h + module.modulemap
├── ios-rust-test.xcodeproj/
└── ios-rust-test/                 carpeta de fuentes
    ├── Generated/core_financiero.swift   Swift generado por uniffi, no editar
    ├── Adapter/CoreFinanciero.swift
    ├── Format/MoneyFormatter.swift
    └── UI/  ArithmeticView.swift, TransferView.swift, CardView.swift, BenchmarkView.swift

El XCFramework **debe** construirse pasando `-headers` con el `.h` y el `module.modulemap`
que genera uniffi; solo con los `.a` Swift no ve ningún símbolo. Es el fallo de
integración más común en iOS + uniffi:

```bash
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a     -headers Generated/include \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a -headers Generated/include \
  -output ../apps/ios/CoreFinanciero.xcframework
```

> ⚠️ **El modulemap que genera uniffi NO se llama `module.modulemap`.** Verificado en la
> Fase 1 con uniffi 0.32: `uniffi-bindgen ... --language swift` emite tres archivos —
> `core_financiero.swift`, `core_financieroFFI.h` y **`core_financieroFFI.modulemap`**—,
> nombrando el tercero según el crate. Pero `xcodebuild -create-xcframework -headers <dir>`
> exige que el directorio de headers contenga un archivo llamado exactamente
> `module.modulemap`. Con el nombre generado tal cual, el XCFramework **se construye sin
> error** y después `import core_financieroFFI` no resuelve: el síntoma es "el XCFramework
> no exporta nada", y se descubre tarde. Antes de correr `-create-xcframework`, arma el
> directorio de headers —los mismos tres comandos que trae el bloque canónico de
> [`rust-core/CONTEXT.md`](../../rust-core/CONTEXT.md), que es de donde conviene copiarlos—:
>
> ```bash
> mkdir -p Generated/include
> mv Generated/core_financieroFFI.h Generated/include/
> cp Generated/core_financieroFFI.modulemap Generated/include/module.modulemap
> ```
>
> Qué se debe ver: `Generated/include` queda con **dos** archivos —`core_financieroFFI.h`
> y `module.modulemap`—, que son los dos que el XCFramework necesita. Los otros dos se
> quedan en `Generated/`: el `core_financiero.swift`, que es fuente Swift y se compila con
> la app en vez de ir a un directorio de headers, y el `core_financieroFFI.modulemap`
> original, porque el paso de arriba lo **copia** y no lo mueve.

Enlaza el XCFramework en Build Phases. Verifica que incluya los slices
arm64 device y arm64 simulator; sin el segundo no corre en Macs con Apple
Silicon.

## Cómo consumir el core

```swift
enum CoreFinanciero {
    static func transfer(accounts: [Account], request: TransferRequest) throws -> TransferResult {
        try executeTransfer(accounts: accounts, request: request)
    }

    static func encryptCard(_ number: String, keyHex: String, nonceHex: String) throws -> String {
        try encrypt(text: number, keyHex: keyHex, nonceHex: nonceHex)
    }
}
```

El adapter **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
Swift es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración de bindings.

Reglas:

1. Montos como `String` de extremo a extremo. **Nunca `Double` ni `Float`.**
2. Para comparar u ordenar en la UI, usa `Decimal` de Foundation.
3. Los `DomainError` llegan como `Error` de Swift; captúralos con `do/catch`
   en la vista y traduce ahí el mensaje de usuario.
   **`localizedDescription` es diagnóstico, nunca texto de usuario**: el binding
   lo define como `String(reflecting: self)`, o sea el volcado de debug del enum
   (`DomainError.CheckDigit`), y no coincide ni con los `#[error("...")]` en
   español del core ni con lo que produce Kotlin. Los nueve textos de usuario,
   iguales en las cuatro apps, viven en
   [`contracts/messages.es.json`](../../contracts/messages.es.json), que esta app
   lee igual que `cases.json` desde el bundle de test. Está indexado por el
   **nombre del contrato** (`Longitud`, `DigitoControl`, …) y no por el de la
   variante, así que el mapeo `DomainError` → nombre del contrato hace falta **en
   producción**, y el test de contrato reusa ese mismo mapeo en vez de escribir el suyo. Va
   exhaustivo: `switch` sin `default`. El porqué del archivo está en
   [rust-core/FFI.md](../../rust-core/FFI.md) — "Los mensajes de error en
   español NO cruzan el FFI".
4. Llamadas síncronas. No las envuelvas en `Task` salvo en el benchmark.

## El campo de monto acepta 2 decimales como máximo

Requisito de UI, igual en las cuatro apps. El core ya rechaza un monto con más decimales
—`InvalidAmount`, `"MontoInvalido"` en el contrato, caso `tr-007`—, pero **el usuario no
tiene que llegar hasta ahí**: es una demo y la pantalla tiene que verse bien. El límite se
fuerza en el campo, no en el core.

```swift
private let montoValido = #"^\d{0,9}(\.\d{0,2})?$"#

TextField("Monto", text: $monto)
    .keyboardType(.decimalPad)
    .onChange(of: monto) { _, nuevo in
        if nuevo.range(of: montoValido, options: .regularExpression) == nil {
            monto = String(nuevo.dropLast())   // filtro de texto: se descarta la última tecla
        }
    }
```

Tres cosas que no son opcionales:

1. **Es un filtro de texto, no una regla de negocio.** No parsea, no redondea, no calcula:
   decide si el string que el usuario acaba de teclear se acepta en el campo. Quien valida
   sigue siendo el core, y `tr-007` sigue probándolo en el test de contrato.
2. **El string viaja al core tal como se tecleó:** punto decimal, sin `S/` y sin
   separadores de miles. Verificado contra el core: `"1,50"`, `"1 000.50"` y `"S/ 100.00"`
   devuelven `InvalidAmount`. El `.decimalPad` en un dispositivo con locale es_PE ofrece
   coma: el filtro de arriba la descarta, que es justo lo que hay que hacer. Y **nunca uses
   `NumberFormatter` para leer el campo**: devuelve `NSNumber`, o sea un `Double`.
3. **La pantalla de Aritmética no lleva este límite.** Ahí el contrato acepta escala libre
   en la entrada (`ar-001` es `"0.1"`); los 2 decimales son normativos solo para la
   transferencia.

## Formateo

```swift
let f = NumberFormatter()
f.numberStyle = .currency
f.locale = Locale(identifier: "es_PE")
```

Construye el `Decimal` desde el string del core con
`Decimal(string:locale:)` usando locale POSIX, para que el punto decimal se
interprete correctamente. Es el error más común en este archivo.

## Arquitectura de UI

Destilado de [TanayenAI](https://github.com/tohure/TanayenAI). **Con una advertencia grande
sobre qué NO copiar:** ese proyecto tiene un `*ViewModelWrapper.swift` por pantalla
—`ObservableObject` con `@Published` por campo, que observa un `StateFlow` de Kotlin vía
`KMPNativeCoroutines` y cancela el `Task` en `deinit`—. Ese wrapper existe **solo porque
ahí el ViewModel es Kotlin y hay que adaptarlo a SwiftUI**.

**Acá no hay nada que envolver.** El core es Rust y cruza por uniffi como funciones
síncronas: Swift llama `executeTransfer(...)` y le devuelve un valor, sin flows, sin
corrutinas, sin `Task` de observación, sin `deinit` que cancelar. Escribir un
`ViewModelWrapper` en esta POC sería copiar la solución sin el problema.

Lo que sí se toma es la forma: **un objeto de estado por pantalla, observable, con la vista
sin lógica.**

```swift
@Observable
final class TransferViewModel {
    var origin = ""
    var destination = ""
    var amount = ""               // String. Siempre. Nunca Double ni Decimal.
    var accounts: [Account] = []
    var result: TransferResult?
    var isLoading = false         // true mientras corre simulatedLatencyMs
    var error: String?            // ya resuelto a texto de usuario
}
```

- **`@Observable`** en vez de `ObservableObject` + `@Published`: menos ceremonia y
  solo invalida las vistas que leen la propiedad que cambió. El deployment target es 17.0,
  así que no hace falta ninguna alternativa.
- **`@MainActor` sobre la clase**, como en el original.
- **Las llamadas al core NO se envuelven en `Task`**, salvo en el benchmark. Son
  microsegundos; `Task` aquí solo agrega un salto de hilo y un frame de latencia.
- **El error es una propiedad del estado**, no un `throw` que sube a la vista. La vista lo
  pinta; quien traduce es el ViewModel, leyendo `contracts/messages.es.json`.
- **Para comparar u ordenar montos en UI: `Decimal` de Foundation.** Nunca `Double`.

### Cómo se escribe el ViewModel por dentro

Las mismas diez reglas que
[`apps/android/CONTEXT.md`](../android/CONTEXT.md) → "Cómo se escribe el ViewModel por
dentro", en Swift. Se listan aquí completas y no por referencia porque quien implemente iOS no
va a leer el CONTEXT de Android — pero **si cambian allí, cambian aquí**.

```swift
@MainActor
@Observable
final class TransferViewModel {
    private(set) var state = TransferUiState()      // la vista NO escribe estado

    private let core: CoreFinanciero
    private var allAccounts: [Account] = []          // cache crudo, aparte del estado

    // MARK: - Entrada del usuario

    func amountChanged(_ value: String) {
        guard amountPattern.matches(value) else { return }   // filtro de texto
        state.amount = value
    }

    // MARK: - Acciones

    func transfer() async {
        state.isLoading = true
        state.error = nil
        do {
            let result = try core.transfer(allAccounts, currentRequest())
            try? await Task.sleep(for: .milliseconds(Int(result.simulatedLatencyMs)))
            allAccounts = result.accounts
            state.result = result
        } catch {
            state.error = userMessage(error)         // ya traducido, no localizedDescription
        }
        state.isLoading = false                      // una sola salida: nunca queda colgado
    }

    func clearError() { state.error = nil }
}
```

1. **`private(set)`** sobre el estado: la vista lee, no escribe.
2. **Un `struct` de estado**, no propiedades sueltas. `struct` en Swift ya es valor: el
   `copy()` de Kotlin es gratis aquí.
3. **Funciones con nombre de dominio** —`transfer()`, `amountChanged(_:)`, `clearError()`—,
   no setters.
4. **`isLoading = false` en una sola salida.** El bug clásico es el `catch` que se olvida de
   apagar el spinner y deja la pantalla cargando para siempre. Acá se apaga después del
   `do/catch`, no dentro de cada rama.
5. **`clearError()` existe.** El error se consume; si no, reaparece al volver a la pantalla.
6. **Un booleano por operación**, no uno global.
7. **El error se guarda ya traducido**, leyendo `contracts/messages.es.json`.
   `localizedDescription` es diagnóstico (ver regla 3 del adapter).
8. **El cache crudo va aparte del estado.**
9. **Lo derivado se calcula en el ViewModel**, no en el `body` de la vista: `body` se
   re-evalúa en cada invalidación.
10. **`// MARK: -`** agrupando secciones — el equivalente de los comentarios de sección de
    Kotlin, y además puebla el jump bar de Xcode.

### Y cómo NO se escribe la capa de datos aquí

Vale íntegra la tabla de
[`apps/android/CONTEXT.md`](../android/CONTEXT.md) → "Y cómo NO se escribe la capa de datos
aquí": **sin protocolo de repositorio, sin mapeo a tipos propios, sin `Result` sellado
propio, sin capa reactiva y sin contenedor de DI.** El adapter reexporta los tipos de uniffi
y las llamadas son síncronas.

Lo único específico de Swift: **`async` no entra por la puerta de atrás.** `transfer()` es
`async` arriba **solo** por el `Task.sleep` que simula la latencia; la llamada al core en sí
es síncrona y no va envuelta en `Task`. Si te encuentras poniendo `await` sobre una función
del core, algo se desvió.

### Componentes compartidos

Los de [`docs/ui-spec.md`](../../docs/ui-spec.md) van en un `Components/` propio, con la
misma descomposición que Android para que las pantallas sean comparables lado a lado. Misma
convención de firma: el componente aporta tipografía y espaciado internos, el caller pone el
padding posicional.

## Pantallas

Las mismas cinco en las cuatro apps, con los mismos labels y el mismo orden de campos, para
que la comparación lado a lado en la demo sea limpia: **Aritmética, Transferencia, Tarjeta,
Benchmark**, y el pie con `coreVersion()` visible en las cuatro.

**Los wireframes, los labels exactos y el orden de campos viven en
[`docs/ui-spec.md`](../../docs/ui-spec.md)** — normativo para las cuatro apps. No se
duplican aquí: cuatro copias de la misma lista divergen, que es justo lo que la demo no puede
permitirse. Cambiar un label obliga a cambiarlo en las cuatro apps y en ese archivo, en el
mismo cambio.

## Pruebas

`Swift Testing` que lee `contracts/cases.json` desde el bundle de test y compara
strings exactos con `#expect(a == b)`. Mismo archivo, mismos casos, mismos
resultados que Android, RN y web.

## Prohibiciones

- No edites `Generated/` ni el `.xcframework`.
- No agregues ninguna dependencia de cálculo financiero.
- No uses `Double` para dinero, ni en tests.
- No agregues red ni Core Data.
