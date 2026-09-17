# Fase 6 · Bloque 0 — Contrato v2.4.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar el error de descifrado del de cifrado en el núcleo y propagarlo a las cinco bases de código, para que la pantalla de Tarjeta deje de decir «No se pudo cifrar» cuando lo que falló fue un descifrado.

**Architecture:** `DomainError` gana una décima variante, `Decryption`, cuyo nombre de contrato es `"Descifrado"`. `contracts/cases.json` sube a v2.4.0 con un grupo `descifrado` de tres casos y `contracts/messages.es.json` a v1.2.0 con la clave nueva. Como `cases.json` es un archivo único que las cinco bases leen y cuya versión las cinco asertan, el cambio no es scopeable: se propaga a Rust, Android, iOS, React Native y Angular en la misma rama, y termina regenerando los cuatro artefactos desde el mismo HEAD.

**Tech Stack:** Rust 1.98.1 (`rust_decimal`, `chacha20poly1305`, `thiserror`, uniffi 0.31), Kotlin/Compose + JNA, Swift/SwiftUI, React Native 0.87 (`ubrn`, N-API y WASM), Angular standalone.

**Spec:** [docs/superpowers/specs/2026-09-16-phase-6-hardening-design.md](../specs/2026-09-16-phase-6-hardening-design.md)

## Global Constraints

- **Todo identificador va en inglés**; documentación, comentarios y mensajes de commit, en español. Commits en Conventional Commits con scope = subproyecto.
- **`contracts/cases.json` conserva claves y nombres de error en español.** La variante nueva se llama `Decryption` en las cinco bases de código; su nombre de contrato es `"Descifrado"`.
- **Ningún tipo de punto flotante toca un monto**, en ningún lenguaje, tampoco en tests.
- **Cero reglas de negocio fuera de `rust-core`.**
- El core no hace `panic!`/`unwrap()`/`expect()` en producción: todo error es `Result` con `DomainError`.
- Las comparaciones del test de contrato son **igualdad exacta de strings**, nunca numéricas con tolerancia.
- **El cambio a `contracts/*.json` va en su propio commit**, separado de los cambios al core y a las apps.
- Perfil de release del core: `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "unwind"`. **`panic = "abort"` está prohibido** (salvo en `wasm32-unknown-unknown`, que lo impone).
- Valores exactos del contrato después de este bloque: versión `cases.json` **2.4.0**, versión `messages.es.json` **1.2.0**, total de casos **31**, casos con `error` **12**, nombres de error distintos usados por el contrato **7**, claves de primer nivel de `cases.json` **13**, variantes de `DomainError` **10**.

---

### Task 1: La variante `Decryption` en `crates/domain`

**Files:**
- Modify: `rust-core/crates/domain/src/error.rs:33-37` (variante nueva tras `Encryption`), `:45-58` (`contract_name`)
- Test: `rust-core/crates/domain/src/error.rs` (módulo `tests` al pie del mismo archivo)

**Interfaces:**
- Consumes: nada.
- Produces: `domain::DomainError::Decryption { detail: String }`, y `DomainError::contract_name()` devolviendo `"Descifrado"` para esa variante. Las tareas 2, 3 y 4 dependen de ese nombre exacto.

- [ ] **Step 1: Escribir el test que falla**

En el módulo `tests` de `rust-core/crates/domain/src/error.rs`, agregar:

```rust
    #[test]
    fn decryption_has_its_own_contract_name() {
        // El contrato distingue las dos direcciones: cifrar y descifrar fallan distinto
        // y la pantalla de Tarjeta muestra textos distintos.
        assert_eq!(
            DomainError::Decryption {
                detail: "no se pudo descifrar".into()
            }
            .contract_name(),
            "Descifrado"
        );
        assert_eq!(
            DomainError::Encryption {
                detail: "no se pudo cifrar".into()
            }
            .contract_name(),
            "Cifrado"
        );
    }
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd rust-core && cargo test -p domain decryption_has_its_own_contract_name`
Expected: FAIL de compilación — `no variant named 'Decryption' found for enum 'DomainError'`.

- [ ] **Step 3: Agregar la variante**

En `rust-core/crates/domain/src/error.rs`, inmediatamente después de la variante `Encryption`:

```rust
    #[error("error de descifrado: {detail}")]
    Decryption { detail: String },
```

y en `contract_name()`, inmediatamente después de la rama de `Encryption`:

```rust
            Self::Decryption { .. } => "Descifrado",
```

- [ ] **Step 4: Correr los tests del crate**

Run: `cd rust-core && cargo test -p domain`
Expected: PASS. El `match` de `contract_name` es exhaustivo y sin `else`, así que si la rama falta, no compila.

- [ ] **Step 5: Commit**

```bash
git add rust-core/crates/domain/src/error.rs
git commit -m "feat(rust-core): variante Decryption, con nombre de contrato Descifrado"
```

---

### Task 2: `decrypt` devuelve `Decryption`, y `prepare` deja de decidir por los dos

