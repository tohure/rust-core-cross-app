package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
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
    override fun add(a: String, b: String) = runCatching { coreAdd(a, b) }
    override fun subtract(a: String, b: String) = runCatching { coreSubtract(a, b) }
    override fun calculateItf(amount: String) = runCatching { coreCalculateItf(amount) }
    override fun validateCci(cci: String): Result<ValidCci> = runCatching { coreValidateCci(cci) }
    override fun validateCard(number: String): Result<ValidCard> = runCatching { coreValidateCard(number) }

    override fun encrypt(text: String, keyHex: String, nonceHex: String) =
        runCatching { coreEncrypt(text, keyHex, nonceHex) }

    override fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) =
        runCatching { coreDecrypt(ciphertextHex, keyHex, nonceHex) }

    override fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult> =
        runCatching { coreExecuteTransfer(accounts, request) }

    override fun coreVersion(): String = coreCoreVersion()
}
