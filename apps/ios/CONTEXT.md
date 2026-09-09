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
└── UI/  SimuladorView.swift, ValidadorCciView.swift, BenchmarkView.swift

El XCFramework **debe** construirse pasando `-headers` con el `.h` y el `module.modulemap`
que genera uniffi; solo con los `.a` Swift no ve ningún símbolo. Es el fallo de
integración más común en iOS + uniffi:

```bash
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a     -headers Generated/include \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a -headers Generated/include \
  -output ../apps/ios/CoreFinanciero.xcframework
```

Enlaza el XCFramework en Build Phases. Verifica que incluya los slices
arm64 device y arm64 simulator; sin el segundo no corre en Macs con Apple
Silicon.

## Cómo consumir el core

```swift
enum CoreFinanciero {
    static func cronograma(monto: String, tea: String,
                           cuotas: UInt32, seguro: String) throws -> Cronograma {
        try generarCronograma(monto: monto, teaPorcentaje: tea,
                              numeroCuotas: cuotas, tasaSeguroMensual: seguro)
    }
}
```

Reglas:

1. Montos como `String` de extremo a extremo. **Nunca `Double` ni `Float`.**
2. Para comparar u ordenar en la UI, usa `Decimal` de Foundation.
3. Los `ErrorDominio` llegan como `Error` de Swift; captúralos con `do/catch`
   en la vista y traduce ahí el mensaje de usuario.
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

Las mismas cuatro que Android: simulador, validador de CCI, benchmark y
`version_core()` visible. Los textos, labels y orden de campos deben coincidir
con Android para que la comparación lado a lado en la demo sea limpia.

## Pruebas

`XCTest` que lee `contracts/cases.json` desde el bundle de test y compara
strings exactos con `XCTAssertEqual`. Mismo archivo, mismos casos, mismos
resultados que Android, RN y web.

## Prohibiciones

- No edites `Generated/` ni el `.xcframework`.
- No agregues ninguna dependencia de cálculo financiero.
- No uses `Double` para dinero, ni en tests.
- No agregues red ni Core Data.