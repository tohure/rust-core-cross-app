@testable import ios_rust_test

/// Determinista y sin núcleo: los tests de ViewModel prueban el ViewModel, no el core.
/// Quien prueba el core es `ContractTest`, contra los 28 casos reales.
///
/// Cada closure tiene un valor por defecto, así que un test solo reemplaza lo que le
/// importa.
final class FakeCoreFinanciero: CoreFinanciero {
    var addResult: (String, String) throws -> String = { a, b in "\(a)+\(b)" }
    var subtractResult: (String, String) throws -> String = { a, b in "\(a)-\(b)" }
    var itfResult: (String) throws -> String = { _ in "0.01" }
    var cciResult: (String) throws -> ValidCci = { _ in
        ValidCci(
            bankCode: "002", bankName: "Banco Demo Uno", branch: "191", account: "001234567890")
    }
    var cardResult: (String) throws -> ValidCard = { _ in
        ValidCard(brand: "Visa", masked: "4111 **** **** 1111")
    }
    var encryptResult: (String) throws -> String = { _ in "deadbeef" }
    var decryptResult: (String) throws -> String = { _ in "4111111111111111" }
    var transferResult: ([Account], TransferRequest) throws -> TransferResult = { accounts, _ in
        TransferResult(
            accounts: accounts,
            itfFee: "0.01",
            totalDebited: "100.01",
            receipt: "TRF-9047-1065-10000",
            simulatedLatencyMs: 0  // cero: los tests no esperan de verdad
        )
    }
    var version = "1.0.0+test"

    func add(a: String, b: String) throws -> String { try addResult(a, b) }
    func subtract(a: String, b: String) throws -> String { try subtractResult(a, b) }
    func calculateItf(amount: String) throws -> String { try itfResult(amount) }
    func validateCci(cci: String) throws -> ValidCci { try cciResult(cci) }
    func validateCard(number: String) throws -> ValidCard { try cardResult(number) }
    func encrypt(text: String, keyHex: String, nonceHex: String) throws -> String {
        try encryptResult(text)
    }
    func decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) throws -> String {
        try decryptResult(ciphertextHex)
    }
    func transfer(accounts: [Account], request: TransferRequest) throws -> TransferResult {
        try transferResult(accounts, request)
    }
    func coreVersion() -> String { version }
}
