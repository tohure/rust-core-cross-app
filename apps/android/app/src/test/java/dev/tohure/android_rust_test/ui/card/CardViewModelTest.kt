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
            mapOf("DigitoControl" to "El número ingresado no es válido: no pasa el dígito de control."),
        ),
    )

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
    }
}