**Files:**
- Modify: `rust-core/crates/domain/src/crypto.rs:7-11` (helper `error`), `:17-29` (`prepare`), `:31-42` (`encrypt`), `:44-60` (`decrypt`)
- Test: `rust-core/crates/domain/src/crypto.rs` (módulo `tests` al pie del mismo archivo)

**Interfaces:**
- Consumes: `DomainError::Decryption { detail }` de la Task 1.
- Produces: `domain::crypto::decrypt` devolviendo **siempre** `Decryption` en su rama de error, y `encrypt` conservando `Encryption`. Las tareas 4 y 6-9 asertan ese comportamiento.

**Por qué no es una línea:** `prepare()` valida clave y nonce y hoy construye `Encryption` para las dos direcciones. Si se deja así, `decrypt("00", KEY, "0001")` seguiría devolviendo `"Cifrado"`. La solución es que `prepare` devuelva el detalle como `String` y que cada función pública lo envuelva en **su** variante — el error nombra la operación que el usuario pidió.

- [ ] **Step 1: Escribir los tests que fallan**

En el módulo `tests` de `rust-core/crates/domain/src/crypto.rs`, agregar:

```rust
    /// Las cuatro ramas de error de `decrypt` devuelven `Descifrado`, incluidas las que
    /// vienen de validar clave y nonce: el error nombra lo que el usuario pidió hacer,
    /// no en qué línea interna falló.
    #[test]
    fn every_decrypt_failure_is_named_descifrado() {
        // hex del ciphertext inválido
        assert_eq!(
            decrypt("zzzz", KEY, NONCE).unwrap_err().contract_name(),
            "Descifrado"
        );
        // clave de largo incorrecto
        assert_eq!(
            decrypt("00", "0001", NONCE).unwrap_err().contract_name(),
            "Descifrado"
        );
        // nonce de largo incorrecto
        assert_eq!(
            decrypt("00", KEY, "0001").unwrap_err().contract_name(),
            "Descifrado"
        );
        // tag adulterado
        let mut ciphertext = encrypt("4111111111111111", KEY, NONCE).unwrap();
        ciphertext.replace_range(0..1, "0");
        assert_eq!(
            decrypt(&ciphertext, KEY, NONCE).unwrap_err().contract_name(),
            "Descifrado"
        );
    }

    /// El otro lado de la misma moneda: cifrar sigue fallando como `Cifrado`.
    #[test]
    fn every_encrypt_failure_is_named_cifrado() {
        assert_eq!(
            encrypt("x", "zzzz", NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
        assert_eq!(
            encrypt("x", "0001", NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
        assert_eq!(
            encrypt("x", KEY, "0001").unwrap_err().contract_name(),
            "Cifrado"
        );
    }
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd rust-core && cargo test -p domain every_decrypt_failure_is_named_descifrado`
Expected: FAIL con `assertion 'left == right' failed: left: "Cifrado", right: "Descifrado"`.

- [ ] **Step 3: Implementar**

Reemplazar el helper `error` y `prepare` en `rust-core/crates/domain/src/crypto.rs`:

```rust
/// `prepare` no decide la variante: devuelve el detalle y cada función pública lo
/// envuelve en la suya. Sin esto, un nonce inválido pasado a `decrypt` se reportaría
/// como error de cifrado, que es el defecto que este bloque vino a cerrar.
fn prepare(key_hex: &str, nonce_hex: &str) -> Result<(ChaCha20Poly1305, Vec<u8>), String> {
    let key = hex::decode(key_hex.trim()).map_err(|_| "la clave no es hex válido".to_string())?;
    let nonce = hex::decode(nonce_hex.trim()).map_err(|_| "el nonce no es hex válido".to_string())?;
    let key: &Key = key
        .as_slice()
        .try_into()
        .map_err(|_| "la clave debe tener 32 bytes".to_string())?;
    if nonce.len() != 12 {
        return Err("el nonce debe tener 12 bytes".to_string());
    }
    Ok((ChaCha20Poly1305::new(key), nonce))
}

fn encryption(detail: &str) -> DomainError {
    DomainError::Encryption {
        detail: detail.to_string(),
    }
}

fn decryption(detail: &str) -> DomainError {
    DomainError::Decryption {
        detail: detail.to_string(),
    }
}
```

Reemplazar los cuerpos de las dos funciones públicas:

```rust
pub fn encrypt(text: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex).map_err(|d| encryption(&d))?;
    let nonce: &Nonce = nonce
        .as_slice()
        .try_into()
        .map_err(|_| encryption("nonce inválido"))?;
    let output = cipher
        .encrypt(nonce, text.as_bytes())
        .map_err(|_| encryption("no se pudo cifrar"))?;
    Ok(hex::encode(output))
}

pub fn decrypt(
    ciphertext_hex: &str,
    key_hex: &str,
    nonce_hex: &str,
) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex).map_err(|d| decryption(&d))?;
    let nonce: &Nonce = nonce
        .as_slice()
        .try_into()
        .map_err(|_| decryption("nonce inválido"))?;
    let bytes = hex::decode(ciphertext_hex.trim())
        .map_err(|_| decryption("el cifrado no es hex válido"))?;
    let plain = cipher
        .decrypt(nonce, bytes.as_slice())
        .map_err(|_| decryption("no se pudo descifrar: clave, nonce o tag incorrectos"))?;
    String::from_utf8(plain).map_err(|_| decryption("el texto descifrado no es UTF-8"))
}
```

