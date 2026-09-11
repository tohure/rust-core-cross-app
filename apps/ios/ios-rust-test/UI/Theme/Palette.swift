import SwiftUI

/// Paleta naranja / azul / blanco, **fija**, compartida con las otras tres apps.
///
/// Cada app se ve nativa de su plataforma —Material 3 en Android, el lenguaje de Apple
/// aquí—, pero las cuatro comparten estos colores: es lo único visual que comparten, y sin
/// eso la comparación lado a lado de la demo pierde la mitad de su efecto.
enum Palette {
    static let brand = Color(red: 0.95, green: 0.45, blue: 0.13)  // naranja
    static let accent = Color(red: 0.10, green: 0.35, blue: 0.70)  // azul
    static let surface = Color(.systemBackground)
    static let onSurfaceMuted = Color.secondary

    /// La pantalla de Aritmética pinta el resultado del flotante en destructivo y el del
    /// core en correcto. No es decorativo: es el contraste que hace legible la demo.
    static let wrong = Color(red: 0.80, green: 0.15, blue: 0.15)
    static let right = Color(red: 0.10, green: 0.55, blue: 0.30)
}
