package dev.tohure.android_rust_test.ui.transfer

import kotlinx.coroutines.ExperimentalCoroutinesApi
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferResult

private class FakeContract : ContractSource {
    override fun initialAccounts() = listOf(
        Account("00219100123456789047", "Ana Quispe", "5000.00"),
        Account("01122000987654321065", "Luis Ramos", "1200.50"),
    )

    override fun demoKeyHex() = "00010203"
    override fun demoNonceHex() = "0001"
}

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

@OptIn(ExperimentalCoroutinesApi::class)
class TransferViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun messages() = ContractMessages(
        FakeMessages(
            mapOf(
                "MismaCuenta" to "La cuenta de origen y la de destino son la misma.",
                "SaldoInsuficiente" to "Saldo insuficiente: tenés {available} y se necesitan {required}.",
            ),
        ),
    )

    @Test
    fun theInitialAccountsComeFromTheContractNotFromCode() {
        val vm = TransferViewModel(FakeCoreFinanciero(), FakeContract(), messages())
        assertEquals(2, vm.uiState.value.accounts.size)
        assertEquals("Ana Quispe", vm.uiState.value.accounts[0].holder)
    }

    @Test
    fun theAmountFieldRejectsMoreThanTwoDecimals() {
        val vm = TransferViewModel(FakeCoreFinanciero(), FakeContract(), messages())
        vm.amountChanged("100.12")
        assertEquals("100.12", vm.uiState.value.amount)
        // Filtro de TEXTO, no regla de negocio: el core igual rechaza (tr-007), pero el
        // usuario no tiene que llegar hasta ahí.
        vm.amountChanged("100.123")
        assertEquals("100.12", vm.uiState.value.amount)
    }

    @Test
    fun aSuccessfulTransferLandsInTheStateAfterTheSimulatedLatency() = runTest {
        val core = FakeCoreFinanciero(
            nextTransfer = Result.success(
                TransferResult(
                    accounts = listOf(
                        Account("00219100123456789047", "Ana Quispe", "4899.99"),
                        Account("01122000987654321065", "Luis Ramos", "3100.00"),
                    ),
                    itfFee = "0.01",
                    totalDebited = "100.01",
                    receipt = "TRF-0001",
                    simulatedLatencyMs = 120u,
                ),
            ),
        )
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        assertEquals("0.01", vm.uiState.value.result?.itfFee)
        assertEquals("4899.99", vm.uiState.value.accounts[0].balance)
        assertFalse(vm.uiState.value.isLoading)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun aDomainErrorBecomesUserTextAndTurnsOffTheSpinner() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.InsufficientFunds("50.00", "100.01"))
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        assertEquals(
            "Saldo insuficiente: tenés 50.00 y se necesitan 100.01.",
            vm.uiState.value.error,
        )
        // El bug clásico: el catch se olvida de apagar el spinner y la pantalla queda
        // cargando para siempre.
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun aFailedTransferClearsThePreviousResult() = runTest {
        val core = FakeCoreFinanciero()
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        assertNotNull("precondición: la primera transferencia dejó un resultado", vm.uiState.value.result)

        // Un fallo no puede dejar el comprobante anterior en pantalla debajo del error: parece
        // que la segunda transferencia surtió efecto parcial.
        core.failNextTransfer(DomainException.InsufficientFunds("50.00", "100.01"))
        vm.transfer()
        advanceUntilIdle()
        assertNull(vm.uiState.value.result)
        assertNotNull(vm.uiState.value.error)
    }

    @Test
    fun clearErrorConsumesTheError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.SameAccount())
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        vm.clearError()
        assertNull(vm.uiState.value.error)
    }
}
