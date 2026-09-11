package dev.tohure.android_rust_test

import android.content.Context
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.adapter.UniffiCoreFinanciero
import dev.tohure.android_rust_test.contract.AssetContractSource
import dev.tohure.android_rust_test.contract.AssetMessageSource
import dev.tohure.android_rust_test.contract.ContractSource

/**
 * Cableado manual, sin librería de DI.
 *
 * Hilt trae KSP y tiempo de build; Koin trae resolución en runtime que falla tarde.
 * Ninguno de los dos es *más* desacoplado que esto: son más automáticos. Con cinco
 * pantallas y tres dependencias, explícito gana — se lee de arriba abajo y el compilador
 * lo verifica entero.
 */
class AppContainer(context: Context) {
    private val assets = context.applicationContext.assets

    val core: CoreFinanciero = UniffiCoreFinanciero()
    val contract: ContractSource = AssetContractSource(assets)
    val messages: ContractMessages = ContractMessages(AssetMessageSource(assets))
}
