import Foundation

/// Máximo 2 decimales y hasta 9 enteros. Es un filtro de **texto**, no una regla de negocio.
private let amountPattern = /^\d{0,9}(\.\d{0,2})?$/

@MainActor
@Observable
final class TransferViewModel {
    private(set) var state = TransferUiState()

    private let core: CoreFinanciero
    private let messages: ContractMessages
    /// Cache crudo, separado del estado: el estado guarda lo que la pantalla pinta.
    private var allAccounts: [Account]

    init(core: CoreFinanciero, contract: ContractSource, messages: ContractMessages) {
        self.core = core
        self.messages = messages
        // Las dos cuentas son DATOS DEL CONTRATO, no de la app: hardcodearlas aquí las
        // duplicaría en las cuatro plataformas y divergirían.
        allAccounts = contract.initialAccounts()
        state.accounts = allAccounts
        state.origin = allAccounts.first?.id ?? ""
        state.destination = allAccounts.dropFirst().first?.id ?? ""
    }

    // MARK: - Entrada del usuario

    func originChanged(_ value: String) {
        state.origin = value
        clearError()
    }

    func destinationChanged(_ value: String) {
        state.destination = value
        clearError()
    }

    /// El core ya rechaza un monto con más de 2 decimales (`tr-007`, `MontoInvalido`), pero
    /// el usuario no tiene que llegar hasta ahí: es una demo y la pantalla tiene que verse
    /// bien. Esto **no parsea, no redondea y no calcula**: decide si el string que se acaba
    /// de teclear se acepta en el campo.
    func amountChanged(_ value: String) {
        guard value.wholeMatch(of: amountPattern) != nil else { return }
        state.amount = value
        clearError()
    }

    // MARK: - Acciones

    /// `async` **solo** por el `Task.sleep` que simula la latencia. La llamada al core es
    /// síncrona y no va envuelta en un `Task`.
    func transfer() async {
        state.isLoading = true
        state.error = nil
        do {
            let request = TransferRequest(
                origin: state.origin,
                destination: state.destination,
                amount: state.amount
            )
            let result = try core.transfer(accounts: allAccounts, request: request)
            // Espera para que parezca una llamada de red. NO HAY RED: el número lo devuelve
            // el core.
            try? await Task.sleep(for: .milliseconds(Int(result.simulatedLatencyMs)))
            allAccounts = result.accounts
            state.accounts = result.accounts
            state.result = result
        } catch let e as DomainError {
            state.result = nil
            state.error = messages.userMessage(e)
        } catch {
            state.result = nil
            state.error = "\(error)"
        }
        // Una sola salida: nunca queda el spinner colgado.
        state.isLoading = false
    }

    func clearError() { state.error = nil }
}
