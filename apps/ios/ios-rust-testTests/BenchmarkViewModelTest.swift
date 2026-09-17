import Foundation
import Testing

@testable import ios_rust_test

@MainActor
@Suite("ViewModel de Benchmark")
struct BenchmarkViewModelTest {
    private func makeViewModel(_ core: FakeCoreFinanciero = FakeCoreFinanciero()) throws
        -> BenchmarkViewModel
    {
        BenchmarkViewModel(
            core: core,
            messages: ContractMessages(
                source: try BundleMessageSource(bundle: Bundle(for: BundleToken.self))
            )
        )
    }

    @Test("arranca en 1000 iteraciones y sin resultados")
    func startsAtAThousand() throws {
        let vm = try makeViewModel()
        #expect(vm.state.iterations == "1000")
        #expect(vm.state.coreP50 == "—")
        #expect(vm.state.isRunning == false)
    }

    @Test("el campo de iteraciones acepta solo dígitos")
    func theIterationsFieldTakesDigitsOnly() throws {
        let vm = try makeViewModel()
        vm.iterationsChanged("250")
        #expect(vm.state.iterations == "250")
        vm.iterationsChanged("250x")
        #expect(vm.state.iterations == "250")
    }

    @Test("correr llena los cuatro percentiles y apaga el spinner")
    func runFillsTheFourPercentiles() async throws {
        let vm = try makeViewModel()
        vm.iterationsChanged("50")
        await vm.run()
        #expect(vm.state.isRunning == false)
        #expect(vm.state.coreP50.hasSuffix("µs"))
        #expect(vm.state.coreP95.hasSuffix("µs"))
        #expect(vm.state.nativeP50.hasSuffix("µs"))
        #expect(vm.state.nativeP95.hasSuffix("µs"))
    }

    @Test("cero iteraciones no revienta ni deja el spinner colgado")
    func zeroIterationsIsSafe() async throws {
        let vm = try makeViewModel()
        vm.iterationsChanged("0")
        await vm.run()
        #expect(vm.state.isRunning == false)
        #expect(vm.state.coreP50 == "—")
    }

    @Test("cero iteraciones explica por qué no pasó nada")
    func zeroIterationsExplainsWhyNothingHappened() async throws {
        // iOS era la ÚNICA de las cuatro que volvía muda: el botón no hacía nada y la
        // pantalla parecía rota. El texto es normativo en `docs/ui-spec.md`.
        let vm = try makeViewModel()
        vm.iterationsChanged("0")
        await vm.run()
        #expect(vm.state.error == "Ingresa un número de iteraciones mayor que cero.")

        // Y una corrida válida lo limpia: un error viejo pegado en pantalla junto a números
        // nuevos es peor que no mostrarlo.
        vm.iterationsChanged("10")
        await vm.run()
        #expect(vm.state.error == nil)
    }

    @Test("los tiempos usan PUNTO decimal, no el separador del locale")
    func timesUseADotRegardlessOfLocale() async throws {
        // Esto NO es una corrección: `String(format:)` de Foundation, sin `locale:`, ya es
        // no-localizado y siempre imprime punto. Es una GUARDIA, y existe porque el mismo
        // código en Kotlin hace lo contrario: `"%.2f".format(...)` usa el locale por defecto
        // y en un aparato es-PE imprimía `1,23 µs` — la divergencia que la Fase 6 corrigió en
        // Android. Si alguien acá le agregara un `locale:` "para hacerlo bien", reintroduce
        // la divergencia y este test lo caza.
        let vm = try makeViewModel()
        vm.iterationsChanged("10")
        await vm.run()
        #expect(vm.state.coreP50.contains("."))
        #expect(!vm.state.coreP50.contains(","))
    }

    @Test("el campo de iteraciones se corta en 6 dígitos, igual que Android")
    func theIterationsFieldCapsAtSixDigits() throws {
        let vm = try makeViewModel()
        vm.iterationsChanged("999999")
        #expect(vm.state.iterations == "999999")
        // El séptimo dígito no entra. Sin este tope, alguien tecleando 10000000 en la demo
        // dispara 2 × 10^7 llamadas al core sin forma de cancelarlas, mientras Android
        // —BenchmarkViewModel.kt:32— rechaza la séptima tecla.
        vm.iterationsChanged("9999999")
        #expect(vm.state.iterations == "999999")
    }

    @Test("una iteración de más de un segundo no se reporta como microsegundos sueltos")
    func aSampleLongerThanASecondIsNotTruncated() async throws {
        let core = FakeCoreFinanciero()
        // 1.05 s en una sola iteración. Es el único test lento de la suite, y existe porque
        // `Duration.components.attoseconds` solo trae el resto sub-segundo: leerlo sin el
        // componente `seconds` convierte este pico en 50000.00 µs y lo borra del p95, que es
        // justo el número que la pantalla existe para mostrar.
        core.addResult = { _, _ in
            Thread.sleep(forTimeInterval: 1.05)
            return "0.3"
        }
        let vm = try makeViewModel(core)
        vm.iterationsChanged("1")
        await vm.run()
        let micros = Int(vm.state.coreP50.split(separator: ".").first ?? "") ?? 0
        #expect(micros >= 1_000_000)
    }

    @Test("un core roto muestra el error en vez de números rápidos y plausibles")
    func aBrokenBridgeShowsTheErrorAndNotANumber() async throws {
        // `measure` mide `try?`, así que sin una llamada de prueba fuera del bucle un puente
        // roto se cronometraría como el tiempo de lanzar la excepción: la pantalla mostraría
        // números **más rápidos que los reales** y nadie se enteraría. Es la pantalla donde
        // menos conviene que eso pase, porque sus números se citan.
        let core = FakeCoreFinanciero()
        core.addResult = { _, _ in throw DomainError.InvalidAmount(detail: "puente roto") }
        let vm = try makeViewModel(core)

        await vm.run()

        #expect(vm.state.error != nil)
        #expect(vm.state.error != "")
        // Y las medidas no quedan con un número de mentira.
        #expect(vm.state.coreP50 == "—")
        #expect(vm.state.coreP95 == "—")
        #expect(vm.state.isRunning == false)
    }

    private final class BundleToken {}
}
