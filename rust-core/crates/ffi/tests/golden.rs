//! Corre contracts/cases.json contra la superficie FFI.
//!
//! La comparación es **igualdad exacta de strings**, nunca numérica con tolerancia:
//! una tolerancia haría pasar el test aunque una plataforma derive en centavos, que es
//! justo el fallo que la POC existe para hacer visible.

use core_financiero::*;
use serde_json::Value;

// include_str! embebe el contrato en el binario de test: cambiar cases.json fuerza
// recompilar, y no hay I/O en tiempo de ejecución.
const CASES: &str = include_str!("../../../../contracts/cases.json");

fn contract() -> Value {
    serde_json::from_str(CASES).expect("cases.json debe ser JSON válido")
}

fn field(v: &Value, k: &str) -> String {
    v[k].as_str()
        .unwrap_or_else(|| panic!("falta el campo de texto `{k}` en {v}"))
        .to_string()
}

#[test]
fn the_contract_is_the_expected_version() {
    assert_eq!(field(&contract(), "version"), "2.2.0");
}

/// Guardia contra el golden que reporta éxito sin haber ejercitado nada.
///
/// Dos razones por las que este test vale:
///
/// 1. Si alguien agrega un caso a `contracts/cases.json`, **tiene que actualizar el
///    número de acá a propósito**. La fricción es deliberada: el contrato lo leen cinco
///    bases de código, y crecerlo es un acto consciente, no algo que se cuela por
///    descuido en una sola de ellas.
/// 2. Sin esta guardia, un grupo vaciado o renombrado a la mitad pasaría en verde: un
///    `for` sobre cero elementos no aserta nada, así que los `golden_*` dirían "ok" sin
///    haber comparado un solo string. Es exactamente la misma clase de fallo que motivó
///    poner este archivo dentro del paquete `ffi` y no en la raíz del workspace.
#[test]
fn the_contract_has_the_expected_number_of_cases() {
    // Los conteos reales del contrato v2.2.0. Cambiarlos es cambiar el alcance de la POC.
    const EXPECTED: [(&str, usize); 5] = [
        ("aritmetica", 6),
        ("cci", 4),
        ("itf", 5),
        ("tarjeta", 6),
        ("transferencia", 6),
    ];
    const EXPECTED_TOTAL: usize = 27;

    let d = contract();
    let mut total = 0;
    for (group, expected) in EXPECTED {
        let actual = d[group]
            .as_array()
            .unwrap_or_else(|| panic!("falta el grupo `{group}` en cases.json"))
            .len();
        assert_eq!(
            actual, expected,
            "el grupo `{group}` trae {actual} casos y se esperaban {expected}"
        );
        total += actual;
    }
    assert_eq!(
        total, EXPECTED_TOTAL,
        "el contrato trae {total} casos en total y se esperaban {EXPECTED_TOTAL}"
    );
}

#[test]
fn golden_arithmetic() {
    for case in contract()["aritmetica"]
        .as_array()
        .expect("grupo aritmetica")
    {
        let id = field(case, "id");
        let op = field(case, "op");
        let (a, b) = (field(case, "a"), field(case, "b"));
        let actual = match op.as_str() {
            "sumar" => add(a, b),
            "restar" => subtract(a, b),
            other => panic!("{id}: operación desconocida `{other}`"),
        }
        .unwrap_or_else(|e| panic!("{id}: error inesperado {e}"));
        assert_eq!(actual, field(case, "esperado"), "caso {id}");
    }
}

#[test]
fn golden_itf() {
    for case in contract()["itf"].as_array().expect("grupo itf") {
        let id = field(case, "id");
        let actual = calculate_itf(field(case, "entrada"))
            .unwrap_or_else(|e| panic!("{id}: error inesperado {e}"));
        assert_eq!(actual, field(case, "esperado"), "caso {id}");
    }
}

