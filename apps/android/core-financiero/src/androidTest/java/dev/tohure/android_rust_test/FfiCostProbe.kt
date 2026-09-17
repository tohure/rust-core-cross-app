package dev.tohure.android_rust_test

import android.content.pm.ApplicationInfo
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.add
import uniffi.core_financiero.coreVersion
import uniffi.core_financiero.validateCard

/**
 * SONDA DE MEDICIÓN — apagada por defecto, y no es un test.
 *
 * Mide el costo del cruce FFI. No aserta nada: es una medición no determinista que tarda
 * ~25 s y no tiene sentido correr en cada suite, así que sin `-e probe true` se salta sola
 * y sale como *skipped*. El comando completo está en [TESTING.md](../../../../../TESTING.md).
 *
 * **Vive en el repositorio a propósito**, al revés de lo que decidió la Fase 6. El código de
 * una medición que hay que poder repetir es parte de la medición: al borrarla, repetirla
 * obligó a reescribirla, y una sonda reescrita no mide lo mismo que la original.
 *
 * Imprime si el APK es `debuggable` porque **esa bandera es la variable**: la medición
 * original se tomó sin registrarla y quedó ~4x pesimista.
 */
@RunWith(AndroidJUnit4::class)
class FfiCostProbe {
    /** Ajustables con `-e warmup N` / `-e runs N`: la cantidad de muestras **cambia el
     *  resultado** —una tanda larga calienta el aparato y presiona al GC—, así que poder
     *  reproducir la forma de otra medición es parte de poder compararse con ella. */
    private val warmup = arg("warmup", 2_000)
    private val runs = arg("runs", 20_000)

    private fun arg(name: String, fallback: Int): Int =
        InstrumentationRegistry.getArguments().getString(name)?.toIntOrNull() ?: fallback

    @Test
    fun measureTheCostOfCrossing() {
        // Un `return`, y NO `assumeTrue`: AGP escribe la `AssumptionViolatedException` como
        // `<failure>` en el XML de resultados —aunque la tarea de Gradle pase en verde—, así
        // que la suite quedaría reportando «1 failure» de forma permanente. Verificado.
        // El log dice que no midió, para que nadie lea un verde y crea que hay número.
        if (InstrumentationRegistry.getArguments().getString("probe") != "true") {
            Log.i(TAG, "sonda apagada: no se midió nada (se prende con `-e probe true`)")
            return
        }
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val debuggable = (ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        Log.i(TAG, "=== artefacto ${coreVersion()} · debuggable=$debuggable · warmup=$warmup runs=$runs ===")

        probe("coreVersion()") { coreVersion() }
        probe("validateCard(\"41111\")") { runCatching { validateCard("41111") } }
        probe("add(\"0.1\", \"0.2\")") { add("0.1", "0.2") }
        probe("NativeBaseline.add") { baselineAdd("0.1", "0.2") }
    }

    /** Copia local de la baseline: la de `:app` no es visible desde este módulo. */
    private fun baselineAdd(a: String, b: String): String =
        ((a.toDouble() + b.toDouble()) * 100.0).toLong().let { "${it / 100}.${it % 100}" }

    private inline fun probe(label: String, block: () -> Unit) {
        repeat(warmup) { block() }
        val samples = LongArray(runs)
        repeat(runs) { i ->
            val start = System.nanoTime()
            block()
            samples[i] = System.nanoTime() - start
        }
        report(label, samples)
    }

    /**
     * Separado de [probe] porque el compilador de Kotlin rechaza funciones locales dentro de
     * una función `inline`, y [probe] **tiene** que ser `inline`: si no, el `block()` del bucle
     * se vuelve una llamada virtual a un lambda y eso entra en la medición.
     */
    private fun report(label: String, samples: LongArray) {
        samples.sort()
        fun at(p: Double) = samples[(samples.size * p).toInt().coerceIn(0, samples.size - 1)] / 1000.0
        Log.i(TAG, String.format("%-24s p50=%8.2f us  p95=%8.2f us", label, at(0.50), at(0.95)))
    }

    private companion object {
        const val TAG = "FfiCostProbe"
    }
}
