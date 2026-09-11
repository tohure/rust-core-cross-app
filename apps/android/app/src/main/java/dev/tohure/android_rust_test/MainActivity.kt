package dev.tohure.android_rust_test

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dev.tohure.android_rust_test.ui.navigation.BancoApp
import dev.tohure.android_rust_test.ui.theme.AndroidrusttestTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = AppContainer(this)
        setContent {
            AndroidrusttestTheme {
                BancoApp(container)
            }
        }
    }
}
