package dev.tohure.android_rust_test.adapter

import android.util.Log
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci
import uniffi.core_financiero.add as coreAdd
import uniffi.core_financiero.calculateItf as coreCalculateItf
import uniffi.core_financiero.coreVersion as coreCoreVersion
import uniffi.core_financiero.decrypt as coreDecrypt
import uniffi.core_financiero.encrypt as coreEncrypt
import uniffi.core_financiero.executeTransfer as coreExecuteTransfer
import uniffi.core_financiero.subtract as coreSubtract
import uniffi.core_financiero.validateCard as coreValidateCard
import uniffi.core_financiero.validateCci as coreValidateCci

/**
 * Habla con `libcore_financiero.so` a través de los bindings de uniffi, que corren sobre
 * JNA. Las llamadas son síncronas y de microsegundos: **no van en corrutinas ni en
 * `Dispatchers.IO`**, salvo en la pantalla de benchmark.
 */
class UniffiCoreFinanciero : CoreFinanciero {
    override fun add(a: String, b: String) = guarded { coreAdd(a, b) }
    override fun subtract(a: String, b: String) = guarded { coreSubtract(a, b) }
    override fun calculateItf(amount: String) = guarded { coreCalculateItf(amount) }
    override fun validateCci(cci: String): Result<ValidCci> = guarded { coreValidateCci(cci) }
    override fun validateCard(number: String): Result<ValidCard> = guarded { coreValidateCard(number) }

    override fun encrypt(text: String, keyHex: String, nonceHex: String) =
        guarded { coreEncrypt(text, keyHex, nonceHex) }

    override fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) =
        guarded { coreDecrypt(ciphertextHex, keyHex, nonceHex) }

    override fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult> =
        guarded { coreExecuteTransfer(accounts, request) }

    /**
     * `runCatching` con una sola línea de más, y esa línea importa.
     *
     * `runCatching` atrapa **todo `Throwable`**, no sólo `DomainException`: si
     * `libcore_financiero.so` no carga, o JNA falla al resolver un símbolo, eso vuelve como
     * `Result.failure` por el mismo camino que un error de negocio. La capa de UI lo convierte
     * en un texto genérico —no puede mostrar `UnsatisfiedLinkError` en pantalla—, así que el
     * diagnóstico se perdería del todo si no quedara acá.
     *
     * Un `DomainException` NO se loguea: es el camino normal, no un fallo.
     */
    private inline fun <T> guarded(block: () -> T): Result<T> =
        runCatching(block).onFailure {
            if (it !is DomainException) {
                Log.e("CoreFinanciero", "error no-dominio cruzando el FFI", it)
            }
        }

    override fun coreVersion(): String = coreCoreVersion()
}
