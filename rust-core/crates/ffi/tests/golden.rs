//! Corre contracts/cases.json contra la superficie FFI.
//!
//! La comparación es **igualdad exacta de strings**, nunca numérica con tolerancia:
//! una tolerancia haría pasar el test aunque una plataforma derive en centavos, que es
//! justo el fallo que la POC existe para hacer visible.
//!
//! Este archivo lo van a espejar Kotlin, Swift y TypeScript, así que las guardias valen
//! por cuatro. Son cuatro, en orden de cercanía al caso:
//!
//! - cada `golden_*` cuenta los casos que ejercitó y lo aserta al cerrar, así que un
//!   grupo vaciado hace fallar al test que lo lee y no solo a una tabla lejana;
//! - `the_contract_has_the_expected_number_of_cases` fija el tamaño de cada grupo;
//! - `the_contract_has_no_unknown_top_level_keys` fija qué grupos existen;
//! - los tres tests `*_messages_*` atan `contracts/messages.es.json` a las nueve variantes
//!   del core y a los nombres de error que usa `cases.json`.
//!
//! Todas responden al mismo fallo: un `for` sobre cero elementos no aserta nada, y un
//! test que no compara ningún string igual reporta éxito.

use core_financiero::*;
use serde_json::Value;
use std::collections::BTreeSet;

// include_str! embebe el contrato en el binario de test: cambiar cases.json fuerza
// recompilar, y no hay I/O en tiempo de ejecución.
const CASES: &str = include_str!("../../../../contracts/cases.json");

// El segundo archivo del contrato: los mensajes de usuario. Vive aparte de `cases.json`
// porque los mensajes NO cruzan el FFI y los redacta la capa de UI de cada app, no el core.
const MESSAGES: &str = include_str!("../../../../contracts/messages.es.json");

fn contract() -> Value {
    serde_json::from_str(CASES).expect("cases.json debe ser JSON válido")
}

fn messages() -> Value {
    serde_json::from_str(MESSAGES).expect("messages.es.json debe ser JSON válido")
}

/// Las claves del objeto `mensajes` de `contracts/messages.es.json`.
fn message_keys(m: &Value) -> BTreeSet<String> {
    m["mensajes"]
        .as_object()
        .unwrap_or_else(|| panic!("falta el objeto `mensajes` en messages.es.json: {m}"))
        .keys()
        .cloned()
        .collect()
}

/// No calcula nada: existe para que el **compilador** cuente las variantes.
///
/// El `match` es exhaustivo y **sin rama por defecto**, así que agregar una décima variante
/// al core rompe la compilación de este archivo. Ese es justamente el punto: sin él, la
/// lista de `contract_error_names` quedaría corta en silencio, las nueve entradas de
/// `messages.es.json` seguirían cuadrando, y la variante nueva llegaría a las cuatro apps
/// sin mensaje de usuario — que es el agujero que este archivo existe para tapar. Es la
/// misma técnica que `rust-core/README.md` le exige al mapeo de las cuatro apps.
fn every_variant_is_listed(e: &DomainError) {
    match e {
        DomainError::Length { .. }
        | DomainError::CheckDigit
        | DomainError::UnknownBank { .. }
        | DomainError::InvalidAmount { .. }
        | DomainError::AccountNotFound { .. }
        | DomainError::SameAccount
        | DomainError::InsufficientFunds { .. }
        | DomainError::Encryption { .. }
        | DomainError::OutOfRange { .. } => {}
    }
}

/// Los nueve nombres del contrato, **derivados de `contract_name()`** sobre las nueve
/// variantes reales y no tipeados a mano: renombrar `"Cifrado"` en el core mueve esta
/// lista sola, y la guardia de abajo lo reporta como "falta Cifrado" en vez de pasar en
/// verde. Es la misma técnica que `the_domain_error_translates_preserving_its_name`.
fn contract_error_names() -> BTreeSet<String> {
    let variants = [
        DomainError::Length {
            field: "cci".into(),
            expected: 20,
            received: 18,
        },
        DomainError::CheckDigit,
        DomainError::UnknownBank { code: "999".into() },
        DomainError::InvalidAmount {
            detail: "cero".into(),
        },
        DomainError::AccountNotFound { id: "ACC-1".into() },
        DomainError::SameAccount,
        DomainError::InsufficientFunds {
            available: "1.00".into(),
            required: "2.00".into(),
        },
        DomainError::Encryption {
            detail: "nonce inválido".into(),
        },
        DomainError::OutOfRange {
            field: "monto".into(),
        },
    ];
    variants.iter().for_each(every_variant_is_listed);
    let names: BTreeSet<String> = variants
        .iter()
        .map(|v| v.contract_name().to_string())
        .collect();
    assert_eq!(
        names.len(),
        9,
        "el core tiene nueve variantes de error: si acá salen {}, alguna quedó sin \
         construir o dos comparten `contract_name()`",
        names.len()
    );
    names
}

