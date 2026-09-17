package dev.tohure.android_rust_test.adapter

import dev.tohure.android_rust_test.contract.MessageSource
import uniffi.core_financiero.DomainException

/**
 * El nombre que `contracts/cases.json` le da a este error.
 *
 * `DomainError::contract_name()` es un método de Rust y **no cruza el FFI**: el enum
 * generado trae solo los nombres en inglés. Verificado en la Fase 1 con nueve variantes
 * y otra vez en la Fase 6 con la décima (`Decryption`): los diez nombres del contrato
 * aparecen 0 veces en el `.kt` generado.
 *
 * El `when` va **exhaustivo, como expresión y sin rama `else`**. Es deliberado: agregar
 * una undécima variante al core tiene que romper la compilación acá — un fallo ruidoso y
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
        is DomainException.Decryption -> "Descifrado"
        is DomainException.OutOfRange -> "FueraDeRango"
    }

/**
 * Traduce un error del core al texto que ve el usuario.
 *
 * Vive en producción, no solo en el test, porque `contracts/messages.es.json` indexa los
 * mensajes por nombre del contrato: la pantalla de error necesita el mapeo igual que el
 * test de contrato. **El test de contrato reusa esta misma función** en vez de escribir la suya — así verifica
 * contra `cases.json` el mapeo que la UI usa de verdad, y no una copia que puede divergir.
 */
class ContractMessages(source: MessageSource) {
    private val messages: Map<String, String> = source.messages()

    /**
     * El texto para un `Throwable` cualquiera, que es lo que de verdad sale del adapter.
     *
     * **Esta sobrecarga no es defensiva, cubre un caso real.** `UniffiCoreFinanciero` envuelve
     * cada llamada en `runCatching`, que en Kotlin atrapa **todo `Throwable`** y no sólo
     * `DomainException`: un fallo al cargar `libcore_financiero.so`, o cualquier excepción de
     * JNA, vuelve como `Result.failure` por el mismo camino. Antes los cuatro ViewModels
     * cerraban con `?: e.toString()` y el usuario veía
     * `java.lang.UnsatisfiedLinkError: dlopen failed: …` en pantalla.
     *
     * El diagnóstico **no se pierde**: lo loguea `UniffiCoreFinanciero`, que es donde se
     * atrapa. Esta clase se queda pura —sin dependencias de Android— para que la puedan usar
     * los tests de JVM sin mockear nada.
     *
     * El texto es normativo y vive en `docs/ui-spec.md`: las cuatro apps muestran el mismo.
     */
    fun userMessage(e: Throwable): String =
        if (e is DomainException) {
            userMessage(e)
        } else {
            FALLBACK
        }

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
            is DomainException.Decryption -> template
            is DomainException.OutOfRange -> template.replace("{field}", e.`field`)
        }

    companion object {
        /**
         * Lo que ve el usuario cuando falla algo que **no** es un error de dominio. Normativo
         * en `docs/ui-spec.md`, igual en las cuatro apps. No dice «vuelve a intentarlo» a
         * propósito: si la librería nativa no cargó, reintentar no arregla nada, y prometer
         * una salida que no existe es peor que no decir nada.
         */
        const val FALLBACK = "No se pudo completar la operación."
    }
}
