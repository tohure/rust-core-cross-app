package dev.tohure.android_rust_test.contract

/**
 * Los nueve mensajes de usuario, indexados por **nombre del contrato**
 * (`Longitud`, `DigitoControl`, …), no por el nombre de la variante en inglés.
 *
 * Los mensajes NO cruzan el FFI: uniffi arma el `message` de la excepción con los campos
 * de la variante y lo deja vacío para las que no tienen campos. Sin este archivo las
 * cuatro apps mostrarían textos distintos.
 *
 * Es interfaz por lo mismo que [ContractSource], y además porque así un segundo idioma
 * es otro archivo y no un cambio de código.
 */
interface MessageSource {
    fun messages(): Map<String, String>
}