- [ ] **Step 4: Actualizar los tests existentes que esperaban `"Cifrado"` al descifrar**

En el mismo módulo `tests`, cuatro asserts pasan a esperar `"Descifrado"`. Están en `invalid_hex_errors_without_panicking` (el assert de `decrypt("zzzz", …)`), `a_wrong_length_nonce_errors_without_panicking` (el de `decrypt("00", KEY, "0001")`) y `a_ciphertext_shorter_than_the_tag_errors_without_panicking` (los dos: `decrypt("00112233", …)` y `decrypt("", …)`). Cambiar en cada uno el string esperado de `"Cifrado"` a `"Descifrado"`. **No se borra ningún test**: esos casos siguen probando que no hay pánico, que es para lo que se escribieron.

- [ ] **Step 5: Correr todo el crate**

Run: `cd rust-core && cargo test -p domain`
Expected: PASS, sin tests perdidos respecto de la corrida anterior.

- [ ] **Step 6: Commit**

```bash
git add rust-core/crates/domain/src/crypto.rs
git commit -m "feat(rust-core): descifrar falla como Descifrado, no como Cifrado"
```

---

### Task 3: La variante cruza el FFI

**Files:**
- Modify: `rust-core/crates/ffi/src/lib.rs:37-40` (enum uniffi), `:45-59` (`contract_name`), `:61-89` (`From<domain::DomainError>`), `:263-310` (test que enumera las variantes)

**Interfaces:**
- Consumes: `domain::DomainError::Decryption { detail }` de la Task 1.
- Produces: `core_financiero::DomainError::Decryption { detail: String }`, que uniffi emite como `DomainException.Decryption` en Kotlin, `DomainError.decryption` en Swift y su equivalente en TypeScript. Las tareas 6-9 dependen de esos nombres generados.

- [ ] **Step 1: Escribir el test que falla**

El test del lib de `ffi` (alrededor de `:263`) enumera las variantes de `domain` y verifica que la traducción conserva el nombre de contrato. Agregar `domain::DomainError::Decryption` a esa lista, junto a `Encryption`:

```rust
            domain::DomainError::Decryption {
                detail: "no se pudo descifrar".into(),
            },
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p core_financiero --lib`
Expected: FAIL de compilación — la variante no existe en el enum de `ffi` y el `From` no es exhaustivo.

- [ ] **Step 3: Implementar las tres partes**

En `rust-core/crates/ffi/src/lib.rs`, en el enum `DomainError`, tras `Encryption`:

```rust
    #[error("error de descifrado: {detail}")]
    Decryption { detail: String },
```

En `contract_name()`, tras la rama de `Encryption`:

```rust
            Self::Decryption { .. } => "Descifrado",
```

En `impl From<domain::DomainError>`, tras la rama de `Encryption`:

```rust
            N::Decryption { detail } => Self::Decryption { detail },
```

- [ ] **Step 4: Correr los tests del paquete**

Run: `cd rust-core && cargo test -p core_financiero --lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rust-core/crates/ffi/src/lib.rs
git commit -m "feat(ffi): exponer Decryption por la frontera uniffi"
```

---

### Task 4: El contrato sube a v2.4.0

**Files:**
- Modify: `contracts/cases.json` (campo `version` y grupo nuevo `descifrado`), `contracts/messages.es.json` (campo `version` y clave `Descifrado`)

**Interfaces:**
- Consumes: el nombre de contrato `"Descifrado"` de la Task 1.
- Produces: el grupo `descifrado` con los ids `de-001`, `de-002` y `de-003`, que las tareas 5 a 9 leen en las cinco bases de código.

**Esta tarea va en un commit propio y no lleva ningún cambio de código.** Es la regla del `CLAUDE.md`: es la única forma de auditar después si el contrato se dobló para que pasara el código. El cambio es **puramente aditivo** — no se corrige ni un valor esperado existente.

- [ ] **Step 1: Agregar el grupo al contrato**

En `contracts/cases.json`, cambiar `"version": "2.3.0"` por `"version": "2.4.0"` y agregar, después del grupo `tarjeta`, el grupo nuevo:

```json
  "descifrado": [
    {
      "id": "de-001",
      "entrada": "bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd",
      "valido": true,
      "esperado": {
        "texto": "4111111111111111"
      }
    },
    {
      "id": "de-002",
      "entrada": "0dca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd",
      "valido": false,
      "error": "Descifrado"
    },
    {
      "id": "de-003",
      "entrada": "zzzz",
      "valido": false,
      "error": "Descifrado"
    }
  ]
```

