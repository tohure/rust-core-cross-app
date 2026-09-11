package dev.tohure.android_rust_test.adapter

import dev.tohure.android_rust_test.contract.MessageSource
import org.junit.Assert.assertEquals
import org.junit.Test
import uniffi.core_financiero.DomainException

/** Fake: no toca assets, así que este test corre en la JVM sin emulador. */
private class FakeMessageSource(private val map: Map<String, String>) : MessageSource {
    override fun messages(): Map<String, String> = map
}

class ContractMessagesTest {
    private val source = FakeMessageSource(
        mapOf(
            "Longitud" to "El número ingresado no tiene la cantidad de dígitos correcta.",
            "DigitoControl" to "El número ingresado no es válido: no pasa el dígito de control.",
            "BancoDesconocido" to "No reconocemos el banco del código {code}.",
            "MontoInvalido" to "El monto ingresado no es válido.",
            "CuentaNoEncontrada" to "No encontramos la cuenta {id}.",
            "MismaCuenta" to "La cuenta de origen y la de destino son la misma.",
            "SaldoInsuficiente" to "Saldo insuficiente: tienes {available} y se necesitan {required}.",
            "Cifrado" to "No se pudo cifrar los datos de la tarjeta.",
            "FueraDeRango" to "El valor de {field} está fuera del rango permitido.",
        ),
    )
    private val messages = ContractMessages(source)

    @Test
    fun theNineVariantsMapToTheContractNames() {
        assertEquals("Longitud", DomainException.Length("cci", 20u, 18u).contractName())
        assertEquals("DigitoControl", DomainException.CheckDigit().contractName())
        assertEquals("BancoDesconocido", DomainException.UnknownBank("999").contractName())
        assertEquals("MontoInvalido", DomainException.InvalidAmount("cero").contractName())
        assertEquals("CuentaNoEncontrada", DomainException.AccountNotFound("A").contractName())
        assertEquals("MismaCuenta", DomainException.SameAccount().contractName())
        assertEquals(
            "SaldoInsuficiente",
            DomainException.InsufficientFunds("1.00", "2.00").contractName(),
        )
        assertEquals("Cifrado", DomainException.Encryption("nonce").contractName())
        assertEquals("FueraDeRango", DomainException.OutOfRange("monto").contractName())
    }

    @Test
    fun placeholdersAreInterpolatedRaw() {
        // CRUDO: nada de NumberFormat sobre los montos. Los formateadores de Android, iOS
        // y el navegador no coinciden, y una diferencia rompe la comparación carácter por
        // carácter que es toda la tesis de la POC.
        assertEquals(
            "Saldo insuficiente: tienes 1234.56 y se necesitan 2000.00.",
            messages.userMessage(DomainException.InsufficientFunds("1234.56", "2000.00")),
        )
        assertEquals(
            "No encontramos la cuenta ACC-9.",
            messages.userMessage(DomainException.AccountNotFound("ACC-9")),
        )
        assertEquals(
            "No reconocemos el banco del código 999.",
            messages.userMessage(DomainException.UnknownBank("999")),
        )
        assertEquals(
            "El valor de monto está fuera del rango permitido.",
            messages.userMessage(DomainException.OutOfRange("monto")),
        )
    }

    @Test
    fun aVariantWithoutPlaceholdersComesBackVerbatim() {
        assertEquals(
            "La cuenta de origen y la de destino son la misma.",
            messages.userMessage(DomainException.SameAccount()),
        )
    }
}
