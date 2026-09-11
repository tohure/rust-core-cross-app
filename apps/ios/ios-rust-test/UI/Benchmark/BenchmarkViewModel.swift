import Foundation

/// Hasta 6 dígitos, igual que `BenchmarkViewModel.kt:32` en Android. Es un filtro de
/// **texto**: sin el tope, teclear 10000000 dispara 2 × 10^7 llamadas al core sin forma
/// de cancelarlas, y las dos apps dejan de comportarse igual en la pantalla que existe
/// justamente para compararlas lado a lado.
private let iterationsPattern = /^[0-9]{0,6}$/

@MainActor
@Observable
final class BenchmarkViewModel {
    private(set) var state = BenchmarkUiState()

    private let core: CoreFinanciero

    init(core: CoreFinanciero) {
        self.core = core
    }

    // MARK: - Entrada del usuario

    func iterationsChanged(_ value: String) {
        guard value.wholeMatch(of: iterationsPattern) != nil else { return }
        state.iterations = value
    }

    // MARK: - Acciones

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

    // MARK: - Medición

    /// Devuelve p50 y p95 ya formateados en µs. Usa el reloj monotónico: `Date` puede saltar
    /// hacia atrás si el sistema ajusta la hora.
    ///
    /// Las muestras se acumulan como **enteros de nanosegundos**, igual que el `LongArray` de
    /// `BenchmarkViewModel.kt:54` en Android; el punto flotante aparece una sola vez, al
    /// formatear. Y se suma el componente `seconds`, porque `attoseconds` trae **solo** el
    /// resto sub-segundo: leerlo suelto convierte un pico de 1,05 s en 53000 µs y lo borra
    /// del p95, que es justo el número que esta pantalla existe para mostrar.
    ///
    /// `nonisolated`: el proyecto aísla a `MainActor` por defecto, y esta función corre
    /// dentro del `Task.detached` de `run()`, fuera del actor principal.
    private nonisolated static func measure(_ n: Int, _ body: () -> Void) -> (
        p50: String, p95: String
    ) {
        var samples: [Int64] = []
        samples.reserveCapacity(n)
        for _ in 0..<n {
            let start = ContinuousClock.now
            body()
            let elapsed = (ContinuousClock.now - start).components
            samples.append(elapsed.seconds * 1_000_000_000 + elapsed.attoseconds / 1_000_000_000)
        }
        samples.sort()
        // `n > 0` lo garantiza el `guard` de `run()`: con `n == 0` este índice daría −1.
        func at(_ p: Double) -> String {
            let index = min(max(Int(Double(n) * p), 0), n - 1)
            return String(format: "%.2f µs", Double(samples[index]) / 1000)
        }
        return (at(0.50), at(0.95))
    }
}