fn field(v: &Value, k: &str) -> String {
    v[k].as_str()
        .unwrap_or_else(|| panic!("falta el campo de texto `{k}` en {v}"))
        .to_string()
}

/// Aserta que un objeto del contrato trae **exactamente** estos campos.
///
/// Sin esto, agregar mañana un campo dentro de un `esperado` no rompería nada y quedaría
/// sin comparar en las cuatro plataformas: la POC diría "verde" sobre un contrato que
/// creció y que nadie está verificando entero. Reporta juntas las claves que sobran y las
/// que faltan, para que un renombre se lea de un vistazo.
fn assert_exact_fields(v: &Value, expected: &[&str], what: &str) {
    let actual: BTreeSet<&str> = v
        .as_object()
        .unwrap_or_else(|| panic!("{what}: se esperaba un objeto JSON, vino {v}"))
        .keys()
        .map(String::as_str)
        .collect();
    let known: BTreeSet<&str> = expected.iter().copied().collect();
    let extra: Vec<&str> = actual.difference(&known).copied().collect();
    let missing: Vec<&str> = known.difference(&actual).copied().collect();
    assert!(
        extra.is_empty() && missing.is_empty(),
        "{what}: los campos no son los esperados — sobran: {extra:?}, faltan: {missing:?}. \
         Un campo nuevo en el contrato necesita su `assert_eq!` acá y en las otras tres \
         plataformas, o queda sin comparar"
    );
}

#[test]
fn the_contract_is_the_expected_version() {
    assert_eq!(field(&contract(), "version"), "2.3.0");
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
    // Los conteos reales del contrato v2.3.0. Cambiarlos es cambiar el alcance de la POC.
    const EXPECTED: [(&str, usize); 5] = [
        ("aritmetica", 6),
        ("cci", 4),
        ("itf", 5),
        ("tarjeta", 6),
        ("transferencia", 7),
    ];
    const EXPECTED_TOTAL: usize = 28;

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
    // Esto NO es una segunda guardia: si los cinco asserts de arriba pasaron, el total es
    // necesariamente 28, y si alguno falla el test aborta antes de llegar acá. Está para
    // documentar el tamaño del contrato y para que crecerlo obligue a tocar dos números.
    assert_eq!(
        total, EXPECTED_TOTAL,
        "el contrato trae {total} casos en total y se esperaban {EXPECTED_TOTAL}"
    );
}

/// Guardia contra el grupo que nadie lee. Un escalón por encima del conteo.
///
/// Un grupo de casos nuevo que ninguna función `golden_*` lea pasaría en verde sin
/// comparar un solo string — igual que un grupo vacío, y por el mismo motivo: lo que no
/// se recorre no aserta nada. La diferencia es que el conteo no puede cazarlo, porque un
/// grupo desconocido no está en su tabla.
///
/// Por eso agregar un grupo al contrato **obliga** a agregarle acá su función `golden_*`
/// y a sumarlo a esta lista, y lo mismo en las otras tres plataformas. Es la misma
/// fricción deliberada del conteo: `contracts/cases.json` lo leen cinco bases de código,
/// y que una se quede atrás sin que nada falle es justo lo que la POC no puede permitirse.
#[test]
fn the_contract_has_no_unknown_top_level_keys() {
    // Las doce claves del contrato v2.3.0: seis de metadatos, cinco grupos de casos, y
    // `cuentas_iniciales`, que `golden_transfer` usa como fixture y no como casos.
    const KNOWN: [&str; 12] = [
        "version",
        "moneda",
        "_nota",
        "_alicuota_itf",
        "_clave_demo_hex",
        "_nonce_demo_hex",
        "aritmetica",
        "cuentas_iniciales",
        "transferencia",
        "cci",
        "itf",
        "tarjeta",
    ];

    let d = contract();
    let actual: BTreeSet<&str> = d
        .as_object()
        .expect("cases.json debe ser un objeto JSON")
        .keys()
        .map(String::as_str)
        .collect();
    let known: BTreeSet<&str> = KNOWN.into_iter().collect();

    // Se reportan las dos diferencias juntas: si alguien renombra un grupo, ver "sobra
    // `tarjetas`, falta `tarjeta`" de una vez dice qué pasó, y no solo que algo difiere.
    let extra: Vec<&str> = actual.difference(&known).copied().collect();
    let missing: Vec<&str> = known.difference(&actual).copied().collect();
    assert!(
        extra.is_empty() && missing.is_empty(),
        "las claves de primer nivel de cases.json no son las conocidas — sobran: {extra:?}, \
         faltan: {missing:?}. Si es un grupo de casos nuevo, no alcanza con agregarlo al \
         contrato: necesita su propia función `golden_*` acá y en las otras tres plataformas"
    );
}

