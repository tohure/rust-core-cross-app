package dev.tohure.android_rust_test.ui.card

import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.ValidCard

private class FakeContract : ContractSource {
    override fun initialAccounts(): List<Account> = emptyList()

    override fun demoKeyHex() = "00010203"

    override fun demoNonceHex() = "0001"
}

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

class CardViewModelTest {
    private fun messages() = ContractMessages(
        FakeMessages(
            mapOf(
                "DigitoControl" to "El número ingresado no es válido: no pasa el dígito de control.",
                "Cifrado" to "No se pudo cifrar los datos de la tarjeta.",
            ),
        ),
    )

    // ── Cifrar ────────────────────────────────────────────────────────────────

    @Test
    fun aValidCardFillsBrandMaskAndCipher() = runTest {
        val core = FakeCoreFinanciero(
            nextCard = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
            nextEncrypt = Result.success("bdca3931"),
        )
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()
        assertEquals("Visa", vm.uiState.value.brand)
        assertEquals("4111 **** **** 1111", vm.uiState.value.masked)
        assertEquals("bdca3931", vm.uiState.value.cipherHex)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun encryptingAlsoDecryptsToProveItIsReversible() = runTest {
        // Sin esta vuelta, la pantalla muestra un hex que nadie puede distinguir de un hash.
        // El roundtrip es lo que demuestra que el core CIFRA, no que resume.
        val core = FakeCoreFinanciero(
            nextCard = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
            nextEncrypt = Result.success("bdca3931"),
            nextDecrypt = Result.success("4111111111111111"),
        )
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()
        assertEquals("4111111111111111", vm.uiState.value.roundTrip)
    }

    @Test
    fun anInvalidCardBecomesUserText() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextCard(DomainException.CheckDigit())
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111112")
        vm.validateAndEncrypt()
        assertEquals(
            "El número ingresado no es válido: no pasa el dígito de control.",
            vm.uiState.value.error,
        )
        assertEquals("", vm.uiState.value.cipherHex)
        assertEquals("", vm.uiState.value.roundTrip)
    }

    // ── Descifrar un hex ajeno ────────────────────────────────────────────────

    @Test
    fun aForeignHexIsDecryptedBackToTheOriginalNumber() = runTest {
        // El caso que demuestra la tesis en vivo: este hex lo produjo otra plataforma y esta
        // app lo descifra con la misma clave y el mismo nonce del contrato.
        val core = FakeCoreFinanciero(nextDecrypt = Result.success("4111111111111111"))
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.foreignHexChanged("bdca39311826947186b2")
        vm.decryptForeign()
        assertEquals("4111111111111111", vm.uiState.value.foreignPlain)
        assertNull(vm.uiState.value.foreignError)
    }

    @Test
    fun aBadForeignHexBecomesUserTextWithoutTouchingTheEncryptSide() = runTest {
        val core = FakeCoreFinanciero(
            nextCard = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
            nextEncrypt = Result.success("bdca3931"),
            nextDecrypt = Result.success("4111111111111111"),
        )
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()

        core.failNextDecrypt(DomainException.Encryption("hex inválido"))
        vm.foreignHexChanged("no-es-hex")
        vm.decryptForeign()

        assertEquals("No se pudo cifrar los datos de la tarjeta.", vm.uiState.value.foreignError)
        assertEquals("", vm.uiState.value.foreignPlain)
        // Las dos operaciones son independientes: el fallo de una no borra el resultado de la
        // otra, porque en la demo las dos están en pantalla a la vez.
        assertEquals("bdca3931", vm.uiState.value.cipherHex)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun editingEachFieldConsumesItsOwnError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextCard(DomainException.CheckDigit())
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.validateAndEncrypt()
        vm.numberChanged("4")
        assertNull(vm.uiState.value.error)

        core.failNextDecrypt(DomainException.Encryption("hex inválido"))
        vm.decryptForeign()
        vm.foreignHexChanged("ab")
        assertNull(vm.uiState.value.foreignError)
    }
}
