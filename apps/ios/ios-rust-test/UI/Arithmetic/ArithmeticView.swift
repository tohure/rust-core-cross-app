import SwiftUI

struct ArithmeticView: View {
    @State private var viewModel: ArithmeticViewModel
    private let version: String

    init(container: AppContainer) {
        _viewModel = State(
            initialValue: ArithmeticViewModel(core: container.core, messages: container.messages)
        )
        version = container.core.coreVersion()
    }

    var body: some View {
        ScreenScaffold(
            title: "Aritmética",
            subtitle: "El float rompe el dinero",
            version: version
        ) {
            LabeledField(
                label: "Operando A",
                value: Binding(
                    get: { viewModel.state.operandA },
                    set: viewModel.operandAChanged
                ),
                keyboard: .decimalPad
            )
            LabeledField(
                label: "Operando B",
                value: Binding(
                    get: { viewModel.state.operandB },
                    set: viewModel.operandBChanged
                ),
                keyboard: .decimalPad
            )

            Picker(
                "",
                selection: Binding(
                    get: { viewModel.state.operation },
                    set: viewModel.operationChanged
                )
            ) {
                ForEach(Operation.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)

            Button("Calcular") { viewModel.calculate() }
                .buttonStyle(.borderedProminent)
                .tint(Palette.brand)
                .frame(maxWidth: .infinity)

            if let error = viewModel.state.error {
                Text(error).font(.footnote).foregroundStyle(Palette.wrong)
            }

            if !viewModel.state.coreResult.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    resultCard(
                        title: "Punto flotante nativo",
                        value: viewModel.state.nativeResult,
                        color: Palette.wrong
                    )
                    resultCard(
                        title: "Core (Rust · Decimal)",
                        value: viewModel.state.coreResult,
                        color: Palette.right
                    )
                }
            }
        }
    }

    private func resultCard(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(color)
            Text(value).font(.title3.monospaced())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
    }
}
