package dev.tohure.android_rust_test.ui.transfer

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferResult

@Immutable
data class TransferUiState(
    val origin: String = "",
    val destination: String = "",
    /** `String`. Siempre. El estado es el último lugar donde alguien se tienta con un número. */
    val amount: String = "",
    val accounts: ImmutableList<Account> = persistentListOf(),
    val result: TransferResult? = null,
    /** `true` mientras corre `simulatedLatencyMs`. */
    val isLoading: Boolean = false,
    /** Ya resuelto a texto de usuario, no la excepción. */
    val error: String? = null,
)
