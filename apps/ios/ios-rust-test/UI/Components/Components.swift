import SwiftUI

/// Cabecera de las cuatro pantallas: título y subtítulo.
struct ScreenHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.largeTitle.bold())
            Text(subtitle).font(.subheadline).foregroundStyle(Palette.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Campo de texto con su label a la izquierda.
struct LabeledField: View {
    let label: String
    @Binding var value: String
    var keyboard: UIKeyboardType = .default
    var monospaced: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Palette.onSurfaceMuted)
                .frame(width: 110, alignment: .leading)
            TextField("", text: $value)
                .keyboardType(keyboard)
                .textFieldStyle(.roundedBorder)
                .font(monospaced ? .body.monospaced() : .body)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
    }
}

/// Fila `etiqueta ......... valor` del bloque de resultado.
struct ResultRow: View {
    let label: String
    let value: String
    var monospaced: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Palette.onSurfaceMuted)
            Spacer(minLength: 8)
            Text(value)
                .font(monospaced ? .footnote.monospaced() : .body)
                .multilineTextAlignment(.trailing)
                .textSelection(.enabled)  // para copiar el hex y pegarlo en otra app
        }
    }
}

/// Los separadores `─── Resultado ───`.
struct SectionDivider: View {
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Text(title).font(.caption.bold()).foregroundStyle(Palette.onSurfaceMuted)
            VStack { Divider() }
        }
    }
}

/// El pie con `coreVersion()`, **visible en las cuatro pantallas**.
///
/// Muestra el string tal como lo devuelve el core, **sin reformatear**: lleva el SHA del
/// commit con el que se compiló el núcleo, y cuatro pantallas con el mismo string es la
/// prueba de que las cuatro apps corren el mismo build.
///
/// El `#available` de aquí es el único de toda la app: es la regla de contención de la spec.
struct CoreVersionFooter: View {
    let version: String

    var body: some View {
        Text("core \(version)")
            .font(.caption2.monospaced())
            .foregroundStyle(Palette.onSurfaceMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background {
                if #available(iOS 26, *) {
                    Color.clear.glassEffect()
                } else {
                    Palette.surface
                }
            }
    }
}
