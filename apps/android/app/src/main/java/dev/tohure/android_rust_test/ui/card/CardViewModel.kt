package dev.tohure.android_rust_test.ui.card

import androidx.compose.runtime.Stable
import androidx.lifecycle.ViewModel
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.core_financiero.DomainException

/**
 * `@Stable` es una **promesa al compilador**, y acá se cumple: la instancia se crea una sola
 * vez con `remember` y nunca cambia, y lo único público que expone es `uiState`, que **es** el
 * canal por el que Compose se entera de los cambios.
 *
 * Sin esto, la inferencia marca la clase como inestable —`ViewModel`, `StateFlow` y
 * `MutableStateFlow` vienen de librerías compiladas sin inferencia de estabilidad— y la
 * pantalla no se puede saltar en recomposición. **No se anota por performance:** las pantallas
 * se llaman desde un `when` que solo recompone al cambiar de pestaña, así que lo que se ahorra
 * es una ejecución de función por tap. Se anota por higiene: una lista de advertencias que uno
 * aprende a ignorar tapa la que sí importa. Ver PENDING.md.
 */
@Stable
class CardViewModel(
    private val core: CoreFinanciero,
    private val contract: ContractSource,
    private val messages: ContractMessages,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CardUiState())
    val uiState: StateFlow<CardUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    fun numberChanged(value: String) {
        // Solo dígitos: filtro de texto. Luhn lo valida el core, no esta app.
        if (!value.all(Char::isDigit)) return
        _uiState.value = _uiState.value.copy(number = value)
        clearError()
    }

    fun foreignHexChanged(value: String) {
        // Solo hex: filtro de texto. Que el hex sea descifrable lo decide el core.
        if (!value.all { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }) return
        _uiState.value = _uiState.value.copy(foreignHex = value.lowercase())
        clearForeignError()
    }

    // ── Acciones ──────────────────────────────────────────────────────────────

    /**
     * Valida por Luhn, cifra, **y vuelve a descifrar**.
     *
     * El descifrado no es redundante: es lo único que demuestra en pantalla que esto es
     * cifrado reversible y no un hash. Sin esa vuelta, el hex de la pantalla es
     * indistinguible de un `sha256` para quien mira la demo.
     */
    fun validateAndEncrypt() {
        val number = _uiState.value.number
        val key = contract.demoKeyHex()
        val nonce = contract.demoNonceHex()
        core.validateCard(number)
            .mapCatching { card ->
                val hex = core.encrypt(number, key, nonce).getOrThrow()
                val back = core.decrypt(hex, key, nonce).getOrThrow()
                Triple(card, hex, back)
            }.onSuccess { (card, hex, back) ->
                _uiState.value = _uiState.value.copy(
                    brand = card.brand,
                    masked = card.masked,
                    cipherHex = hex,
                    roundTrip = back,
                    error = null,
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    brand = "",
                    masked = "",
                    cipherHex = "",
                    roundTrip = "",
                    error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                )
            }
    }

    /**
     * Descifra un hex producido por **otra plataforma**.
     *
     * Es la demostración en vivo de la tesis: el hex que cifró la app de iOS, React Native o
     * Angular se pega acá y sale el mismo número, porque la clave, el nonce y el algoritmo
     * vienen del mismo core de Rust. Hasta ahora eso solo lo probaba el test de contrato.
     */
    fun decryptForeign() {
        val hex = _uiState.value.foreignHex
        core.decrypt(hex, contract.demoKeyHex(), contract.demoNonceHex())
            .onSuccess { plain ->
                _uiState.value = _uiState.value.copy(foreignPlain = plain, foreignError = null)
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    foreignPlain = "",
                    foreignError = (e as? DomainException)?.let(messages::userMessage)
                        ?: e.toString(),
                )
            }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun clearForeignError() {
        _uiState.value = _uiState.value.copy(foreignError = null)
    }
}
