package dev.tohure.android_rust_test.format

import java.math.BigDecimal

/**
 * Agrega `S/` y separadores de miles. **Solo al pintar.**
 *
 * Recibe el `String` que devolvió el core y lo convierte a `BigDecimal` —nunca a `Double`—
 * únicamente para agrupar los miles. No redondea: el core ya entregó el valor con la
 * escala correcta (2 decimales para PEN).
 *
 * No se usa en los mensajes de error: ahí los montos van crudos, porque los formateadores
 * de Android, iOS y el navegador no coinciden entre sí.
 */
object MoneyFormatter {
    fun format(amount: String): String {
        val value = runCatching { BigDecimal(amount) }.getOrNull() ?: return amount
        // El signo se separa ANTES de agrupar: si entra al `chunked(3)` se comporta como un
        // dígito más y, cuando la parte entera tiene un múltiplo de 3 dígitos, queda aislado
        // en su propio grupo — "-123456.78" salía como "S/ -,123,456.78".
        val sign = if (value.signum() < 0) "-" else ""
        val parts = value.abs().toPlainString().split(".")
        val grouped = parts[0]
            .reversed()
            .chunked(3)
            .joinToString(",")
            .reversed()
        val decimals = parts.getOrNull(1)
        return if (decimals != null) "S/ $sign$grouped.$decimals" else "S/ $sign$grouped"
    }
}
