use thiserror::Error;

/// El único tipo de error del núcleo. Se define aquí una sola vez; el crate `ffi`
/// lo expone a uniffi con un `From`, para que este crate no dependa de uniffi.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum DomainError {
    #[error("longitud inválida en {field}: se esperaban {expected} dígitos, llegaron {received} caracteres")]
    Length {
        field: String,
        expected: u32,
        received: u32,
    },

    #[error("dígito de control inválido")]
    CheckDigit,

    #[error("banco no reconocido: {code}")]
    UnknownBank { code: String },

    #[error("monto inválido: {detail}")]
    InvalidAmount { detail: String },

    #[error("cuenta no encontrada: {id}")]
    AccountNotFound { id: String },

    #[error("origen y destino son la misma cuenta")]
    SameAccount,

    #[error("saldo insuficiente: disponible {available}, requerido {required}")]
    InsufficientFunds { available: String, required: String },

    #[error("error de cifrado: {detail}")]
    Encryption { detail: String },

    #[error("parámetro fuera de rango: {field}")]
    OutOfRange { field: String },
}

impl DomainError {
    /// Nombre que el contrato le da a este error. Devuelve el string en español de
    /// `contracts/cases.json` porque el contrato es un archivo de datos que las cinco
    /// plataformas comparan por igualdad exacta; este método es el único puente entre
    /// los identificadores en inglés y ese contrato.
    pub fn contract_name(&self) -> &'static str {
        match self {
            Self::Length { .. } => "Longitud",
            Self::CheckDigit => "DigitoControl",
            Self::UnknownBank { .. } => "BancoDesconocido",
            Self::InvalidAmount { .. } => "MontoInvalido",
            Self::AccountNotFound { .. } => "CuentaNoEncontrada",
            Self::SameAccount => "MismaCuenta",
            Self::InsufficientFunds { .. } => "SaldoInsuficiente",
            Self::Encryption { .. } => "Cifrado",
            Self::OutOfRange { .. } => "FueraDeRango",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_contract_name_matches_the_contract() {
        // Los strings del campo "error" de contracts/cases.json.
        assert_eq!(DomainError::SameAccount.contract_name(), "MismaCuenta");
        assert_eq!(DomainError::CheckDigit.contract_name(), "DigitoControl");
        assert_eq!(
            DomainError::Length {
                field: "cci".into(),
                expected: 20,
                received: 18
            }
            .contract_name(),
            "Longitud"
        );
        assert_eq!(
            DomainError::AccountNotFound { id: "x".into() }.contract_name(),
            "CuentaNoEncontrada"
        );
        assert_eq!(
            DomainError::InsufficientFunds {
                available: "1.00".into(),
                required: "2.00".into()
            }
            .contract_name(),
            "SaldoInsuficiente"
        );
        assert_eq!(
            DomainError::InvalidAmount {
                detail: "cero".into()
            }
            .contract_name(),
            "MontoInvalido"
        );
    }
}
