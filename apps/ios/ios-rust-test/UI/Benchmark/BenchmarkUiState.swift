struct BenchmarkUiState {
    var iterations = "1000"
    var coreP50 = "—"
    var coreP95 = "—"
    var nativeP50 = "—"
    var nativeP95 = "—"
    var isRunning = false
    /// Por qué no arrancó. Las otras tres apps ya lo explicaban; ésta volvía muda.
    var error: String?
}
