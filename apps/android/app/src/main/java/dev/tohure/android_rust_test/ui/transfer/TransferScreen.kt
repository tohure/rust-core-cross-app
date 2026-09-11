package dev.tohure.android_rust_test.ui.transfer

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.format.MoneyFormatter
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider

@Composable
fun TransferScreen(vm: TransferViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        ScreenHeader("Transferencia", "Dos cuentas en memoria")
        Spacer(Modifier.height(16.dp))

        // Orden de campos fijado por docs/ui-spec.md: origen, destino, monto. No se altera.
        LabeledField("Origen", state.origin, vm::originChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Destino", state.destination, vm::destinationChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Monto", state.amount, vm::amountChanged, keyboardType = KeyboardType.Decimal)
        Spacer(Modifier.height(12.dp))

        Button(vm::transfer, Modifier.fillMaxWidth(), enabled = !state.isLoading) {
            if (state.isLoading) CircularProgressIndicator(Modifier.height(16.dp)) else Text("Transferir")
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        state.result?.let { r ->
            SectionDivider("Resultado")
            ResultRow("Comisión ITF", MoneyFormatter.format(r.itfFee))
            ResultRow("Total debitado", MoneyFormatter.format(r.totalDebited))
            ResultRow("Comprobante", r.receipt, mono = true)
        }

        SectionDivider("Saldos")
        state.accounts.forEach { account ->
            ResultRow("${account.id}  ${account.holder}", MoneyFormatter.format(account.balance))
        }
    }
}