`de-001` es el `cifrado_hex` de `tj-001` leído al revés: descifrarlo con `_clave_demo_hex` y `_nonce_demo_hex` devuelve el número de tarjeta original. `de-002` es ese mismo hex con el primer carácter cambiado de `b` a `0`, o sea un tag que no valida. `de-003` no es hex.

- [ ] **Step 2: Agregar el mensaje de usuario**

En `contracts/messages.es.json`, cambiar `"version": "1.1.0"` por `"version": "1.2.0"` y agregar dentro de `mensajes`, después de la clave `Cifrado`:

```json
    "Descifrado": "No se pudo descifrar el hex ingresado: revisa que esté completo y que venga de otra app de esta demo.",
```

- [ ] **Step 3: Verificar que el JSON sigue siendo válido y tiene la forma esperada**

Run:
```bash
python3 -c "
import json
c = json.load(open('contracts/cases.json'))
m = json.load(open('contracts/messages.es.json'))
grupos = ['aritmetica','cci','itf','tarjeta','transferencia','descifrado']
total = sum(len(c[g]) for g in grupos)
print('version', c['version'], '| total', total, '| claves', len(c))
print('messages', m['version'], '| mensajes', len(m['mensajes']))
"
```
Expected: `version 2.4.0 | total 31 | claves 13` y `messages 1.2.0 | mensajes 10`.

- [ ] **Step 4: Commit, con la justificación en el mensaje**

```bash
git add contracts/cases.json contracts/messages.es.json
git commit -m "feat(contracts): v2.4.0 — grupo descifrado y mensaje de usuario propio

Aditivo: no se corrige ningún valor esperado anterior. El contrato no tenía
ningún vector de descifrado fallido, así que las cuatro apps mostraban el
mensaje de cifrado cuando lo que falló era un descifrado — y ese es el caso
que la demo ejercita en vivo, pegando el hex de otra plataforma.

de-001 es el cifrado_hex de tj-001 leído al revés. de-002 es ese mismo hex
con el primer carácter cambiado, o sea un tag que no valida. de-003 no es hex.

messages.es.json sube a 1.2.0 con la clave Descifrado."
```

---

### Task 5: Las guardias y el recorrido del grupo nuevo, en Rust

**Files:**
- Modify: `rust-core/crates/ffi/tests/contract.rs:148` (versión), `:163-195` (conteo por grupo), `:208-246` (claves de primer nivel), `:255-277` (forma de `messages.es.json`), `:280-315` (cobertura de variantes), `:320-345` (casos con error)
- Create: en el mismo archivo, la función `contract_decrypt`

**Interfaces:**
- Consumes: el grupo `descifrado` de la Task 4 y `Decryption` de las tareas 1-3.
- Produces: `contract_decrypt`, el sexto `contract_*`. Las tareas 6-9 lo espejan en Kotlin, Swift y TypeScript.

- [ ] **Step 1: Correr el test de contrato y ver los rojos esperados**

Run: `cd rust-core && cargo test -p core_financiero --test contract`
Expected: FAIL en varias guardias a la vez — versión `2.3.0` vs `2.4.0`, el grupo `descifrado` como clave desconocida, y `messages.es.json` con una clave de más.

- [ ] **Step 2: Actualizar las seis guardias**

En `rust-core/crates/ffi/tests/contract.rs`:

1. `the_contract_is_the_expected_version`: `assert_eq!(field(&contract(), "version"), "2.4.0");`
2. `the_contract_has_the_expected_number_of_cases`: la tabla pasa a seis entradas y el total a 31.

```rust
    const EXPECTED: [(&str, usize); 6] = [
        ("aritmetica", 6),
        ("cci", 4),
        ("descifrado", 3),
        ("itf", 5),
        ("tarjeta", 6),
        ("transferencia", 7),
    ];
    const EXPECTED_TOTAL: usize = 31;
```

3. `the_contract_has_no_unknown_top_level_keys`: `const KNOWN: [&str; 13]` con `"descifrado"` agregado a la lista, y el comentario de arriba pasa a decir «Las trece claves del contrato v2.4.0».
4. `the_messages_file_has_the_expected_shape`: `assert_eq!(field(&m, "version"), "1.2.0");`
5. `the_messages_file_covers_the_nine_error_variants`: se renombra a `the_messages_file_covers_the_ten_error_variants` y su docstring pasa de «nueve nombres» a «diez».
6. `every_error_name_in_the_contract_has_a_user_message`:

```rust
    // Los doce casos con `error` del contrato v2.4.0, sobre siete nombres distintos:
    // 3 DigitoControl, 2 Longitud, 2 MontoInvalido, 2 Descifrado, y uno de
    // CuentaNoEncontrada, MismaCuenta y SaldoInsuficiente. Los tres nombres restantes
    // —BancoDesconocido, Cifrado y FueraDeRango— no tienen caso en el contrato, y para
    // ellos la guardia es la de arriba.
    const EXPECTED_ERROR_CASES: usize = 12;
    const EXPECTED_DISTINCT_NAMES: usize = 7;
```

- [ ] **Step 3: Escribir el recorrido del grupo nuevo**

