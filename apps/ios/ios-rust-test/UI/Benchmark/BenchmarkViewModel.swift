import Foundation

private let digitsOnly = /^[0-9]*$/

@MainActor
@Observable
final class BenchmarkViewModel {
    private(set) var state = BenchmarkUiState()

    private let core: CoreFinanciero

    init(core: CoreFinanciero) {
        self.core = core
    }

    func iterationsChanged(_ value: String) {
        guard value.wholeMatch(of: digitsOnly) != nil else { return }
        state.iterations = value
    }

    /// La **única** acción de la app que sale del hilo principal: son miles de llamadas y
    /// bloquearían la UI.
    func run() async {
        guard let n = Int(state.iterations), n > 0 else { return }
        state.isRunning = true
        let core = self.core
        let measured = await Task.detached(priority: .userInitiated) {
            (
                core: Self.measure(n) { _ = try? core.add(a: "0.1", b: "0.2") },
                native: Self.measure(n) { _ = NativeBaseline.add("0.1", "0.2") }
            )
        }.value
        state.coreP50 = measured.core.p50
        state.coreP95 = measured.core.p95
        state.nativeP50 = measured.native.p50
        state.nativeP95 = measured.native.p95
        state.isRunning = false
    }

    /// Devuelve p50 y p95 ya formateados en µs. Usa el reloj monotónico: `Date` puede saltar
    /// hacia atrás si el sistema ajusta la hora.
    ///
    /// `nonisolated`: el proyecto aísla a `MainActor` por defecto, y esta función corre
    /// dentro del `Task.detached` de `run()`, fuera del actor principal.
    private nonisolated static func measure(_ n: Int, _ body: () -> Void) -> (
        p50: String, p95: String
    ) {
        var samples: [Double] = []
        samples.reserveCapacity(n)
        for _ in 0..<n {
            let start = ContinuousClock.now
            body()
            samples.append(
                Double((ContinuousClock.now - start).components.attoseconds) / 1_000_000_000_000
            )
        }
        samples.sort()
        func at(_ p: Double) -> String {
            let index = min(max(Int(Double(n) * p), 0), n - 1)
            return String(format: "%.2f µs", samples[index])
        }
        return (at(0.50), at(0.95))
    }
}