#[test]
fn golden_cci() {
    for case in contract()["cci"].as_array().expect("grupo cci") {
        let id = field(case, "id");
        let input = field(case, "entrada");
        match validate_cci(input) {
            Ok(v) => {
                assert!(case["valido"].as_bool() == Some(true), "{id}: debía fallar");
                let e = &case["esperado"];
                assert_eq!(v.bank_code, field(e, "codigo_banco"), "caso {id}");
                assert_eq!(v.bank_name, field(e, "nombre_banco"), "caso {id}");
                assert_eq!(v.branch, field(e, "oficina"), "caso {id}");
                assert_eq!(v.account, field(e, "cuenta"), "caso {id}");
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(err.contract_name(), field(case, "error"), "caso {id}");
            }
        }
    }
}

#[test]
fn golden_card() {
    let d = contract();
    let key = field(&d, "_clave_demo_hex");
    let nonce = field(&d, "_nonce_demo_hex");
    for case in d["tarjeta"].as_array().expect("grupo tarjeta") {
        let id = field(case, "id");
        let input = field(case, "entrada");
        match validate_card(input.clone()) {
            Ok(v) => {
                assert!(case["valido"].as_bool() == Some(true), "{id}: debía fallar");
                let e = &case["esperado"];
                assert_eq!(v.brand, field(e, "marca"), "caso {id}");
                assert_eq!(v.masked, field(e, "enmascarado"), "caso {id}");

                let ciphertext = encrypt(input.clone(), key.clone(), nonce.clone())
                    .unwrap_or_else(|err| panic!("{id}: {err}"));
                assert_eq!(ciphertext, field(e, "cifrado_hex"), "caso {id} (cifrado)");

                let roundtrip = decrypt(ciphertext, key.clone(), nonce.clone())
                    .unwrap_or_else(|err| panic!("{id}: {err}"));
                assert_eq!(roundtrip, input, "caso {id} (roundtrip)");
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(err.contract_name(), field(case, "error"), "caso {id}");
            }
        }
    }
}

#[test]
fn golden_transfer() {
    let d = contract();
    let initial: Vec<Account> = d["cuentas_iniciales"]
        .as_array()
        .expect("cuentas_iniciales")
        .iter()
        .map(|c| Account {
            id: field(c, "id"),
            holder: field(c, "titular"),
            balance: field(c, "saldo"),
        })
        .collect();

    for case in d["transferencia"].as_array().expect("grupo transferencia") {
        let id = field(case, "id");
        let input = &case["entrada"];
        let request = TransferRequest {
            origin: field(input, "origen"),
            destination: field(input, "destino"),
            amount: field(input, "monto"),
        };

        match execute_transfer(initial.clone(), request) {
            Ok(r) => {
                assert!(case["valido"].as_bool() == Some(true), "{id}: debía fallar");
                let e = &case["esperado"];
                assert_eq!(r.itf_fee, field(e, "comision_itf"), "caso {id}");
                assert_eq!(r.total_debited, field(e, "total_debitado"), "caso {id}");
                assert_eq!(r.receipt, field(e, "comprobante"), "caso {id}");
                assert_eq!(
                    u64::from(r.simulated_latency_ms),
                    e["latencia_simulada_ms"].as_u64().expect("latencia"),
                    "caso {id}"
                );
                let expected_accounts = e["cuentas"].as_array().expect("cuentas esperadas");
                assert_eq!(r.accounts.len(), expected_accounts.len(), "caso {id}");
                for (actual_account, expected_account) in r.accounts.iter().zip(expected_accounts) {
                    assert_eq!(
                        actual_account.id,
                        field(expected_account, "id"),
                        "caso {id}"
                    );
                    assert_eq!(
                        actual_account.holder,
                        field(expected_account, "titular"),
                        "caso {id}"
                    );
                    assert_eq!(
                        actual_account.balance,
                        field(expected_account, "saldo"),
                        "caso {id}"
                    );
                }
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(err.contract_name(), field(case, "error"), "caso {id}");
            }
        }
    }
}
