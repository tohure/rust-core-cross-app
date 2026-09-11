package dev.tohure.android_rust_test.ui.benchmark

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BenchmarkViewModel(private val core: CoreFinanciero) : ViewModel() {
    private val _uiState = MutableStateFlow(BenchmarkUiState())
    val uiState: StateFlow<BenchmarkUiState> = _uiState.asStateFlow()

    fun iterationsChanged(value: String) {
        if (!value.all(Char::isDigit) || value.length > 6) return
        _uiState.value = _uiState.value.copy(iterations = value)
    }

    fun run() {
        val n = _uiState.value.iterations.toIntOrNull() ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRunning = true)
            // ESTA es la única pantalla donde las llamadas al core salen del hilo principal.
            // En el resto son síncronas y de microsegundos: envolverlas sería puro ruido.
            val core50to95 = withContext(Dispatchers.Default) { measure(n) { core.add("0.1", "0.2") } }
            val native50to95 = withContext(Dispatchers.Default) { measure(n) { NativeBaseline.add("0.1", "0.2") } }
            _uiState.value = _uiState.value.copy(
                coreP50 = core50to95.first, coreP95 = core50to95.second,
                nativeP50 = native50to95.first, nativeP95 = native50to95.second,
                isRunning = false,
            )
        }
    }

    /** Devuelve (p50, p95) formateados en microsegundos. */
    private fun measure(n: Int, block: () -> Unit): Pair<String, String> {
        val samples = LongArray(n)
        repeat(n) { i ->
            val start = System.nanoTime()
            block()
            samples[i] = System.nanoTime() - start
        }
        samples.sort()
        fun at(p: Double) = "%.2f µs".format(samples[(n * p).toInt().coerceIn(0, n - 1)] / 1000.0)
        return at(0.50) to at(0.95)
    }
}
