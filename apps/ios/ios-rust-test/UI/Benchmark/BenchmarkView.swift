import SwiftUI

struct BenchmarkView: View {
    @State private var viewModel: BenchmarkViewModel
    private let version: String

    init(container: AppContainer) {
        _viewModel = State(initialValue: BenchmarkViewModel(core: container.core))
        version = container.core.coreVersion()
    }

    var body: some View {
        ScreenScaffold(
            title: "Benchmark",
            subtitle: "Core vs. implementación nativa",
            version: version
        ) {
            LabeledField(
                label: "Iteraciones",
                value: Binding(
                    get: { viewModel.state.iterations },
                    set: viewModel.iterationsChanged
                ),
                keyboard: .numberPad
            )

            Button {
                Task { await viewModel.run() }
            } label: {
                if viewModel.state.isRunning {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Ejecutar").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.brand)
            .disabled(viewModel.state.isRunning)

            // Los nombres de las dos implementaciones son LOS MISMOS que usa la pantalla de
            // Aritmética: quien mira la demo tiene que ver dos conceptos, no cuatro.
            // Labels normativos, iguales en las cuatro apps: ver docs/ui-spec.md.
            SectionDivider(title: "Core (Rust · Decimal)")
            ResultRow(label: "Tiempo típico (p50)", value: viewModel.state.coreP50)
            ResultRow(label: "Peor caso (p95)", value: viewModel.state.coreP95)

            SectionDivider(title: "Punto flotante nativo")
            ResultRow(label: "Tiempo típico (p50)", value: viewModel.state.nativeP50)
            ResultRow(label: "Peor caso (p95)", value: viewModel.state.nativeP95)

            // Sin esta frase, un número más grande parece un defecto en vez del argumento
            // que es.
            Text("El core es más lento porque cada llamada cruza la frontera al código Rust.")
                .font(.caption)
                .foregroundStyle(Palette.onSurfaceMuted)
            Text(
                "⚠ El punto flotante nativo es más rápido y da mal el resultado: existe para "
                    + "exhibirlo."
            )
            .font(.caption)
            .foregroundStyle(Palette.wrong)
        }
    }
}
