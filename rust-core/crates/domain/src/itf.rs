use crate::arithmetic::{format_amount, parse_amount, round_amount};
use crate::error::DomainError;
use rust_decimal::Decimal;
use std::str::FromStr;

/// Alícuota del ITF. **Dato dummy de la POC.** Es constante nombrada y no un literal
/// suelto justamente para que cambiarla acá y ver moverse las cuatro apps sea parte
/// del guion de la demo.
pub const ITF_RATE: &str = "0.00005";

/// El ITF ya redondeado a 2 decimales. Lo usa `execute_transfer` para el total.
pub(crate) fn rounded_itf(amount: Decimal) -> Result<Decimal, DomainError> {
    let rate = Decimal::from_str(ITF_RATE).map_err(|_| DomainError::OutOfRange {
        field: "alicuota".into(),
    })?;
    let raw = amount.checked_mul(rate).ok_or(DomainError::OutOfRange {
        field: "itf".into(),
    })?;
    Ok(round_amount(raw))
}

pub fn calculate_itf(amount: &str) -> Result<String, DomainError> {
    let m = parse_amount(amount, "monto")?;
    Ok(format_amount(rounded_itf(m)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Los cuatro casos del grupo `itf` de contracts/cases.json.
    #[test]
    fn calculates_the_contract_cases() {
        assert_eq!(calculate_itf("1000.00").unwrap(), "0.05"); // itf-001
        assert_eq!(calculate_itf("3500.00").unwrap(), "0.18"); // itf-002
        assert_eq!(calculate_itf("150.00").unwrap(), "0.01"); // itf-003
        assert_eq!(calculate_itf("87654.32").unwrap(), "4.38"); // itf-004
    }

    #[test]
    fn rounds_half_away_from_zero_not_to_even() {
        // 3500.00 * 0.00005 = 0.175 exacto. Con banker's rounding daría 0.17 y el
        // contrato lo caza: por eso este caso existe.
        assert_eq!(calculate_itf("3500.00").unwrap(), "0.18");
    }

    #[test]
    fn invalid_text_errors_without_panicking() {
        assert_eq!(
            calculate_itf("no-soy-un-monto")
                .unwrap_err()
                .contract_name(),
            "MontoInvalido"
        );
    }
}
