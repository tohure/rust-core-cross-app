package dev.tohure.android_rust_test.contract

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AssetSourcesTest {
    private val assets get() = InstrumentationRegistry.getInstrumentation().targetContext.assets

    @Test
    fun theInitialAccountsComeFromTheContract() {
        val accounts = AssetContractSource(assets).initialAccounts()
        assertEquals(2, accounts.size)
        assertEquals("00219100123456789047", accounts[0].id)
        assertEquals("Ana Quispe", accounts[0].holder)
        assertEquals("5000.00", accounts[0].balance)
        assertEquals("01122000987654321065", accounts[1].id)
        assertEquals("Luis Ramos", accounts[1].holder)
    }

    @Test
    fun theNineUserMessagesComeFromTheContract() {
        val messages = AssetMessageSource(assets).messages()
        assertEquals(9, messages.size)
        assertEquals(
            "La cuenta de origen y la de destino son la misma.",
            messages["MismaCuenta"],
        )
        assertTrue(
            "ningún mensaje puede estar vacío",
            messages.values.all { it.isNotBlank() },
        )
    }
}
