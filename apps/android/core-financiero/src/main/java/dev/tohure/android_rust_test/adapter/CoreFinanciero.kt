package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci

/**
 * La única superficie por la que la app habla con el core.
 *
 * **Reexporta los tipos de uniffi; no los traduce.** Una segunda nomenclatura en Kotlin
 * duplicaría el contrato y se desincronizaría en la primera regeneración de bindings.
 * Esta interfaz existe para **sustituir la implementación** —y así testear los ViewModels
 * en la JVM, sin emulador—, no para mapear tipos.
 *
 * Devuelve `Result<T>` y no lanza: el mapeo a mensaje de usuario ocurre en la capa de UI
 * con [ContractMessages], no acá. El adapter propaga el `DomainException` tal cual.
 */
interface CoreFinanciero {
    fun add(a: String, b: String): Result<String>
    fun subtract(a: String, b: String): Result<String>
    fun calculateItf(amount: String): Result<String>
    fun validateCci(cci: String): Result<ValidCci>
    fun validateCard(number: String): Result<ValidCard>
    fun encrypt(text: String, keyHex: String, nonceHex: String): Result<String>
    fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String): Result<String>
    fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult>

    /** La única que no falla. Es la prueba en pantalla de que las cuatro apps comparten build. */
    fun coreVersion(): String
}
