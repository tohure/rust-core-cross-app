package dev.tohure.android_rust_test.ui.card

import androidx.lifecycle.ViewModel
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.core_financiero.DomainException

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

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun validateAndEncrypt() {
        val number = _uiState.value.number
        core.validateCard(number)
            .mapCatching { card ->
                val hex = core.encrypt(number, contract.demoKeyHex(), contract.demoNonceHex())
                    .getOrThrow()
                card to hex
            }.onSuccess { (card, hex) ->
                _uiState.value = _uiState.value.copy(
                    brand = card.brand,
                    masked = card.masked,
                    cipherHex = hex,
                    error = null,
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    brand = "",
                    masked = "",
                    cipherHex = "",
                    error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                )
            }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }
}
