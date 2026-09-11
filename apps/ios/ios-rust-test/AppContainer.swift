import Foundation

/// Cableado manual, sin librería de DI.
///
/// Con cinco pantallas y tres dependencias, explícito gana: se lee de arriba abajo y el
/// compilador lo verifica entero. Un contenedor de DI no sería *más* desacoplado, sería
/// más automático — y fallaría más tarde.
struct AppContainer {
    let core: CoreFinanciero
    let contract: ContractSource
    let messages: ContractMessages

    /// Lanza si el contrato no está en el bundle: es un fallo de build, no de dominio, y
    /// tiene que verse al arrancar en vez de dejar la pantalla de Transferencia sin
    /// cuentas y sin explicación.
    init(bundle: Bundle = .main) throws {
        core = UniffiCoreFinanciero()
        contract = try BundleContractSource(bundle: bundle)
        messages = ContractMessages(source: try BundleMessageSource(bundle: bundle))
    }
}
