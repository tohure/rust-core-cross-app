struct TransferUiState {
    var origin = ""
    var destination = ""
    /// `String`. Siempre. El estado es el último lugar donde alguien se tienta con un número.
    var amount = ""
    var accounts: [Account] = []
    var result: TransferResult?
    /// `true` mientras corre `simulatedLatencyMs`.
    var isLoading = false
    /// Ya resuelto a texto de usuario.
    var error: String?
}
