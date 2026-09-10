use crate::arithmetic::{format_amount, parse_scaled_amount, round_amount};
use crate::error::DomainError;
use crate::itf::rounded_itf;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: String,
    pub holder: String,
    pub balance: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferRequest {
    pub origin: String,
    pub destination: String,
    pub amount: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferResult {
    /// El estado NUEVO, ya aplicado. La app guarda esto en memoria y lo tira al cerrar.
    pub accounts: Vec<Account>,
    pub itf_fee: String,
    pub total_debited: String,
    pub receipt: String,
    /// La app espera estos ms antes de pintar, para que la demo "parezca" HTTP.
    /// No hay ningún cliente HTTP en ninguna parte.
    pub simulated_latency_ms: u32,
}

fn last4(id: &str) -> String {
    let chars: Vec<char> = id.chars().collect();
    let start = chars.len().saturating_sub(4);
    chars[start..].iter().collect()
}

/// Determinista a propósito: si dependiera del reloj, las cuatro apps mostrarían
/// comprobantes distintos lado a lado. Ver contracts/README.md.
fn receipt(origin: &str, destination: &str, amount: Decimal) -> Result<String, DomainError> {
    let cents = round_amount(amount)
        .checked_mul(Decimal::from(100))
        .and_then(|c| c.trunc().to_i64())
        .ok_or(DomainError::OutOfRange {
            field: "comprobante".into(),
        })?;
    Ok(format!(
        "TRF-{}-{}-{}",
        last4(origin),
        last4(destination),
        cents
    ))
}

/// `250 + min(parte entera del amount, 500)`, topeada en 750 ms.
fn simulated_latency(amount: Decimal) -> u32 {
    let whole = amount.trunc().to_u32().unwrap_or(500);
    250 + whole.min(500)
}

pub fn execute_transfer(
    accounts: Vec<Account>,
    request: TransferRequest,
) -> Result<TransferResult, DomainError> {
    // El orden de las validaciones lo fija contracts/README.md y los casos tr-003..tr-006
    // lo verifican. No reordenar sin cambiar el contrato.
    if request.origin == request.destination {
        return Err(DomainError::SameAccount);
    }

    let i_origin = accounts
        .iter()
        .position(|c| c.id == request.origin)
        .ok_or_else(|| DomainError::AccountNotFound {
            id: request.origin.clone(),
        })?;
    let i_destination = accounts
        .iter()
        .position(|c| c.id == request.destination)
        .ok_or_else(|| DomainError::AccountNotFound {
            id: request.destination.clone(),
        })?;

    // `parse_scaled_amount` rechaza acá el monto con más de 2 decimales, junto al chequeo
    // de "mayor que cero" y **después** de resolver las cuentas: adelantarlo le cambiaría
    // el error a tr-004 y tr-005, que el contrato fija en CuentaNoEncontrada y MismaCuenta.
    let amount = parse_scaled_amount(&request.amount, "monto")?;
    if amount <= Decimal::ZERO {
        return Err(DomainError::InvalidAmount {
            detail: "el monto debe ser mayor que cero".into(),
        });
    }

    let fee = rounded_itf(amount)?;
    let total = round_amount(amount.checked_add(fee).ok_or(DomainError::OutOfRange {
        field: "total".into(),
    })?);

    // El saldo entra por la misma puerta que el monto: un saldo con más de 2 decimales se
    // redondea al formatear la salida, y ese redondeo crea o destruye centavos.
    let origin_balance = parse_scaled_amount(&accounts[i_origin].balance, "saldo origen")?;
    if origin_balance < total {
        return Err(DomainError::InsufficientFunds {
            available: format_amount(origin_balance),
            required: format_amount(total),
        });
    }
    let destination_balance =
        parse_scaled_amount(&accounts[i_destination].balance, "saldo destino")?;

    // Entra el estado, sale el estado nuevo: la entrada no se muta.
    let mut updated = accounts.clone();
    updated[i_origin].balance = format_amount(origin_balance.checked_sub(total).ok_or(
        DomainError::OutOfRange {
            field: "saldo origen".into(),
        },
    )?);
    updated[i_destination].balance = format_amount(destination_balance.checked_add(amount).ok_or(
        DomainError::OutOfRange {
            field: "saldo destino".into(),
        },
    )?);

    Ok(TransferResult {
        accounts: updated,
        itf_fee: format_amount(fee),
        total_debited: format_amount(total),
        receipt: receipt(&request.origin, &request.destination, amount)?,
        simulated_latency_ms: simulated_latency(amount),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // `initial_accounts` de contracts/cases.json.
    fn accounts() -> Vec<Account> {
        vec![
            Account {
                id: "00219100123456789047".into(),
                holder: "Ana Quispe".into(),
                balance: "5000.00".into(),
            },
            Account {
                id: "01122000987654321065".into(),
                holder: "Luis Ramos".into(),
                balance: "1200.50".into(),
            },
        ]
    }

    fn request(origin: &str, destination: &str, amount: &str) -> TransferRequest {
        TransferRequest {
            origin: origin.into(),
            destination: destination.into(),
            amount: amount.into(),
        }
    }

    #[test]
    fn tr_001_happy_transfer() {
        let r = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "100.00"),
        )
        .unwrap();
        assert_eq!(r.accounts[0].balance, "4899.99");
        assert_eq!(r.accounts[1].balance, "1300.50");
        assert_eq!(r.itf_fee, "0.01");
        assert_eq!(r.total_debited, "100.01");
        assert_eq!(r.receipt, "TRF-9047-1065-10000");
        assert_eq!(r.simulated_latency_ms, 350);
    }

    #[test]
    fn tr_002_with_itf_rounding() {
        let r = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "3500.00"),
        )
        .unwrap();
        assert_eq!(r.accounts[0].balance, "1499.82");
        assert_eq!(r.accounts[1].balance, "4700.50");
        assert_eq!(r.itf_fee, "0.18");
        assert_eq!(r.total_debited, "3500.18");
        assert_eq!(r.receipt, "TRF-9047-1065-350000");
        assert_eq!(r.simulated_latency_ms, 750);
    }

    #[test]
    fn tr_003_insufficient_funds() {
        let e = execute_transfer(
            accounts(),
            request("01122000987654321065", "00219100123456789047", "10000.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "SaldoInsuficiente");
    }

    #[test]
    fn tr_004_account_not_found() {
        let e = execute_transfer(
            accounts(),
            request("00219100123456789047", "00000000000000000000", "50.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "CuentaNoEncontrada");
    }

    #[test]
    fn tr_005_same_account() {
        let e = execute_transfer(
            accounts(),
            request("00219100123456789047", "00219100123456789047", "50.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "MismaCuenta");
    }

    #[test]
    fn tr_006_zero_amount() {
        let e = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "0.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "MontoInvalido");
    }

    /// tr-007 del contrato: el monto con 3 decimales se rechaza.
    ///
    /// Antes de esta guardia devolvía `Ok` con los dos saldos intactos y
    /// `total_debitado "0.00"`: una transferencia "exitosa" que no movía nada. Y con un
    /// saldo mal escalado creaba dinero (ver el test de abajo).
    #[test]
    fn tr_007_amount_with_more_than_two_decimals() {
        let e = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "0.001"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "MontoInvalido");
    }

    /// El contracara de `tr-007`, y el falso positivo que el chequeo original tenía:
    /// `"1.000"` vale exactamente 1 y se representa exacto con 2 decimales, así que la
    /// transferencia **debe** salir bien. Con `Decimal::scale()` literal daba
    /// `MontoInvalido` por tres ceros a la derecha que no cambian nada.
    ///
    /// Los esperados salen de la fórmula normativa de contracts/README.md:
    ///   comision = redondear2(1.000 * 0.00005) = redondear2(0.00005) = 0.00
    ///   total    = redondear2(1.000 + 0.00)    = 1.00
    ///   receipt  = "TRF-9047-1065-" + centavos(1.000) = "TRF-9047-1065-100"
    ///   latencia = 250 + min(1, 500) = 251
    #[test]
    fn an_amount_with_harmless_trailing_zeros_is_accepted() {
        let r = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "1.000"),
        )
        .unwrap();

        // Toda salida sale con exactamente 2 decimales, sin rastro de la escala de entrada.
        assert_eq!(r.accounts[0].balance, "4999.00");
        assert_eq!(r.accounts[1].balance, "1201.50");
        assert_eq!(r.itf_fee, "0.00");
        assert_eq!(r.total_debited, "1.00");
        assert_eq!(r.receipt, "TRF-9047-1065-100");
        assert_eq!(r.simulated_latency_ms, 251);
    }

    /// Y lo mismo del lado de los saldos: un saldo escrito `"5000.000"` es el mismo saldo.
    #[test]
    fn a_balance_with_harmless_trailing_zeros_is_accepted() {
        let padded = vec![
            Account {
                id: "00219100123456789047".into(),
                holder: "Ana Quispe".into(),
                balance: "5000.000".into(),
            },
            Account {
                id: "01122000987654321065".into(),
                holder: "Luis Ramos".into(),
                balance: "1200.5000".into(),
            },
        ];
        let r = execute_transfer(
            padded,
            request("00219100123456789047", "01122000987654321065", "100.00"),
        )
        .unwrap();

        // Idénticos a tr-001: los ceros a la derecha no mueven un centavo.
        assert_eq!(r.accounts[0].balance, "4899.99");
        assert_eq!(r.accounts[1].balance, "1300.50");
        assert_eq!(r.total_debited, "100.01");
    }

    /// El otro lado de la misma guardia, este sin caso en el contrato porque los saldos
    /// del contrato son fixture y siempre llegan bien escalados: con `5000.005` y
    /// `0.005` de saldos, la transferencia de `0.001` devolvía `Ok` con saldos
    /// `5000.01` y `0.01` — un centavo entero salido de la nada, con ITF `0.00`.
    #[test]
    fn a_badly_scaled_balance_is_rejected() {
        let mis_scaled = vec![
            Account {
                id: "00219100123456789047".into(),
                holder: "Ana Quispe".into(),
                balance: "5000.005".into(),
            },
            Account {
                id: "01122000987654321065".into(),
                holder: "Luis Ramos".into(),
                balance: "0.005".into(),
            },
        ];
        let e = execute_transfer(
            mis_scaled,
            request("00219100123456789047", "01122000987654321065", "100.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "MontoInvalido");
        assert!(e.to_string().contains("saldo origen"), "{e}");
    }

    /// Y el saldo destino tiene su propia puerta: el origen bien escalado no alcanza para
    /// que el estado de salida esté bien escalado.
    #[test]
    fn a_badly_scaled_destination_balance_is_rejected() {
        let mis_scaled = vec![
            Account {
                id: "00219100123456789047".into(),
                holder: "Ana Quispe".into(),
                balance: "5000.00".into(),
            },
            Account {
                id: "01122000987654321065".into(),
                holder: "Luis Ramos".into(),
                balance: "0.005".into(),
            },
        ];
        let e = execute_transfer(
            mis_scaled,
            request("00219100123456789047", "01122000987654321065", "100.00"),
        )
        .unwrap_err();
        assert_eq!(e.contract_name(), "MontoInvalido");
        assert!(e.to_string().contains("saldo destino"), "{e}");
    }

    // Reemplaza a un test anterior (`does_not_mutate_the_input_accounts`) que no podía
    // fallar: `execute_transfer` toma `Vec<Account>` por valor, así que el test le
    // pasaba un clon y asertaba sobre el vector original — eso vale para cualquier
    // implementación imaginable, incluida una que mutara todo lo que recibe. La pureza
    // ya la garantiza la firma de la función, no hacía falta (ni servía) un test para
    // eso. Este test sí puede fallar: cubre una tercera cuenta ajena a la transferencia
    // (que debe salir intacta) y el campo `holder` de las dos cuentas participantes
    // (que el contrato incluye en `esperado.cuentas` pero ningún test tocaba todavía).
    #[test]
    fn preserves_untouched_accounts_and_holders() {
        let bystander = Account {
            id: "00218900555555555099".into(),
            holder: "Marta Solis".into(),
            balance: "777.77".into(),
        };
        let mut all_accounts = accounts();
        all_accounts.push(bystander.clone());

        let r = execute_transfer(
            all_accounts,
            request("00219100123456789047", "01122000987654321065", "100.00"),
        )
        .unwrap();

        // Las dos cuentas participantes conservan id y holder; solo cambia el balance
        // (ya verificado por tr_001_happy_transfer).
        assert_eq!(r.accounts[0].id, "00219100123456789047");
        assert_eq!(r.accounts[0].holder, "Ana Quispe");
        assert_eq!(r.accounts[1].id, "01122000987654321065");
        assert_eq!(r.accounts[1].holder, "Luis Ramos");

        // La tercera cuenta no participa en la transferencia: debe salir intacta, en
        // la misma posición.
        assert_eq!(r.accounts[2], bystander);
    }

    // Caso extra (no viene en contracts/cases.json): tr-001 y tr-002 usan montos
    // terminados en ".00", así que ninguno ejercita `centavos(monto)` con centavos
    // distintos de cero. Derivado estrictamente de la fórmula normativa de
    // contracts/README.md:
    //   comision = redondear2(100.55 * 0.00005) = redondear2(0.0050275) = 0.01
    //   total    = redondear2(100.55 + 0.01)      = 100.56
    //   receipt  = "TRF-" + ultimos4(origen) + "-" + ultimos4(destino) + "-" + centavos(100.55)
    //            = "TRF-9047-1065-10055"
    //   latencia = 250 + min(100, 500) = 350
    #[test]
    fn receipt_and_latency_cover_nonzero_cents() {
        let r = execute_transfer(
            accounts(),
            request("00219100123456789047", "01122000987654321065", "100.55"),
        )
        .unwrap();
        assert_eq!(r.accounts[0].balance, "4899.44");
        assert_eq!(r.accounts[1].balance, "1301.05");
        assert_eq!(r.itf_fee, "0.01");
        assert_eq!(r.total_debited, "100.56");
        assert_eq!(r.receipt, "TRF-9047-1065-10055");
        assert_eq!(r.simulated_latency_ms, 350);
    }
}
