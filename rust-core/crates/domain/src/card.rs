use crate::error::DomainError;

const MIN_LENGTH: usize = 13;
const MAX_LENGTH: usize = 19;
/// Solo se usa para poblar el campo `expected` del error; el rango real es 13-19.
const TYPICAL_LENGTH: u32 = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidCard {
    pub brand: String,
    pub masked: String,
}

fn luhn(digits: &[u32]) -> bool {
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| {
            if i % 2 == 1 {
                let double = d * 2;
                if double > 9 {
                    double - 9
                } else {
                    double
                }
            } else {
                d
            }
        })
        .sum();
    sum.is_multiple_of(10)
}

/// Marca por prefijo, según contracts/README.md.
fn brand(number: &str) -> Option<&'static str> {
    if number.starts_with('4') {
        return Some("Visa");
    }
    let two: u32 = number.get(..2)?.parse().ok()?;
    if (51..=55).contains(&two) {
        return Some("Mastercard");
    }
    if two == 34 || two == 37 {
        return Some("Amex");
    }
    let four: u32 = number.get(..4)?.parse().ok()?;
    if (2221..=2720).contains(&four) {
        return Some("Mastercard");
    }
    None
}

pub fn validate_card(number: &str) -> Result<ValidCard, DomainError> {
    let number = number.trim();
    let received = number.chars().count() as u32;

    let digits: Vec<u32> = match number
        .chars()
        .map(|c| c.to_digit(10))
        .collect::<Option<Vec<_>>>()
    {
        Some(d) if (MIN_LENGTH..=MAX_LENGTH).contains(&d.len()) => d,
        _ => {
            return Err(DomainError::Length {
                field: "tarjeta".into(),
                expected: TYPICAL_LENGTH,
                received,
            })
        }
    };

    if !luhn(&digits) {
        return Err(DomainError::CheckDigit);
    }

    // Ningún caso del contrato pasa Luhn con un prefijo desconocido. Si llegara uno,
    // el core dice "no sé" en vez de inventar una marca.
    let brand = brand(number).ok_or_else(|| DomainError::OutOfRange {
        field: "marca".into(),
    })?;

    let length = number.len();
    Ok(ValidCard {
        brand: brand.to_string(),
        masked: format!("{} **** **** {}", &number[..4], &number[length - 4..]),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Los seis casos del grupo `tarjeta` de contracts/cases.json.
    #[test]
    fn accepts_visa() {
        let r = validate_card("4111111111111111").unwrap(); // tj-001
        assert_eq!(r.brand, "Visa");
        assert_eq!(r.masked, "4111 **** **** 1111");
    }

    #[test]
    fn accepts_mastercard() {
        let r = validate_card("5555555555554444").unwrap(); // tj-002
        assert_eq!(r.brand, "Mastercard");
        assert_eq!(r.masked, "5555 **** **** 4444");
    }

    #[test]
    fn accepts_a_fifteen_digit_amex() {
        let r = validate_card("378282246310005").unwrap(); // tj-003
        assert_eq!(r.brand, "Amex");
        assert_eq!(r.masked, "3782 **** **** 0005");
    }

    #[test]
    fn rejects_an_invalid_luhn() {
        assert_eq!(
            validate_card("4111111111111112")
                .unwrap_err()
                .contract_name(),
            "DigitoControl"
        ); // tj-004
        assert_eq!(
            validate_card("1234567890123456")
                .unwrap_err()
                .contract_name(),
            "DigitoControl"
        ); // tj-005
    }

    #[test]
    fn rejects_a_bad_length() {
        assert_eq!(
            validate_card("41111").unwrap_err().contract_name(),
            "Longitud"
        ); // tj-006
    }

    /// La rama `OutOfRange { field: "marca" }` no la ejercita ningún caso del contrato:
    /// los seis casos de `tarjeta` son Visa, Mastercard, Amex o fallan antes, en Luhn o
    /// en la longitud. Sin este test, la única rama del core que dice "no sé qué marca
    /// es" nunca se ejecuta, y podría estar rota sin que nada lo note.
    ///
    /// `6011111111111117` es un número Discover-like construido a propósito: la suma de
    /// Luhn da 30, así que **pasa** el dígito de control, y su prefijo no matchea nada de
    /// `brand()` — no empieza con 4, `60` no está en 51..=55 ni es 34/37, y `6011` no
    /// está en 2221..=2720. Es la única forma de llegar a la tercera rama de
    /// `validate_card`.
    #[test]
    fn rejects_a_valid_luhn_with_an_unknown_brand() {
        let e = validate_card("6011111111111117").unwrap_err();
        assert_eq!(e.contract_name(), "FueraDeRango");
        assert_eq!(
            e,
            DomainError::OutOfRange {
                field: "marca".into()
            },
            "el campo debe nombrar la marca: es lo que la UI necesita para explicar el fallo"
        );
    }

    #[test]
    fn never_panics_with_arbitrary_text() {
        for input in ["", "abcd", "ñññññññññññññ", "4111-1111-1111-1111"] {
            let _ = validate_card(input);
        }
    }
}