/// Guardia de forma del **segundo** archivo del contrato, `contracts/messages.es.json`.
///
/// Mismo criterio que `the_contract_has_no_unknown_top_level_keys` para `cases.json`: una
/// clave nueva que ninguna plataforma lea es una parte del contrato que nadie verifica, y
/// una renombrada se lee de un vistazo si se reportan juntas las que sobran y las que
/// faltan.
#[test]
fn the_messages_file_has_the_expected_shape() {
    // Cinco claves de primer nivel: cuatro de metadatos y el objeto `mensajes`.
    const KNOWN: [&str; 5] = ["version", "idioma", "_nota", "_placeholders", "_fuente"];

    let m = messages();
    assert_eq!(field(&m, "version"), "1.0.0");
    assert_eq!(field(&m, "idioma"), "es");

    let actual: BTreeSet<&str> = m
        .as_object()
        .expect("messages.es.json debe ser un objeto JSON")
        .keys()
        .map(String::as_str)
        .collect();
    let known: BTreeSet<&str> = KNOWN.into_iter().chain(["mensajes"]).collect();
    let extra: Vec<&str> = actual.difference(&known).copied().collect();
    let missing: Vec<&str> = known.difference(&actual).copied().collect();
    assert!(
        extra.is_empty() && missing.is_empty(),
        "las claves de primer nivel de messages.es.json no son las conocidas — sobran: \
         {extra:?}, faltan: {missing:?}"
    );
}

/// La guardia que hace que `contracts/messages.es.json` valga más que una convención
/// escrita: sus claves son **exactamente** los nueve nombres del contrato, ni una más ni
/// una menos.
///
/// Los nueve no están tipeados acá: salen de `contract_name()` sobre las nueve variantes
/// reales (ver `contract_error_names`). Así, agregar una décima variante al core deja el
/// archivo corto y este test lo dice nombrándola, en vez de que se descubra el día de la
/// demo con un cuadro de error en blanco — que es justo lo que pasa hoy si una app muestra
/// `e.message`: uniffi devuelve el string vacío para las variantes sin campos.
///
/// El chequeo de "no vacío" no es decorativo por lo mismo: una entrada presente pero con
/// `""` pasaría la igualdad de conjuntos y volvería a producir la pantalla en blanco.
#[test]
fn the_messages_file_covers_the_nine_error_variants() {
    let m = messages();
    let present = message_keys(&m);
    let expected = contract_error_names();

    let extra: Vec<&String> = present.difference(&expected).collect();
    let missing: Vec<&String> = expected.difference(&present).collect();
    assert!(
        extra.is_empty() && missing.is_empty(),
        "contracts/messages.es.json no cubre las nueve variantes del core — sobran: \
         {extra:?}, faltan: {missing:?}. Agregar una variante de error al core obliga a \
         agregarle su mensaje de usuario acá, en el mismo cambio"
    );

    for name in &expected {
        let text = m["mensajes"][name]
            .as_str()
            .unwrap_or_else(|| panic!("el mensaje de `{name}` no es un string"));
        assert!(
            !text.trim().is_empty(),
            "el mensaje de `{name}` está vacío: en pantalla eso es un cuadro de error en \
             blanco, que es exactamente el fallo que este archivo existe para evitar"
        );
    }
}

