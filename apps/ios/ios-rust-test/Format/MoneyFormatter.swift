import Foundation

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
        // `Decimal(string:locale:)` con POSIX para que el punto decimal se interprete bien
        // sin importar el locale del aparato. NUNCA `Double`. Solo se usa para validar que
        // la entrada es numérica: los decimales que se pintan salen del string original.
        guard Decimal(string: amount, locale: Locale(identifier: "en_US_POSIX")) != nil else {
            return amount
        }

        let sign = amount.hasPrefix("-") ? "-" : ""
        let unsigned = sign.isEmpty ? amount : String(amount.dropFirst())
        let parts = unsigned.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let integerPart = parts.first else { return amount }

        let grouped = String(
            String(integerPart)
                .reversed()
                .enumerated()
                .map {
                    let isGroupBoundary = $0.offset > 0 && $0.offset.isMultiple(of: 3)
                    return isGroupBoundary ? ",\($0.element)" : "\($0.element)"
                }
                .joined()
                .reversed()
        )

        if parts.count == 2 {
            return "S/ \(sign)\(grouped).\(parts[1])"
        }
        return "S/ \(sign)\(grouped)"
    }
}
