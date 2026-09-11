package dev.tohure.android_rust_test.ui.card

import androidx.compose.runtime.Immutable

/**
 * La pantalla tiene **dos operaciones independientes**, y por eso dos bloques de campos con su
 * propio error: cifrar un número, y descifrar un hex que viene de otra plataforma. Un fallo en
 * una no puede borrar el resultado de la otra — en la demo las dos están en pantalla a la vez.
 */
@Immutable
data class CardUiState(
    // ── Cifrar ────────────────────────────────────────────────────────────────
    val number: String = "",
    val brand: String = "",
    val masked: String = "",
    /** El hex debe ser idéntico en las cuatro plataformas. Es el punto de la demo. */
    val cipherHex: String = "",
    /**
     * El número recuperado descifrando el hex que se acaba de producir.
     *
     * Existe para que se vea que esto es **cifrado reversible y no un hash**: sin esta fila,
     * un espectador no tiene cómo distinguir un `encrypt` de un `sha256`.
     */
    val roundTrip: String = "",
    val error: String? = null,

    // ── Descifrar un hex ajeno ────────────────────────────────────────────────
    /** Hex pegado a mano, típicamente copiado de la app de iOS, RN o Angular. */
    val foreignHex: String = "",
    val foreignPlain: String = "",
    val foreignError: String? = null,
)
