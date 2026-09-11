/// Agrega `S/` y separadores de miles. **Solo al pintar.**
///
/// Recibe el `String` que devolvió el core y **no redondea**: el core ya entregó el valor
/// con la escala correcta (2 decimales para PEN).
///
/// **No usa `NumberFormatter` a propósito.** Su salida depende del ICU de la plataforma
/// —puede meter un espacio duro entre el símbolo y el número— y no tiene por qué coincidir
/// carácter por carácter con la de Kotlin. La demo pone las cuatro pantallas lado a lado,
/// así que aquí se usa el mismo algoritmo manual que `MoneyFormatter.kt` en Android.
///
/// No se usa en los mensajes de error: ahí los montos van crudos.
enum MoneyFormatter {
    static func format(_ amount: String) -> String {
        guard let parsed = parse(amount) else { return amount }

        let grouped = groupThousands(parsed.integerDigits)
        guard !parsed.fractionDigits.isEmpty else {
            return "S/ \(parsed.sign)\(grouped)"
        }
        return "S/ \(parsed.sign)\(grouped).\(parsed.fractionDigits)"
    }

    /// El número ya descompuesto en las tres piezas que hacen falta para pintarlo: signo,
    /// parte entera sin ceros a la izquierda (salvo un único "0") y parte fraccionaria —que
    /// puede ser vacía, cuando el valor no tiene decimales que mostrar.
    private struct ParsedAmount {
        let sign: String
        let integerDigits: String
        let fractionDigits: String
    }

    /// Reproduce la gramática de `java.math.BigDecimal(String)`, que es lo que
    /// `MoneyFormatter.kt` usa en Android para decidir qué es un monto válido y qué no.
    ///
    /// **No es una regla de negocio nueva.** Es la misma validación que Kotlin ya hace del
    /// otro lado del FFI, reproducida a mano porque Swift no tiene un tipo con la misma
    /// gramática de parsing que `BigDecimal`. `Decimal(string:)` de Foundation no sirve para
    /// esto: es un parser de *prefijo* que acepta basura arrastrada (`"12abc"` → 12,
    /// `"12   "` → 12), y eso rompía la paridad con Android, que sí rechaza esos strings.
    ///
    /// Verificado contra `MoneyFormatter.kt` real, corriendo ambos lados con las 34 entradas
    /// que se probaron en la Task 7 (ver `MoneyFormatterTest.swift` y el reporte de esa
    /// tarea): ceros a la izquierda se cancelan (`"007.50"` → `7.50`), un punto sin dígitos
    /// después es válido y sin parte decimal (`"100."` → `100`), un punto sin dígitos antes
    /// es válido con parte entera "0" (`".5"` → `0.5`), y la notación científica desplaza el
    /// punto decimal (`"1e3"` → `1000`).
    ///
    /// **Dos huecos conocidos, fuera de esas 34 entradas — ninguno alcanzable desde los
    /// llamadores actuales**, que solo pasan salida canónica del core, nunca texto libre
    /// tecleado por el usuario:
    /// - Un coeficiente cero con escala negativa no colapsa a un `"0"` pelado como en Java:
    ///   `"0e1"` da `"S/ 00"`, `"0e5"` da `"S/ 000,000"` y `"00e3"` da `"S/ 0,000"`; Kotlin
    ///   da `"S/ 0"` en los tres, porque `BigDecimal` colapsa un coeficiente cero con escala
    ///   negativa a `"0"` pelado.
    /// - Un exponente enorme pero parseable como `Int` de Swift —`"1e2147483648"`— dispara
    ///   un `String(repeating:count:)` del tamaño de ese exponente. Kotlin usa un exponente
    ///   de 32 bits y lanza en ese mismo caso, devolviendo la entrada intacta.
    private static func parse(_ input: String) -> ParsedAmount? {
        let chars = Array(input)
        let n = chars.count
        var i = 0
        guard n > 0 else { return nil }

        var isNegative = false
        if chars[i] == "+" || chars[i] == "-" {
            isNegative = chars[i] == "-"
            i += 1
        }

        var integerPart = ""
        while i < n, isDigit(chars[i]) {
            integerPart.append(chars[i])
            i += 1
        }

        var fractionPart = ""
        if i < n, chars[i] == "." {
            i += 1
            while i < n, isDigit(chars[i]) {
                fractionPart.append(chars[i])
                i += 1
            }
        }

        // El significand tiene que aportar al menos un dígito, en la parte entera o en la
        // fraccionaria — igual que exige BigDecimal. "." sola, o un signo solo, no alcanzan.
        guard !(integerPart.isEmpty && fractionPart.isEmpty) else { return nil }

        var exponent = 0
        if i < n, chars[i] == "e" || chars[i] == "E" {
            i += 1
            var exponentIsNegative = false
            if i < n, chars[i] == "+" || chars[i] == "-" {
                exponentIsNegative = chars[i] == "-"
                i += 1
            }
            var exponentDigits = ""
            while i < n, isDigit(chars[i]) {
                exponentDigits.append(chars[i])
                i += 1
            }
            guard !exponentDigits.isEmpty, let exponentMagnitude = Int(exponentDigits) else {
                return nil
            }
            exponent = exponentIsNegative ? -exponentMagnitude : exponentMagnitude
        }

        // Cualquier carácter sobrante — espacios, letras, un segundo punto — es basura: no
        // es un BigDecimal válido, y el monto se pinta tal cual llegó.
        guard i == n else { return nil }

        // `scale` es cuántos dígitos quedan a la derecha del punto decimal una vez aplicado
        // el exponente: los dígitos leídos después del punto restan al exponente, igual que
        // en BigDecimal.
        let scale = fractionPart.count - exponent

        // Los ceros a la izquierda del valor sin escala se cancelan, igual que al construir
        // un entero desde una cadena de dígitos: "007" y "7" son el mismo número.
        var unscaledDigits = String((integerPart + fractionPart).drop { $0 == "0" })
        if unscaledDigits.isEmpty { unscaledDigits = "0" }

        // El signo desaparece si el valor es cero: no existe el cero negativo.
        let sign = (isNegative && unscaledDigits != "0") ? "-" : ""

        if scale <= 0 {
            // Sin parte decimal: si el exponente empujó el punto más allá del último
            // dígito, se completan ceros a la derecha (`"1e3"` → `1000`).
            let trailingZeros = String(repeating: "0", count: -scale)
            return ParsedAmount(
                sign: sign, integerDigits: unscaledDigits + trailingZeros, fractionDigits: "")
        }

        if unscaledDigits.count > scale {
            let splitIndex = unscaledDigits.index(unscaledDigits.endIndex, offsetBy: -scale)
            return ParsedAmount(
                sign: sign,
                integerDigits: String(unscaledDigits[..<splitIndex]),
                fractionDigits: String(unscaledDigits[splitIndex...])
            )
        }

        // El valor es menor que 1: la parte entera es "0" y la fracción se completa con
        // ceros a la izquierda (`".5"` → `0.5`).
        let leadingZeros = String(repeating: "0", count: scale - unscaledDigits.count)
        return ParsedAmount(
            sign: sign, integerDigits: "0", fractionDigits: leadingZeros + unscaledDigits)
    }

    private static func isDigit(_ character: Character) -> Bool {
        character >= "0" && character <= "9"
    }

    private static func groupThousands(_ digits: String) -> String {
        String(
            digits.reversed()
                .enumerated()
                .map {
                    let isGroupBoundary = $0.offset > 0 && $0.offset.isMultiple(of: 3)
                    return isGroupBoundary ? ",\($0.element)" : "\($0.element)"
                }
                .joined()
                .reversed()
        )
    }
}
