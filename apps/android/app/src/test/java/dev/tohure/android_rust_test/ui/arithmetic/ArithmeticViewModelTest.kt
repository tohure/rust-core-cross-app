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
    fun editingAnOperandConsumesThePreviousError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextAdd(DomainException.InvalidAmount("vacío"))
        val vm = ArithmeticViewModel(core, messages())
        vm.compute()
        assertEquals("El monto ingresado no es válido.", vm.uiState.value.error)

        // Editar la entrada consume el error: sin esto el mensaje viejo queda en pantalla
        // al lado de operandos nuevos.
        vm.operandAChanged("0.5")
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun aNonDomainFailureDoesNotPutDiagnosticTextOnTheScreen() = runTest {
        // **La rama NO es inalcanzable**, contra lo que decía el PENDING de iOS.
        // `UniffiCoreFinanciero` envuelve cada llamada en `runCatching`, que en Kotlin atrapa
        // **todo `Throwable`** —no sólo `DomainException`—. O sea que un fallo al cargar la
        // librería nativa, o cualquier excepción de JNA, vuelve como `Result.failure` y cae
        // en este mismo camino. Con el fallback viejo, `e.toString()`, el usuario veía
        // `java.lang.UnsatisfiedLinkError: dlopen failed: ...` en la pantalla de Aritmética.
        val vm = ArithmeticViewModel(
            FakeCoreFinanciero(
                nextAdd = Result.failure(UnsatisfiedLinkError("dlopen failed: library not found"))
            ),
            messages(),
        )
        vm.operandAChanged("0.1")
        vm.operandBChanged("0.2")
        vm.compute()

        val shown = vm.uiState.value.error
        assertEquals("No se pudo completar la operación.", shown)
        // Lo importante no es sólo qué dice, sino qué NO dice.
        assertEquals(false, shown!!.contains("UnsatisfiedLinkError"))
        assertEquals(false, shown.contains("dlopen"))
    }
}