/// El otro sentido de la misma guardia, y el que ata los dos archivos del contrato: todo
/// nombre de error que `cases.json` espera tiene su mensaje de usuario en
/// `messages.es.json`.
///
/// La igualdad de conjuntos de arriba ya lo implica hoy, porque los nombres de `cases.json`
/// son un subconjunto de los nueve. Este test existe igual porque **no compara contra los
/// nueve sino contra lo que el contrato usa de verdad**, y ese es el recorrido que Kotlin,
/// Swift y TypeScript pueden espejar sin tener acceso a `contract_name()`. Lleva contador,
/// como los `golden_*`: sin él, un `cases.json` sin casos de error pasaría en verde.
#[test]
fn every_error_name_in_the_contract_has_a_user_message() {
    // Los diez casos con `error` del contrato v2.3.0, sobre seis nombres distintos:
    // 3 DigitoControl, 2 Longitud, 2 MontoInvalido, y uno de CuentaNoEncontrada,
    // MismaCuenta y SaldoInsuficiente. Los otros tres nombres —BancoDesconocido, Cifrado
    // y FueraDeRango— no tienen caso en el contrato, y para ellos la guardia es la de
    // arriba.
    const EXPECTED_ERROR_CASES: usize = 10;
    const EXPECTED_DISTINCT_NAMES: usize = 6;

    let available = message_keys(&messages());
    let d = contract();
    let mut checked = 0;
    let mut seen: BTreeSet<String> = BTreeSet::new();

    // Se recorren TODOS los grupos, no una lista fija: un grupo nuevo con casos de error
    // entra solo en el chequeo.
    for (group, value) in d.as_object().expect("cases.json debe ser un objeto JSON") {
        let Some(cases) = value.as_array() else {
            continue;
        };
        for case in cases {
            let Some(name) = case["error"].as_str() else {
                continue;
            };
            let id = field(case, "id");
            assert!(
                available.contains(name),
                "el caso `{id}` del grupo `{group}` espera el error `{name}` y \
                 contracts/messages.es.json no tiene su mensaje de usuario: esa pantalla \
                 de error quedaría distinta en cada una de las cuatro apps"
            );
            seen.insert(name.to_string());
            checked += 1;
        }
    }

    assert_eq!(
        checked, EXPECTED_ERROR_CASES,
        "se recorrieron {checked} casos con `error` y el contrato declara \
         {EXPECTED_ERROR_CASES}"
    );
    assert_eq!(
        seen.len(),
        EXPECTED_DISTINCT_NAMES,
        "los casos con `error` usan {} nombres distintos y se esperaban \
         {EXPECTED_DISTINCT_NAMES}: {seen:?}",
        seen.len()
    );
}

#[test]
fn golden_arithmetic() {
    // El contador se aserta al cerrar: si el grupo llegara vacío, el `for` no compararía
    // nada y este test pasaría en verde sin el assert final.
    const EXPECTED_CASES: usize = 6;
    let mut exercised = 0;

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
        assert_eq!(actual, field(case, "esperado"), "caso {id} ({op})");
        exercised += 1;
    }

    assert_eq!(
        exercised, EXPECTED_CASES,
        "golden_arithmetic ejercitó {exercised} casos y el grupo `aritmetica` declara {EXPECTED_CASES}"
    );
}

#[test]
fn golden_itf() {
    // Ver `golden_arithmetic`: el contador es lo que impide pasar en verde sin ejercitar.
    const EXPECTED_CASES: usize = 5;
    let mut exercised = 0;

    for case in contract()["itf"].as_array().expect("grupo itf") {
        let id = field(case, "id");
        let actual = calculate_itf(field(case, "entrada"))
            .unwrap_or_else(|e| panic!("{id}: error inesperado {e}"));
        assert_eq!(actual, field(case, "esperado"), "caso {id} (itf)");
        exercised += 1;
    }

    assert_eq!(
        exercised, EXPECTED_CASES,
        "golden_itf ejercitó {exercised} casos y el grupo `itf` declara {EXPECTED_CASES}"
    );
}

#[test]
fn golden_cci() {
    // Ver `golden_arithmetic`: el contador es lo que impide pasar en verde sin ejercitar.
    const EXPECTED_CASES: usize = 4;
    let mut exercised = 0;

    for case in contract()["cci"].as_array().expect("grupo cci") {
        let id = field(case, "id");
        let input = field(case, "entrada");
        match validate_cci(input) {
            Ok(v) => {
                assert!(case["valido"].as_bool() == Some(true), "{id}: debía fallar");
                let e = &case["esperado"];
                assert_exact_fields(
                    e,
                    &["codigo_banco", "nombre_banco", "oficina", "cuenta"],
                    &format!("caso {id} esperado"),
                );
                assert_eq!(
                    v.bank_code,
                    field(e, "codigo_banco"),
                    "caso {id} (codigo_banco)"
                );
                assert_eq!(
                    v.bank_name,
                    field(e, "nombre_banco"),
                    "caso {id} (nombre_banco)"
                );
                assert_eq!(v.branch, field(e, "oficina"), "caso {id} (oficina)");
                assert_eq!(v.account, field(e, "cuenta"), "caso {id} (cuenta)");
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(
                    err.contract_name(),
                    field(case, "error"),
                    "caso {id} (error)"
                );
            }
        }
        exercised += 1;
    }

    assert_eq!(
        exercised, EXPECTED_CASES,
        "golden_cci ejercitó {exercised} casos y el grupo `cci` declara {EXPECTED_CASES}"
    );
}

