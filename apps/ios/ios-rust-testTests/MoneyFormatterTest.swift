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
    }

    @Test("nunca redondea: el core ya entregó la escala correcta")
    func neverRounds() {
        #expect(MoneyFormatter.format("0.01") == "S/ 0.01")
        #expect(MoneyFormatter.format("87654.32") == "S/ 87,654.32")
    }
}
