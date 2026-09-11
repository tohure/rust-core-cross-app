package dev.tohure.android_rust_test.ui.card

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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

@Composable
fun CardScreen(vm: CardViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Tarjeta", "Luhn y cifrado ChaCha20-Poly1305")
        Spacer(Modifier.height(16.dp))

        LabeledField("Número", state.number, vm::numberChanged, keyboardType = KeyboardType.Number)
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
        }
    }
}
