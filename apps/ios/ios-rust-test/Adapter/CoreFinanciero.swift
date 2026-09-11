/// La única superficie por la que la app habla con el núcleo.
///
/// **Reexporta los tipos de uniffi; no los traduce.** Un `toDomain()` que mapee `Account`
/// o `TransferResult` a tipos Swift paralelos duplicaría el contrato, se desincronizaría
/// en la primera regeneración de bindings, y es exactamente lo que esta POC argumenta que
/// no hay que hacer. El protocolo existe para sustituir la implementación, no los tipos.
///
/// **Por qué existe, dicho sin maquillaje.** En Android era obligatorio: los tests de JVM
/// no pueden cargar la `.so`. **Aquí no lo es** — los tests corren en el simulador
/// enlazados contra la app y pueden llamar al core real. Se conserva por dos razones
/// honestas: los tests de ViewModel quedan deterministas y no dependen del comportamiento
/// del core, y las cuatro apps mantienen la misma forma, que es lo que hace comparable el
/// code review. No se justifica como "testabilidad sin FFI", porque en iOS eso no es
/// cierto.
protocol CoreFinanciero {
    func add(a: String, b: String) throws -> String
    func subtract(a: String, b: String) throws -> String
    func calculateItf(amount: String) throws -> String
    func validateCci(cci: String) throws -> ValidCci
    func validateCard(number: String) throws -> ValidCard
    func encrypt(text: String, keyHex: String, nonceHex: String) throws -> String
    func decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) throws -> String
    func transfer(accounts: [Account], request: TransferRequest) throws -> TransferResult

    /// La única que no lanza. Es la prueba en pantalla de que las cuatro apps comparten build.
    func coreVersion() -> String
}
