use thiserror::Error;

/// El único tipo de error del núcleo. Se define aquí una sola vez; el crate `ffi`
/// lo expone a uniffi con un `From`, para que este crate no dependa de uniffi.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ErrorDominio {
    #[error("longitud inválida en {campo}: se esperaban {esperado} dígitos, llegaron {recibido}")]
    Longitud {
        campo: String,
        esperado: u32,
        recibido: u32,
    },

    #[error("dígito de control inválido")]
    DigitoControl,

    #[error("banco no reconocido: {codigo}")]
    BancoDesconocido { codigo: String },

    #[error("monto inválido: {detalle}")]
    MontoInvalido { detalle: String },

    #[error("cuenta no encontrada: {id}")]
    CuentaNoEncontrada { id: String },

    #[error("origen y destino son la misma cuenta")]
    MismaCuenta,

    #[error("saldo insuficiente: disponible {disponible}, requerido {requerido}")]
    SaldoInsuficiente {
        disponible: String,
        requerido: String,
    },

    #[error("error de cifrado: {detalle}")]
    Cifrado { detalle: String },

    #[error("parámetro fuera de rango: {campo}")]
    FueraDeRango { campo: String },
}

impl ErrorDominio {
    /// Nombre de la variante, para comparar contra el campo `error` de
    /// `contracts/cases.json`. El contrato identifica el error por nombre, no por mensaje.
    pub fn nombre(&self) -> &'static str {
        match self {
            Self::Longitud { .. } => "Longitud",
            Self::DigitoControl => "DigitoControl",
            Self::BancoDesconocido { .. } => "BancoDesconocido",
            Self::MontoInvalido { .. } => "MontoInvalido",
            Self::CuentaNoEncontrada { .. } => "CuentaNoEncontrada",
            Self::MismaCuenta => "MismaCuenta",
            Self::SaldoInsuficiente { .. } => "SaldoInsuficiente",
            Self::Cifrado { .. } => "Cifrado",
            Self::FueraDeRango { .. } => "FueraDeRango",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_nombre_coincide_con_el_del_contrato() {
        // Los strings del campo "error" de contracts/cases.json.
        assert_eq!(ErrorDominio::MismaCuenta.nombre(), "MismaCuenta");
        assert_eq!(ErrorDominio::DigitoControl.nombre(), "DigitoControl");
        assert_eq!(
            ErrorDominio::Longitud {
                campo: "cci".into(),
                esperado: 20,
                recibido: 18
            }
            .nombre(),
            "Longitud"
        );
        assert_eq!(
            ErrorDominio::CuentaNoEncontrada { id: "x".into() }.nombre(),
            "CuentaNoEncontrada"
        );
        assert_eq!(
            ErrorDominio::SaldoInsuficiente {
                disponible: "1.00".into(),
                requerido: "2.00".into()
            }
            .nombre(),
            "SaldoInsuficiente"
        );
        assert_eq!(
            ErrorDominio::MontoInvalido {
                detalle: "cero".into()
            }
            .nombre(),
            "MontoInvalido"
        );
    }
}
