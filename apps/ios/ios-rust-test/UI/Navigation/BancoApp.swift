import SwiftUI

/// La navegación de la app y el pie de `coreVersion()` **visible en todas las pestañas**.
///
/// Las Tasks 11 y 12 agregaron Transferencia y Tarjeta; Benchmark la agrega la Task 13,
/// cuando su pantalla existe. Preferible a un `TabView` de cuatro con placeholders: una
/// pestaña sin contenido real sería código muerto.
///
/// Sin librería de navegación: no hay back stack, ni argumentos, ni deep links. Una
/// enumeración y un `TabView` alcanzan.
///
/// **`.tabItem`, no el `Tab(_:systemImage:content:)` de resultBuilder.** Ese inicializador
/// es de iOS 18+; el deployment target de esta app es 17.0 y no se negocia (ver
/// `CLAUDE.md`). `.tabItem` es la forma disponible desde iOS 13 y no necesita
/// `#available` — que de todas formas tendría que vivir en `UI/Components/`, no aquí.
struct BancoApp: View {
    let container: AppContainer

    var body: some View {
        TabView {
            ArithmeticView(container: container)
                .tabItem {
                    Label("Aritmética", systemImage: "plusminus")
                }
            TransferView(container: container)
                .tabItem {
                    Label("Transferencia", systemImage: "arrow.left.arrow.right")
                }
            CardView(container: container)
                .tabItem {
                    Label("Tarjeta", systemImage: "creditcard")
                }
        }
        .tint(Palette.brand)
    }
}

/// La disposición común de las cuatro pantallas: cabecera, contenido, y el pie SIEMPRE.
///
/// El pie va aquí y no en una pantalla "Acerca de" porque es la prueba en pantalla de que
/// las cuatro apps corren el mismo build: tiene que estar a la vista durante la demo.
struct ScreenScaffold<Content: View>: View {
    let title: String
    let subtitle: String
    let version: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ScreenHeader(title: title, subtitle: subtitle)
                    content()
                }
                .padding(20)
            }
            CoreVersionFooter(version: version)
        }
        .background(Palette.surface)
    }
}
