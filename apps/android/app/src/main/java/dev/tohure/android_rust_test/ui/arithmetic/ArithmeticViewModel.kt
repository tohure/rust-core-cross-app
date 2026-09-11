package dev.tohure.android_rust_test.ui.arithmetic

import androidx.lifecycle.ViewModel
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.core_financiero.DomainException

class ArithmeticViewModel(
    private val core: CoreFinanciero,
    private val messages: ContractMessages,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ArithmeticUiState())
    val uiState: StateFlow<ArithmeticUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    // Sin límite de decimales acá: el contrato acepta escala libre en la entrada de
    // aritmética (`ar-001` es "0.1"). Los 2 decimales son normativos solo para transferencia.
    //
    // Editar un operando CONSUME el error anterior. Sin esto, `clearError()` queda como
    // código muerto que aparenta cobertura, y el mensaje viejo se queda en pantalla al lado
    // de operandos nuevos — que es peor que no mostrarlo.
    fun operandAChanged(value: String) {
        _uiState.value = _uiState.value.copy(operandA = value)
        clearError()
    }

    fun operandBChanged(value: String) {
        _uiState.value = _uiState.value.copy(operandB = value)
        clearError()
    }

    fun operationChanged(op: Operation) { _uiState.value = _uiState.value.copy(operation = op) }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun compute() {
        val s = _uiState.value
        val result = when (s.operation) {
            Operation.ADD -> core.add(s.operandA, s.operandB)
            Operation.SUBTRACT -> core.subtract(s.operandA, s.operandB)
        }
        result
            .onSuccess { value ->
                _uiState.value = s.copy(
                    coreResult = value,
                    nativeResult = nativeFloat(s),
                    error = null,
                )
            }.onFailure { e ->
                _uiState.value = s.copy(
                    coreResult = "",
                    nativeResult = "",
                    error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                )
            }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }

    // ── El flotante nativo, que existe para fallar ────────────────────────────

    /**
     * **La única aritmética con punto flotante permitida en toda la app**, y está acá a
     * propósito: la pantalla de Aritmética existe para exhibir que `0.1 + 0.2` da
     * `0.30000000000000004` con `Double` y `0.30` con el core.
     *
     * No es una implementación alternativa del dominio: es el contraejemplo.
     */
    private fun nativeFloat(s: ArithmeticUiState): String {
        val a = s.operandA.toDoubleOrNull() ?: return "—"
        val b = s.operandB.toDoubleOrNull() ?: return "—"
        return when (s.operation) {
            Operation.ADD -> (a + b).toString()
            Operation.SUBTRACT -> (a - b).toString()
        }
    }
}
