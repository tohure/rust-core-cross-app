package dev.tohure.android_rust_test.adapter

import dev.tohure.android_rust_test.contract.MessageSource
import uniffi.core_financiero.DomainException

/**
 * El nombre que `contracts/cases.json` le da a este error.
 *
 * `DomainError::contract_name()` es un método de Rust y **no cruza el FFI**: el enum
 * generado trae solo los nombres en inglés. Verificado en la Fase 1: los nueve nombres
 * del contrato aparecen 0 veces en el `.kt` generado.
 *
 * El `when` va **exhaustivo, como expresión y sin rama `else`**. Es deliberado: agregar
 * una décima variante al core tiene que romper la compilación acá — un fallo ruidoso y
 * ubicado— en vez de caer en un `"Desconocido"` que compila, pasa en verde, y se descubre
 * el día de la demo cuando esta app muestra un error que las otras tres no.
 */
fun DomainException.contractName(): String =
    when (this) {
        is DomainException.Length -> "Longitud"
        is DomainException.CheckDigit -> "DigitoControl"
        is DomainException.UnknownBank -> "BancoDesconocido"
        is DomainException.InvalidAmount -> "MontoInvalido"
        is DomainException.AccountNotFound -> "CuentaNoEncontrada"
        is DomainException.SameAccount -> "MismaCuenta"
        is DomainException.InsufficientFunds -> "SaldoInsuficiente"
        is DomainException.Encryption -> "Cifrado"
        is DomainException.OutOfRange -> "FueraDeRango"
    }

/**
 * Traduce un error del core al texto que ve el usuario.
 *
 * Vive en producción, no solo en el test, porque `contracts/messages.es.json` indexa los
 * mensajes por nombre del contrato: la pantalla de error necesita el mapeo igual que el
 * golden. **El golden reusa esta misma función** en vez de escribir la suya — así verifica
 * contra `cases.json` el mapeo que la UI usa de verdad, y no una copia que puede divergir.
 */
class ContractMessages(source: MessageSource) {
    private val messages: Map<String, String> = source.messages()

    fun userMessage(e: DomainException): String {
        val name = e.contractName()
        val template = messages[name]
            ?: error("contracts/messages.es.json no tiene el mensaje de `$name`")
        return interpolate(template, e)
    }

    /**
     * Reemplaza `{code}`, `{id}`, `{available}`, `{required}` y `{field}` por los campos
     * de la variante, **crudos**. Nada de `NumberFormat` acá: los formateadores de moneda
     * de Android, iOS y el navegador no coinciden entre sí, y una diferencia rompe la
     * comparación carácter por carácter. El formateo vive en las pantallas de montos.
     */
    private fun interpolate(template: String, e: DomainException): String =
        when (e) {
            is DomainException.Length -> template
            is DomainException.CheckDigit -> template
            is DomainException.UnknownBank -> template.replace("{code}", e.code)
            is DomainException.InvalidAmount -> template
            is DomainException.AccountNotFound -> template.replace("{id}", e.id)
            is DomainException.SameAccount -> template
            is DomainException.InsufficientFunds ->
                template
                    .replace("{available}", e.available)
                    .replace("{required}", e.required)
            is DomainException.Encryption -> template
            is DomainException.OutOfRange -> template.replace("{field}", e.`field`)
        }
}
