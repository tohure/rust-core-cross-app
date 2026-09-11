/// Las dos operaciones que expone el core.
enum Operation: CaseIterable {
    case add, subtract

    /// Label exacto de `docs/ui-spec.md`.
    var label: String {
        switch self {
        case .add: return "Sumar"
        case .subtract: return "Restar"
        }
    }
}

struct ArithmeticUiState {
    /// Arranca en el caso `ar-001` del contrato: es el que mejor exhibe la divergencia.
    var operandA = "0.1"
    var operandB = "0.2"
    var operation: Operation = .add
    /// Lo que devuelve el core: `Decimal` con la escala correcta. **String, siempre.**
    var coreResult = ""
    /// Lo que devuelve el flotante nativo. Existe para exhibir la divergencia.
    var nativeResult = ""
    /// Ya resuelto a texto de usuario, no la excepción.
    var error: String?
}
