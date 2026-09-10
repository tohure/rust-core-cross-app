package dev.tohure.android_rust_test.ui.arithmetic

import androidx.compose.runtime.Immutable

/** Las dos operaciones que expone el core. */
enum class Operation { ADD, SUBTRACT }

@Immutable
data class ArithmeticUiState(
    val operandA: String = "0.1",
    val operandB: String = "0.2",
    val operation: Operation = Operation.ADD,
    /** Lo que devuelve el core: `Decimal` con la escala correcta. */
    val coreResult: String = "",
    /** Lo que devuelve el flotante nativo. Existe para exhibir la divergencia. */
    val nativeResult: String = "",
    val error: String? = null,
)
