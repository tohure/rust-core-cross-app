package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.add
import uniffi.core_financiero.coreVersion

/**
 * El primer test de toda la POC que cruza el borde FFI real.
 *
 * El test de contrato de `rust-core` llama a las nueve funciones como funciones Rust ordinarias:
 * no prueba JNA, ni `System.loadLibrary`, ni si el `strip` del perfil release se comió
 * algún símbolo. Esto sí. Si este test falla, ninguna pantalla tiene sentido todavía.
 */
@RunWith(AndroidJUnit4::class)
class CoreSmokeTest {
    @Test
    fun theLibraryLoadsAndJnaResolvesSymbols() {
        // `coreVersion()` es la única función del core que no lanza: si la librería no
        // cargó, esto revienta con UnsatisfiedLinkError antes de comparar nada.
        val version = coreVersion()
        assertTrue("coreVersion() devolvió vacío: $version", version.isNotBlank())
    }

    @Test
    fun aValueCrossesTheBoundaryAndComesBack() {
        // Un caso del contrato (ar-001), acá solo para probar que un String cruza en
        // los dos sentidos. La verificación real de los 28 casos es la Task 5.
        assertEquals("0.30", add("0.1", "0.2"))
    }
}
