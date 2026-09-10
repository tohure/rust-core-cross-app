use domain::{add, decrypt, encrypt, execute_transfer, subtract, validate_card, validate_cci};
use domain::{Account, TransferRequest};
use proptest::prelude::*;
use rust_decimal::Decimal;
use std::str::FromStr;

const KEY: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const NONCE: &str = "000102030405060708090a0b";

/// `expect()` y no `filter_map(... .ok())`: esta suma es el lado izquierdo del invariante
/// de conservación del dinero, y un saldo que no parsee tiene que **romper el test**, no
/// desaparecer de la suma. Descartarlo en silencio haría que `after == before - fee` se
/// cumpla justamente cuando el core devolvió un saldo con formato roto. Es un test, así
/// que el `expect()` está permitido.
fn sum_balances(accounts: &[Account]) -> Decimal {
    accounts
        .iter()
        .map(|c| {
            Decimal::from_str(&c.balance)
                .unwrap_or_else(|e| panic!("saldo no parseable en {}: {:?} ({e})", c.id, c.balance))
        })
        .sum()
}

/// Escala del texto generado. Tres de cada cuatro veces sale bien escalado (0 a 2
/// decimales), que es la rama donde el invariante de conservación **debe** cumplirse; una
/// de cada cuatro sale con 3 a 5 decimales, la rama donde `execute_transfer` debe rechazar.
fn scale() -> impl Strategy<Value = u32> {
    prop_oneof![
        3 => Just(0u32),
        3 => Just(1u32),
        3 => Just(2u32),
        1 => Just(3u32),
        1 => Just(4u32),
        1 => Just(5u32),
    ]
}

/// Un monto o un saldo como texto, con escala variable.
///
/// El generador anterior (`cents in 1i64..400_000`, saldos fijos de dos decimales)
/// producía **solo** montos de exactamente 2 decimales contra saldos de 2 decimales: el
/// subespacio donde el invariante de conservación no puede fallar, porque ningún
/// redondeo de salida cambia nada. Es decir, el test pasaba por construcción. Con escala
/// variable el generador sí alcanza los valores mal escalados (`0.001`, `5000.005`) que
/// creaban centavos de la nada; el invariante sigue siendo cierto, ahora por la otra
/// rama: `execute_transfer` los rechaza con MontoInvalido y el `if let Ok` no entra.
///
/// `Decimal::new(mantisa, escala)` conserva la escala al imprimirse: `Decimal::new(1, 3)`
/// se imprime `"0.001"` y `Decimal::new(100, 2)` se imprime `"1.00"`. Nada de esto usa
/// punto flotante: la mantisa es `i64` y la escala `u32`.
fn scaled_text(mantissa: impl Strategy<Value = i64>) -> impl Strategy<Value = String> {
    (mantissa, scale()).prop_map(|(mantissa, scale)| Decimal::new(mantissa, scale).to_string())
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
        let ciphertext = encrypt(&text, KEY, NONCE).unwrap();
        prop_assert_eq!(decrypt(&ciphertext, KEY, NONCE).unwrap(), text);
    }

    /// No se crea ni se destruye dinero: la suma de saldos baja exactamente el ITF.
    ///
    /// El monto **y los dos saldos** se generan con escala variable (ver `scaled_text`),
    /// así que la corrida cubre las dos ramas: la transferencia se rechaza, o conserva
    /// el dinero. No hay una tercera.
    #[test]
    fn a_transfer_conserves_money(
        amount in scaled_text(1i64..400_000i64),
        origin_balance in scaled_text(0i64..1_000_000i64),
        destination_balance in scaled_text(0i64..1_000_000i64),
    ) {
        let accounts = vec![
            Account { id: "00219100123456789047".into(), holder: "Ana".into(), balance: origin_balance },
            Account { id: "01122000987654321065".into(), holder: "Luis".into(), balance: destination_balance },
        ];
        let before = sum_balances(&accounts);
        let request = TransferRequest {
            origin: "00219100123456789047".into(),
            destination: "01122000987654321065".into(),
            amount,
        };
        if let Ok(r) = execute_transfer(accounts, request) {
            let after = sum_balances(&r.accounts);
            let fee = Decimal::from_str(&r.itf_fee).unwrap();
            prop_assert_eq!(after, before - fee);

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
