# app-ios

App nativa iOS que consume `rust-core`. Espejo funcional de `apps/android`.

Stack: Swift, SwiftUI, iOS 16+, XCFramework.

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
  hay que escribirlo, nueve líneas, **en el `XCTest` golden, no en producción**, con un
  `switch` que cubra los nueve casos **sin `default`**, para que una décima variante rompa
  la compilación en vez de pasar en verde. Ver
  [rust-core/README.md](../../rust-core/README.md).

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el test golden. Si se decide darles pantalla, se agrega **en las cuatro apps a
la vez** — la paridad es la demo.

## Estructura

CoreFinancieroPOC/
├── CoreFinanciero.xcframework/   artefacto generado, no editar
├── Generated/                     Swift generado por uniffi, no editar
│                                  core_financiero.swift + include/{core_financieroFFI.h,
│                                  module.modulemap}
├── Adapter/CoreFinanciero.swift
├── Format/MoneyFormatter.swift
└── UI/  AritmeticaView.swift, TransferenciaView.swift, TarjetaView.swift, BenchmarkView.swift

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
> no exporta nada", y se descubre tarde. Antes de correr `-create-xcframework`, armá el
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
   iguales en las cuatro apps, están en la tabla de
   [rust-core/README.md](../../rust-core/README.md) — "Los mensajes de error en
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
    // iOS 17+ usa la firma de dos parámetros: .onChange(of: monto) { _, nuevo in ... }
    .onChange(of: monto) { nuevo in
        if nuevo.range(of: montoValido, options: .regularExpression) == nil {
            monto = String(nuevo.dropLast())   // filtro de texto: se descarta la última tecla
        }
    }
```

Tres cosas que no son opcionales:

1. **Es un filtro de texto, no una regla de negocio.** No parsea, no redondea, no calcula:
   decide si el string que el usuario acaba de teclear se acepta en el campo. Quien valida
   sigue siendo el core, y `tr-007` sigue probándolo en el golden.
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

## Pantallas

Las mismas cinco en las cuatro apps, con los mismos labels y el mismo orden de campos, para
que la comparación lado a lado en la demo sea limpia.

1. **Aritmética.** Dos inputs y una operación. Muestra lado a lado el resultado con el
   tipo de punto flotante nativo de la plataforma y el del core. Los seis casos del
   contrato divergen: `0.1 + 0.2` da `0.30000000000000004` con double y `0.30` con el core.
   Es la única pantalla donde se permite usar el tipo flotante nativo, y existe justamente
   para exhibir el fallo.
2. **Transferencia.** Dos cuentas fake en memoria. Monto, origen, destino. Muestra la
   comisión ITF, el total debitado, el comprobante y los saldos nuevos. La app espera
   `simulatedLatencyMs` antes de pintar, para que parezca una llamada HTTP: **no hay red**.
   Las cuentas se reinician al cerrar la app; sin BD, sin cache.
3. **Tarjeta.** Un número de tarjeta fake. Valida por Luhn, muestra marca y enmascarado, y
   cifra con ChaCha20-Poly1305. El hex resultante debe ser idéntico al de las otras tres
   plataformas — y lo que cifra una descifra cualquier otra.
4. **Benchmark.** Ejecuta el core N veces y reporta p50/p95 contra una implementación
   equivalente nativa que vive solo en el código de test.
5. **Pie de pantalla:** `coreVersion()` visible en todas. En la demo se compara con las
   otras tres apps: mismo string = mismo build.

## Pruebas

`XCTest` que lee `contracts/cases.json` desde el bundle de test y compara
strings exactos con `XCTAssertEqual`. Mismo archivo, mismos casos, mismos
resultados que Android, RN y web.

## Prohibiciones

- No edites `Generated/` ni el `.xcframework`.
- No agregues ninguna dependencia de cálculo financiero.
- No uses `Double` para dinero, ni en tests.
- No agregues red ni Core Data.
