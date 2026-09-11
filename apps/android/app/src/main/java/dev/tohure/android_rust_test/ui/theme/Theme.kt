package dev.tohure.android_rust_test.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = BrandOrange,
    onPrimary = Color.White,
    secondary = BrandBlue,
    onSecondary = Color.White,
    background = SurfaceWhite,
    surface = SurfaceWhite,
    error = FloatRed,
)

private val DarkColors = darkColorScheme(
    primary = BrandOrangeDark,
    onPrimary = Color.White,
    secondary = BrandBlueLight,
    onSecondary = Color.White,
    background = SurfaceDark,
    surface = SurfaceDark,
    error = FloatRed,
)

/**
 * Material 3 como lenguaje —componentes, formas, superficies tonales, motion— con
 * **esquema fijo**.
 *
 * **`dynamicColor` está apagado a propósito, no por olvido.** El color dinámico de
 * Material You deriva el esquema del wallpaper del usuario y **reemplaza** esta paleta:
 * activarlo haría que el naranja y el azul no se vieran en la mayoría de los dispositivos,
 * y las cuatro apps de la demo dejarían de compartir lo único visual que comparten. Si
 * alguien lo "arregla", rompe la paridad que la POC existe para mostrar.
 */
@Composable
fun AndroidrusttestTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content,
    )
}
