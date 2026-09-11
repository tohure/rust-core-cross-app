import Foundation

@MainActor
@Observable
final class ArithmeticViewModel {
    /// La vista lee, no escribe.
    private(set) var state = ArithmeticUiState()

    private let core: CoreFinanciero
    private let messages: ContractMessages

    init(core: CoreFinanciero, messages: ContractMessages) {
        self.core = core
        self.messages = messages
    }

    // MARK: - Entrada del usuario

    // Editar un campo CONSUME el error anterior: si no, el mensaje sobrevive a la
    // corrección y el usuario ve un error que ya no corresponde.
    func operandAChanged(_ value: String) {
        state.operandA = value
        clearError()
    }

    func operandBChanged(_ value: String) {
        state.operandB = value
        clearError()
    }

    func operationChanged(_ value: Operation) {
        state.operation = value
        clearError()
    }

    // MARK: - Acciones

    /// Síncrona a propósito: la llamada al core son microsegundos. Envolverla en un `Task`
    /// solo agregaría un salto de hilo y un frame de latencia.
    func calculate() {
        do {
            state.coreResult =
                switch state.operation {
                case .add: try core.add(a: state.operandA, b: state.operandB)
                case .subtract: try core.subtract(a: state.operandA, b: state.operandB)
                }
            state.nativeResult =
                switch state.operation {
                case .add: NativeBaseline.add(state.operandA, state.operandB)
                case .subtract: NativeBaseline.subtract(state.operandA, state.operandB)
                }
            state.error = nil
        } catch let e as DomainError {
            state.coreResult = ""
            state.nativeResult = ""
            state.error = messages.userMessage(e)
        } catch {
            state.coreResult = ""
            state.nativeResult = ""
            state.error = "\(error)"
        }
    }

    func clearError() { state.error = nil }
}
