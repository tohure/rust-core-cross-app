import Foundation

/// Filtros de **texto**, no validaciones: quien decide si el número pasa Luhn o si el hex
/// es descifrable es el core.
private let digitsOnly = /^[0-9]*$/
private let lowercaseHex = /^[0-9a-f]*$/

@MainActor
@Observable
final class CardViewModel {
    private(set) var state = CardUiState()

    private let core: CoreFinanciero
    private let messages: ContractMessages
    private let keyHex: String
    private let nonceHex: String

    init(core: CoreFinanciero, contract: ContractSource, messages: ContractMessages) {
        self.core = core
        self.messages = messages
        // El nonce es FIJO a propósito: es lo que hace que las cuatro plataformas produzcan
        // el mismo hex y se pueda comparar en la demo. En producción sería catastrófico.
        keyHex = contract.demoKeyHex()
        nonceHex = contract.demoNonceHex()
    }

    // MARK: - Entrada del usuario

    /// Escribe el estado **siempre**, aunque el valor no cambie: un `set` que no escribe deja la
    /// tecla rechazada a la vista. La explicación completa está en `TransferViewModel.amountChanged`.
    func numberChanged(_ value: String) {
        let accepted = value.wholeMatch(of: digitsOnly) != nil
        state.number = accepted ? value : state.number
        if accepted { state.encryptError = nil }
    }

    /// Ídem `numberChanged`.
    func pastedHexChanged(_ value: String) {
        let accepted = value.wholeMatch(of: lowercaseHex) != nil
        state.pastedHex = accepted ? value : state.pastedHex
        if accepted { state.decryptError = nil }
    }

    // MARK: - Acciones

    func validateAndEncrypt() {
        do {
            let card = try core.validateCard(number: state.number)
            let hex = try core.encrypt(text: state.number, keyHex: keyHex, nonceHex: nonceHex)
            let back = try core.decrypt(ciphertextHex: hex, keyHex: keyHex, nonceHex: nonceHex)
            state.brand = card.brand
            state.masked = card.masked
            state.cipherHex = hex
            state.decrypted = back
            state.encryptError = nil
        } catch let e as DomainError {
            clearEncryptResult()
            state.encryptError = messages.userMessage(e)
        } catch {
            clearEncryptResult()
            state.encryptError = messages.userMessage(error)
        }
    }

    func decryptPasted() {
        do {
            state.recovered = try core.decrypt(
                ciphertextHex: state.pastedHex,
                keyHex: keyHex,
                nonceHex: nonceHex
            )
            state.decryptError = nil
        } catch let e as DomainError {
            state.recovered = ""
            state.decryptError = messages.userMessage(e)
        } catch {
            state.recovered = ""
            state.decryptError = messages.userMessage(error)
        }
    }

    private func clearEncryptResult() {
        state.brand = ""
        state.masked = ""
        state.cipherHex = ""
        state.decrypted = ""
    }
}
