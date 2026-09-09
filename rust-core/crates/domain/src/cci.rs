use crate::error::DomainError;

/// Pesos del dígito de control, especificados en contracts/README.md.
const WEIGHTS: [u32; 18] = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/// Tabla de bancos. **Códigos dummy de la POC**, no corresponden a bancos reales.
const BANKS: [(&str, &str); 3] = [
    ("002", "Banco Demo Uno"),
    ("011", "Banco Demo Dos"),
    ("009", "Banco Demo Tres"),
];

const CCI_LENGTH: u32 = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidCci {
    pub bank_code: String,
    pub bank_name: String,
    pub branch: String,
    pub account: String,
}

/// Dígito de control: `(11 - (Σ dígito·peso) mod 11) mod 11`, y 0 si da mayor que 9.
fn check_digit(digits: &[u32], weights: &[u32]) -> u32 {
    let sum: u32 = digits.iter().zip(weights).map(|(d, p)| d * p).sum();
    let d = (11 - (sum % 11)) % 11;
    if d > 9 {
        0
    } else {
        d
    }
}

pub fn validate_cci(cci: &str) -> Result<ValidCci, DomainError> {
    let cci = cci.trim();
    // Se cuentan dígitos, no caracteres: si contáramos caracteres, una entrada de 20
    // caracteres con uno no numérico reportaría "llegaron 20", contradiciendo el
    // "se esperaban 20 dígitos" del mismo mensaje.
    let received = cci.chars().filter(|c| c.is_ascii_digit()).count() as u32;

    // Un solo error para "no son 20 dígitos", tenga letras o no.
    let digits: Vec<u32> = match cci
        .chars()
        .map(|c| c.to_digit(10))
        .collect::<Option<Vec<_>>>()
    {
        Some(d) if d.len() as u32 == CCI_LENGTH => d,
        _ => {
            return Err(DomainError::Length {
                field: "cci".into(),
                expected: CCI_LENGTH,
                received,
            })
        }
    };

    let d19 = check_digit(&digits[..18], &WEIGHTS);
    let weights_20: Vec<u32> = WEIGHTS.iter().copied().chain([2]).collect();
    let d20 = check_digit(&digits[..19], &weights_20);

    if d19 != digits[18] || d20 != digits[19] {
        return Err(DomainError::CheckDigit);
    }

    let bank_code = &cci[0..3];
    let bank_name = BANKS
        .iter()
        .find(|(code, _)| *code == bank_code)
        .map(|(_, contract_name)| *contract_name)
        .ok_or_else(|| DomainError::UnknownBank {
            code: bank_code.to_string(),
        })?;

    Ok(ValidCci {
        bank_code: bank_code.to_string(),
        bank_name: bank_name.to_string(),
        branch: cci[3..6].to_string(),
        account: cci[6..18].to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Los cuatro casos del grupo `cci` de contracts/cases.json.
    #[test]
    fn accepts_a_valid_cci() {
        let r = validate_cci("00219100123456789047").unwrap(); // cci-001
        assert_eq!(r.bank_code, "002");
        assert_eq!(r.bank_name, "Banco Demo Uno");
        assert_eq!(r.branch, "191");
        assert_eq!(r.account, "001234567890");
    }

    #[test]
    fn accepts_a_cci_from_another_bank() {
        let r = validate_cci("01122000987654321065").unwrap(); // cci-002
        assert_eq!(r.bank_code, "011");
        assert_eq!(r.bank_name, "Banco Demo Dos");
        assert_eq!(r.branch, "220");
        assert_eq!(r.account, "009876543210");
    }

    #[test]
    fn rejects_a_bad_check_digit() {
        // cci-003: mismo CCI que cci-001 con el ultimo digito cambiado.
        assert_eq!(
            validate_cci("00219100123456789048")
                .unwrap_err()
                .contract_name(),
            "DigitoControl"
        );
    }

    #[test]
    fn rejects_a_bad_length() {
        // cci-004: 18 digitos.
        assert_eq!(
            validate_cci("002191001234567890")
                .unwrap_err()
                .contract_name(),
            "Longitud"
        );
    }

    #[test]
    fn rejects_a_bank_outside_the_table() {
        // Todo ceros pasa el digito de control (la suma ponderada da 0) pero el banco
        // 000 no esta en la tabla. Es el destino de tr-004 y por eso la transferencia
        // NO valida CCI: el contrato exige ahi CuentaNoEncontrada, no BancoDesconocido.
        assert_eq!(
            validate_cci("00000000000000000000")
                .unwrap_err()
                .contract_name(),
            "BancoDesconocido"
        );
    }

    #[test]
    fn rejects_20_characters_with_a_non_digit() {
        // Borde del fix de `received`: 20 caracteres pero uno no es dígito. Antes del
        // fix, `received` contaba caracteres y el mensaje decía "llegaron 20" pese a
        // fallar por longitud, contradiciendo "se esperaban 20 dígitos". El contrato
        // compara por contract_name(), no por mensaje, así que esto sigue dando
        // "Longitud" igual que antes; lo que cambia es que el mensaje deja de mentir.
        assert_eq!(
            validate_cci("0021910012345678904x")
                .unwrap_err()
                .contract_name(),
            "Longitud"
        );
    }

    #[test]
    fn never_panics_with_arbitrary_text() {
        for input in [
            "",
            "abc",
            "ñ",
            "0021910012345678904x",
            "0".repeat(500).as_str(),
        ] {
            let _ = validate_cci(input); // solo debe no romper
        }
    }
}
