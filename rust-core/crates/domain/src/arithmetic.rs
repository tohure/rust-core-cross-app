use crate::error::DomainError;
use rust_decimal::{Decimal, RoundingStrategy};
use std::str::FromStr;

/// Escala de salida de todo monto: 2 decimales (PEN).
pub const SCALE: u32 = 2;

/// Parsea un monto que llegó como texto. Nunca entra en pánico: el texto viene del usuario.
pub(crate) fn parse_amount(value: &str, field: &str) -> Result<Decimal, DomainError> {
    Decimal::from_str(value.trim()).map_err(|e| DomainError::InvalidAmount {
        detail: format!("{field}: {e}"),
    })
}

/// Redondeo normativo del contrato: 2 decimales, medio hacia afuera del cero.
pub(crate) fn round_amount(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(SCALE, RoundingStrategy::MidpointAwayFromZero)
}

/// Todo monto sale con exactamente 2 decimales. El símbolo y los separadores los pone la UI.
pub(crate) fn format_amount(value: Decimal) -> String {
    format!("{:.*}", SCALE as usize, round_amount(value))
}

pub fn add(a: &str, b: &str) -> Result<String, DomainError> {
    let x = parse_amount(a, "a")?;
    let y = parse_amount(b, "b")?;
    let r = x.checked_add(y).ok_or(DomainError::OutOfRange {
        field: "suma".into(),
    })?;
    Ok(format_amount(r))
}

pub fn subtract(a: &str, b: &str) -> Result<String, DomainError> {
    let x = parse_amount(a, "a")?;
    let y = parse_amount(b, "b")?;
    let r = x.checked_sub(y).ok_or(DomainError::OutOfRange {
        field: "resta".into(),
    })?;
    Ok(format_amount(r))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Los seis casos del grupo `aritmetica` de contracts/cases.json.
    // Los seis divergen bajo IEEE-754; ese es el punto de la pantalla.
    #[test]
    fn adds_the_contract_cases() {
        assert_eq!(add("0.1", "0.2").unwrap(), "0.30"); // ar-001
        assert_eq!(add("0.7", "0.1").unwrap(), "0.80"); // ar-002
        assert_eq!(add("1000000.10", "0.20").unwrap(), "1000000.30"); // ar-003
    }

    #[test]
    fn subtracts_the_contract_cases() {
        assert_eq!(subtract("1.00", "0.90").unwrap(), "0.10"); // ar-004
        assert_eq!(subtract("100.00", "99.99").unwrap(), "0.01"); // ar-005
        assert_eq!(subtract("82.35", "12.34").unwrap(), "70.01"); // ar-006
    }

    #[test]
    fn the_output_always_has_two_decimals() {
        assert_eq!(add("1", "1").unwrap(), "2.00");
        assert_eq!(add("0", "0").unwrap(), "0.00");
    }

    #[test]
    fn non_amount_text_errors_without_panicking() {
        assert_eq!(
            add("hola", "1").unwrap_err().contract_name(),
            "MontoInvalido"
        );
        assert_eq!(
            subtract("1", "").unwrap_err().contract_name(),
            "MontoInvalido"
        );
    }
}
