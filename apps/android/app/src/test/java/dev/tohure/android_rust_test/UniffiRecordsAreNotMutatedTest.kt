package dev.tohure.android_rust_test

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Los cinco `Record` que genera uniffi son `data class` con propiedades `var`, y el
 * `@Immutable` de los `UiState` es una promesa que sólo se sostiene si nadie los muta.
 * `@Immutable` **anula la inferencia** de Compose: si alguien escribiera
 * `account.balance = "0.00"`, Compose no se enteraría y la pantalla seguiría mostrando el
 * saldo viejo. Es un riesgo de corrección, no de rendimiento.
 *
 * Las dos salidas obvias no sirven: los tipos son generados y no se editan, y envolverlos en
 * tipos propios sería duplicar el contrato en Kotlin —lo que `CONTEXT.md` pone en «Qué NO
 * hacer»—. Queda esta guardia, que **deriva la lista de campos del propio binding**, así que
 * regenerar los bindings no la pudre.
 */
class UniffiRecordsAreNotMutatedTest {
    private val generated = File(
        "../core-financiero/src/generated/java/uniffi/core_financiero/core_financiero.kt",
    )
    private val uiSources = File("src/main/java/dev/tohure/android_rust_test/ui")

    private val records = listOf(
        "Account", "TransferRequest", "TransferResult", "ValidCci", "ValidCard",
    )

    private fun mutableFieldsOfRecords(): Set<String> {
        val source = generated.readText()
        return records.flatMap { name ->
            val header = Regex("""data class $name\s*\(([^)]*)\)""", RegexOption.DOT_MATCHES_ALL)
                .find(source)
                ?.groupValues
                ?.get(1)
                ?: error("no se encontró el Record `$name` en el binding generado")
            // Los backticks NO son opcionales en el patrón: uniffi emite ``var `id`:
            // kotlin.String`` con el nombre entre backticks, y un `var\s+(\w+)` no matchea
            // nada. El set saldría vacío y la guardia de abajo pasaría sin mirar un solo
            // campo — verde y sin valor. Lo caza `theGeneratedBindingStillHasTheFiveRecords`.
            Regex("""var\s+`?(\w+)`?\s*:""").findAll(header).map { it.groupValues[1] }.toList()
        }.toSet()
    }

    @Test
    fun theGeneratedBindingStillHasTheFiveRecords() {
        // Si esto falla, cambió la forma del generado y la guardia de abajo dejó de mirar lo
        // que cree mirar.
        assertEquals(
            "se esperaban los campos de los cinco Records",
            true,
            mutableFieldsOfRecords().containsAll(listOf("balance", "origin", "receipt", "masked")),
        )
    }

    @Test
    fun noUiFileAssignsToAUniffiRecordField() {
        val fields = mutableFieldsOfRecords()
        val offenders = uiSources.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .flatMap { file ->
                file.readLines().mapIndexedNotNull { i, line ->
                    fields.firstOrNull { field ->
                        Regex("""\.$field\s*=(?!=)""").containsMatchIn(line)
                    }?.let { "${file.name}:${i + 1} → .$it =" }
                }
            }
            .toList()

        assertEquals(
            "un Record de uniffi se REEMPLAZA, no se muta: Compose no observa la mutación " +
                "y la pantalla queda con el valor viejo. Encontrado en: $offenders",
            emptyList<String>(),
            offenders,
        )
    }
}
