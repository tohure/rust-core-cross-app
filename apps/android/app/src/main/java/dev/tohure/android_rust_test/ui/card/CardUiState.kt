package dev.tohure.android_rust_test.ui.card

import androidx.compose.runtime.Immutable

@Immutable
data class CardUiState(
    val number: String = "",
    val brand: String = "",
    val masked: String = "",
    /** El hex debe ser idéntico en las cuatro plataformas. Es el punto de la demo. */
    val cipherHex: String = "",
    val error: String? = null,
)
