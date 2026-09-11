package dev.tohure.android_rust_test.ui.card

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider
import dev.tohure.android_rust_test.ui.theme.CoreGreen

@Composable
fun CardScreen(vm: CardViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        ScreenHeader("Tarjeta", "Luhn y cifrado ChaCha20-Poly1305")
        Spacer(Modifier.height(16.dp))

        LabeledField("Número", state.number, vm::numberChanged, keyboardType = KeyboardType.Number)
        Spacer(Modifier.height(4.dp))
        // Sin esto la pantalla no dice qué espera: el campo acepta cualquier dígito pero el
        // core exige un número que pase Luhn, y quien hace la demo tiene que adivinarlo
        // frente a la audiencia. Texto normativo, igual en las cuatro apps: ver docs/ui-spec.md.
        Text(
            "Probá 4111111111111111 (Visa) o 5555555555554444 (Mastercard).\n" +
                "Un número inválido lo rechaza el core, no esta pantalla.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        Button(vm::validateAndEncrypt, Modifier.fillMaxWidth()) { Text("Validar y cifrar") }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        if (state.cipherHex.isNotEmpty()) {
            SectionDivider("Resultado")
            ResultRow("Marca", state.brand)
            ResultRow("Enmascarado", state.masked, mono = true)

            Text("Cifrado (hex)", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Card(Modifier.fillMaxWidth()) {
                // Monoespaciado y con corte de línea: en la demo se compara a simple vista
                // contra las otras tres pantallas.
                Text(
                    state.cipherHex,
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }

            Spacer(Modifier.height(8.dp))
            // La vuelta completa. Sin esta fila el hex de arriba es indistinguible de un hash:
            // esto es lo que muestra que el core CIFRA y no resume.
            ResultRow("Descifrado", state.roundTrip, mono = true)
            Text(
                "El mismo número salió de vuelta: es cifrado reversible, no un hash.",
                style = MaterialTheme.typography.bodySmall,
                color = CoreGreen,
            )
        }

        // ── Descifrar un hex ajeno ────────────────────────────────────────────
        SectionDivider("Descifrar un hex de otra plataforma")
        Text(
            "Pegá acá el hex que produjo la app de iOS, React Native o Angular. Sale el mismo " +
                "número, porque las cuatro usan el mismo core.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        LabeledField("Hex cifrado", state.foreignHex, vm::foreignHexChanged)
        Spacer(Modifier.height(12.dp))
        Button(vm::decryptForeign, Modifier.fillMaxWidth()) { Text("Descifrar") }

        state.foreignError?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        if (state.foreignPlain.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            ResultRow("Número recuperado", state.foreignPlain, mono = true)
        }
    }
}
