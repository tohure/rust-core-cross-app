package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci

/**
 * Fake determinista para testear ViewModels en la JVM, sin `.so` y sin emulador.
 *
 * **No calcula nada**: devuelve lo que se le configuró. Poner aritmética acá sería
 * reimplementar el core en Kotlin, que es lo contrario de lo que la POC demuestra. Los
 * valores que se le pasan salen de `contracts/cases.json`.
 */
class FakeCoreFinanciero(
    private var nextAdd: Result<String> = Result.success("0.30"),
    private var nextSubtract: Result<String> = Result.success("0.00"),
    private var nextItf: Result<String> = Result.success("0.05"),
    private var nextCci: Result<ValidCci> = Result.success(ValidCci("002", "Banco Demo Uno", "191", "001234567890")),
    private var nextCard: Result<ValidCard> = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
    private var nextEncrypt: Result<String> = Result.success("bdca3931"),
    private var nextDecrypt: Result<String> = Result.success("4111111111111111"),
    private var nextTransfer: Result<TransferResult> = Result.success(
        TransferResult(emptyList(), "0.05", "100.05", "TRF-0001", 120u),
    ),
    private val version: String = "1.0.0+test",
) : CoreFinanciero {
    override fun add(a: String, b: String) = nextAdd
    override fun subtract(a: String, b: String) = nextSubtract
    override fun calculateItf(amount: String) = nextItf
    override fun validateCci(cci: String) = nextCci
    override fun validateCard(number: String) = nextCard
    override fun encrypt(text: String, keyHex: String, nonceHex: String) = nextEncrypt
    override fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) = nextDecrypt
    override fun transfer(accounts: List<Account>, request: TransferRequest) = nextTransfer
    override fun coreVersion() = version

    fun failNextTransfer(e: Throwable) { nextTransfer = Result.failure(e) }
    fun failNextAdd(e: Throwable) { nextAdd = Result.failure(e) }
    fun failNextCard(e: Throwable) { nextCard = Result.failure(e) }
}
