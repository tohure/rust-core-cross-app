import Foundation

/// Lee `cases.json` del bundle que se le pase.
///
/// El `init` lanza a propósito: un contrato ausente es un fallo de build —la Run Script
/// Phase no corrió— y tiene que romper ruidosamente al arrancar, no devolver una lista
/// vacía que deje la pantalla de Transferencia sin cuentas y sin explicación.
struct BundleContractSource: ContractSource {
    enum LoadError: Error, CustomStringConvertible {
        case notInBundle
        case malformed(String)
        var description: String {
            switch self {
            case .notInBundle:
                return "cases.json no está en el bundle: la fase que copia contracts/ no corrió."
            case .malformed(let key):
                return "cases.json no tiene `\(key)` o no tiene la forma esperada."
            }
        }
    }

    private let accounts: [Account]
    private let keyHex: String
    private let nonceHex: String

    init(bundle: Bundle) throws {
        guard let url = bundle.url(forResource: "cases", withExtension: "json") else {
            throw LoadError.notInBundle
        }
        let raw = try JSONSerialization.jsonObject(with: try Data(contentsOf: url))
        guard let root = raw as? [String: Any] else { throw LoadError.malformed("raíz") }

        guard let rows = root["cuentas_iniciales"] as? [[String: String]] else {
            throw LoadError.malformed("cuentas_iniciales")
        }
        accounts = try rows.map { row in
            guard let id = row["id"], let holder = row["titular"], let balance = row["saldo"] else {
                throw LoadError.malformed("cuentas_iniciales[]")
            }
            return Account(id: id, holder: holder, balance: balance)
        }

        guard let key = root["_clave_demo_hex"] as? String else {
            throw LoadError.malformed("_clave_demo_hex")
        }
        guard let nonce = root["_nonce_demo_hex"] as? String else {
            throw LoadError.malformed("_nonce_demo_hex")
        }
        keyHex = key
        nonceHex = nonce
    }

    func initialAccounts() -> [Account] { accounts }
    func demoKeyHex() -> String { keyHex }
    func demoNonceHex() -> String { nonceHex }
}
