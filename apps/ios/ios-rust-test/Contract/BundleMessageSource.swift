import Foundation

struct BundleMessageSource: MessageSource {
    enum LoadError: Error, CustomStringConvertible {
        case notInBundle
        case malformed
        var description: String {
            switch self {
            case .notInBundle:
                return
                    "messages.es.json no está en el bundle: la fase que copia contracts/ no corrió."
            case .malformed:
                return "messages.es.json no tiene la clave `mensajes` con forma de diccionario."
            }
        }
    }

    private let table: [String: String]

    init(bundle: Bundle) throws {
        guard let url = bundle.url(forResource: "messages.es", withExtension: "json") else {
            throw LoadError.notInBundle
        }
        let raw = try JSONSerialization.jsonObject(with: try Data(contentsOf: url))
        guard let root = raw as? [String: Any],
            let table = root["mensajes"] as? [String: String]
        else { throw LoadError.malformed }
        self.table = table
    }

    func messages() -> [String: String] { table }
}
