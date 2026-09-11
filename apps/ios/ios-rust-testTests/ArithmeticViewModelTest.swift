import Foundation
import Testing

@testable import ios_rust_test

@MainActor
@Suite("ViewModel de Aritmética")
struct ArithmeticViewModelTest {
    private func makeViewModel(_ core: FakeCoreFinanciero = FakeCoreFinanciero()) throws
        -> ArithmeticViewModel
    {
        ArithmeticViewModel(
            core: core,
            messages: ContractMessages(
                source: try BundleMessageSource(bundle: Bundle(for: BundleToken.self))
            )
        )
    }

    @Test("arranca con los operandos de ar-001, que es el caso que mejor se ve en demo")
    func startsWithTheCaseThatShowsBest() throws {
        let vm = try makeViewModel()
        #expect(vm.state.operandA == "0.1")
        #expect(vm.state.operandB == "0.2")
        #expect(vm.state.operation == .add)
        #expect(vm.state.coreResult.isEmpty)
    }

    @Test("calcular llena los dos resultados: el del core y el del flotante")
    func calculateFillsBothResults() throws {
        let core = FakeCoreFinanciero()
        core.addResult = { _, _ in "0.30" }
        let vm = try makeViewModel(core)
        vm.calculate()
        #expect(vm.state.coreResult == "0.30")
        // El contraejemplo: el flotante nativo NO da 0.30.
        #expect(vm.state.nativeResult == "0.30000000000000004")
        #expect(vm.state.error == nil)
    }

    @Test("restar llama a subtract, no a add")
    func subtractCallsSubtract() throws {
        let core = FakeCoreFinanciero()
        core.subtractResult = { _, _ in "0.10" }
        let vm = try makeViewModel(core)
        vm.operandAChanged("1.00")
        vm.operandBChanged("0.90")
        vm.operationChanged(.subtract)
        vm.calculate()
        #expect(vm.state.coreResult == "0.10")
    }

    @Test("un error del core se guarda YA traducido, no como excepción")
    func anErrorIsStoredAsUserText() throws {
        let core = FakeCoreFinanciero()
        core.addResult = { _, _ in throw DomainError.InvalidAmount(detail: "escala") }
        let vm = try makeViewModel(core)
        vm.calculate()
        #expect(vm.state.error == "El monto ingresado no es válido.")
        #expect(vm.state.coreResult.isEmpty)
    }

    @Test("editar un operando consume el error anterior")
    func editingConsumesThePreviousError() throws {
        let core = FakeCoreFinanciero()
        core.addResult = { _, _ in throw DomainError.InvalidAmount(detail: "escala") }
        let vm = try makeViewModel(core)
        vm.calculate()
        #expect(vm.state.error != nil)
        vm.operandAChanged("0.5")
        #expect(vm.state.error == nil)
    }

    private final class BundleToken {}
}
