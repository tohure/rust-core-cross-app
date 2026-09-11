package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.tohure.android_rust_test.adapter.contractName
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.add
import uniffi.core_financiero.calculateItf
import uniffi.core_financiero.decrypt
import uniffi.core_financiero.encrypt
import uniffi.core_financiero.executeTransfer
import uniffi.core_financiero.subtract
import uniffi.core_financiero.validateCard
import uniffi.core_financiero.validateCci

/**
 * Espejo Kotlin de `rust-core/crates/ffi/tests/contract.rs`. Que este test pase **es** la
 * demostración: los mismos 28 casos producen los mismos strings que en Rust.
 *
 * Comparaciones con `assertEquals` sobre `String`, nunca numéricas con tolerancia.
 *
 * Las guardias son las mismas que en Rust y por el mismo motivo: un `for` sobre cero
 * elementos no aserta nada, y un test que no compara ningún string reporta éxito.
 */
@RunWith(AndroidJUnit4::class)
class ContractTest {
    private val contract: JSONObject by lazy {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        JSONObject(assets.open("cases.json").bufferedReader().use { it.readText() })
    }

    private fun group(name: String): JSONArray = contract.getJSONArray(name)

    private fun keyHex() = contract.getString("_clave_demo_hex")
    private fun nonceHex() = contract.getString("_nonce_demo_hex")

    // ── Guardias del contrato ─────────────────────────────────────────────────

    @Test
    fun theContractIsTheExpectedVersion() {
        assertEquals("2.3.0", contract.getString("version"))
        assertEquals("PEN", contract.getString("moneda"))
    }

    @Test
    fun theContractHasTheExpectedNumberOfCases() {
        assertEquals(6, group("aritmetica").length())
        assertEquals(4, group("cci").length())
        assertEquals(5, group("itf").length())
        assertEquals(6, group("tarjeta").length())
        assertEquals(7, group("transferencia").length())
        assertEquals(2, group("cuentas_iniciales").length())
    }

    @Test
    fun theContractHasNoUnknownTopLevelKeys() {
        val known = setOf(
            "version", "moneda", "_nota", "_alicuota_itf",
            "_clave_demo_hex", "_nonce_demo_hex",
            "aritmetica", "cuentas_iniciales", "transferencia", "cci", "itf", "tarjeta",
        )
        val actual = contract.keys().asSequence().toSet()
        assertEquals(
            "las claves de primer nivel de cases.json no son las conocidas",
            emptySet<String>(),
            actual - known,
        )
        assertEquals(
            "faltan claves de primer nivel en cases.json",
            emptySet<String>(),
            known - actual,
        )
    }

    /**
     * Ata el asset REAL de `messages.es.json` a las nueve variantes del core.
     *
     * Es la única guardia de mensajes que Android necesita y que Rust no puede dar: el test de contrato
     * de Rust lee el archivo fuente con `include_str!`, mientras que esta app lee el asset que
     * copió Gradle. Un asset viejo o truncado dejaría a Rust en verde y a las cuatro pantallas
     * de error mostrando cosas distintas.
     *
     * Los nueve nombres no se tipean acá: salen de `contractName()` sobre las nueve variantes
     * construidas de verdad, así que renombrar una en el core mueve esta lista sola.
     */
    @Test
    fun theMessagesAssetCoversTheNineErrorVariants() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val node = JSONObject(assets.open("messages.es.json").bufferedReader().use { it.readText() })
            .getJSONObject("mensajes")

        val variants = listOf(
            DomainException.Length("cci", 20u, 18u),
            DomainException.CheckDigit(),
            DomainException.UnknownBank("999"),
            DomainException.InvalidAmount("cero"),
            DomainException.AccountNotFound("ACC-1"),
            DomainException.SameAccount(),
            DomainException.InsufficientFunds("1.00", "2.00"),
            DomainException.Encryption("nonce inválido"),
            DomainException.OutOfRange("monto"),
        )
        // Derivado, no tipeado: si dos variantes colisionaran en el mismo nombre de contrato
        // —un copy-paste en el `when` de contractName()—, el set se reduce y esto falla. Con
        // `variants.size` no fallaría nunca, porque la lista literal siempre tiene nueve.
        val names = variants.map { it.contractName() }.toSet()
        assertEquals(
            "las nueve variantes del core deben dar nueve nombres de contrato distintos",
            9,
            names.size,
        )

