package dev.tohure.android_rust_test.contract

import android.content.res.AssetManager
import org.json.JSONObject
import uniffi.core_financiero.Account

/**
 * Lee `cases.json` de los assets. El archivo lo pone ahí la tarea Gradle `copyContracts*`.
 *
 * Se parsea una sola vez: el contrato no cambia mientras la app corre.
 */
class AssetContractSource(private val assets: AssetManager) : ContractSource {
    private val root: JSONObject by lazy {
        JSONObject(assets.open("cases.json").bufferedReader().use { it.readText() })
    }

    override fun initialAccounts(): List<Account> {
        val array = root.getJSONArray("cuentas_iniciales")
        // Las claves de `cases.json` están en español a propósito: es un archivo de datos
        // que las cinco plataformas comparan por igualdad exacta, no código.
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Account(
                id = o.getString("id"),
                holder = o.getString("titular"),
                balance = o.getString("saldo"),
            )
        }
    }

    override fun demoKeyHex(): String = root.getString("_clave_demo_hex")
    override fun demoNonceHex(): String = root.getString("_nonce_demo_hex")
}
