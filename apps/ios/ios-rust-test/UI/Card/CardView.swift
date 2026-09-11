import SwiftUI

struct CardView: View {
    @State private var viewModel: CardViewModel
    private let version: String

    init(container: AppContainer) {
        _viewModel = State(
            initialValue: CardViewModel(
                core: container.core,
                contract: container.contract,
                messages: container.messages
            )
        )
        version = container.core.coreVersion()
    }

    var body: some View {
        ScreenScaffold(
            title: "Tarjeta",
            subtitle: "Luhn y cifrado ChaCha20-Poly1305",
            version: version
        ) {
            LabeledField(
                label: "Número",
                value: Binding(
                    get: { viewModel.state.number },
                    set: viewModel.numberChanged
                ),
                keyboard: .numberPad,
                monospaced: true
            )

            // Sin esto la pantalla no dice qué espera: el campo acepta cualquier dígito pero
            // el core exige un número que pase Luhn, y quien hace la demo tiene que
            // adivinarlo frente a la audiencia. Texto normativo, igual en las cuatro apps:
            // ver docs/ui-spec.md.
            Text(
                """
                Puedes probar 4111111111111111 (Visa) o 5555555555554444 (Mastercard).
                Un número inválido lo rechaza el core, no esta pantalla.
                """
            )
            .font(.caption)
            .foregroundStyle(Palette.onSurfaceMuted)
            .frame(maxWidth: .infinity, alignment: .leading)

            Button("Validar y cifrar") { viewModel.validateAndEncrypt() }
                .buttonStyle(.borderedProminent)
                .tint(Palette.brand)
                .frame(maxWidth: .infinity)

            if let error = viewModel.state.encryptError {
                Text(error).font(.footnote).foregroundStyle(Palette.wrong)
            }

            if !viewModel.state.cipherHex.isEmpty {
                SectionDivider(title: "Resultado")
                ResultRow(label: "Marca", value: viewModel.state.brand)
                ResultRow(label: "Enmascarado", value: viewModel.state.masked, monospaced: true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Cifrado (hex)")
                        .font(.subheadline)
                        .foregroundStyle(Palette.onSurfaceMuted)
                    Text(viewModel.state.cipherHex)
                        .font(.footnote.monospaced())
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(
                            Palette.accent.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 8)
                        )
                }
                ResultRow(label: "Descifrado", value: viewModel.state.decrypted, monospaced: true)
                Text("El mismo número salió de vuelta: es cifrado reversible, no un hash.")
                    .font(.caption)
                    .foregroundStyle(Palette.onSurfaceMuted)
            }

            SectionDivider(title: "Descifrar un hex de otra plataforma")
            Text("Pega aquí el hex que produjo la app de iOS, React Native o Angular…")
                .font(.caption)
                .foregroundStyle(Palette.onSurfaceMuted)
            LabeledField(
                label: "Hex cifrado",
                value: Binding(
                    get: { viewModel.state.pastedHex },
                    set: viewModel.pastedHexChanged
                ),
                monospaced: true
            )
            Button("Descifrar") { viewModel.decryptPasted() }
                .buttonStyle(.bordered)
                .tint(Palette.accent)
                .frame(maxWidth: .infinity)

            if let error = viewModel.state.decryptError {
                Text(error).font(.footnote).foregroundStyle(Palette.wrong)
            }
            if !viewModel.state.recovered.isEmpty {
                ResultRow(
                    label: "Número recuperado",
                    value: viewModel.state.recovered,
                    monospaced: true
                )
            }
        }
    }
}
