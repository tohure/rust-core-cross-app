import Foundation
import Testing

@testable import ios_rust_test

@MainActor
@Suite("ViewModel de Transferencia")
struct TransferViewModelTest {
    private func makeViewModel(_ core: FakeCoreFinanciero = FakeCoreFinanciero()) throws
        -> TransferViewModel
    {
        let bundle = Bundle(for: BundleToken.self)
        return TransferViewModel(
            core: core,
            contract: try BundleContractSource(bundle: bundle),
            messages: ContractMessages(source: try BundleMessageSource(bundle: bundle))
        )
    }

    @Test("arranca con las dos cuentas del contrato, origen y destino ya elegidos")
    func startsWithTheContractAccounts() throws {
        let vm = try makeViewModel()
        #expect(vm.state.accounts.count == 2)
        #expect(vm.state.origin == "00219100123456789047")
        #expect(vm.state.destination == "01122000987654321065")
        #expect(vm.state.amount.isEmpty)
        #expect(vm.state.result == nil)
    }

    @Test("el campo de monto acepta como máximo 2 decimales")
    func theAmountFieldAcceptsAtMostTwoDecimals() throws {
        let vm = try makeViewModel()
        vm.amountChanged("100")
        #expect(vm.state.amount == "100")
        vm.amountChanged("100.5")
        #expect(vm.state.amount == "100.5")
        vm.amountChanged("100.50")
        #expect(vm.state.amount == "100.50")
        // El tercer decimal NO entra. Es un filtro de TEXTO, no una validación: quien
        // rechaza el monto sigue siendo el core, y tr-007 lo prueba en el test de contrato.
        vm.amountChanged("100.501")
        #expect(vm.state.amount == "100.50")
        // Tampoco entra una coma: el .decimalPad con locale es_PE la ofrece.
        vm.amountChanged("100,50")
        #expect(vm.state.amount == "100.50")
    }

    @Test("una transferencia válida guarda el resultado y actualiza los saldos")
    func aValidTransferUpdatesTheBalances() async throws {
        let core = FakeCoreFinanciero()
        core.transferResult = { _, _ in
            TransferResult(
                accounts: [
                    Account(id: "00219100123456789047", holder: "Ana Quispe", balance: "4899.99"),
                    Account(id: "01122000987654321065", holder: "Luis Ramos", balance: "1300.50"),
                ],
                itfFee: "0.01",
                totalDebited: "100.01",
                receipt: "TRF-9047-1065-10000",
                simulatedLatencyMs: 0
            )
        }
        let vm = try makeViewModel(core)
        vm.amountChanged("100.00")
        await vm.transfer()
        #expect(vm.state.result?.receipt == "TRF-9047-1065-10000")
        #expect(vm.state.result?.itfFee == "0.01")
        #expect(vm.state.accounts[0].balance == "4899.99")
        #expect(vm.state.isLoading == false)
        #expect(vm.state.error == nil)
    }

    @Test("un error apaga el spinner y guarda el texto de usuario")
    func anErrorTurnsOffTheSpinner() async throws {
        let core = FakeCoreFinanciero()
        core.transferResult = { _, _ in
            throw DomainError.InsufficientFunds(available: "1200.50", required: "10000.50")
        }
        let vm = try makeViewModel(core)
        vm.amountChanged("10000.00")
        await vm.transfer()
        // El bug clásico es el catch que se olvida de apagar el spinner.
        #expect(vm.state.isLoading == false)
        #expect(vm.state.result == nil)
        #expect(
            vm.state.error == "Saldo insuficiente: tienes 1200.50 y se necesitan 10000.50."
        )
    }

    @Test("clearError existe y el error se consume")
    func clearErrorConsumesTheError() async throws {
        let core = FakeCoreFinanciero()
        core.transferResult = { _, _ in throw DomainError.SameAccount }
        let vm = try makeViewModel(core)
        await vm.transfer()
        #expect(vm.state.error != nil)
        vm.clearError()
        #expect(vm.state.error == nil)
    }

    private final class BundleToken {}
}
