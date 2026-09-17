import Foundation
import Testing
@testable import ios_rust_test

@Suite("El mapeo de errores a texto de usuario")
struct ContractMessagesTest {
    private func messages() throws -> ContractMessages {
        ContractMessages(source: try BundleMessageSource(bundle: Bundle(for: BundleToken.self)))
    }

    @Test("los diez nombres del contrato salen de las diez variantes")
    func theTenVariantsMapToTheTenContractNames() {
        #expect(
            DomainError.Length(field: "cci", expected: 20, received: 18).contractName
                == "Longitud"
        )
        #expect(DomainError.CheckDigit.contractName == "DigitoControl")
        #expect(DomainError.UnknownBank(code: "999").contractName == "BancoDesconocido")
        #expect(DomainError.InvalidAmount(detail: "cero").contractName == "MontoInvalido")
        #expect(DomainError.AccountNotFound(id: "x").contractName == "CuentaNoEncontrada")
        #expect(DomainError.SameAccount.contractName == "MismaCuenta")
        #expect(
            DomainError.InsufficientFunds(available: "1.00", required: "2.00").contractName
                == "SaldoInsuficiente"
        )
        #expect(DomainError.Encryption(detail: "nonce").contractName == "Cifrado")
        #expect(DomainError.Decryption(detail: "tag").contractName == "Descifrado")
        #expect(DomainError.OutOfRange(field: "monto").contractName == "FueraDeRango")
    }

    @Test("un error sin placeholders devuelve su mensaje tal cual")
    func anErrorWithNoPlaceholdersReturnsItsMessageVerbatim() throws {
        #expect(
            try messages().userMessage(.SameAccount)
                == "La cuenta de origen y la de destino son la misma."
        )
    }

    @Test("los placeholders se interpolan CRUDOS, sin formatear el monto")
    func placeholdersAreInterpolatedRaw() throws {
        let text = try messages().userMessage(
            .InsufficientFunds(available: "1200.50", required: "10000.50")
        )
        #expect(text == "Saldo insuficiente: tienes 1200.50 y se necesitan 10000.50.")
        // Ni `S/` ni separadores de miles: los formateadores de Android, iOS y el navegador
        // no coinciden entre sí y una diferencia rompe la comparación carácter por carácter.
        #expect(!text.contains("S/"))
        #expect(!text.contains(","))
    }

    private final class BundleToken {}

    @Test("un error que NO es de dominio no muestra su texto de diagnóstico")
    func aNonDomainErrorDoesNotShowDiagnosticText() throws {
        // La rama NO es inalcanzable, contra lo que decía el PENDING de esta app. El `catch`
        // final de cada ViewModel atrapa cualquier cosa, y en Android el equivalente llegó a
        // poner `java.lang.UnsatisfiedLinkError: dlopen failed: …` en pantalla — verificado
        // con un test, no supuesto.
        struct BoomError: Error { let detail = "dlopen failed: library not found" }

        let shown = try messages().userMessage(BoomError() as Error)
        #expect(shown == "No se pudo completar la operación.")
        #expect(!shown.contains("dlopen"))
        #expect(!shown.contains("BoomError"))
    }

    @Test("la sobrecarga genérica sigue resolviendo los errores de dominio")
    func theGenericOverloadStillResolvesDomainErrors() throws {
        // Si esto fallara —o entrara en recursión— la sobrecarga estaría capturando también
        // el camino normal, y las diez variantes perderían su mensaje.
        let shown = try messages().userMessage(DomainError.SameAccount as Error)
        #expect(shown == "La cuenta de origen y la de destino son la misma.")
    }
}
