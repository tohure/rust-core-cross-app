package dev.tohure.android_rust_test.ui.benchmark

/**
 * ⚠ **LA ÚNICA EXCEPCIÓN PERMITIDA A "CERO LÓGICA DE NEGOCIO FUERA DE `rust-core`".**
 *
 * Este archivo existe **para exhibir la divergencia de centavos del punto flotante**, no
 * para calcular nada que la app use. Es el contraejemplo de la pantalla de Benchmark: se
 * compara contra el core para mostrar que `Double` pierde precisión sobre dinero.
 *
 * **No lo copies, no lo extiendas y no lo llames desde ninguna otra pantalla.** Si te
 * encontrás necesitando aritmética sobre montos en Kotlin fuera de acá, el cálculo está en
 * el lugar equivocado: pedíselo al core.
 *
 * Vive en producción y no en `androidTest` porque la pantalla de Benchmark tiene que
 * pintarlo: el día de la demo nadie corre los tests instrumentados.
 */
object NativeBaseline {
    fun add(a: String, b: String): String {
        val x = a.toDoubleOrNull() ?: return "—"
        val y = b.toDoubleOrNull() ?: return "—"
        return (x + y).toString()
    }
}
