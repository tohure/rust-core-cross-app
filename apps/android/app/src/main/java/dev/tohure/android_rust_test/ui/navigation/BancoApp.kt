package dev.tohure.android_rust_test.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import dev.tohure.android_rust_test.AppContainer
import dev.tohure.android_rust_test.ui.components.CoreVersionFooter

/**
 * Cuatro pestañas, sin librería de navegación.
 *
 * No hay back stack, ni argumentos, ni deep links: Navigation 3 o Navigation Compose
 * serían una dependencia de la que no se usaría ninguna función. Un `sealed interface`
 * y un `when` alcanzan, y el `when` exhaustivo garantiza que agregar una pestaña obligue
 * a implementarla.
 */
sealed interface Tab {
    val label: String

    data object Arithmetic : Tab { override val label = "Aritmética" }
    data object Transfer : Tab { override val label = "Transferencia" }
    data object Card : Tab { override val label = "Tarjeta" }
    data object Benchmark : Tab { override val label = "Benchmark" }

    companion object {
        val all = listOf(Arithmetic, Transfer, Card, Benchmark)
    }
}

@Composable
fun BancoApp(container: AppContainer) {
    var current: Tab by remember { mutableStateOf(Tab.Arithmetic) }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            Column {
                // El pie va en LAS CUATRO pantallas, no en un "Acerca de": en la demo se
                // comparan los cuatro strings lado a lado.
                CoreVersionFooter(container.core.coreVersion())
                NavigationBar {
                    Tab.all.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab,
                            onClick = { current = tab },
                            icon = {},
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            when (current) {
                Tab.Arithmetic -> Text("Aritmética")   // Task 9
                Tab.Transfer -> Text("Transferencia")  // Task 10
                Tab.Card -> Text("Tarjeta")            // Task 11
                Tab.Benchmark -> Text("Benchmark")     // Task 12
            }
        }
    }
}
