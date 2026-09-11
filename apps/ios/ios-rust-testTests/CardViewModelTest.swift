import Foundation
import Testing

@testable import ios_rust_test

@MainActor
@Suite("ViewModel de Tarjeta")
struct CardViewModelTest {
    private func makeViewModel(_ core: FakeCoreFinanciero = FakeCoreFinanciero()) throws
        -> CardViewModel
    {
        let bundle = Bundle(for: BundleToken.self)
        return CardViewModel(
            core: core,
            contract: try BundleContractSource(bundle: bundle),
            messages: ContractMessages(source: try BundleMessageSource(bundle: bundle))
        )
    }

    @Test("validar y cifrar llena marca, enmascarado, hex y la vuelta completa")
    func encryptFillsTheWholeRoundTrip() throws {
        let core = FakeCoreFinanciero()
        core.cardResult = { _ in ValidCard(brand: "Visa", masked: "4111 **** **** 1111") }
        core.encryptResult = { _ in "bdca3931" }
        core.decryptResult = { _ in "4111111111111111" }
        let vm = try makeViewModel(core)
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()
        #expect(vm.state.brand == "Visa")
        #expect(vm.state.masked == "4111 **** **** 1111")
        #expect(vm.state.cipherHex == "bdca3931")
        // La vuelta completa: sin esto, el hex es indistinguible de un hash.
        #expect(vm.state.decrypted == "4111111111111111")
        #expect(vm.state.encryptError == nil)
    }

    @Test("el campo Número acepta solo dígitos")
    func theNumberFieldTakesDigitsOnly() throws {
        let vm = try makeViewModel()
        vm.numberChanged("4111")
        #expect(vm.state.number == "4111")
        vm.numberChanged("4111a")
        #expect(vm.state.number == "4111")
        vm.numberChanged("4111 1111")
        #expect(vm.state.number == "4111")
    }

    @Test("el campo Hex cifrado acepta solo [0-9a-f]")
    func theHexFieldTakesLowercaseHexOnly() throws {
        let vm = try makeViewModel()
        vm.pastedHexChanged("bcce3d")
        #expect(vm.state.pastedHex == "bcce3d")
        vm.pastedHexChanged("bcce3dZZ")
        #expect(vm.state.pastedHex == "bcce3d")
        vm.pastedHexChanged("BCCE3D")
        #expect(vm.state.pastedHex == "bcce3d")
    }

    @Test("un fallo al descifrar el hex pegado NO borra el resultado de cifrar")
    func aPasteFailureDoesNotWipeTheEncryptResult() throws {
        let core = FakeCoreFinanciero()
        core.encryptResult = { _ in "bdca3931" }
        core.decryptResult = { hex in
            if hex == "bdca3931" { return "4111111111111111" }
            throw DomainError.Encryption(detail: "hex ilegible")
        }
        let vm = try makeViewModel(core)
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()
        #expect(vm.state.cipherHex == "bdca3931")

        vm.pastedHexChanged("deadbeef")
        vm.decryptPasted()
        #expect(vm.state.decryptError == "No se pudo cifrar los datos de la tarjeta.")
        // Los dos bloques son independientes: en la demo están los dos en pantalla.
        #expect(vm.state.cipherHex == "bdca3931")
        #expect(vm.state.encryptError == nil)
    }

    @Test("un número que no pasa Luhn deja el error en el bloque de cifrar")
    func anInvalidNumberErrorsInTheEncryptBlock() throws {
        let core = FakeCoreFinanciero()
        core.cardResult = { _ in throw DomainError.CheckDigit }
        let vm = try makeViewModel(core)
        vm.numberChanged("4111111111111112")
        vm.validateAndEncrypt()
        #expect(
            vm.state.encryptError
                == "El número ingresado no es válido: no pasa el dígito de control."
        )
        #expect(vm.state.cipherHex.isEmpty)
    }

    @Test("descifrar un hex pegado de otra plataforma llena el número recuperado")
    func decryptingAPastedHexFillsTheRecoveredNumber() throws {
        let core = FakeCoreFinanciero()
        // El hex de `tj-002`, el que produce cualquiera de las cuatro apps para la
        // Mastercard. El fake responde SOLO a ese: así el test prueba que el ViewModel le
        // pasa al core el hex que el usuario pegó, no que el fake devuelve lo que le dijeron.
        let tj002 = "bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036"
        core.decryptResult = { hex in hex == tj002 ? "5555555555554444" : "" }
        let vm = try makeViewModel(core)
        vm.pastedHexChanged(tj002)
        vm.decryptPasted()
        #expect(vm.state.recovered == "5555555555554444")
        #expect(vm.state.decryptError == nil)
    }

    private final class BundleToken {}
}
