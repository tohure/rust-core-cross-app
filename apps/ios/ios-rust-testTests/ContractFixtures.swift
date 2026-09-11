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
