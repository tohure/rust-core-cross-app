package dev.tohure.android_rust_test.contract

import uniffi.core_financiero.Account

/**
 * De dónde salen los datos del contrato que la app necesita en producción.
 *
 * Existe como interfaz para que los ViewModels no dependan de `android.content.Context`
 * y se puedan testear en la JVM, sin emulador.
 */
interface ContractSource {
    /** Las dos cuentas de `cuentas_iniciales`. Son datos del contrato, no de la app. */
    fun initialAccounts(): List<Account>

    /**
     * La clave y el nonce de demo, de `_clave_demo_hex` y `_nonce_demo_hex`.
     *
     * **El nonce es FIJO a propósito**, para que las cuatro plataformas produzcan el mismo
     * hex y se pueda comparar en la demo. En producción reutilizar un nonce con
     * ChaCha20-Poly1305 es catastrófico; ver `contracts/README.md`.
     *
     * Se declaran acá y no en la Task 11 a propósito: agregar métodos a esta interfaz más
     * tarde rompería la compilación de todos los fakes ya escritos.
     */
    fun demoKeyHex(): String
    fun demoNonceHex(): String
}