Agregar al mismo archivo, junto a los otros `contract_*`:

```rust
/// El grupo `descifrado` del contrato: el camino de vuelta del cifrado.
///
/// Existe porque hasta v2.3.0 ninguna plataforma verificaba `decrypt` contra el
/// contrato — solo el roundtrip interno de Rust—, y porque el bloque de "pegá el hex de
/// otra app" de la pantalla de Tarjeta es exactamente lo que la demo ejercita en vivo.
#[test]
fn contract_decrypt() {
    let d = contract();
    let key = field(&d, "_clave_demo_hex");
    let nonce = field(&d, "_nonce_demo_hex");
    let mut checked = 0;

    for case in d["descifrado"].as_array().expect("falta el grupo `descifrado`") {
        let id = field(case, "id");
        let input = field(case, "entrada");
        let result = decrypt(input.clone(), key.clone(), nonce.clone());

        if case["valido"].as_bool().expect("`valido` debe ser booleano") {
            let expected = field(&case["esperado"], "texto");
            assert_eq!(
                result.expect("el caso válido no debería fallar"),
                expected,
                "caso {id}"
            );
        } else {
            let error = result.expect_err("el caso inválido no debería descifrar");
            assert_eq!(error.contract_name(), field(case, "error"), "caso {id}");
        }
        checked += 1;
    }

    // Contador, como en los otros `contract_*`: un grupo vaciado pasaría en verde sin
    // comparar un solo string.
    assert_eq!(checked, 3, "se esperaban 3 casos de descifrado y se vieron {checked}");
}
```

Si `decrypt` no está importado en el archivo, agregarlo al `use` de `core_financiero` junto a `encrypt`.

- [ ] **Step 4: Correr el test de contrato entero**

Run: `cd rust-core && cargo test -p core_financiero --test contract`
Expected: PASS. La corrida pasa de 11 a 12 tests.

- [ ] **Step 5: Correr el workspace y el linter**

Run:
```bash
cd rust-core && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all --check
```
Expected: PASS. El total sube de 67 a **71** tests: uno nuevo en `domain/error.rs` (Task 1), dos en `domain/crypto.rs` (Task 2) y uno en el test de contrato (`contract_decrypt`). Los cuatro asserts de `crypto` que cambiaron de `"Cifrado"` a `"Descifrado"` viven dentro de tests que ya existían, así que no suman.

- [ ] **Step 6: Commit**

```bash
git add rust-core/crates/ffi/tests/contract.rs
git commit -m "test(ffi): guardias de v2.4.0 y recorrido del grupo descifrado"
```

---

### Task 6: La documentación del core, que es copia gemela del contrato

**Files:**
- Modify: `rust-core/README.md` (la tabla de mensajes que las cuatro apps copian), `rust-core/FFI.md:24` (el bucle que lista los nombres), `contracts/README.md:246` (los nombres del contrato), `rust-core/CONTEXT.md` (la superficie del core, si enumera las variantes)

**Interfaces:**
- Consumes: la clave `Descifrado` de la Task 4.
- Produces: nada que otra tarea consuma. Cierra el circuito documental del core.

**Por qué es su propia tarea:** `contracts/messages.es.json` declara en su campo `_fuente` que la tabla de `rust-core/README.md` y él son el mismo texto y no pueden divergir. Si se saltea, el repo queda con dos verdades.

- [ ] **Step 1: Ubicar cada lugar que enumera los nombres de error**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && grep -rn "FueraDeRango" --include='*.md' . | grep -v node_modules
```
Expected: la lista de archivos y líneas a tocar. Cada aparición que enumere los nombres necesita `Descifrado`.

- [ ] **Step 2: Actualizar cada uno**

Agregar `Descifrado` a la tabla de `rust-core/README.md` con el texto **idéntico** al de `contracts/messages.es.json`; agregarlo al bucle de `rust-core/FFI.md:24`; y en `contracts/README.md:246` cambiar «nueve» por «diez» en la enumeración de nombres. Verificar que `contracts/README.md:298` sigue siendo correcto: los nombres **sin** caso en el contrato siguen siendo tres —`BancoDesconocido`, `Cifrado` y `FueraDeRango`—, porque `Descifrado` ahora sí tiene casos.

- [ ] **Step 3: Verificar que la tabla y el JSON dicen lo mismo**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && python3 -c "
import json
m = json.load(open('contracts/messages.es.json'))['mensajes']
readme = open('rust-core/README.md').read()
faltan = [k for k,v in m.items() if v not in readme]
print('mensajes que no aparecen literales en el README:', faltan)
"
```
Expected: `[]`.

- [ ] **Step 4: Commit**

```bash
git add rust-core/README.md rust-core/FFI.md rust-core/CONTEXT.md contracts/README.md
git commit -m "docs(rust-core): el décimo nombre de error en las tablas del núcleo"
```

---

### Task 7: El paso único para generar los artefactos de las cuatro apps

