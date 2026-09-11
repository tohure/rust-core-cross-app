#![forbid(unsafe_code)]

uniffi::setup_scaffolding!();

// ---------- error: se define en `domain` una sola vez y acá se le pone la piel de uniffi

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, uniffi::Error)]
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
    /// Espejo de `domain::DomainError::contract_name()`. Lo usa el test de contrato.
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

impl From<domain::DomainError> for DomainError {
    fn from(e: domain::DomainError) -> Self {
        use domain::DomainError as N;
        match e {
            N::Length {
                field,
                expected,
                received,
            } => Self::Length {
                field,
                expected,
                received,
            },
            N::CheckDigit => Self::CheckDigit,
            N::UnknownBank { code } => Self::UnknownBank { code },
            N::InvalidAmount { detail } => Self::InvalidAmount { detail },
            N::AccountNotFound { id } => Self::AccountNotFound { id },
            N::SameAccount => Self::SameAccount,
            N::InsufficientFunds {
                available,
                required,
            } => Self::InsufficientFunds {
                available,
                required,
            },
            N::Encryption { detail } => Self::Encryption { detail },
            N::OutOfRange { field } => Self::OutOfRange { field },
        }
    }
}

// ---------- records

#[derive(Debug, Clone, uniffi::Record)]
pub struct Account {
    pub id: String,
    pub holder: String,
    pub balance: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferRequest {
    pub origin: String,
    pub destination: String,
    pub amount: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferResult {
    pub accounts: Vec<Account>,
    pub itf_fee: String,
    pub total_debited: String,
    pub receipt: String,
    pub simulated_latency_ms: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ValidCci {
    pub bank_code: String,
    pub bank_name: String,
    pub branch: String,
    pub account: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ValidCard {
    pub brand: String,
    pub masked: String,
}

impl From<domain::Account> for Account {
    fn from(c: domain::Account) -> Self {
        Self {
            id: c.id,
            holder: c.holder,
            balance: c.balance,
        }
    }
}

impl From<Account> for domain::Account {
    fn from(c: Account) -> Self {
        Self {
            id: c.id,
            holder: c.holder,
            balance: c.balance,
        }
    }
}

// ---------- caso 1: aritmética decimal

#[uniffi::export]
pub fn add(a: String, b: String) -> Result<String, DomainError> {
    domain::add(&a, &b).map_err(Into::into)
}

#[uniffi::export]
pub fn subtract(a: String, b: String) -> Result<String, DomainError> {
    domain::subtract(&a, &b).map_err(Into::into)
}

// ---------- caso 2: transferencia

#[uniffi::export]
pub fn execute_transfer(
    accounts: Vec<Account>,
    request: TransferRequest,
) -> Result<TransferResult, DomainError> {
    let accounts: Vec<domain::Account> = accounts.into_iter().map(Into::into).collect();
    let request = domain::TransferRequest {
        origin: request.origin,
        destination: request.destination,
        amount: request.amount,
    };
    let r = domain::execute_transfer(accounts, request)?;
    Ok(TransferResult {
        accounts: r.accounts.into_iter().map(Into::into).collect(),
        itf_fee: r.itf_fee,
        total_debited: r.total_debited,
        receipt: r.receipt,
        simulated_latency_ms: r.simulated_latency_ms,
    })
}

#[uniffi::export]
pub fn validate_cci(cci: String) -> Result<ValidCci, DomainError> {
    let v = domain::validate_cci(&cci)?;
    Ok(ValidCci {
        bank_code: v.bank_code,
        bank_name: v.bank_name,
        branch: v.branch,
        account: v.account,
    })
}

#[uniffi::export]
pub fn calculate_itf(amount: String) -> Result<String, DomainError> {
    domain::calculate_itf(&amount).map_err(Into::into)
}

// ---------- caso 3: tarjeta y cifrado

#[uniffi::export]
pub fn validate_card(number: String) -> Result<ValidCard, DomainError> {
    let v = domain::validate_card(&number)?;
    Ok(ValidCard {
        brand: v.brand,
        masked: v.masked,
    })
}

#[uniffi::export]
pub fn encrypt(text: String, key_hex: String, nonce_hex: String) -> Result<String, DomainError> {
    domain::encrypt(&text, &key_hex, &nonce_hex).map_err(Into::into)
}

#[uniffi::export]
pub fn decrypt(
    ciphertext_hex: String,
    key_hex: String,
    nonce_hex: String,
) -> Result<String, DomainError> {
    domain::decrypt(&ciphertext_hex, &key_hex, &nonce_hex).map_err(Into::into)
}

// ---------- meta

/// Versión del crate + SHA corto de git. Cuatro strings idénticos en pantalla son la
/// prueba de que las cuatro apps corren exactamente el mismo build.
#[uniffi::export]
pub fn core_version() -> String {
    format!("{}+{}", env!("CARGO_PKG_VERSION"), env!("GIT_SHA"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// No alcanza con que haya un `+`: `1.0.0+sin-git` también lo tiene, y ese es
    /// justamente el string degradado que `build.rs` existe para evitar. Por eso se
    /// verifica que el sufijo tenga **forma de SHA corto**.
    ///
    /// Si este test falla diciendo `sin-git`, no está roto: te está avisando que el build
    /// corrió sin `git` disponible o fuera de un checkout, y que el binario resultante no
    /// lleva identificación de build — inservible para poner cuatro apps lado a lado.
    #[test]
    fn the_version_has_semver_and_sha() {
        let v = core_version();
        let (semver, sha) = match v.split_once('+') {
            Some(parts) => parts,
            None => panic!("core_version debe ser <semver>+<sha>, fue {v}"),
        };
        assert_eq!(semver, "1.0.0", "fue {v}");
        assert!(
            sha.len() >= 7 && sha.chars().all(|c| c.is_ascii_hexdigit()),
            "el sufijo debe tener forma de SHA corto (hexadecimal, 7+ caracteres), fue {v}"
        );
    }

    /// Las nueve variantes, no una muestra. Este test es lo que hace vivible la
    /// duplicación que la spec asume a conciencia (D2): como `domain` no declara uniffi,
    /// el enum de error vive dos veces, y dos copias que se separan en silencio serían
    /// peor que la dependencia que se evitó.
    ///
    /// El `match` exhaustivo del `From` ya obliga a cubrir toda variante nueva del
    /// dominio —eso lo garantiza el compilador—, pero no protege contra cambiar un
    /// *string*: renombrar `"Cifrado"` en `domain/src/error.rs` y olvidarlo acá compila y
    /// pasa todo lo demás. Y tres de estos nombres (`BancoDesconocido`, `Cifrado`,
    /// `FueraDeRango`) no aparecen en `contracts/cases.json`, así que el test de contrato tampoco
    /// los cubre: para esos tres, este test es la única guardia que existe.
    #[test]
    fn the_domain_error_translates_preserving_its_name() {
        let variants = [
            domain::DomainError::Length {
                field: "cci".into(),
                expected: 20,
                received: 18,
            },
            domain::DomainError::CheckDigit,
            domain::DomainError::UnknownBank { code: "999".into() },
            domain::DomainError::InvalidAmount {
                detail: "cero".into(),
            },
            domain::DomainError::AccountNotFound { id: "ACC-1".into() },
            domain::DomainError::SameAccount,
            domain::DomainError::InsufficientFunds {
                available: "1.00".into(),
                required: "2.00".into(),
            },
            domain::DomainError::Encryption {
                detail: "nonce inválido".into(),
            },
            domain::DomainError::OutOfRange {
                field: "monto".into(),
            },
        ];
        assert_eq!(
            variants.len(),
            9,
            "el dominio tiene nueve variantes: si acá hay menos, alguna quedó sin guardia"
        );

        for original in variants {
            let expected = original.contract_name();
            let translated: DomainError = original.clone().into();
            assert_eq!(
                translated.contract_name(),
                expected,
                "el nombre de contrato divergió entre domain y ffi para {original:?}"
            );
        }
    }

    #[test]
    fn the_public_api_responds() {
        assert_eq!(add("0.1".into(), "0.2".into()).unwrap(), "0.30");
        assert_eq!(calculate_itf("3500.00".into()).unwrap(), "0.18");
        assert_eq!(
            validate_card("4111111111111111".into()).unwrap().brand,
            "Visa"
        );
    }
}
