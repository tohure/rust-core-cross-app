package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider

@Composable
fun BenchmarkScreen(vm: BenchmarkViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Benchmark", "Core vs. implementación nativa")
        Spacer(Modifier.height(16.dp))

        LabeledField("Iteraciones", state.iterations, vm::iterationsChanged, keyboardType = KeyboardType.Number)
        Spacer(Modifier.height(12.dp))
        Button(vm::run, Modifier.fillMaxWidth(), enabled = !state.isRunning) { Text("Ejecutar") }

        SectionDivider("Resultado")
        ResultRow("Core · p50", state.coreP50, mono = true)
        ResultRow("Core · p95", state.coreP95, mono = true)
        ResultRow("Nativa · p50", state.nativeP50, mono = true)
        ResultRow("Nativa · p95", state.nativeP95, mono = true)

        Spacer(Modifier.height(16.dp))
        Text(
            "⚠ La baseline nativa diverge en centavos: existe para exhibirlo.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}
