/// Llama a las funciones globales que emite uniffi.
///
/// **No traduce errores**: propaga el `DomainError` tal cual. Quien lo convierte a texto de
/// usuario es el ViewModel, con `ContractMessages`.
///
/// Los nombres del core se reexportan, no se renombran: una segunda nomenclatura en Swift
/// es una capa que hay que mantener sincronizada a mano y que se desincroniza en la primera
/// regeneración de bindings. El prefijo `CoreFinancieroKit.` en cada llamada desambigua la
/// función global del método de este `struct`, que se llaman igual.
public struct UniffiCoreFinanciero: CoreFinanciero {
    public init() {}

    public func add(a: String, b: String) throws -> String {
        try CoreFinancieroKit.add(a: a, b: b)
    }

    public func subtract(a: String, b: String) throws -> String {
        try CoreFinancieroKit.subtract(a: a, b: b)
    }

    public func calculateItf(amount: String) throws -> String {
        try CoreFinancieroKit.calculateItf(amount: amount)
    }

    public func validateCci(cci: String) throws -> ValidCci {
        try CoreFinancieroKit.validateCci(cci: cci)
    }

    public func validateCard(number: String) throws -> ValidCard {
        try CoreFinancieroKit.validateCard(number: number)
    }

    public func encrypt(text: String, keyHex: String, nonceHex: String) throws -> String {
        try CoreFinancieroKit.encrypt(text: text, keyHex: keyHex, nonceHex: nonceHex)
    }

    public func decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) throws -> String {
        try CoreFinancieroKit.decrypt(ciphertextHex: ciphertextHex, keyHex: keyHex, nonceHex: nonceHex)
    }

    public func transfer(accounts: [Account], request: TransferRequest) throws -> TransferResult {
        try CoreFinancieroKit.executeTransfer(accounts: accounts, request: request)
    }

    public func coreVersion() -> String {
        CoreFinancieroKit.coreVersion()
    }
}
