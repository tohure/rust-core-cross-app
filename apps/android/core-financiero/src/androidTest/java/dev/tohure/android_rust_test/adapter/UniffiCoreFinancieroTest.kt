package dev.tohure.android_rust_test.adapter

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.tohure.android_rust_test.contract.AssetMessageSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.DomainException

/**
 * El único test que ejercita el adapter **real** contra `libcore_financiero.so`.
 *
 * `CoreFinancieroAdapterTest` corre en la JVM y sólo puede ver `FakeCoreFinanciero`; el test
 * de contrato llama a uniffi directo, sin pasar por acá. Sin este archivo, que el
 * `runCatching` de `UniffiCoreFinanciero` traduzca una excepción del core a `Result.failure`
 * es una creencia —«se forzó un error en el emulador una vez»—, no un hecho verificado.
 */
@RunWith(AndroidJUnit4::class)
class UniffiCoreFinancieroTest {
    private val core: CoreFinanciero = UniffiCoreFinanciero()

    @Test
    fun aValidCallComesBackAsSuccess() {
        assertEquals("0.30", core.add("0.1", "0.2").getOrNull())
    }

    @Test
    fun aCoreErrorComesBackAsFailureAndNotAsAThrow() {
        // `"no-es-un-numero"` no parsea como Decimal, así que `parse_amount` del core
        // devuelve `InvalidAmount`. Lo que se prueba acá no es el error: es que el
        // `runCatching` lo ATRAPE en vez de dejarlo propagar como excepción.
        val result = core.add("no-es-un-numero", "1")
        assertTrue("se esperaba failure y llegó $result", result.isFailure)
        val e = result.exceptionOrNull()
        assertTrue("se esperaba DomainException y llegó ${e?.javaClass?.name}", e is DomainException)
    }

    @Test
    fun theFailureCarriesAContractNameWithAUserMessage() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val messages = ContractMessages(AssetMessageSource(assets))
        val e = core.add("no-es-un-numero", "1").exceptionOrNull() as DomainException

        // El nombre del contrato es el puente que NO cruza el FFI: si esto falla, la
        // pantalla de error queda en blanco aunque el core haya reportado bien.
        assertEquals("MontoInvalido", e.contractName())
        assertTrue("el mensaje de usuario no puede estar vacío", messages.userMessage(e).isNotBlank())
    }
}
