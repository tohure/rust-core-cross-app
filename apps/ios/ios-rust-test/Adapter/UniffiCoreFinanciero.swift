/// Llama a las funciones globales que emite uniffi.
///
/// **No traduce errores**: propaga el `DomainError` tal cual. Quien lo convierte a texto de
/// usuario es el ViewModel, con `ContractMessages`.
///
/// Los nombres del core se reexportan, no se renombran: una segunda nomenclatura en Swift
/// es una capa que hay que mantener sincronizada a mano y que se desincroniza en la primera
/// regeneración de bindings. El prefijo `ios_rust_test.` en cada llamada desambigua la
/// función global del método de este `struct`, que se llaman igual.
struct UniffiCoreFinanciero: CoreFinanciero {
    func add(a: String, b: String) throws -> String {
        try ios_rust_test.add(a: a, b: b)
    }

    func subtract(a: String, b: String) throws -> String {
        try ios_rust_test.subtract(a: a, b: b)
    }

    func calculateItf(amount: String) throws -> String {
        try ios_rust_test.calculateItf(amount: amount)
    }

    func validateCci(cci: String) throws -> ValidCci {
        try ios_rust_test.validateCci(cci: cci)
    }

    func validateCard(number: String) throws -> ValidCard {
        try ios_rust_test.validateCard(number: number)
    }

    func encrypt(text: String, keyHex: String, nonceHex: String) throws -> String {
        try ios_rust_test.encrypt(text: text, keyHex: keyHex, nonceHex: nonceHex)
    }

    func decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) throws -> String {
        try ios_rust_test.decrypt(ciphertextHex: ciphertextHex, keyHex: keyHex, nonceHex: nonceHex)
    }

    func transfer(accounts: [Account], request: TransferRequest) throws -> TransferResult {
        try ios_rust_test.executeTransfer(accounts: accounts, request: request)
    }

    func coreVersion() -> String {
        ios_rust_test.coreVersion()
    }
}