**Files:**
- Modify: `rust-core/README.md` (sección nueva), `rust-core/BUILD.md` (la secuencia completa en un solo lugar), `apps/android/README.md`, `apps/ios/README.md`, `apps/react-native/README.md`, `apps/web-angular/README.md` (un renglón cada uno, antes de sus propios pasos)

**Interfaces:**
- Consumes: el core ya en verde de las tareas 1-6.
- Produces: la secuencia documentada que las tareas 8-11 ejecutan. **Esta tarea va antes que ellas a propósito:** es la que dice cómo regenerar.

**Por qué no es una tarea Gradle:** automatizar la generación dentro del build de Android haría que Android regenerara el core en cada compilación y su pie de `coreVersion()` dejara de coincidir con el de las otras tres, cuyos artefactos están congelados. El primer paso del runbook de demo es justamente que los cuatro coincidan. Queda manual y documentado.

- [ ] **Step 1: Escribir la secuencia completa en `rust-core/BUILD.md`**

Una sección nueva, «Generar el core que consumen las cuatro apps», con los comandos **en el orden en que hay que correrlos** y qué artefacto deja cada uno: `cargo ndk` + `uniffi-bindgen kotlin` para Android, los dos targets de iOS + `xcodebuild -create-xcframework` + `uniffi-bindgen swift`, `ubrn build android|ios --and-generate` y `ubrn build web` desde `apps/react-native/`. Los comandos exactos ya están en ese archivo repartidos por plataforma: esta sección los ordena, no los inventa.

Cerrar la sección con la advertencia que la hace necesaria: **los cuatro artefactos se generan desde el mismo HEAD, o los cuatro pies de `coreVersion()` dejan de coincidir** y la comparación lado a lado de la demo deja de valer aunque las pantallas se vean bien.

- [ ] **Step 2: Apuntar desde `rust-core/README.md`**

Un renglón en el índice del README que lleve a la sección nueva de `BUILD.md`.

- [ ] **Step 3: Apuntar desde los cuatro READMEs de app**

En cada uno, antes de sus propios pasos de build, el mismo renglón: que el binario de Rust se genera primero, con enlace a `rust-core/BUILD.md`. Redacción propia de cada app, mismo contenido.

