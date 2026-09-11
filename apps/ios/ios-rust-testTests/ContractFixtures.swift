import Foundation
import Testing

/// Lee los JSON del contrato desde el bundle de **test**.
///
/// No usa `Bundle.main`: en un bundle de test eso apunta al runner del simulador, no al
/// `.xctest`. Es el error que hace que el archivo "no aparezca" aunque la fase de copia
/// haya corrido bien.
enum ContractFixtures {
    enum FixtureError: Error, CustomStringConvertible {
        case missing(String)
        var description: String {
            switch self {
            case .missing(let name):
                return """
                    `\(name)` no está en el bundle de test. La Run Script Phase que copia \
                    contracts/*.json no corrió, o corrió sobre el target equivocado.
                    """
            }
        }
    }

    static func data(_ name: String) throws -> Data {
        let bundle = Bundle(for: BundleToken.self)
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw FixtureError.missing("\(name).json")
        }
        return try Data(contentsOf: url)
    }

    /// Solo existe para darle a `Bundle(for:)` una clase de este bundle.
    private final class BundleToken {}
}

@Suite("El contrato llega al bundle de test")
struct ContractInBundleTest {
    @Test("cases.json está en el bundle y es la versión que esta fase espera")
    func casesIsBundledAtTheExpectedVersion() throws {
        let raw = try JSONSerialization.jsonObject(with: try ContractFixtures.data("cases"))
        let root = try #require(raw as? [String: Any])
        #expect(root["version"] as? String == "2.3.0")
        #expect(root["moneda"] as? String == "PEN")
    }

    @Test("messages.es.json está en el bundle con los nueve mensajes")
    func messagesIsBundled() throws {
        let raw = try JSONSerialization.jsonObject(with: try ContractFixtures.data("messages.es"))
        let root = try #require(raw as? [String: Any])
        let messages = try #require(root["mensajes"] as? [String: String])
        #expect(messages.count == 9)
    }
}

// MARK: - Los grupos de cases.json

struct ContractFile: Decodable, Sendable {
    let version: String
    let currency: String
    let itfRate: String
    let demoKeyHex: String
    let demoNonceHex: String
    let arithmetic: [ArithmeticCase]
    let initialAccounts: [AccountRow]
    let transfer: [TransferCase]
    let cci: [CciCase]
    let itf: [ItfCase]
    let card: [CardCase]

    enum CodingKeys: String, CodingKey {
        case version
        case currency = "moneda"
        case itfRate = "_alicuota_itf"
        case demoKeyHex = "_clave_demo_hex"
        case demoNonceHex = "_nonce_demo_hex"
        case arithmetic = "aritmetica"
        case initialAccounts = "cuentas_iniciales"
        case transfer = "transferencia"
        case cci
        case itf
        case card = "tarjeta"
    }
}

struct AccountRow: Decodable, Sendable {
    let id: String
    let holder: String
    let balance: String
    enum CodingKeys: String, CodingKey {
        case id
        case holder = "titular"
        case balance = "saldo"
    }
}

struct ArithmeticCase: Decodable, Sendable, CustomTestStringConvertible {
    let id: String
    let op: String
    let a: String
    let b: String
    let expected: String
    enum CodingKeys: String, CodingKey {
        case id, op, a, b
        case expected = "esperado"
    }
    var testDescription: String { id }
}

struct TransferCase: Decodable, Sendable, CustomTestStringConvertible {
    struct Input: Decodable, Sendable {
        let origin: String
        let destination: String
        let amount: String
        enum CodingKeys: String, CodingKey {
            case origin = "origen"
            case destination = "destino"
            case amount = "monto"
        }
    }
    struct Expected: Decodable, Sendable {
        let accounts: [AccountRow]
        let itfFee: String
        let totalDebited: String
        let receipt: String
        let simulatedLatencyMs: UInt32
        enum CodingKeys: String, CodingKey {
            case accounts = "cuentas"
            case itfFee = "comision_itf"
            case totalDebited = "total_debitado"
            case receipt = "comprobante"
            case simulatedLatencyMs = "latencia_simulada_ms"
        }
    }
    let id: String
    let input: Input
    let valid: Bool
    let expected: Expected?
    let error: String?
    enum CodingKeys: String, CodingKey {
        case id
        case input = "entrada"
        case valid = "valido"
        case expected = "esperado"
        case error
    }
    var testDescription: String { id }
}

struct CciCase: Decodable, Sendable, CustomTestStringConvertible {
    struct Expected: Decodable, Sendable {
        let bankCode: String
        let bankName: String
        let branch: String
        let account: String
        enum CodingKeys: String, CodingKey {
            case bankCode = "codigo_banco"
            case bankName = "nombre_banco"
            case branch = "oficina"
            case account = "cuenta"
        }
    }
    let id: String
    let input: String
    let valid: Bool
    let expected: Expected?
    let error: String?
    enum CodingKeys: String, CodingKey {
        case id
        case input = "entrada"
        case valid = "valido"
        case expected = "esperado"
        case error
    }
    var testDescription: String { id }
}

struct ItfCase: Decodable, Sendable, CustomTestStringConvertible {
    let id: String
    let input: String
    let expected: String
    enum CodingKeys: String, CodingKey {
        case id
        case input = "entrada"
        case expected = "esperado"
    }
    var testDescription: String { id }
}

struct CardCase: Decodable, Sendable, CustomTestStringConvertible {
    struct Expected: Decodable, Sendable {
        let brand: String
        let masked: String
        let cipherHex: String
        enum CodingKeys: String, CodingKey {
            case brand = "marca"
            case masked = "enmascarado"
            case cipherHex = "cifrado_hex"
        }
    }
    let id: String
    let input: String
    let valid: Bool
    let expected: Expected?
    let error: String?
    enum CodingKeys: String, CodingKey {
        case id
        case input = "entrada"
        case valid = "valido"
        case expected = "esperado"
        case error
    }
    var testDescription: String { id }
}

extension ContractFixtures {
    /// Se carga una sola vez. `@Test(arguments:)` necesita los casos antes de correr, así
    /// que esto se evalúa al inicializar el tipo.
    ///
    /// Si el contrato no está o no decodifica, `fatalError` es lo correcto **aquí y solo
    /// aquí**: es código de test, y un contrato ilegible tiene que detener la suite entera
    /// con un mensaje claro en vez de dejar cero casos corriendo en verde.
    static let contract: ContractFile = {
        do {
            return try JSONDecoder().decode(ContractFile.self, from: try data("cases"))
        } catch {
            fatalError("No se pudo leer contracts/cases.json desde el bundle de test: \(error)")
        }
    }()
}
