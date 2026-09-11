package dev.tohure.android_rust_test.adapter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import uniffi.core_financiero.DomainException

/** Verifica el CONTRATO de la interfaz con el fake — el core real lo prueba el test de contrato. */
class CoreFinancieroAdapterTest {
    @Test
    fun aFailureComesBackAsResultFailureAndNotAsAThrow() {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.SameAccount())
        val result = core.transfer(emptyList(), uniffi.core_financiero.TransferRequest("A", "A", "1.00"))
        assertTrue("el adapter no debe lanzar", result.isFailure)
        assertTrue(result.exceptionOrNull() is DomainException.SameAccount)
    }

    @Test
    fun coreVersionNeverFails() {
        assertEquals("1.0.0+test", FakeCoreFinanciero().coreVersion())
    }
}
