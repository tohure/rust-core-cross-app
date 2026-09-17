package dev.tohure.android_rust_test

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import dev.tohure.android_rust_test.ui.arithmetic.ArithmeticViewModel
import dev.tohure.android_rust_test.ui.benchmark.BenchmarkViewModel
import dev.tohure.android_rust_test.ui.card.CardViewModel
import dev.tohure.android_rust_test.ui.transfer.TransferViewModel

/**
 * El cableado manual de [AppContainer], ahora también para `viewModel()`.
 *
 * Con `remember` los cuatro ViewModels morían en cada rotación. `viewModel()` los ata al
 * `ViewModelStore` de la Activity, que sobrevive al cambio de configuración — pero exige una
 * factory, porque los cuatro tienen dependencias en el constructor.
 *
 * Sin librería de DI, por lo mismo que [AppContainer]: con cuatro ViewModels, un `when`
 * explícito se lee de arriba abajo y lo verifica el compilador.
 */
class AppViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        when (modelClass) {
            ArithmeticViewModel::class.java ->
                ArithmeticViewModel(container.core, container.messages)
            TransferViewModel::class.java ->
                TransferViewModel(container.core, container.contract, container.messages)
            CardViewModel::class.java ->
                CardViewModel(container.core, container.contract, container.messages)
            BenchmarkViewModel::class.java ->
                BenchmarkViewModel(core = container.core, messages = container.messages)
            else -> error("ViewModel no registrado en AppViewModelFactory: ${modelClass.name}")
        } as T
}
