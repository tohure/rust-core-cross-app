package dev.tohure.android_rust_test.ui.benchmark

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NativeBaselineTest {
    @Test
    fun theNativeBaselineDivergesFromTheCoreAndThatIsThePoint() {
        // El core devuelve "0.30" para este caso (ar-001 del contrato). El Double no.
        // Si esto dejara de fallar, la baseline dejaría de servir para la demo.
        assertNotEquals("0.30", NativeBaseline.add("0.1", "0.2"))
        assertEquals("0.30000000000000004", NativeBaseline.add("0.1", "0.2"))
    }
}
