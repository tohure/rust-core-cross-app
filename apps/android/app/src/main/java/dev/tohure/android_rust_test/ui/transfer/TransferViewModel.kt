package dev.tohure.android_rust_test.ui.transfer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferRequest

/** Máximo 2 decimales. Es un filtro de TEXTO, no una regla de negocio. */
private val AMOUNT = Regex("""^\d{0,9}(\.\d{0,2})?$""")

class TransferViewModel(
    private val core: CoreFinanciero,
    contract: ContractSource,
    private val messages: ContractMessages,
) : ViewModel() {
    /**
     * Cache crudo, separado del estado: el estado guarda lo que la pantalla pinta.
     *
     * Las dos cuentas son DATOS DEL CONTRATO, no de la app. Hardcodearlas acá las
     * duplicaría en las cuatro apps y divergirían.
     *
     * Se inicializa ANTES que `_uiState`: el orden de los inicializadores de propiedad
     * importa, y al revés esto sería `null` al construir el estado inicial.
     */
    private var allAccounts: List<Account> = contract.initialAccounts()

    private val _uiState = MutableStateFlow(
        TransferUiState(
            origin = allAccounts.getOrNull(0)?.id.orEmpty(),
            destination = allAccounts.getOrNull(1)?.id.orEmpty(),
            accounts = allAccounts.toImmutableList(),
        ),
    )
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    // Editar un campo CONSUME el error anterior — ver el comentario equivalente en
    // ArithmeticViewModel.
    fun originChanged(value: String) {
        _uiState.value = _uiState.value.copy(origin = value)
        clearError()
    }

    fun destinationChanged(value: String) {
        _uiState.value = _uiState.value.copy(destination = value)
        clearError()
    }

    /**
     * El core ya rechaza un monto con más de 2 decimales (`tr-007`, `MontoInvalido`), pero
     * el usuario no tiene que llegar hasta ahí: es una demo y la pantalla tiene que verse
     * bien. Esto **no parsea, no redondea y no calcula**: decide si el string que se acaba
     * de teclear se acepta en el campo.
     */
    fun amountChanged(value: String) {
        if (!AMOUNT.matches(value)) return
        _uiState.value = _uiState.value.copy(amount = value)
        clearError()
    }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun transfer() {
        viewModelScope.launch {
            val s = _uiState.value
            _uiState.value = s.copy(isLoading = true, error = null)
            val request = TransferRequest(s.origin, s.destination, s.amount)
            core.transfer(allAccounts, request)
                .onSuccess { result ->
                    // Espera para que parezca una llamada de red. NO HAY RED.
                    delay(result.simulatedLatencyMs.toLong())
                    allAccounts = result.accounts
                    _uiState.value = _uiState.value.copy(
                        result = result,
                        accounts = result.accounts.toImmutableList(),
                        isLoading = false,
                    )
                }.onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        result = null,
                        error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                        isLoading = false,
                    )
                }
        }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }
}
