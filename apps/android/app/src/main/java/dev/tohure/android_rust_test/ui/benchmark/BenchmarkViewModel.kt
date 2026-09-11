package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.runtime.Stable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