- [ ] **Step 4: Verificar que los cuatro enlaces resuelven**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && for f in apps/*/README.md; do echo "--- $f"; grep -n "rust-core/BUILD.md" "$f"; done
```
Expected: una coincidencia en cada uno de los cuatro archivos.

- [ ] **Step 5: Commit**

```bash
git add rust-core/README.md rust-core/BUILD.md apps/*/README.md
git commit -m "docs: un solo paso para generar el core, y las cuatro apps apuntando ahí"
```

---

### Task 8: Android adopta v2.4.0

**Files:**
- Regenerate: `apps/android/app/src/main/java/uniffi/core_financiero/core_financiero.kt`, `apps/android/app/src/main/jniLibs/*/libcore_financiero.so`
- Modify: `apps/android/app/src/main/java/dev/tohure/android_rust_test/adapter/ContractMessages.kt:19-30` (`contractName`), `:57-75` (`interpolate`), `apps/android/app/src/androidTest/java/dev/tohure/android_rust_test/ContractTest.kt:49`, `apps/android/app/src/androidTest/java/dev/tohure/android_rust_test/ContractAssetsTest.kt:23,33`
- Test: `apps/android/app/src/androidTest/java/dev/tohure/android_rust_test/ContractTest.kt` (función nueva), `apps/android/app/src/test/java/dev/tohure/android_rust_test/adapter/ContractMessagesTest.kt`

**Interfaces:**
- Consumes: `DomainException.Decryption` del binding regenerado, y el grupo `descifrado` del contrato.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Regenerar el binding y la librería**

Correr la secuencia de Android de `rust-core/BUILD.md` (Task 7). Expected: `core_financiero.kt` con una subclase `Decryption` nueva en `DomainException`.

- [ ] **Step 2: Compilar y ver que el `when` exhaustivo rompe**

Run: `cd apps/android && ./gradlew :app:compileDebugKotlin`
Expected: FAIL con `'when' expression must be exhaustive` en `ContractMessages.kt`. **Esto es el mecanismo funcionando**, no un accidente: el `when` sin `else` existe para que una variante nueva no pase en verde.

- [ ] **Step 3: Cerrar las dos ramas**

En `contractName()`, tras la rama de `Encryption`:

```kotlin
        is DomainException.Decryption -> "Descifrado"
```

En `interpolate()`, tras la rama de `Encryption` (el mensaje no lleva marcadores, así que devuelve el template tal cual):

```kotlin
            is DomainException.Decryption -> template
```

- [ ] **Step 4: Escribir el test JVM del mapeo**

En `ContractMessagesTest.kt`:

```kotlin
    @Test
    fun decryptionMapsToItsOwnContractName() {
        assertEquals("Descifrado", DomainException.Decryption("detalle").contractName())
        assertEquals("Cifrado", DomainException.Encryption("detalle").contractName())
    }
```

- [ ] **Step 5: Actualizar las guardias y escribir el recorrido del grupo**

Cambiar las tres asserts de versión a `"2.4.0"` (`ContractTest.kt:49`, `ContractAssetsTest.kt:23` y `:33`) y agregar a `ContractTest.kt` el espejo Kotlin de `contract_decrypt`:

```kotlin
    @Test
    fun theDecryptGroupMatches() {
        val cases = group("descifrado")
        var checked = 0
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            val id = case.getString("id")
            if (case.getBoolean("valido")) {
                assertEquals(
                    id,
                    case.getJSONObject("esperado").getString("texto"),
                    decrypt(case.getString("entrada"), keyHex(), nonceHex()),
                )
            } else {
                val e = assertThrows(DomainException::class.java) {
                    decrypt(case.getString("entrada"), keyHex(), nonceHex())
                }
                assertEquals(id, case.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 3 casos de descifrado", 3, checked)
    }
```

Si el archivo no importa `decrypt` ni `assertThrows`, agregarlos.

- [ ] **Step 6: Correr las dos suites**

Run:
```bash
cd apps/android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:connectedDebugAndroidTest
```
Expected: PASS las dos. La instrumentada sube de 15 a 16 tests. **Necesita dispositivo o emulador conectado.**

- [ ] **Step 7: Commit**

```bash
git add apps/android
git commit -m "feat(android): adoptar el contrato v2.4.0 y el error Descifrado"
```

---

### Task 9: iOS adopta v2.4.0

**Files:**
- Regenerate: `apps/ios/ios-rust-test/Generated/`, `apps/ios/CoreFinanciero.xcframework`
- Modify: el mapeo de `DomainError` → nombre de contrato de iOS (el equivalente de `ContractMessages.kt`; ubicarlo con el paso 1), `apps/ios/ios-rust-testTests/ContractTest.swift:11,19`, `apps/ios/ios-rust-testTests/ContractFixtures.swift:41`
- Test: `apps/ios/ios-rust-testTests/ContractTest.swift` (caso nuevo)

**Interfaces:**
- Consumes: `DomainError.decryption` del binding Swift regenerado, y el grupo `descifrado`.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Ubicar el mapeo y las guardias**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && grep -rn "Cifrado\|2\.3\.0" apps/ios --include='*.swift'
```
Expected: el archivo del mapeo exhaustivo, las dos asserts de versión y el nombre del suite.

- [ ] **Step 2: Regenerar el XCFramework y los bindings**

Correr la secuencia de iOS de `rust-core/BUILD.md` (Task 7). Expected: el enum Swift con el caso `decryption` nuevo.

- [ ] **Step 3: Compilar y ver que el `switch` exhaustivo rompe**

Run: `cd apps/ios && xcodebuild build -scheme ios-rust-test -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: FAIL con `switch must be exhaustive`. Mismo mecanismo que en Android.

- [ ] **Step 4: Cerrar la rama, subir la versión y espejar el recorrido**

Agregar el caso `.decryption` devolviendo `"Descifrado"` en el mapeo; cambiar `"2.3.0"` por `"2.4.0"` en `ContractTest.swift:19`, `ContractFixtures.swift:41` y el nombre del suite en `:11`; y agregar el espejo Swift de `contract_decrypt`, recorriendo el grupo `descifrado`, comparando con `#expect` y cerrando con el contador en 3, igual que hacen los otros grupos de ese archivo.

- [ ] **Step 5: Correr los tests**

Run: `cd apps/ios && xcodebuild test -scheme ios-rust-test -destination 'platform=iOS Simulator,name=iPhone 16'`
Expected: PASS. La corrida sube de 47 a 48 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/ios
git commit -m "feat(ios): adoptar el contrato v2.4.0 y el error Descifrado"
```

---

### Task 10: React Native adopta v2.4.0, por N-API y por WASM

**Files:**
- Regenerate: `apps/react-native/cpp/`, `apps/react-native/src/generated/`, el paquete WASM de `packages/core-financiero-wasm/`
- Modify: el mapeo de error de React Native (ubicarlo con el paso 1), `apps/react-native/__tests__/contract.napi.test.ts:25`, `apps/react-native/__tests__/contract.wasm.test.ts:58`
- Test: los dos archivos de contrato, con el grupo nuevo

**Interfaces:**
- Consumes: la variante `Decryption` de los bindings regenerados y el grupo `descifrado`.
- Produces: el `.wasm` v2.4.0 del que depende la Task 11. **Por eso va antes que Angular.**

- [ ] **Step 1: Ubicar el mapeo y las guardias**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && grep -rn "Cifrado\|2\.3\.0" apps/react-native --include='*.ts' --include='*.tsx' | grep -v node_modules
```

- [ ] **Step 2: Regenerar las tres salidas**

Correr la secuencia de React Native de `rust-core/BUILD.md` (Task 7): el turbo module, los bindings N-API y el paquete WASM.

- [ ] **Step 3: Subir las versiones, cerrar el mapeo y espejar el recorrido en los dos archivos**

Cambiar `'2.3.0'` por `'2.4.0'` en `contract.napi.test.ts:25` y `contract.wasm.test.ts:58`; agregar la rama `Descifrado` al mapeo de error; y agregar a **los dos** archivos el recorrido del grupo `descifrado`, con su contador en 3. Son dos caminos distintos al mismo core y los dos tienen que verificarlo.

- [ ] **Step 4: Correr la suite**

Run: `cd apps/react-native && pnpm test`
Expected: PASS. La corrida sube de 109 a 111 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/react-native packages
git commit -m "feat(react-native): adoptar el contrato v2.4.0 por N-API y por WASM"
```

---

### Task 11: Angular adopta v2.4.0

**Files:**
- Modify: el mapeo de error de Angular (ubicarlo con el paso 1), `apps/web-angular/src/app/core/contract.spec.ts:40`
- Test: `apps/web-angular/src/app/core/contract.spec.ts`

**Interfaces:**
- Consumes: el paquete WASM v2.4.0 que produjo la Task 10.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Ubicar el mapeo y la guardia**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && grep -rn "Cifrado\|2\.3\.0" apps/web-angular/src --include='*.ts'
```

- [ ] **Step 2: Subir la versión, cerrar el mapeo y espejar el recorrido**

Cambiar `'2.3.0'` por `'2.4.0'` en `contract.spec.ts:40`, agregar la rama `Descifrado` al mapeo de error y agregar el recorrido del grupo `descifrado` con su contador en 3.

- [ ] **Step 3: Correr la suite**

Run: `cd apps/web-angular && pnpm test`
Expected: PASS. La corrida sube de 99 a 100 tests.

- [ ] **Step 4: Commit**

```bash
git add apps/web-angular
git commit -m "feat(web-angular): adoptar el contrato v2.4.0 y el error Descifrado"
```

---

### Task 12: Los cuatro pies vuelven a coincidir

**Files:**
- Regenerate: los cuatro artefactos, desde el mismo HEAD
- Modify: `docs/demo-runbook.md` (si el acto de Tarjeta describe el mensaje viejo)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el cierre del bloque. El Bloque 1 arranca recién cuando esta tarea está verde.

**Por qué existe:** `coreVersion()` es `<semver>+<SHA corto>`, inyectado en compilación por `rust-core/crates/ffi/build.rs`. Las tareas 8 a 11 regeneraron cada artefacto en un commit distinto, así que los cuatro pies muestran SHAs distintos. Esta tarea los vuelve a alinear regenerando los cuatro **desde el mismo HEAD**, que es el estado que la demo necesita.

- [ ] **Step 1: Confirmar que el árbol está limpio**

Run: `cd /Users/tohure/Documents/Projects/rust-core-cross-app && git status --porcelain`
Expected: salida vacía. Si no lo está, commitear antes de regenerar: el SHA que se congela es el de HEAD.

- [ ] **Step 2: Regenerar los cuatro desde el mismo HEAD**

Correr la secuencia completa de `rust-core/BUILD.md` (Task 7), las cuatro plataformas, sin commitear nada en el medio.

- [ ] **Step 3: Verificar que el SHA embebido es el mismo en los cuatro**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && git rev-parse --short HEAD && \
strings apps/android/app/src/main/jniLibs/arm64-v8a/libcore_financiero.so | grep -o '1\.0\.0+[0-9a-f]\{7,\}' | sort -u
```
Expected: el mismo SHA en las dos salidas. Repetir el `strings` sobre el binario de iOS y sobre el `.wasm`.

- [ ] **Step 4: Verificar en pantalla, que es lo que la demo mira**

Levantar las cuatro apps y comparar el pie. Expected: el mismo string en las cuatro. Es el primer paso del runbook y no es opcional.

- [ ] **Step 5: Correr los cuatro tests de contrato una última vez**

Run:
```bash
cd rust-core && cargo test --workspace
cd ../apps/android && ./gradlew :app:connectedDebugAndroidTest
cd ../ios && xcodebuild test -scheme ios-rust-test -destination 'platform=iOS Simulator,name=iPhone 16'
cd ../react-native && pnpm test
cd ../web-angular && pnpm test
```
Expected: PASS las cinco, con los totales 71 (workspace de Rust) / 16 instrumentados en Android / 48 en iOS / 111 en React Native / 100 en Angular.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: regenerar los cuatro artefactos desde el mismo HEAD

Las tareas 8-11 regeneraron cada app en un commit distinto, así que los cuatro
pies de coreVersion() mostraban SHAs distintos. Esto los vuelve a alinear, que
es lo que el primer paso del runbook de demo verifica."
```

---

## Criterios de salida del Bloque 0

- Los cinco tests de contrato en verde contra `cases.json` v2.4.0.
- Los cuatro pies de `coreVersion()` mostrando el mismo string, verificado en pantalla.
- El cambio a `contracts/*.json` en un commit propio, sin ningún valor esperado corregido.
- `rust-core/BUILD.md` con el paso único de generación, y los cuatro READMEs apuntando ahí.
