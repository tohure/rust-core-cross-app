use domain::{add, decrypt, encrypt, execute_transfer, subtract, validate_card, validate_cci};
use domain::{Account, TransferRequest};
use proptest::prelude::*;
use rust_decimal::Decimal;
use std::str::FromStr;

const CLAVE: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const NONCE: &str = "000102030405060708090a0b";

fn sum_balances(accounts: &[Account]) -> Decimal {
    accounts
        .iter()
        .filter_map(|c| Decimal::from_str(&c.balance).ok())
        .sum()
}

proptest! {
    /// Test de SEGURIDAD, no solo de robustez: estas funciones reciben texto
    /// arbitrario del usuario a través del FFI. Un pánico acá es un crash de la app.
    #[test]
    fn validate_cci_never_panics(input in ".*") {
        let _ = validate_cci(&input);
    }

    #[test]
    fn validate_card_never_panics(input in ".*") {
        let _ = validate_card(&input);
    }

    #[test]
    fn decrypt_never_panics(input in ".*", key in ".*", nonce in ".*") {
        let _ = decrypt(&input, &key, &nonce);
    }

    #[test]
    fn the_encryption_roundtrip_returns_the_original(text in ".{0,200}") {
        let ciphertext = encrypt(&text, CLAVE, NONCE).unwrap();
        prop_assert_eq!(decrypt(&ciphertext, CLAVE, NONCE).unwrap(), text);
    }

    /// No se crea ni se destruye dinero: la suma de saldos baja exactamente el ITF.
    #[test]
    fn a_transfer_conserves_money(cents in 1i64..400_000i64) {
        let amount = Decimal::new(cents, 2);
        let accounts = vec![
            Account { id: "00219100123456789047".into(), holder: "Ana".into(), balance: "5000.00".into() },
            Account { id: "01122000987654321065".into(), holder: "Luis".into(), balance: "1200.50".into() },
        ];
        let antes = sum_balances(&accounts);
        let request = TransferRequest {
            origin: "00219100123456789047".into(),
            destination: "01122000987654321065".into(),
            amount: format!("{amount:.2}"),
        };
        if let Ok(r) = execute_transfer(accounts, request) {
            let despues = sum_balances(&r.accounts);
            let fee = Decimal::from_str(&r.itf_fee).unwrap();
            prop_assert_eq!(despues, antes - fee);

            // Y ningún saldo queda negativo.
            for account in &r.accounts {
                prop_assert!(Decimal::from_str(&account.balance).unwrap() >= Decimal::ZERO);
            }
        }
    }
}

/// Decisión D5 de la spec de la Fase 1: el desbordamiento de `Decimal` (límite
/// ±7.9228162514264337593543950335 × 10²⁸, `Decimal::MAX`/`Decimal::MIN`) debe resultar
/// en `DomainError::OutOfRange`, nunca en un pánico. Es un test determinista y no un
/// proptest: el borde de `Decimal` es un punto fijo y conocido, no un rango a explorar,
/// así que generar "montos cerca del máximo" al azar no suma cobertura — corre el
/// riesgo de que una corrida particular no llegue a desbordar y la invariante quede sin
/// ejercitar esa vez. Sumar `Decimal::MAX` consigo mismo (y restar `Decimal::MAX` de
/// `Decimal::MIN`) desborda siempre, con certeza, así que es la forma más honesta de
/// probar este borde.
///
/// Verificado manualmente antes de escribir el test: `Decimal::MAX.checked_add(MAX)` y
/// `Decimal::MIN.checked_sub(MAX)` devuelven `None`, que es exactamente lo que `add` y
/// `subtract` traducen a `OutOfRange` en vez de dejar propagar un pánico de overflow.
#[test]
fn add_and_subtract_return_out_of_range_at_the_decimal_boundary() {
    let max = Decimal::MAX.to_string();
    let min = Decimal::MIN.to_string();

    let sum_error = add(&max, &max).unwrap_err();
    assert_eq!(sum_error.contract_name(), "FueraDeRango");

    let diff_error = subtract(&min, &max).unwrap_err();
    assert_eq!(diff_error.contract_name(), "FueraDeRango");
}
