import Foundation
import OSLog

extension DomainError {
    /// El nombre que `contracts/cases.json` le da a este error.
    ///
    /// `DomainError::contract_name()` es un método de Rust y **no cruza el FFI**: el enum
    /// generado trae solo los nombres en inglés.
    ///
    /// El `switch` va **exhaustivo y sin `default`**. Es deliberado: agregar una undécima
    /// variante al core tiene que romper la compilación aquí —un fallo ruidoso y ubicado—
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
        case .Decryption: return "Descifrado"
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
    private let logger = Logger(subsystem: "dev.tohure.ios-rust-test", category: "CoreFinanciero")

    init(source: MessageSource) {
        table = source.messages()
    }

    /// Lo que ve el usuario cuando falla algo que **no** es un error de dominio. Normativo en
    /// `docs/ui-spec.md`, igual en las cuatro apps. No dice «vuelve a intentarlo» a propósito:
    /// si el core no responde, reintentar no arregla nada, y prometer una salida que no existe
    /// es peor que no decir nada.
    static let fallback = "No se pudo completar la operación."

    /// El texto para un `Error` cualquiera, que es lo que de verdad llega al `catch` genérico
    /// de los ViewModels.
    ///
    /// **No es defensivo, cubre un caso real.** El `catch` final de cada ViewModel atrapa
    /// cualquier cosa que no sea `DomainError`, y antes guardaba `"\(error)"` — o sea el texto
    /// de diagnóstico, en la cara del usuario. En Android el equivalente mostraba
    /// `java.lang.UnsatisfiedLinkError: dlopen failed: …`, verificado con un test.
    ///
    /// **El diagnóstico no se pierde: se loguea acá.** En Android se loguea en el adapter,
    /// porque allá `runCatching` es el único punto donde se atrapa; acá no hay tal punto —los
    /// métodos del protocolo son `throws` y cada ViewModel tiene su `catch`—, así que el lugar
    /// con un solo dueño es éste.
    func userMessage(_ error: Error) -> String {
        if let domain = error as? DomainError {
            return userMessage(domain)
        }
        logger.error("error no-dominio cruzando el FFI: \(String(describing: error))")
        return Self.fallback
    }

    func userMessage(_ error: DomainError) -> String {
        let name = error.contractName
        guard let template = table[name] else {
            return "Error del núcleo: \(name)"
        }
        return interpolate(template, error)
    }

    /// Reemplaza `{code}`, `{id}`, `{available}`, `{required}` y `{field}` por los campos de
    /// la variante, **crudos**. Nada de `NumberFormatter` aquí: los formateadores de Android,
    /// iOS y el navegador no coinciden entre sí, y una diferencia rompe la comparación
    /// carácter por carácter que es toda la tesis. El formateo vive en las pantallas.
    ///
    /// `Longitud`, `MontoInvalido`, `Cifrado` y `Descifrado` llevan campos
    /// (`field`/`expected`/`received`, `detail`) que `contracts/messages.es.json` no usa en su
    /// plantilla — ver `contracts/README.md` — así que esos cuatro casos devuelven la plantilla
    /// sin tocar, igual que `CheckDigit` y `SameAccount`, que no llevan campos.
    private func interpolate(_ template: String, _ error: DomainError) -> String {
        switch error {
        case .Length, .CheckDigit, .InvalidAmount, .SameAccount, .Encryption, .Decryption:
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
