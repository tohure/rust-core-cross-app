import Testing

@testable import ios_rust_test

@Suite("El formateo de montos")
struct MoneyFormatterTest {
    @Test("agrega S/ y separadores de miles sin tocar los decimales")
    func addsSymbolAndThousandsSeparators() {
        #expect(MoneyFormatter.format("4899.99") == "S/ 4,899.99")
        #expect(MoneyFormatter.format("1300.50") == "S/ 1,300.50")
        #expect(MoneyFormatter.format("100.01") == "S/ 100.01")
        #expect(MoneyFormatter.format("1000000.30") == "S/ 1,000,000.30")
    }

    @Test("el signo negativo no se cuenta como dígito al agrupar")
    func theMinusSignIsNotGroupedAsADigit() {
        // El bug que Android documentó: si el signo entra al agrupamiento se comporta como
        // un dígito más y, cuando la parte entera tiene un múltiplo de 3 dígitos, queda
        // aislado en su propio grupo — "-123456.78" salía como "S/ -,123,456.78".
        #expect(MoneyFormatter.format("-123456.78") == "S/ -123,456.78")
    }

    @Test("lo que no es un número decimal se devuelve tal cual")
    func garbagePassesThrough() {
        #expect(MoneyFormatter.format("") == "")
        #expect(MoneyFormatter.format("—") == "—")
        // Fix 1 del review: `Decimal(string:)` de Foundation es un parser de *prefijo* y
        // aceptaba estos tres arrastrando la basura ("12abc" -> 12, "12   " -> 12), cosa que
        // `BigDecimal` de Kotlin no hace. Verificado corriendo `MoneyFormatter.kt` real:
        // los tres se devuelven tal cual, sin tocar.
        #expect(MoneyFormatter.format("12abc") == "12abc")
        #expect(MoneyFormatter.format("12   ") == "12   ")
        #expect(MoneyFormatter.format("-") == "-")
    }

    @Test("nunca redondea: el core ya entregó la escala correcta")
    func neverRounds() {
        #expect(MoneyFormatter.format("0.01") == "S/ 0.01")
        #expect(MoneyFormatter.format("87654.32") == "S/ 87,654.32")
    }

    @Test("coincide con BigDecimal de Kotlin en los quince casos que disputó el review")
    func matchesKotlinsBigDecimalGrammar() {
        // Tabla obtenida corriendo `MoneyFormatter.format` real de Kotlin sobre estas
        // mismas quince entradas (ver el reporte de la Task 7, sección "Fix 1"). Cubre lo
        // que `Decimal(string:)` no resolvía: ceros a la izquierda, punto colgante, punto
        // sin parte entera, y notación científica.
        let cases: [(input: String, expected: String)] = [
            ("12abc", "12abc"),
            ("12   ", "12   "),
            ("-", "-"),
            ("", ""),
            ("—", "—"),
            ("007.50", "S/ 7.50"),
            ("100.", "S/ 100"),
            ("1.5", "S/ 1.5"),
            ("-123456.78", "S/ -123,456.78"),
            ("0.00", "S/ 0.00"),
            ("1000000.00", "S/ 1,000,000.00"),
            (".5", "S/ 0.5"),
            ("1e3", "S/ 1,000"),
            ("5000.00", "S/ 5,000.00"),
            ("1200.50", "S/ 1,200.50"),
        ]
        for c in cases {
            #expect(MoneyFormatter.format(c.input) == c.expected, "entrada: \"\(c.input)\"")
        }
    }
}
