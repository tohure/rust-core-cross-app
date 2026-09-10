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

    @Test
    fun groupsThousandsCorrectlyAtEveryBoundary() {
        // El caso que rompía: parte entera con múltiplo de 3 dígitos Y signo negativo.
        assertEquals("S/ -123,456.78", MoneyFormatter.format("-123456.78"))
        assertEquals("S/ 123,456.78", MoneyFormatter.format("123456.78"))
        assertEquals("S/ -1,500.08", MoneyFormatter.format("-1500.08"))
        assertEquals("S/ 999.99", MoneyFormatter.format("999.99"))
        assertEquals("S/ 1,234,567.89", MoneyFormatter.format("1234567.89"))
        assertEquals("S/ 1,000", MoneyFormatter.format("1000"))
    }
}
