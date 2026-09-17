package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.runtime.Stable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import java.util.Locale
import kotlinx.coroutines.CoroutineDispatcher
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
class BenchmarkViewModel(
    private val core: CoreFinanciero,
    /**
     * Dónde corren las mediciones. Se inyecta **solo para poder testear esta pantalla**:
     * con `Dispatchers.Default` fijo, la corrutina salta a un pool real que
     * `advanceUntilIdle()` no espera, y el test no puede observar el estado final. Eso es
     * lo que dejó pasar el bug de `n = 0` hasta la Fase 3.
     */
    private val worker: CoroutineDispatcher = Dispatchers.Default,
    private val messages: ContractMessages,
) : ViewModel() {
    private val _uiState = MutableStateFlow(BenchmarkUiState())
    val uiState: StateFlow<BenchmarkUiState> = _uiState.asStateFlow()

    fun iterationsChanged(value: String) {
        if (!value.all(Char::isDigit) || value.length > 6) return
        _uiState.value = _uiState.value.copy(iterations = value)
    }

    fun run() {
        // `n > 0`, no solo `n != null`: con n = 0, `measure` calcula el índice del percentil
        // como (0 * 0.5).toInt().coerceIn(0, -1) y `coerceIn` lanza IllegalArgumentException
        // cuando el mínimo supera al máximo. La corrutina moría después de prender
        // isRunning, así que el spinner quedaba colgado — y en un aparato la excepción sin
        // capturar en viewModelScope se lleva puesta la app. iOS tiene el mismo guard.
        val n = _uiState.value.iterations.toIntOrNull()?.takeIf { it > 0 }
        if (n == null) {
            // Antes era un `?: return` mudo: sin spinner colgado, pero sin decir por qué no
            // pasó nada. React Native y Angular ya lo explican, con este texto exacto — la
            // demo consiste en poner las pantallas lado a lado, así que el string es el mismo.
            _uiState.value = _uiState.value.copy(
                error = "Ingresa un número de iteraciones mayor que cero.",
                isRunning = false,
            )
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRunning = true, error = null)

            // Una llamada de prueba FUERA del bucle, y la única cuyo Result se mira.
            //
            // `measure` descarta el `Result`, así que con el puente roto cronometraría el
            // camino de error: la pantalla mostraría números MÁS RÁPIDOS que los reales y
            // nadie se enteraría. Es la pantalla donde menos conviene, porque sus números se
            // citan. React Native y Angular ya mostraban el error; esto cierra la divergencia.
            val failure = core.add("0.1", "0.2").exceptionOrNull()
            if (failure != null) {
                // Las medidas vuelven a `—`: dejar las de una corrida anterior debajo de un
                // error haría parecer que el número corresponde a ésta. Igual que React Native.
                _uiState.value = BenchmarkUiState(
                    iterations = _uiState.value.iterations,
                    error = messages.userMessage(failure),
                )
                return@launch
            }
            // ESTA es la única pantalla donde las llamadas al core salen del hilo principal.
            // En el resto son síncronas y de microsegundos: envolverlas sería puro ruido.
            val core50to95 = withContext(worker) { measure(n) { core.add("0.1", "0.2") } }
            val native50to95 = withContext(worker) { measure(n) { NativeBaseline.add("0.1", "0.2") } }
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
        // `Locale.ROOT`, no el locale por defecto: `"%.2f".format(...)` en un aparato es-PE
        // imprime `1,23 µs` mientras React Native, que usa `toFixed(2)`, siempre da
        // `1.23 µs`. Dos apps lado a lado con distinto separador rompen la comparación
        // carácter por carácter, que es toda la tesis.
        fun at(p: Double) = String.format(
            Locale.ROOT,
            "%.2f µs",
            samples[(n * p).toInt().coerceIn(0, n - 1)] / 1000.0,
        )
        return at(0.50) to at(0.95)
    }
}
