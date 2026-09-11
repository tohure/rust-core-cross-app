import SwiftUI

struct TransferView: View {
    @State private var viewModel: TransferViewModel
    private let version: String

    init(container: AppContainer) {
        _viewModel = State(
            initialValue: TransferViewModel(
                core: container.core,
                contract: container.contract,
                messages: container.messages
            )
        )
        version = container.core.coreVersion()
    }

    var body: some View {
        ScreenScaffold(
            title: "Transferencia",
            subtitle: "Dos cuentas en memoria",
            version: version
        ) {
            accountPicker(
                label: "Origen",
                selection: Binding(
                    get: { viewModel.state.origin },
                    set: viewModel.originChanged
                )
            )
            accountPicker(
                label: "Destino",
                selection: Binding(
                    get: { viewModel.state.destination },
                    set: viewModel.destinationChanged
                )
            )
            LabeledField(
                label: "Monto",
                value: Binding(
                    get: { viewModel.state.amount },
                    set: viewModel.amountChanged
                ),
                keyboard: .decimalPad
            )

            Button {
                Task { await viewModel.transfer() }
            } label: {
                if viewModel.state.isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Transferir").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.brand)
            .disabled(viewModel.state.isLoading)

            if let error = viewModel.state.error {
                Text(error).font(.footnote).foregroundStyle(Palette.wrong)
            }

            if let result = viewModel.state.result {
                SectionDivider(title: "Resultado")
                ResultRow(label: "Comisión ITF", value: MoneyFormatter.format(result.itfFee))
                ResultRow(
                    label: "Total debitado",
                    value: MoneyFormatter.format(result.totalDebited)
                )
                ResultRow(label: "Comprobante", value: result.receipt, monospaced: true)
            }

            SectionDivider(title: "Saldos")
            ForEach(viewModel.state.accounts, id: \.id) { account in
                ResultRow(
                    label: "\(account.id)  \(account.holder)",
                    value: MoneyFormatter.format(account.balance)
                )
            }
        }
    }

    private func accountPicker(label: String, selection: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Palette.onSurfaceMuted)
                .frame(width: 110, alignment: .leading)
            Picker("", selection: selection) {
                ForEach(viewModel.state.accounts, id: \.id) { Text($0.id).tag($0.id) }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
