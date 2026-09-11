package dev.tohure.android_rust_test.ui.arithmetic

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.theme.CoreGreen
import dev.tohure.android_rust_test.ui.theme.FloatRed

@Composable
fun ArithmeticScreen(vm: ArithmeticViewModel, modifier: Modifier = Modifier) {
    // collectAsStateWithLifecycle, NO collectAsState: el primero deja de colectar cuando
    // la pantalla no está visible.
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Aritmética", "El float rompe el dinero")
        Spacer(Modifier.height(16.dp))

        LabeledField("Operando A", state.operandA, vm::operandAChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Operando B", state.operandB, vm::operandBChanged)
        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(state.operation == Operation.ADD, { vm.operationChanged(Operation.ADD) })
            Text("Sumar")
            Spacer(Modifier.height(0.dp))
            RadioButton(state.operation == Operation.SUBTRACT, { vm.operationChanged(Operation.SUBTRACT) })
            Text("Restar")
        }

        Button(vm::compute, Modifier.fillMaxWidth()) { Text("Calcular") }
        Spacer(Modifier.height(16.dp))

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        ComparisonCard("Punto flotante nativo", state.nativeResult, FloatRed)
        Spacer(Modifier.height(8.dp))
        ComparisonCard("Core (Rust · Decimal)", state.coreResult, CoreGreen)
    }
}

@Composable
private fun ComparisonCard(label: String, value: String, accent: Color) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = accent)
            Spacer(Modifier.height(4.dp))
            Text(
                value.ifBlank { "—" },
                style = MaterialTheme.typography.headlineSmall,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}
