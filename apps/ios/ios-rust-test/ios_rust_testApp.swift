import SwiftUI

@main
struct IosRustTestApp: App {
    /// Se arma una vez. Si el contrato no está en el bundle, la app **dice por qué** en
    /// vez de arrancar a medias: sin `try!`, sin crash, y sin una pantalla vacía sin
    /// explicación.
    private let container: Result<AppContainer, Error> = Result { try AppContainer() }

    var body: some Scene {
        WindowGroup {
            switch container {
            case .success(let container):
                BancoApp(container: container)
            case .failure(let error):
                ContractErrorView(error: error)
            }
        }
    }
}

/// Lo que se ve si `contracts/*.json` no llegó al bundle: el error exacto, no una pantalla
/// en blanco. Es un fallo de build y se arregla en `BUILD.md`, no en runtime.
struct ContractErrorView: View {
    let error: Error

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(Palette.wrong)
            Text("No se pudo leer el contrato")
                .font(.headline)
            Text("\(error)")
                .font(.footnote.monospaced())
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.onSurfaceMuted)
        }
        .padding(24)
    }
}
