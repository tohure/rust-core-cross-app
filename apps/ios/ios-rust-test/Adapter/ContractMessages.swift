import Foundation

extension DomainError {
    /// El nombre que `contracts/cases.json` le da a este error.
    ///
    /// `DomainError::contract_name()` es un método de Rust y **no cruza el FFI**: el enum
    /// generado trae solo los nombres en inglés.
    ///
    /// El `switch` va **exhaustivo y sin `default`**. Es deliberado: agregar una décima
    /// variante al core tiene que romper la compilación acá —un fallo ruidoso y ubicado—
    /// en vez de caer en un `"Desconocido"` que compila, pasa en verde, y se descubre el
    /// día de la demo cuando esta app muestra un error que las otras tres no.
    var contractName: String {
        switch self {
        case .Length: return "Longitud"
        case .CheckDigit: return "DigitoControl"
        case .UnknownBank: return "BancoDesconocido"
        case .InvalidAmount: return "MontoInvalido"
        case .AccountNotFound: return "CuentaNoEncontrada"
        case .SameAccount: return "MismaCuenta"
        case .InsufficientFunds: return "SaldoInsuficiente"
        case .Encryption: return "Cifrado"
        case .OutOfRange: return "FueraDeRango"
        }
    }
}

/// Traduce un error del core al texto que ve el usuario.
///
/// Vive en producción y no solo en el test porque `contracts/messages.es.json` indexa los
/// mensajes por nombre del contrato: la pantalla de error necesita el mapeo igual que el
/// test de contrato. **El test de contrato reusa esta misma función** en vez de escribir
/// la suya, así que verifica contra `cases.json` el mapeo que la UI usa de verdad.
struct ContractMessages {
    private let table: [String: String]

    init(source: MessageSource) {
        table = source.messages()
    }

    func userMessage(_ error: DomainError) -> String {
        let name = error.contractName
        guard let template = table[name] else {
            return "Error del núcleo: \(name)"
        }
        return interpolate(template, error)
    }

    /// Reemplaza `{code}`, `{id}`, `{available}`, `{required}` y `{field}` por los campos de
    /// la variante, **crudos**. Nada de `NumberFormatter` acá: los formateadores de Android,
    /// iOS y el navegador no coinciden entre sí, y una diferencia rompe la comparación
    /// carácter por carácter que es toda la tesis. El formateo vive en las pantallas.
    ///
    /// `Longitud`, `MontoInvalido` y `Cifrado` llevan campos (`field`/`expected`/`received`,
    /// `detail`) que `contracts/messages.es.json` no usa en su plantilla — ver
    /// `contracts/README.md` — así que esos tres casos devuelven la plantilla sin tocar,
    /// igual que `CheckDigit` y `SameAccount`, que no llevan campos.
    private func interpolate(_ template: String, _ error: DomainError) -> String {
        switch error {
        case .Length, .CheckDigit, .InvalidAmount, .SameAccount, .Encryption:
            return template
        case .UnknownBank(let code):
            return template.replacingOccurrences(of: "{code}", with: code)
        case .AccountNotFound(let id):
            return template.replacingOccurrences(of: "{id}", with: id)
        case .InsufficientFunds(let available, let required):
            return
                template
                .replacingOccurrences(of: "{available}", with: available)
                .replacingOccurrences(of: "{required}", with: required)
        case .OutOfRange(let field):
            return template.replacingOccurrences(of: "{field}", with: field)
        }
    }
}
