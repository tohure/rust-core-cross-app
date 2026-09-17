package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.runtime.Immutable

@Immutable
data class BenchmarkUiState(
    val iterations: String = "1000",
    val coreP50: String = "—",
    val coreP95: String = "—",
    val nativeP50: String = "—",
    val nativeP95: String = "—",
    val isRunning: Boolean = false,
    /** Por qué no arrancó. Las otras tres apps ya lo explicaban; ésta volvía muda. */
    val error: String? = null,
)
