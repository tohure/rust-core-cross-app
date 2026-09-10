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

/// Parsea un monto que además debe **entrar** con la escala del contrato: 2 decimales
/// como máximo.
///
/// Vive acá, junto a `parse_amount` y `SCALE`, y no duplicada en `transfer.rs`: la
/// transferencia la necesita en tres lugares (el monto y los dos saldos) y la misma
/// condición escrita tres veces es la que después se corrige en dos.
///
/// `add`/`subtract` **no** pasan por esta puerta a propósito: el contrato les acepta
/// escala libre en la entrada (`"0.1"` es un caso válido, `ar-001`) porque su salida
/// redondeada no alimenta ningún saldo. La transferencia sí: un monto o un saldo con más
/// de 2 decimales se redondea al formatear la salida y mueve la suma total de saldos,
/// con lo que el invariante "no se crea ni se destruye dinero" deja de valer. Ver la
/// sección Transferencia de contracts/README.md.
pub(crate) fn parse_scaled_amount(value: &str, field: &str) -> Result<Decimal, DomainError> {
    let amount = parse_amount(value, field)?;
    let scale = amount.scale();
    if scale > SCALE {
        return Err(DomainError::InvalidAmount {
            detail: format!(
                "{field}: se aceptan {SCALE} decimales como máximo, llegaron {scale} en `{}`",
                value.trim()
            ),
        });
    }
    Ok(amount)
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

    fn dec(value: &str) -> Decimal {
        Decimal::from_str(value).expect("literal de test bien formado")
    }

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
    fn the_scaled_gate_accepts_up_to_two_decimals_and_rejects_more() {
        assert_eq!(
            parse_scaled_amount("100.55", "monto").unwrap(),
            dec("100.55")
        );
        assert_eq!(parse_scaled_amount("100.5", "monto").unwrap(), dec("100.5"));
        assert_eq!(parse_scaled_amount("100", "monto").unwrap(), dec("100"));

        let e = parse_scaled_amount("0.001", "monto").unwrap_err();
        assert_eq!(e.contract_name(), "MontoInvalido");
        assert!(e.to_string().contains("monto"), "{e}");
    }

    /// `add`/`subtract` conservan la escala libre en la entrada: `ar-001` es `"0.1"`, y
    /// nada de esto los toca.
    #[test]
    fn the_scaled_gate_does_not_apply_to_arithmetic() {
        assert_eq!(add("0.001", "0.001").unwrap(), "0.00");
        assert_eq!(add("0.005", "0.005").unwrap(), "0.01");
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
