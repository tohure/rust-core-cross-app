package dev.tohure.android_rust_test.ui.arithmetic

import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.core_financiero.DomainException

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

class ArithmeticViewModelTest {
    private fun messages() = ContractMessages(
        FakeMessages(mapOf("MontoInvalido" to "El monto ingresado no es válido.")),
    )

    @Test
    fun theResultOfTheCoreLandsInTheState() = runTest {
        val vm = ArithmeticViewModel(FakeCoreFinanciero(nextAdd = Result.success("0.30")), messages())
        vm.operandAChanged("0.1")
        vm.operandBChanged("0.2")
        vm.compute()
        assertEquals("0.30", vm.uiState.value.coreResult)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun theNativeFloatResultIsComputedForContrast() = runTest {
        val vm = ArithmeticViewModel(FakeCoreFinanciero(), messages())
        vm.operandAChanged("0.1")
        vm.operandBChanged("0.2")
        vm.compute()
        // Esta pantalla es la ÚNICA donde se permite el flotante nativo, y existe para
        // exhibir el fallo: 0.1 + 0.2 no da 0.3 en IEEE-754.
        assertEquals("0.30000000000000004", vm.uiState.value.nativeResult)
    }

    @Test
    fun anErrorFromTheCoreBecomesUserText() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextAdd(DomainException.InvalidAmount("vacío"))
        val vm = ArithmeticViewModel(core, messages())
        vm.compute()
        assertEquals("El monto ingresado no es válido.", vm.uiState.value.error)
    }

    @Test
    fun clearErrorConsumesTheError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextAdd(DomainException.InvalidAmount("vacío"))
        val vm = ArithmeticViewModel(core, messages())
        vm.compute()
        vm.clearError()
        // Sin esta acción el mensaje reaparece al rotar la pantalla, porque sigue en el estado.
        assertNull(vm.uiState.value.error)
    }
}
