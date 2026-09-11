package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Los dos JSON del contrato viven en `contracts/`, en la raíz del repo, y Android no lee
 * archivos fuera del APK. Una tarea Gradle los copia a los dos source sets; esto verifica
 * que llegaron y que son el contrato que esperamos, no una copia vieja.
 */
@RunWith(AndroidJUnit4::class)
class ContractAssetsTest {
    private val testAssets get() = InstrumentationRegistry.getInstrumentation().context.assets
    private val appAssets get() = InstrumentationRegistry.getInstrumentation().targetContext.assets

    @Test
    fun theTestApkCarriesBothContractFiles() {
        val cases = JSONObject(testAssets.open("cases.json").reader().readText())
        assertEquals("2.3.0", cases.getString("version"))
        val messages = JSONObject(testAssets.open("messages.es.json").reader().readText())
        assertEquals("1.1.0", messages.getString("version"))
    }

    @Test
    fun theAppApkCarriesBothContractFiles() {
        // Producción los necesita: `cuentas_iniciales` para la pantalla de Transferencia
        // y los nueve mensajes para las pantallas de error.
        val cases = JSONObject(appAssets.open("cases.json").reader().readText())
        assertEquals("2.3.0", cases.getString("version"))
        val messages = JSONObject(appAssets.open("messages.es.json").reader().readText())
        assertEquals("1.1.0", messages.getString("version"))
    }
}
