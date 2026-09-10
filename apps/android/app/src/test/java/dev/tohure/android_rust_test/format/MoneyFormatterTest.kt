package dev.tohure.android_rust_test.format

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyFormatterTest {
    @Test
    fun addsCurrencyAndThousandSeparatorsWithoutRounding() {
        // El core ya entregó el valor con la escala correcta: el formateador NUNCA redondea.
        assertEquals("S/ 1,500.08", MoneyFormatter.format("1500.08"))
        assertEquals("S/ 0.05", MoneyFormatter.format("0.05"))
        assertEquals("S/ 8,499.92", MoneyFormatter.format("8499.92"))
    }

    @Test
    fun aValueThatIsNotAnAmountComesBackUntouched() {
        // Defensivo: si el core devolviera algo inesperado, la pantalla muestra el string
        // crudo en vez de romperse. Nunca inventa un número.
        assertEquals("--", MoneyFormatter.format("--"))
    }
}
