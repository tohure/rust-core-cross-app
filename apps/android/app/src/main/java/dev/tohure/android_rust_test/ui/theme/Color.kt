package dev.tohure.android_rust_test.ui.theme

import androidx.compose.ui.graphics.Color

// Paleta compartida por las cuatro apps: naranja, azul, blanco.
// Los valores son los mismos en Android, iOS, React Native y Angular; las variantes
// tonales las pone el sistema de cada plataforma.
val BrandOrange = Color(0xFFEA5B0C)
val BrandOrangeDark = Color(0xFFB33F00)
val BrandBlue = Color(0xFF0A3D62)
val BrandBlueLight = Color(0xFF2E6B96)
val SurfaceWhite = Color(0xFFFFFBF8)
val SurfaceDark = Color(0xFF14100E)

// Señalización de la pantalla de Aritmética: el resultado del float nativo va en el
// color de error y el del core en el de éxito. No es decoración — es el punto.
val FloatRed = Color(0xFFB3261E)
val CoreGreen = Color(0xFF1B6B3A)
