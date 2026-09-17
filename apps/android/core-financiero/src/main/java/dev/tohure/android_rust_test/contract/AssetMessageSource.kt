package dev.tohure.android_rust_test.contract

import android.content.res.AssetManager
import org.json.JSONObject

/** Lee `messages.es.json` de los assets. */
class AssetMessageSource(private val assets: AssetManager) : MessageSource {
    private val root: JSONObject by lazy {
        JSONObject(assets.open("messages.es.json").bufferedReader().use { it.readText() })
    }

    override fun messages(): Map<String, String> {
        val node = root.getJSONObject("mensajes")
        return node.keys().asSequence().associateWith { node.getString(it) }
    }
}