        for (name in names) {
            assertTrue(
                "contracts/messages.es.json no tiene el mensaje de `$name`: esa pantalla de " +
                    "error quedaría distinta en cada una de las cuatro apps",
                node.has(name),
            )
            assertTrue(
                "el mensaje de `$name` está vacío: en pantalla eso es un cuadro de error en " +
                    "blanco, que es exactamente el fallo que este archivo existe para evitar",
                node.getString(name).isNotBlank(),
            )
        }
    }

    // ── Los cinco grupos ──────────────────────────────────────────────────────

    @Test
    fun contractArithmetic() {
        val cases = group("aritmetica")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            val actual = when (val op = c.getString("op")) {
                "sumar" -> add(c.getString("a"), c.getString("b"))
                "restar" -> subtract(c.getString("a"), c.getString("b"))
                else -> error("operación desconocida en $id: $op")
            }
            assertEquals("caso $id", c.getString("esperado"), actual)
            checked++
        }
        // El contador no es decorativo: si el grupo llegara vacío, el `for` no compararía
        // nada y el test pasaría en verde sin haber probado nada.
        assertEquals("se esperaban 6 casos de aritmetica", 6, checked)
    }

    @Test
    fun contractItf() {
        val cases = group("itf")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(
                "caso ${c.getString("id")}",
                c.getString("esperado"),
                calculateItf(c.getString("entrada")),
            )
            checked++
        }
        assertEquals("se esperaban 5 casos de itf", 5, checked)
    }

    @Test
    fun contractCci() {
        val cases = group("cci")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                assertExactFields(
                    expected,
                    setOf("codigo_banco", "nombre_banco", "oficina", "cuenta"),
                    "caso $id",
                )
                val actual = validateCci(c.getString("entrada"))
                assertEquals("caso $id codigo_banco", expected.getString("codigo_banco"), actual.bankCode)
                assertEquals("caso $id nombre_banco", expected.getString("nombre_banco"), actual.bankName)
                assertEquals("caso $id oficina", expected.getString("oficina"), actual.branch)
                assertEquals("caso $id cuenta", expected.getString("cuenta"), actual.account)
            } else {
                val e = assertThrowsDomain("caso $id") { validateCci(c.getString("entrada")) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 4 casos de cci", 4, checked)
    }

    @Test
    fun contractCard() {
        val cases = group("tarjeta")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                assertExactFields(
                    expected,
                    setOf("marca", "enmascarado", "cifrado_hex"),
                    "caso $id",
                )
                val card = validateCard(c.getString("entrada"))
                assertEquals("caso $id marca", expected.getString("marca"), card.brand)
                assertEquals("caso $id enmascarado", expected.getString("enmascarado"), card.masked)

                val hex = encrypt(c.getString("entrada"), keyHex(), nonceHex())
                assertEquals("caso $id cifrado_hex", expected.getString("cifrado_hex"), hex)
                // Lo que cifra una plataforma lo descifra cualquier otra.
                assertEquals("caso $id roundtrip", c.getString("entrada"), decrypt(hex, keyHex(), nonceHex()))
            } else {
                val e = assertThrowsDomain("caso $id") { validateCard(c.getString("entrada")) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 6 casos de tarjeta", 6, checked)
    }

    @Test
    fun contractTransfer() {
        val initial = initialAccounts()
        val cases = group("transferencia")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            val input = c.getJSONObject("entrada")
            val request = TransferRequest(
                origin = input.getString("origen"),
                destination = input.getString("destino"),
                amount = input.getString("monto"),
            )
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                assertExactFields(
                    expected,
                    setOf("cuentas", "comision_itf", "total_debitado", "comprobante", "latencia_simulada_ms"),
                    "caso $id",
                )
                val r = executeTransfer(initial, request)
                assertEquals("caso $id comision_itf", expected.getString("comision_itf"), r.itfFee)
                assertEquals("caso $id total_debitado", expected.getString("total_debitado"), r.totalDebited)
                assertEquals("caso $id comprobante", expected.getString("comprobante"), r.receipt)
                assertEquals(
                    "caso $id latencia_simulada_ms",
                    expected.getInt("latencia_simulada_ms"),
                    r.simulatedLatencyMs.toInt(),
                )
                val expectedAccounts = expected.getJSONArray("cuentas")
                assertEquals("caso $id cantidad de cuentas", expectedAccounts.length(), r.accounts.size)
                for (j in 0 until expectedAccounts.length()) {
                    val e = expectedAccounts.getJSONObject(j)
                    assertExactFields(e, setOf("id", "titular", "saldo"), "caso $id cuenta $j")
                    assertEquals("caso $id cuenta $j id", e.getString("id"), r.accounts[j].id)
                    assertEquals("caso $id cuenta $j titular", e.getString("titular"), r.accounts[j].holder)
                    assertEquals("caso $id cuenta $j saldo", e.getString("saldo"), r.accounts[j].balance)
                }
            } else {
                val e = assertThrowsDomain("caso $id") { executeTransfer(initial, request) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 7 casos de transferencia", 7, checked)
    }

    // ── Ayudantes ─────────────────────────────────────────────────────────────

    private fun initialAccounts(): List<Account> {
        val array = group("cuentas_iniciales")
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Account(o.getString("id"), o.getString("titular"), o.getString("saldo"))
        }
    }

    private fun assertThrowsDomain(label: String, block: () -> Unit): DomainException {
        try {
            block()
        } catch (e: DomainException) {
            return e
        }
        throw AssertionError("$label: se esperaba un DomainException y no se lanzó ninguno")
    }

    /**
     * Espejo de `assert_exact_fields` de `contract.rs`.
     *
     * Verifica que un `esperado` traiga EXACTAMENTE los campos declarados. Sin esta guardia,
     * un campo nuevo en el contrato quedaría sin comparar en silencio: los `getString(...)`
     * de abajo solo leen los campos que ya conocen. Rust lo caza y Kotlin no — y las cuatro
     * plataformas tienen que cazar lo mismo.
     */
    private fun assertExactFields(o: JSONObject, expected: Set<String>, what: String) {
        val actual = o.keys().asSequence().toSet()
        assertEquals(
            "$what: los campos no son los esperados. Un campo nuevo en el contrato necesita " +
                "su assertEquals acá y en las otras tres plataformas, o queda sin comparar",
            expected,
            actual,
        )
    }
}
