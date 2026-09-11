import Foundation
import Testing

@testable import ios_rust_test

@MainActor
@Suite("ViewModel de Benchmark")
struct BenchmarkViewModelTest {
    @Test("arranca en 1000 iteraciones y sin resultados")
    func startsAtAThousand() {
        let vm = BenchmarkViewModel(core: FakeCoreFinanciero())
        #expect(vm.state.iterations == "1000")
        #expect(vm.state.coreP50 == "—")
        #expect(vm.state.isRunning == false)
    }

    @Test("el campo de iteraciones acepta solo dígitos")
    func theIterationsFieldTakesDigitsOnly() {
        let vm = BenchmarkViewModel(core: FakeCoreFinanciero())
        vm.iterationsChanged("250")
        #expect(vm.state.iterations == "250")
        vm.iterationsChanged("250x")
        #expect(vm.state.iterations == "250")
    }

    @Test("correr llena los cuatro percentiles y apaga el spinner")
    func runFillsTheFourPercentiles() async {
        let vm = BenchmarkViewModel(core: FakeCoreFinanciero())
        vm.iterationsChanged("50")
        await vm.run()
        #expect(vm.state.isRunning == false)
        #expect(vm.state.coreP50.hasSuffix("µs"))
        #expect(vm.state.coreP95.hasSuffix("µs"))
        #expect(vm.state.nativeP50.hasSuffix("µs"))
        #expect(vm.state.nativeP95.hasSuffix("µs"))
    }

    @Test("cero iteraciones no revienta ni deja el spinner colgado")
    func zeroIterationsIsSafe() async {
        let vm = BenchmarkViewModel(core: FakeCoreFinanciero())
        vm.iterationsChanged("0")
        await vm.run()
        #expect(vm.state.isRunning == false)
        #expect(vm.state.coreP50 == "—")
    }

    @Test("el campo de iteraciones se corta en 6 dígitos, igual que Android")
    func theIterationsFieldCapsAtSixDigits() {
        let vm = BenchmarkViewModel(core: FakeCoreFinanciero())
        vm.iterationsChanged("999999")
        #expect(vm.state.iterations == "999999")
        // El séptimo dígito no entra. Sin este tope, alguien tecleando 10000000 en la demo
        // dispara 2 × 10^7 llamadas al core sin forma de cancelarlas, mientras Android
        // —BenchmarkViewModel.kt:32— rechaza la séptima tecla.
        vm.iterationsChanged("9999999")
        #expect(vm.state.iterations == "999999")
    }

    @Test("una iteración de más de un segundo no se reporta como microsegundos sueltos")
    func aSampleLongerThanASecondIsNotTruncated() async {
        let core = FakeCoreFinanciero()
        // 1.05 s en una sola iteración. Es el único test lento de la suite, y existe porque
        // `Duration.components.attoseconds` solo trae el resto sub-segundo: leerlo sin el
        // componente `seconds` convierte este pico en 50000.00 µs y lo borra del p95, que es
        // justo el número que la pantalla existe para mostrar.
        core.addResult = { _, _ in
            Thread.sleep(forTimeInterval: 1.05)
            return "0.3"
        }
        let vm = BenchmarkViewModel(core: core)
        vm.iterationsChanged("1")
        await vm.run()
        let micros = Int(vm.state.coreP50.split(separator: ".").first ?? "") ?? 0
        #expect(micros >= 1_000_000)
    }
}