#[test]
fn golden_card() {
    // Ver `golden_arithmetic`: el contador es lo que impide pasar en verde sin ejercitar.
    const EXPECTED_CASES: usize = 6;
    let mut exercised = 0;

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
                assert_exact_fields(
                    e,
                    &["marca", "enmascarado", "cifrado_hex"],
                    &format!("caso {id} esperado"),
                );
                assert_eq!(v.brand, field(e, "marca"), "caso {id} (marca)");
                assert_eq!(v.masked, field(e, "enmascarado"), "caso {id} (enmascarado)");

                let ciphertext = encrypt(input.clone(), key.clone(), nonce.clone())
                    .unwrap_or_else(|err| panic!("{id}: {err}"));
                assert_eq!(
                    ciphertext,
                    field(e, "cifrado_hex"),
                    "caso {id} (cifrado_hex)"
                );

                let roundtrip = decrypt(ciphertext, key.clone(), nonce.clone())
                    .unwrap_or_else(|err| panic!("{id}: {err}"));
                assert_eq!(roundtrip, input, "caso {id} (roundtrip)");
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(
                    err.contract_name(),
                    field(case, "error"),
                    "caso {id} (error)"
                );
            }
        }
        exercised += 1;
    }

    assert_eq!(
        exercised, EXPECTED_CASES,
        "golden_card ejercitó {exercised} casos y el grupo `tarjeta` declara {EXPECTED_CASES}"
    );
}

#[test]
fn golden_transfer() {
    // Ver `golden_arithmetic`: el contador es lo que impide pasar en verde sin ejercitar.
    const EXPECTED_CASES: usize = 7;
    let mut exercised = 0;

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
                assert_exact_fields(
                    e,
                    &[
                        "cuentas",
                        "comision_itf",
                        "total_debitado",
                        "comprobante",
                        "latencia_simulada_ms",
                    ],
                    &format!("caso {id} esperado"),
                );
                assert_eq!(
                    r.itf_fee,
                    field(e, "comision_itf"),
                    "caso {id} (comision_itf)"
                );
                assert_eq!(
                    r.total_debited,
                    field(e, "total_debitado"),
                    "caso {id} (total_debitado)"
                );
                assert_eq!(
                    r.receipt,
                    field(e, "comprobante"),
                    "caso {id} (comprobante)"
                );
                assert_eq!(
                    u64::from(r.simulated_latency_ms),
                    e["latencia_simulada_ms"].as_u64().expect("latencia"),
                    "caso {id} (latencia_simulada_ms)"
                );
                let expected_accounts = e["cuentas"].as_array().expect("cuentas esperadas");
                assert_eq!(
                    r.accounts.len(),
                    expected_accounts.len(),
                    "caso {id} (cantidad de cuentas)"
                );
                // El `zip` compara posición a posición: **el orden de `esperado.cuentas` es
                // parte del contrato**, no un detalle. Hoy los dos casos válidos lo traen en
                // el mismo orden que `cuentas_iniciales`, así que un espejo en Kotlin o Swift
                // que ordenara la lista o usara un Set pasaría igual y estaría verificando
                // menos. Espejar este test es espejar también el orden.
                for (i, (actual_account, expected_account)) in
                    r.accounts.iter().zip(expected_accounts).enumerate()
                {
                    assert_exact_fields(
                        expected_account,
                        &["id", "titular", "saldo"],
                        &format!("caso {id} esperado.cuentas[{i}]"),
                    );
                    assert_eq!(
                        actual_account.id,
                        field(expected_account, "id"),
                        "caso {id} cuenta[{i}] (id)"
                    );
                    assert_eq!(
                        actual_account.holder,
                        field(expected_account, "titular"),
                        "caso {id} cuenta[{i}] (titular)"
                    );
                    assert_eq!(
                        actual_account.balance,
                        field(expected_account, "saldo"),
                        "caso {id} cuenta[{i}] (saldo)"
                    );
                }
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(
                    err.contract_name(),
                    field(case, "error"),
                    "caso {id} (error)"
                );
            }
        }
        exercised += 1;
    }

    assert_eq!(
        exercised, EXPECTED_CASES,
        "golden_transfer ejercitó {exercised} casos y el grupo `transferencia` declara {EXPECTED_CASES}"
    );
}
