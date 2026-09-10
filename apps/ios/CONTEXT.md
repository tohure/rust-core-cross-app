# app-ios

App nativa iOS que consume `rust-core`. Espejo funcional de `apps/android`.

Stack: Swift, SwiftUI, iOS 16+, XCFramework.

## Regla central

Idéntica a Android: **cero reglas de negocio en esta app.** Toda validación y
todo cálculo se delega al core. Esta app solo pinta y formatea.

## Estructura

CoreFinancieroPOC/
├── CoreFinanciero.xcframework/   artefacto generado, no editar
├── Generated/                     Swift generado por uniffi, no editar
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
    static func transferir(cuentas: [Cuenta],
                           _ s: SolicitudTransferencia) throws -> ResultadoTransferencia {
        try ejecutarTransferencia(cuentas: cuentas, solicitud: s)
    }

    static func cifrar(_ numero: String, claveHex: String,
                       nonceHex: String) throws -> String {
        try CoreFinancieroFFI.cifrar(texto: numero, claveHex: claveHex, nonceHex: nonceHex)
    }
}
```

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

Las mismas cinco que Android, con los mismos labels y el mismo orden de campos, para que
la comparación lado a lado en la demo sea limpia.

1. **Aritmética.** Dos inputs y una operación. Muestra lado a lado el resultado con el
   tipo de punto flotante nativo de la plataforma y el del core. Los seis casos del
   contrato divergen: `0.1 + 0.2` da `0.30000000000000004` con double y `0.30` con el core.
   Es la única pantalla donde se permite usar el tipo flotante nativo, y existe justamente
   para exhibir el fallo.
2. **Transferencia.** Dos cuentas fake en memoria. Monto, origen, destino. Muestra la
   comisión ITF, el total debitado, el comprobante y los saldos nuevos. La app espera
   `latencia_simulada_ms` antes de pintar, para que parezca una llamada HTTP: **no hay red**.
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