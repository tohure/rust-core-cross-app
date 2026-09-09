# Fase 1 — `rust-core` · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** construir el núcleo de dominio en Rust que las cuatro apps consumirán sin reescribirlo, con el test golden de `contracts/cases.json` en verde.

**Architecture:** dos crates. `domain` es Rust puro con toda la lógica en módulos y no declara `uniffi`, así que un `#[uniffi::export]` ahí adentro no compila — la frontera la hace cumplir el compilador. `ffi` es el único crate exportado: aplica las macros de uniffi y traduce `domain::DomainError` con un `From`. Todo monto viaja como `String`; `rust_decimal::Decimal` nunca cruza la frontera.

**Tech Stack:** Rust 1.98.1 · `rust_decimal` 1.43 · `chacha20poly1305` 0.11 · `hex` 0.4 · `thiserror` 2.0 · `uniffi` 0.32 · `proptest` 1.11 · `serde_json` 1.0 (solo dev)

**Spec:** [`../specs/2026-09-08-phase-1-rust-core-design.md`](../specs/2026-09-08-phase-1-rust-core-design.md)

## Global Constraints

Aplican a **todas** las tareas. No se repiten en cada una.

- **Ningún `f32` ni `f64`**, en ningún lado, ni en tests. Los montos son `String` en la frontera y `Decimal` adentro.
- **Ningún `panic!`, `unwrap()` ni `expect()`** en código de producción. Todo error es `Result<_, DomainError>`. En tests sí se permite `unwrap()`.
- `#![forbid(unsafe_code)]` en la primera línea de cada `lib.rs`.
- **Cero reglas de negocio inventadas.** Si un caso no está en `contracts/cases.json`, se pregunta antes de implementar. La fuente normativa de los algoritmos es [`contracts/README.md`](../../../contracts/README.md).
- Redondeo global: **2 decimales, `RoundingStrategy::MidpointAwayFromZero`**. Verificado: `3500.00 × 0.00005 = 0.175 → "0.18"`.
- **Todo identificador va en inglés**: archivos, carpetas, crates, funciones, tipos, campos, variables, constantes y nombres de test (`validate_cci`, `execute_transfer`, `DomainError`, `Account.balance`). Las siglas peruanas `cci` e `itf` no se traducen, pero llevan prefijo en inglés (`validate_cci`, `ITF_RATE`). **Comentarios, docs de función, mensajes de error al usuario y mensajes de commit: español.** Commits en Conventional Commits, scope `rust-core`.
- **`contracts/cases.json` conserva sus claves y sus nombres de error en español** — es un archivo de datos comparado por igualdad exacta de strings, no código. El puente vive en un solo lugar: `DomainError::contract_name()` devuelve el nombre que espera el contrato.
- Gates de cada tarea antes de commitear: `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo fmt --all`.
- Sin red, sin disco, sin async, sin threads en la API pública.

---

## Correcciones de preflight (2026-09-08, antes de la Task 1)

Tres defectos del plan, encontrados y resueltos en el scan previo a la ejecución. Se
corrigieron en el texto de arriba; quedan acá anotados para que se pueda auditar qué
cambió y por qué.

1. **El crate puro se llama `domain`, no `core`.** Un paquete llamado `core` sí choca:
   dentro de `ffi` lo declara como dependencia, y el `--extern core` resultante tapa al
   `core` de la stdlib, así que `#[derive(thiserror::Error)]` —que expande a
   `::core::fmt`— no compila (`cannot find 'fmt' in 'core'`). Verificado con un workspace
   de prueba, que compila en verde tras renombrar. El cdylib **sigue** llamándose
   `core_financiero`: es el nombre que esperan las Fases 2 a 5.
2. **El chequeo del contrato de la Task 1 no usa `float`.** La restricción global de no
   usar punto flotante vale también para los scripts de verificación; se pasó a
   `decimal.Decimal`.
3. **El grep de `unwrap()`/`expect()` de la Task 13 no excluía los tests.** Filtraba la
   línea `#[cfg(test)]`, no el bloque, así que los `unwrap()` legítimos de los módulos de
   test daban falso positivo. Se reemplazó por un `awk` que corta cada archivo en su
   `#[cfg(test)]`.

---

## Estado de ejecución

**Última actualización: 2026-09-08.** Plan aprobado. **Ejecución no empezada** — ninguna
tarea completada, ninguna línea de Rust en el repo. Rama: `feat/phase-1-rust-core`.

**Para retomar:** invocar `superpowers:subagent-driven-development` y arrancar por la
**Task 1**. Un subagente fresco por tarea, revisión desde la sesión principal entre cada
una, con este reparto de modelos:

| Tarea | Modelo | Por qué |
|---|---|---|
| 1 · Contrato v2.1.0 | **Opus** | Toca valores esperados. El atajo peligroso es doblar el contrato para que pase el código, y en review es casi invisible. |
| 2 · Workspace y error | Sonnet | Código literal en el plan, verificado con `cargo build`. |
| 3 · `arithmetic` | Sonnet | Código literal + los 6 casos del contrato como oráculo. |
| 4 · `itf` | Sonnet | Ídem, 4 casos. |
| 5 · `cci` | Sonnet | Ídem, 4 casos. |
| 6 · `card` | Sonnet | Ídem, 6 casos. |
| 7 · `crypto` | Sonnet | Ídem, 3 vectores ya reproducidos en Rust. |
| 8 · `transfer` | Sonnet | Ídem, 6 casos. |
| 9 · `proptest` | Sonnet | Tests escritos en el plan. |
| 10 · `ffi` / uniffi | **Opus** | Errores de macro crípticos y uniffi 0.32 es reciente: es donde el código del plan tiene más chances de no compilar tal cual. |
| 11 · Golden | **Opus** | Es *la* evidencia de la POC. Incluye romperlo a propósito para probar que corre. |
| 12 · Smoke de bindings | **Opus** | Diagnóstico de FFI, no transcripción. |
| 13 · Docs y CONTEXT | **Opus** | Criterio: redactar el porqué de un cambio de arquitectura. |

Si una tarea se traba **dos veces en el mismo error de compilación**, subirla a Opus en vez
de dejar al subagente insistir.

**Pendiente que no bloquea:** instalar `rust-analyzer-lsp` y `security-guidance`
(`/plugin install …@claude-plugins-official`, los corre el humano). La rama se mergea a
`main` recién cuando el golden pase.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `rust-core/Cargo.toml` | Workspace y `[profile.release]` |
| `rust-core/crates/domain/src/lib.rs` | Declara los módulos y reexporta la API |
| `rust-core/crates/domain/src/error.rs` | `DomainError`, definido **una sola vez** |
| `rust-core/crates/domain/src/arithmetic.rs` | Parseo, redondeo, formateo, `add`, `subtract` |
| `rust-core/crates/domain/src/itf.rs` | `ITF_RATE` y `calculate_itf` |
| `rust-core/crates/domain/src/cci.rs` | `validate_cci` y la tabla de bancos |
| `rust-core/crates/domain/src/card.rs` | Luhn, marca, enmascarado |
| `rust-core/crates/domain/src/crypto.rs` | `encrypt` / `decrypt` |
| `rust-core/crates/domain/src/transfer.rs` | `execute_transfer`, comprobante, latencia |
| `rust-core/crates/domain/tests/properties.rs` | Property-based con `proptest` |
| `rust-core/crates/ffi/Cargo.toml` | cdylib `core_financiero` + bin `uniffi-bindgen` |
| `rust-core/crates/ffi/build.rs` | Inyecta versión + SHA de git |
| `rust-core/crates/ffi/src/lib.rs` | `uniffi::export`, Records, `From<domain::DomainError>` |
| `rust-core/crates/ffi/tests/golden.rs` | Corre `contracts/cases.json` |
| `rust-core/README.md` | Gate de fase: diagrama Mermaid + comandos ejecutados |

**El golden va dentro del paquete `ffi`.** Verificado: un `tests/` en la raíz de un workspace sin paquete raíz **nunca se compila ni se ejecuta**; puesto ahí, el test golden habría "pasado" sin correr jamás.

---

## Task 1: Contrato v2.1.0 — los dos campos que faltaban

Va **primero y en su propio commit**: el criterio de aceptación se escribe antes que la implementación, y `CLAUDE.md` exige que los cambios de contrato no se mezclen con cambios al core.

**Files:**
- Modify: `contracts/cases.json`
- Modify: `contracts/README.md`

**Interfaces:**
- Produces: los esperados `comprobante` y `latencia_simulada_ms` que consumen la Task 8 y la Task 11.

- [ ] **Step 1: Agregar los dos campos a los casos válidos de `transferencia`**

En `tr-001`, dentro de `esperado`, junto a `total_debitado`:

```json
        "comprobante": "TRF-9047-1065-10000",
        "latencia_simulada_ms": 350
```

En `tr-002`:

```json
        "comprobante": "TRF-9047-1065-350000",
        "latencia_simulada_ms": 750
```

Y subir la versión del archivo:

```json
  "version": "2.1.0",
```

- [ ] **Step 2: Documentar las derivaciones en `contracts/README.md`**

Dentro de la sección `### Transferencia`, después del pseudocódigo:

```markdown
Dos salidas más, ambas **deterministas** — `ejecutar_transferencia` es pura, así que no
pueden depender de reloj ni de azar: si lo hicieran, las cuatro apps mostrarían valores
distintos lado a lado, que es lo contrario de lo que la POC prueba.

    comprobante          = "TRF-" + ultimos4(origen) + "-" + ultimos4(destino) + "-" + centavos(monto)
    latencia_simulada_ms = 250 + min(parte_entera(monto), 500)

`centavos(monto)` es el monto redondeado a 2 decimales por 100, sin decimales. La latencia
crece con el monto y está topeada en 750 ms: montos grandes "tardan más", y lo decide el
core, no la app.
```

- [ ] **Step 3: Verificar el JSON y los valores**

Run:
```bash
python3 -c "
import json
from decimal import Decimal      # sin float: la regla vale tambien para los chequeos
d=json.load(open('contracts/cases.json'))
assert d['version']=='2.1.0', d['version']
for c in d['transferencia']:
    if not c['valido']: continue
    e=c['esperado']
    m=Decimal(c['entrada']['monto']); o=c['entrada']['origen']; dst=c['entrada']['destino']
    cent=int(m*100)
    assert e['comprobante']==f'TRF-{o[-4:]}-{dst[-4:]}-{cent}', (c['id'], e['comprobante'])
    assert e['latencia_simulada_ms']==250+min(int(m),500), (c['id'], e['latencia_simulada_ms'])
print('contrato v2.1.0 coherente con las derivaciones')
"
```
Expected: `contrato v2.1.0 coherente con las derivaciones`

- [ ] **Step 4: Commit**

```bash
git add contracts/cases.json contracts/README.md
git commit -m "$(cat <<'MSG'
feat(contracts): agregar comprobante y latencia al contrato, v2.1.0

ResultadoTransferencia devolvia dos campos que no existian en el
contrato. Como ejecutar_transferencia es pura, tienen que estar
determinados por la entrada: si no, las cuatro apps mostrarian
comprobantes distintos lado a lado.

    comprobante          = TRF- + ultimos4(origen) + ultimos4(destino) + centavos
    latencia_simulada_ms = 250 + min(parte_entera(monto), 500)

Minor: se agrega cobertura, no se corrige ningun esperado existente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: Workspace, los dos crates y `DomainError`

**Files:**
- Create: `rust-core/Cargo.toml`, `rust-core/crates/domain/Cargo.toml`, `rust-core/crates/domain/src/lib.rs`, `rust-core/crates/domain/src/error.rs`
- Create: `rust-core/crates/ffi/Cargo.toml`, `rust-core/crates/ffi/src/lib.rs`, `rust-core/crates/ffi/uniffi-bindgen.rs`

**Interfaces:**
- Produces: `domain::error::DomainError` con las nueve variantes y `DomainError::contract_name() -> &'static str`, que usan todas las tareas siguientes y el golden para comparar contra el campo `error` de `cases.json`.

- [ ] **Step 1: Crear el workspace**

`rust-core/Cargo.toml`:

```toml
[workspace]
resolver = "2"
members = ["crates/domain", "crates/ffi"]

[workspace.package]
version = "1.0.0"
edition = "2021"
rust-version = "1.98"

[workspace.dependencies]
rust_decimal = "1.43"
chacha20poly1305 = "0.11"
hex = "0.4"
thiserror = "2.0"
uniffi = "0.32"
proptest = "1.11"
serde_json = "1.0"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
panic = "unwind"   # NO cambiar a abort: desactiva el catch_unwind de uniffi
```

`rust-core/crates/domain/Cargo.toml` — **no declara uniffi, a propósito**:

```toml
[package]
name = "domain"
version.workspace = true
edition.workspace = true
rust-version.workspace = true

[dependencies]
rust_decimal = { workspace = true }
chacha20poly1305 = { workspace = true }
hex = { workspace = true }
thiserror = { workspace = true }

[dev-dependencies]
proptest = { workspace = true }
```

`rust-core/crates/ffi/Cargo.toml`:

```toml
[package]
name = "core_financiero"
version.workspace = true
edition.workspace = true
rust-version.workspace = true

[lib]
crate-type = ["cdylib", "lib"]

[[bin]]
name = "uniffi-bindgen"
path = "uniffi-bindgen.rs"

[dependencies]
domain = { path = "../domain" }
uniffi = { workspace = true, features = ["cli"] }
thiserror = { workspace = true }

[dev-dependencies]
serde_json = { workspace = true }
```

`rust-core/crates/ffi/uniffi-bindgen.rs`:

```rust
fn main() {
    uniffi::uniffi_bindgen_main()
}
```

- [ ] **Step 2: Escribir el test que falla**

`rust-core/crates/domain/src/error.rs`, al final del archivo:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_contract_name_matches_the_contract() {
        // Los strings del campo "error" de contracts/cases.json.
        assert_eq!(DomainError::SameAccount.contract_name(), "MismaCuenta");
        assert_eq!(DomainError::CheckDigit.contract_name(), "DigitoControl");
        assert_eq!(
            DomainError::Length { field: "cci".into(), expected: 20, received: 18 }.contract_name(),
            "Longitud"
        );
        assert_eq!(
            DomainError::AccountNotFound { id: "x".into() }.contract_name(),
            "CuentaNoEncontrada"
        );
        assert_eq!(
            DomainError::InsufficientFunds { available: "1.00".into(), required: "2.00".into() }.contract_name(),
            "SaldoInsuficiente"
        );
        assert_eq!(
            DomainError::InvalidAmount { detail: "cero".into() }.contract_name(),
            "MontoInvalido"
        );
    }
}
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd rust-core && cargo test -p domain`
Expected: FAIL — `cannot find type DomainError` / `no method named contract_name`

- [ ] **Step 4: Implementar `DomainError`**

Arriba del bloque de tests en `rust-core/crates/domain/src/error.rs`:

```rust
use thiserror::Error;

/// El único tipo de error del núcleo. Se define aquí una sola vez; el crate `ffi`
/// lo expone a uniffi con un `From`, para que este crate no dependa de uniffi.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum DomainError {
    #[error("longitud inválida en {field}: se esperaban {expected} dígitos, llegaron {received}")]
    Length { field: String, expected: u32, received: u32 },

    #[error("dígito de control inválido")]
    CheckDigit,

    #[error("banco no reconocido: {code}")]
    UnknownBank { code: String },

    #[error("monto inválido: {detail}")]
    InvalidAmount { detail: String },

    #[error("cuenta no encontrada: {id}")]
    AccountNotFound { id: String },

    #[error("origen y destino son la misma cuenta")]
    SameAccount,

    #[error("saldo insuficiente: disponible {available}, requerido {required}")]
    InsufficientFunds { available: String, required: String },

    #[error("error de cifrado: {detail}")]
    Encryption { detail: String },

    #[error("parámetro fuera de rango: {field}")]
    OutOfRange { field: String },
}

impl DomainError {
    /// Nombre de la variante, para comparar contra el campo `error` de
    /// `contracts/cases.json`. El contrato identifica el error por nombre, no por mensaje.
    pub fn contract_name(&self) -> &'static str {
        match self {
            Self::Length { .. } => "Longitud",
            Self::CheckDigit => "DigitoControl",
            Self::UnknownBank { .. } => "BancoDesconocido",
            Self::InvalidAmount { .. } => "MontoInvalido",
            Self::AccountNotFound { .. } => "CuentaNoEncontrada",
            Self::SameAccount => "MismaCuenta",
            Self::InsufficientFunds { .. } => "SaldoInsuficiente",
            Self::Encryption { .. } => "Cifrado",
            Self::OutOfRange { .. } => "FueraDeRango",
        }
    }
}
```

`rust-core/crates/domain/src/lib.rs`:

```rust
#![forbid(unsafe_code)]

pub mod error;

pub use error::DomainError;
```

`rust-core/crates/ffi/src/lib.rs` — por ahora solo el andamiaje, para que el workspace compile:

```rust
#![forbid(unsafe_code)]

uniffi::setup_scaffolding!();
```

- [ ] **Step 5: Correr los gates**

Run:
```bash
cd rust-core
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```
Expected: test PASS, clippy sin warnings.

- [ ] **Step 6: Verificar que el compilador hace cumplir la frontera**

Este paso prueba la tesis arquitectónica de la fase. Agregar temporalmente a `crates/domain/src/lib.rs`:

```rust
#[uniffi::export]
pub fn should_not_compile() {}
```

Run: `cargo build -p domain`
Expected: **FAIL** con `failed to resolve: use of undeclared crate or module 'uniffi'`.
Luego **borrar esas tres líneas** y volver a correr `cargo build -p domain`: debe pasar.

- [ ] **Step 7: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): workspace de dos crates y DomainError

domain no declara uniffi, asi que un uniffi::export ahi adentro no compila:
la frontera que la POC argumenta la hace cumplir el compilador, no la
disciplina. Verificado en el paso 6 del plan.

DomainError se define una sola vez, con contract_name() para que el golden
compare contra el campo error de cases.json. Los identificadores son
ingles; contract_name() devuelve el nombre en espanol del contrato, que es
un archivo de datos y no se traduce.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `arithmetic.rs` — parseo, redondeo, `add` y `subtract`

Es la base de todo lo demás: `itf` y `transfer` usan su parseo y su formateo.

**Files:**
- Create: `rust-core/crates/domain/src/arithmetic.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub fn add(a: &str, b: &str) -> Result<String, DomainError>`
  - `pub fn subtract(a: &str, b: &str) -> Result<String, DomainError>`
  - `pub(crate) fn parse_amount(value: &str, field: &str) -> Result<Decimal, DomainError>`
  - `pub(crate) fn round_amount(value: Decimal) -> Decimal`
  - `pub(crate) fn format_amount(value: Decimal) -> String`

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/arithmetic.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Los seis casos del grupo `aritmetica` de contracts/cases.json.
    // Los seis divergen bajo IEEE-754; ese es el punto de la pantalla.
    #[test]
    fn adds_the_contract_cases() {
        assert_eq!(add("0.1", "0.2").unwrap(), "0.30");            // ar-001
        assert_eq!(add("0.7", "0.1").unwrap(), "0.80");            // ar-002
        assert_eq!(add("1000000.10", "0.20").unwrap(), "1000000.30"); // ar-003
    }

    #[test]
    fn subtracts_the_contract_cases() {
        assert_eq!(subtract("1.00", "0.90").unwrap(), "0.10");   // ar-004
        assert_eq!(subtract("100.00", "99.99").unwrap(), "0.01"); // ar-005
        assert_eq!(subtract("82.35", "12.34").unwrap(), "70.01"); // ar-006
    }

    #[test]
    fn the_output_always_has_two_decimals() {
        assert_eq!(add("1", "1").unwrap(), "2.00");
        assert_eq!(add("0", "0").unwrap(), "0.00");
    }

    #[test]
    fn non_amount_text_errors_without_panicking() {
        assert_eq!(add("hola", "1").unwrap_err().contract_name(), "MontoInvalido");
        assert_eq!(subtract("1", "").unwrap_err().contract_name(), "MontoInvalido");
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain arithmetic`
Expected: FAIL — `cannot find function add`

- [ ] **Step 3: Implementar**

Arriba del bloque de tests en `arithmetic.rs`:

```rust
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
    let r = x.checked_add(y).ok_or(DomainError::OutOfRange { field: "suma".into() })?;
    Ok(format_amount(r))
}

pub fn subtract(a: &str, b: &str) -> Result<String, DomainError> {
    let x = parse_amount(a, "a")?;
    let y = parse_amount(b, "b")?;
    let r = x.checked_sub(y).ok_or(DomainError::OutOfRange { field: "resta".into() })?;
    Ok(format_amount(r))
}
```

En `lib.rs`, agregar:

```rust
pub mod arithmetic;

pub use arithmetic::{subtract, add};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS, clippy limpio.

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): aritmetica decimal con redondeo del contrato

add y subtract sobre rust_decimal, redondeo a 2 decimales
MidpointAwayFromZero. Los seis casos del grupo aritmetica de cases.json
pasan; los seis divergen bajo IEEE-754, que es lo que la pantalla exhibe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `itf.rs` — la alícuota como constante nombrada

**Files:**
- Create: `rust-core/crates/domain/src/itf.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub const ITF_RATE: &str`
  - `pub fn calculate_itf(amount: &str) -> Result<String, DomainError>`
  - `pub(crate) fn rounded_itf(amount: Decimal) -> Result<Decimal, DomainError>` — lo consume la Task 8.

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/itf.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Los cinco casos del grupo `itf` de contracts/cases.json.
    #[test]
    fn calculates_the_contract_cases() {
        assert_eq!(calculate_itf("1000.00").unwrap(), "0.05");  // itf-001
        assert_eq!(calculate_itf("3500.00").unwrap(), "0.18");  // itf-002
        assert_eq!(calculate_itf("150.00").unwrap(), "0.01");   // itf-003
        assert_eq!(calculate_itf("87654.32").unwrap(), "4.38"); // itf-004
        assert_eq!(calculate_itf("2500.00").unwrap(), "0.13");  // itf-005
    }

    #[test]
    fn rounds_half_away_from_zero_not_to_even() {
        // 2500.00 * 0.00005 = 0.125 exacto: medio hacia afuera del cero da 0.13, y
        // banker's rounding daría 0.12 porque el 2 es par. ESTE es el caso que
        // distingue las dos estrategias.
        assert_eq!(calculate_itf("2500.00").unwrap(), "0.13"); // itf-005
        // 3500.00 * 0.00005 = 0.175 exacto, pero acá las dos estrategias coinciden
        // en 0.18 (el 8 es par). No discrimina; queda por ser caso del contrato.
        assert_eq!(calculate_itf("3500.00").unwrap(), "0.18"); // itf-002
    }

    #[test]
    fn invalid_text_errors_without_panicking() {
        assert_eq!(calculate_itf("no-soy-un-monto").unwrap_err().contract_name(), "MontoInvalido");
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain itf`
Expected: FAIL — `cannot find function calculate_itf`

- [ ] **Step 3: Implementar**

```rust
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
    let rate = Decimal::from_str(ITF_RATE)
        .map_err(|_| DomainError::OutOfRange { field: "alicuota".into() })?;
    let raw = amount
        .checked_mul(rate)
        .ok_or(DomainError::OutOfRange { field: "itf".into() })?;
    Ok(round_amount(raw))
}

pub fn calculate_itf(amount: &str) -> Result<String, DomainError> {
    let m = parse_amount(amount, "monto")?;
    Ok(format_amount(rounded_itf(m)?))
}
```

En `lib.rs`:

```rust
pub mod itf;

pub use itf::{calculate_itf, ITF_RATE};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): calculo del ITF con la alicuota como constante nombrada

Los cinco casos del grupo itf de cases.json pasan, incluido itf-005
(0.125 -> 0.13), que es el unico que distingue MidpointAwayFromZero de
banker's rounding: itf-002 (0.175 -> 0.18) da lo mismo bajo las dos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `cci.rs` — validación del CCI y tabla de bancos

**Files:**
- Create: `rust-core/crates/domain/src/cci.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub struct ValidCci { pub bank_code: String, pub bank_name: String, pub branch: String, pub account: String }`
  - `pub fn validate_cci(cci: &str) -> Result<ValidCci, DomainError>`

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/cci.rs`:

```rust
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
        assert_eq!(validate_cci("00219100123456789048").unwrap_err().contract_name(), "DigitoControl");
    }

    #[test]
    fn rejects_a_bad_length() {
        // cci-004: 18 digitos.
        assert_eq!(validate_cci("002191001234567890").unwrap_err().contract_name(), "Longitud");
    }

    #[test]
    fn rejects_a_bank_outside_the_table() {
        // Todo ceros pasa el digito de control (la suma ponderada da 0) pero el banco
        // 000 no esta en la tabla. Es el destino de tr-004 y por eso la transferencia
        // NO valida CCI: el contrato exige ahi CuentaNoEncontrada, no BancoDesconocido.
        assert_eq!(validate_cci("00000000000000000000").unwrap_err().contract_name(), "BancoDesconocido");
    }

    #[test]
    fn never_panics_with_arbitrary_text() {
        for input in ["", "abc", "ñ", "0021910012345678904x", "0".repeat(500).as_str()] {
            let _ = validate_cci(input); // solo debe no romper
        }
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain cci`
Expected: FAIL — `cannot find function validate_cci`

- [ ] **Step 3: Implementar**

```rust
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
    let digits: Vec<u32> = match cci.chars().map(|c| c.to_digit(10)).collect::<Option<Vec<_>>>() {
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
        .ok_or_else(|| DomainError::UnknownBank { code: bank_code.to_string() })?;

    Ok(ValidCci {
        bank_code: bank_code.to_string(),
        bank_name: bank_name.to_string(),
        branch: cci[3..6].to_string(),
        account: cci[6..18].to_string(),
    })
}
```

> El indexado por bytes (`cci[0..3]`) es seguro acá: llegado este punto ya se verificó que los 20 caracteres son dígitos ASCII.

En `lib.rs`:

```rust
pub mod cci;

pub use cci::{validate_cci, ValidCci};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): validacion de CCI con digitos de control

Los cuatro casos del grupo cci de cases.json, mas el caso de banco fuera
de tabla que documenta por que execute_transfer NO valida CCI: el
destino de tr-004 pasa el digito de control pero el contrato exige
CuentaNoEncontrada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `card.rs` — Luhn, marca y enmascarado

**Files:**
- Create: `rust-core/crates/domain/src/card.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub struct ValidCard { pub brand: String, pub masked: String }`
  - `pub fn validate_card(number: &str) -> Result<ValidCard, DomainError>`

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/card.rs`:

```rust
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
        assert_eq!(validate_card("4111111111111112").unwrap_err().contract_name(), "DigitoControl"); // tj-004
        assert_eq!(validate_card("1234567890123456").unwrap_err().contract_name(), "DigitoControl"); // tj-005
    }

    #[test]
    fn rejects_a_bad_length() {
        assert_eq!(validate_card("41111").unwrap_err().contract_name(), "Longitud"); // tj-006
    }

    #[test]
    fn never_panics_with_arbitrary_text() {
        for input in ["", "abcd", "ñññññññññññññ", "4111-1111-1111-1111"] {
            let _ = validate_card(input);
        }
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain card`
Expected: FAIL — `cannot find function validate_card`

- [ ] **Step 3: Implementar**

```rust
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
    sum % 10 == 0
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

    let digits: Vec<u32> = match number.chars().map(|c| c.to_digit(10)).collect::<Option<Vec<_>>>() {
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
    let brand = brand(number).ok_or_else(|| DomainError::OutOfRange { field: "marca".into() })?;

    let length = number.len();
    Ok(ValidCard {
        brand: brand.to_string(),
        masked: format!("{} **** **** {}", &number[..4], &number[length - 4..]),
    })
}
```

En `lib.rs`:

```rust
pub mod card;

pub use card::{validate_card, ValidCard};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): validacion de tarjeta con Luhn, marca y enmascarado

Los seis casos del grupo tarjeta de cases.json. Un prefijo desconocido
que pase Luhn devuelve FueraDeRango en vez de inventar una marca: no hay
caso en el contrato y no se inventan reglas de negocio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `crypto.rs` — ChaCha20-Poly1305

La API de `chacha20poly1305` 0.11 está **verificada**: `Key::from_slice` y `Nonce::from_slice` están deprecados y harían fallar `clippy -D warnings`. Se usa `try_into`.

**Files:**
- Create: `rust-core/crates/domain/src/crypto.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub fn encrypt(text: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError>`
  - `pub fn decrypt(ciphertext_hex: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError>`

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/crypto.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const CLAVE: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const NONCE: &str = "000102030405060708090a0b";

    // Vectores del grupo `tarjeta` de contracts/cases.json. Se derivaron con la
    // stdlib de Node 22, o sea son independientes de Rust: que Rust los reproduzca
    // es evidencia real, no un snapshot de si mismo.
    #[test]
    fn reproduces_the_contract_vectors() {
        assert_eq!(
            encrypt("4111111111111111", CLAVE, NONCE).unwrap(),
            "bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd"
        );
        assert_eq!(
            encrypt("5555555555554444", CLAVE, NONCE).unwrap(),
            "bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036"
        );
        assert_eq!(
            encrypt("378282246310005", CLAVE, NONCE).unwrap(),
            "bacc30321125977481b00ec3a82d3b43191141e9da8b2ad948e1c7b3a8ee5e"
        );
    }

    #[test]
    fn roundtrip_returns_the_original() {
        let ciphertext = encrypt("4111111111111111", CLAVE, NONCE).unwrap();
        assert_eq!(decrypt(&ciphertext, CLAVE, NONCE).unwrap(), "4111111111111111");
    }

    #[test]
    fn a_wrong_length_key_errors_without_panicking() {
        assert_eq!(encrypt("x", "0001", NONCE).unwrap_err().contract_name(), "Cifrado");
    }

    #[test]
    fn invalid_hex_errors_without_panicking() {
        assert_eq!(encrypt("x", "zzzz", NONCE).unwrap_err().contract_name(), "Cifrado");
        assert_eq!(decrypt("zzzz", CLAVE, NONCE).unwrap_err().contract_name(), "Cifrado");
    }

    #[test]
    fn a_tampered_tag_does_not_decrypt() {
        let mut ciphertext = encrypt("4111111111111111", CLAVE, NONCE).unwrap();
        ciphertext.replace_range(0..1, "0");
        assert!(decrypt(&ciphertext, CLAVE, NONCE).is_err());
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain crypto`
Expected: FAIL — `cannot find function encrypt`

- [ ] **Step 3: Implementar**

```rust
use crate::error::DomainError;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};

fn error(detail: &str) -> DomainError {
    DomainError::Encryption { detail: detail.to_string() }
}

/// El nonce entra como parámetro y **no** se genera acá: generarlo pediría entropía del
/// sistema (una syscall), lo que rompería la pureza, y haría la salida no determinista,
/// o sea no comparable entre plataformas — que es justo lo que el contrato prueba.
///
/// ⚠️ Reutilizar el par (clave, nonce) es catastrófico en producción. Acá es a propósito.
fn prepare(key_hex: &str, nonce_hex: &str) -> Result<(ChaCha20Poly1305, Vec<u8>), DomainError> {
    let key = hex::decode(key_hex.trim()).map_err(|_| error("la clave no es hex válido"))?;
    let nonce = hex::decode(nonce_hex.trim()).map_err(|_| error("el nonce no es hex válido"))?;
    let key: &Key = key
        .as_slice()
        .try_into()
        .map_err(|_| error("la clave debe tener 32 bytes"))?;
    if nonce.len() != 12 {
        return Err(error("el nonce debe tener 12 bytes"));
    }
    Ok((ChaCha20Poly1305::new(key), nonce))
}

pub fn encrypt(text: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex)?;
    let nonce: &Nonce = nonce.as_slice().try_into().map_err(|_| error("nonce inválido"))?;
    let output = cipher
        .encrypt(nonce, text.as_bytes())
        .map_err(|_| error("no se pudo cifrar"))?;
    Ok(hex::encode(output))
}

pub fn decrypt(ciphertext_hex: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex)?;
    let nonce: &Nonce = nonce.as_slice().try_into().map_err(|_| error("nonce inválido"))?;
    let bytes = hex::decode(ciphertext_hex.trim()).map_err(|_| error("el cifrado no es hex válido"))?;
    let plain = cipher
        .decrypt(nonce, bytes.as_slice())
        .map_err(|_| error("no se pudo descifrar: clave, nonce o tag incorrectos"))?;
    String::from_utf8(plain).map_err(|_| error("el texto descifrado no es UTF-8"))
}
```

En `lib.rs`:

```rust
pub mod crypto;

pub use crypto::{encrypt, decrypt};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): cifrado ChaCha20-Poly1305 con nonce como parametro

Reproduce los tres vectores del contrato, derivados con la stdlib de
Node 22 e independientes de Rust. El nonce entra como parametro: no se
necesita entropia del sistema (se mantiene la pureza) y la salida es
determinista, o sea comparable entre las cuatro plataformas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: `transfer.rs` — la transferencia como función pura

**Files:**
- Create: `rust-core/crates/domain/src/transfer.rs`
- Modify: `rust-core/crates/domain/src/lib.rs`

**Interfaces:**
- Consumes: `arithmetic::{parse_amount, round_amount, format_amount}` (Task 3), `itf::rounded_itf` (Task 4).
- Produces:
  - `pub struct Account { pub id: String, pub holder: String, pub balance: String }`
  - `pub struct TransferRequest { pub origin: String, pub destination: String, pub amount: String }`
  - `pub struct TransferResult { pub accounts: Vec<Account>, pub itf_fee: String, pub total_debited: String, pub receipt: String, pub simulated_latency_ms: u32 }`
  - `pub fn execute_transfer(accounts: Vec<Account>, request: TransferRequest) -> Result<TransferResult, DomainError>`

- [ ] **Step 1: Escribir los tests que fallan**

`rust-core/crates/domain/src/transfer.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // `initial_accounts` de contracts/cases.json.
    fn accounts() -> Vec<Account> {
        vec![
            Account { id: "00219100123456789047".into(), holder: "Ana Quispe".into(), balance: "5000.00".into() },
            Account { id: "01122000987654321065".into(), holder: "Luis Ramos".into(), balance: "1200.50".into() },
        ]
    }

    fn request(origin: &str, destination: &str, amount: &str) -> TransferRequest {
        TransferRequest { origin: origin.into(), destination: destination.into(), amount: amount.into() }
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

    #[test]
    fn does_not_mutate_the_input_accounts() {
        let originales = accounts();
        let _ = execute_transfer(
            originales.clone(),
            request("00219100123456789047", "01122000987654321065", "100.00"),
        );
        assert_eq!(originales[0].balance, "5000.00");
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p domain transfer`
Expected: FAIL — `cannot find function execute_transfer`

- [ ] **Step 3: Implementar**

```rust
use crate::arithmetic::{format_amount, parse_amount, round_amount};
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
        .ok_or(DomainError::OutOfRange { field: "comprobante".into() })?;
    Ok(format!("TRF-{}-{}-{}", last4(origin), last4(destination), cents))
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
        .ok_or_else(|| DomainError::AccountNotFound { id: request.origin.clone() })?;
    let i_destination = accounts
        .iter()
        .position(|c| c.id == request.destination)
        .ok_or_else(|| DomainError::AccountNotFound { id: request.destination.clone() })?;

    let amount = parse_amount(&request.amount, "monto")?;
    if amount <= Decimal::ZERO {
        return Err(DomainError::InvalidAmount {
            detail: "el monto debe ser mayor que cero".into(),
        });
    }

    let fee = rounded_itf(amount)?;
    let total = round_amount(
        amount
            .checked_add(fee)
            .ok_or(DomainError::OutOfRange { field: "total".into() })?,
    );

    let origin_balance = parse_amount(&accounts[i_origin].balance, "saldo origen")?;
    if origin_balance < total {
        return Err(DomainError::InsufficientFunds {
            available: format_amount(origin_balance),
            required: format_amount(total),
        });
    }
    let destination_balance = parse_amount(&accounts[i_destination].balance, "saldo destino")?;

    // Entra el estado, sale el estado nuevo: la entrada no se muta.
    let mut updated = accounts.clone();
    updated[i_origin].balance = format_amount(
        origin_balance
            .checked_sub(total)
            .ok_or(DomainError::OutOfRange { field: "saldo origen".into() })?,
    );
    updated[i_destination].balance = format_amount(
        destination_balance
            .checked_add(amount)
            .ok_or(DomainError::OutOfRange { field: "saldo destino".into() })?,
    );

    Ok(TransferResult {
        accounts: updated,
        itf_fee: format_amount(fee),
        total_debited: format_amount(total),
        receipt: receipt(&request.origin, &request.destination, amount)?,
        simulated_latency_ms: simulated_latency(amount),
    })
}
```

En `lib.rs`:

```rust
pub mod transfer;

pub use transfer::{
    execute_transfer, Account, TransferResult, TransferRequest,
};
```

- [ ] **Step 4: Correr los tests**

Run: `cd rust-core && cargo test -p domain && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS — los seis casos de `transferencia` en verde.

- [ ] **Step 5: Commit**

```bash
git add rust-core/
git commit -m "feat(rust-core): transferencia como funcion pura de estado

Entra el estado, sale el estado nuevo, como un reducer: sin BD, sin
cache, sin red. Los seis casos del grupo transferencia de cases.json,
mas comprobante y latencia deterministas del contrato v2.1.0.

El orden de validaciones lo fija contracts/README.md y lo verifican
tr-003 a tr-006.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Property-based tests

Las invariantes que los ejemplos no cubren. Es lo que Rust aporta y que el argumento de robustez necesita.

**Files:**
- Create: `rust-core/crates/domain/tests/properties.rs`

**Interfaces:**
- Consumes: toda la API pública de `domain` (Tasks 3-8).

- [ ] **Step 1: Escribir los tests**

`rust-core/crates/domain/tests/properties.rs`:

```rust
use domain::{encrypt, decrypt, execute_transfer, validate_cci, validate_card};
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
```

- [ ] **Step 2: Correr los tests**

Run: `cd rust-core && cargo test -p domain --test properties`
Expected: PASS. Si `proptest` encuentra un contraejemplo lo guarda en
`crates/domain/proptest-regressions/` — **ese archivo se commitea**, es el caso que hizo
fallar y no debe perderse.

- [ ] **Step 3: Correr todos los gates**

Run: `cd rust-core && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add rust-core/
git commit -m "test(rust-core): invariantes con proptest

Conservacion del dinero, ningun saldo negativo, roundtrip del cifrado, y
el test de seguridad: validate_cci, validate_card y decrypt nunca
entran en panico con texto arbitrario. Reciben input del usuario a traves
del FFI, asi que un panico ahi es un crash de la app del banco.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: El crate `ffi` — la fachada uniffi

API de uniffi 0.32 **verificada**: `setup_scaffolding!`, `#[derive(uniffi::Record)]`, enum de error con campos y `Vec<Account>` cruzando la frontera compilan y pasan clippy.

**Files:**
- Create: `rust-core/crates/ffi/build.rs`
- Modify: `rust-core/crates/ffi/src/lib.rs`

**Interfaces:**
- Consumes: toda la API pública de `domain`.
- Produces: la superficie FFI completa que consumen las cuatro apps y el golden de la Task 11.

- [ ] **Step 1: Escribir el test que falla**

Al final de `rust-core/crates/ffi/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_version_has_semver_and_sha() {
        let v = core_version();
        assert!(v.contains('+'), "core_version debe ser <semver>+<sha>, fue {v}");
        assert!(v.starts_with("1.0.0"), "fue {v}");
    }

    #[test]
    fn the_domain_error_translates_preserving_its_name() {
        let e: DomainError = domain::DomainError::SameAccount.into();
        assert_eq!(e.contract_name(), "MismaCuenta");
        let e: DomainError = domain::DomainError::InsufficientFunds {
            available: "1.00".into(),
            required: "2.00".into(),
        }
        .into();
        assert_eq!(e.contract_name(), "SaldoInsuficiente");
    }

    #[test]
    fn the_public_api_responds() {
        assert_eq!(add("0.1".into(), "0.2".into()).unwrap(), "0.30");
        assert_eq!(calculate_itf("3500.00".into()).unwrap(), "0.18");
        assert_eq!(validate_card("4111111111111111".into()).unwrap().brand, "Visa");
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd rust-core && cargo test -p core_financiero`
Expected: FAIL — `cannot find function core_version`

- [ ] **Step 3: Escribir `build.rs`**

`rust-core/crates/ffi/build.rs`:

```rust
use std::process::Command;

/// Inyecta el SHA de git en compilación. `core_version()` devuelve versión + SHA para
/// que cuatro strings idénticos en pantalla sean evidencia de que las cuatro apps corren
/// el mismo build — un semver escrito a mano no probaría nada.
///
/// Esto es I/O en **tiempo de compilación**, no en runtime: la regla de funciones puras
/// es sobre la API pública.
fn main() {
    let sha = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "sin-git".to_string());

    println!("cargo:rustc-env=GIT_SHA={sha}");
    println!("cargo:rerun-if-changed=../../../.git/HEAD");
}
```

- [ ] **Step 4: Escribir la fachada**

`rust-core/crates/ffi/src/lib.rs`, arriba del bloque de tests:

```rust
#![forbid(unsafe_code)]

uniffi::setup_scaffolding!();

// ---------- error: se define en `domain` una sola vez y acá se le pone la piel de uniffi

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, uniffi::Error)]
pub enum DomainError {
    #[error("longitud inválida en {field}: se esperaban {expected} dígitos, llegaron {received}")]
    Length { field: String, expected: u32, received: u32 },
    #[error("dígito de control inválido")]
    CheckDigit,
    #[error("banco no reconocido: {code}")]
    UnknownBank { code: String },
    #[error("monto inválido: {detail}")]
    InvalidAmount { detail: String },
    #[error("cuenta no encontrada: {id}")]
    AccountNotFound { id: String },
    #[error("origen y destino son la misma cuenta")]
    SameAccount,
    #[error("saldo insuficiente: disponible {available}, requerido {required}")]
    InsufficientFunds { available: String, required: String },
    #[error("error de cifrado: {detail}")]
    Encryption { detail: String },
    #[error("parámetro fuera de rango: {field}")]
    OutOfRange { field: String },
}

impl DomainError {
    /// Espejo de `domain::DomainError::contract_name()`. Lo usa el golden.
    pub fn contract_name(&self) -> &'static str {
        match self {
            Self::Length { .. } => "Longitud",
            Self::CheckDigit => "DigitoControl",
            Self::UnknownBank { .. } => "BancoDesconocido",
            Self::InvalidAmount { .. } => "MontoInvalido",
            Self::AccountNotFound { .. } => "CuentaNoEncontrada",
            Self::SameAccount => "MismaCuenta",
            Self::InsufficientFunds { .. } => "SaldoInsuficiente",
            Self::Encryption { .. } => "Cifrado",
            Self::OutOfRange { .. } => "FueraDeRango",
        }
    }
}

impl From<domain::DomainError> for DomainError {
    fn from(e: domain::DomainError) -> Self {
        use domain::DomainError as N;
        match e {
            N::Length { field, expected, received } => Self::Length { field, expected, received },
            N::CheckDigit => Self::CheckDigit,
            N::UnknownBank { code } => Self::UnknownBank { code },
            N::InvalidAmount { detail } => Self::InvalidAmount { detail },
            N::AccountNotFound { id } => Self::AccountNotFound { id },
            N::SameAccount => Self::SameAccount,
            N::InsufficientFunds { available, required } => Self::InsufficientFunds { available, required },
            N::Encryption { detail } => Self::Encryption { detail },
            N::OutOfRange { field } => Self::OutOfRange { field },
        }
    }
}

// ---------- records

#[derive(Debug, Clone, uniffi::Record)]
pub struct Account {
    pub id: String,
    pub holder: String,
    pub balance: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferRequest {
    pub origin: String,
    pub destination: String,
    pub amount: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TransferResult {
    pub accounts: Vec<Account>,
    pub itf_fee: String,
    pub total_debited: String,
    pub receipt: String,
    pub simulated_latency_ms: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ValidCci {
    pub bank_code: String,
    pub bank_name: String,
    pub branch: String,
    pub account: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ValidCard {
    pub brand: String,
    pub masked: String,
}

impl From<domain::Account> for Account {
    fn from(c: domain::Account) -> Self {
        Self { id: c.id, holder: c.holder, balance: c.balance }
    }
}

impl From<Account> for domain::Account {
    fn from(c: Account) -> Self {
        Self { id: c.id, holder: c.holder, balance: c.balance }
    }
}

// ---------- caso 1: aritmética decimal

#[uniffi::export]
pub fn add(a: String, b: String) -> Result<String, DomainError> {
    domain::add(&a, &b).map_err(Into::into)
}

#[uniffi::export]
pub fn subtract(a: String, b: String) -> Result<String, DomainError> {
    domain::subtract(&a, &b).map_err(Into::into)
}

// ---------- caso 2: transferencia

#[uniffi::export]
pub fn execute_transfer(
    accounts: Vec<Account>,
    request: TransferRequest,
) -> Result<TransferResult, DomainError> {
    let accounts: Vec<domain::Account> = accounts.into_iter().map(Into::into).collect();
    let request = domain::TransferRequest {
        origin: request.origin,
        destination: request.destination,
        amount: request.amount,
    };
    let r = domain::execute_transfer(accounts, request)?;
    Ok(TransferResult {
        accounts: r.accounts.into_iter().map(Into::into).collect(),
        itf_fee: r.itf_fee,
        total_debited: r.total_debited,
        receipt: r.receipt,
        simulated_latency_ms: r.simulated_latency_ms,
    })
}

#[uniffi::export]
pub fn validate_cci(cci: String) -> Result<ValidCci, DomainError> {
    let v = domain::validate_cci(&cci)?;
    Ok(ValidCci {
        bank_code: v.bank_code,
        bank_name: v.bank_name,
        branch: v.branch,
        account: v.account,
    })
}

#[uniffi::export]
pub fn calculate_itf(amount: String) -> Result<String, DomainError> {
    domain::calculate_itf(&amount).map_err(Into::into)
}

// ---------- caso 3: tarjeta y cifrado

#[uniffi::export]
pub fn validate_card(number: String) -> Result<ValidCard, DomainError> {
    let v = domain::validate_card(&number)?;
    Ok(ValidCard { brand: v.brand, masked: v.masked })
}

#[uniffi::export]
pub fn encrypt(text: String, key_hex: String, nonce_hex: String) -> Result<String, DomainError> {
    domain::encrypt(&text, &key_hex, &nonce_hex).map_err(Into::into)
}

#[uniffi::export]
pub fn decrypt(ciphertext_hex: String, key_hex: String, nonce_hex: String) -> Result<String, DomainError> {
    domain::decrypt(&ciphertext_hex, &key_hex, &nonce_hex).map_err(Into::into)
}

// ---------- meta

/// Versión del crate + SHA corto de git. Cuatro strings idénticos en pantalla son la
/// prueba de que las cuatro apps corren exactamente el mismo build.
#[uniffi::export]
pub fn core_version() -> String {
    format!("{}+{}", env!("CARGO_PKG_VERSION"), env!("GIT_SHA"))
}
```

- [ ] **Step 5: Correr los gates**

Run: `cd rust-core && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add rust-core/
git commit -m "feat(ffi): fachada uniffi con la superficie completa de la POC

domain define DomainError una sola vez; aca se le pone la piel de uniffi
con un From. core_version devuelve semver + SHA de git inyectado por
build.rs: cuatro strings identicos en pantalla son la prueba de que las
cuatro apps corren el mismo build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: El test golden — la evidencia de la POC

No es un test más. Que esto pase en las cuatro plataformas **es** la demostración.

**Files:**
- Create: `rust-core/crates/ffi/tests/golden.rs`

**Interfaces:**
- Consumes: toda la superficie FFI de la Task 10 y `contracts/cases.json` v2.2.0 (v2.1.0 de la Task 1 más el caso itf-005 del fix de la Task 4).

- [ ] **Step 1: Escribir el golden**

`rust-core/crates/ffi/tests/golden.rs`:

```rust
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

#[test]
fn golden_arithmetic() {
    for case in contract()["aritmetica"].as_array().expect("grupo aritmetica") {
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
                    assert_eq!(actual_account.id, field(expected_account, "id"), "caso {id}");
                    assert_eq!(actual_account.holder, field(expected_account, "titular"), "caso {id}");
                    assert_eq!(actual_account.balance, field(expected_account, "saldo"), "caso {id}");
                }
            }
            Err(err) => {
                assert!(case["valido"].as_bool() == Some(false), "{id}: debía pasar");
                assert_eq!(err.contract_name(), field(case, "error"), "caso {id}");
            }
        }
    }
}
```

- [ ] **Step 2: Correr el golden y confirmar que efectivamente corre**

Run: `cd rust-core && cargo test -p core_financiero --test golden -- --nocapture`
Expected: `running 6 tests` … `test result: ok. 6 passed`.

**Verificación obligatoria de que el test no es un fantasma.** Un golden que no se ejecuta
pasa igual. Cambiar temporalmente en `golden_itf` el `assert_eq!` por
`assert_eq!(actual, "NO-DEBE-PASAR", "case {id}")`, correr, y confirmar que **falla**.
Luego revertir y confirmar que vuelve a pasar.

- [ ] **Step 3: Confirmar que el atajo documentado también lo alcanza**

Run: `cd rust-core && cargo test --workspace 2>&1 | grep golden`
Expected: aparece `Running tests/golden.rs`.

- [ ] **Step 4: Commit**

```bash
git add rust-core/
git commit -m "test(ffi): golden contra cases.json v2.2.0

Los 27 casos del contrato mas comprobante y latencia, con igualdad exacta
de strings. Vive dentro del paquete ffi: en la raiz del workspace cargo
nunca lo habria compilado ni ejecutado.

Verificado que el test realmente corre rompiendolo a proposito y viendolo
fallar antes de revertir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Smoke del FFI — generar bindings Kotlin y Swift

Adelanta a esta fase el fallo más caro de la Fase 2. No agrega toolchain: `uniffi-bindgen` es un binario del propio crate y lee la librería del host.

**Files:**
- Modify: `rust-core/README.md` (se crea en la Task 13; acá solo se anotan los comandos que funcionaron)

- [ ] **Step 1: Compilar la librería del host**

Run:
```bash
cd rust-core
cargo build --release -p core_financiero
ls -la target/release/libcore_financiero.dylib
```
Expected: el `.dylib` existe.

- [ ] **Step 2: Generar los bindings Kotlin**

Run:
```bash
cd rust-core
mkdir -p target/bindings-smoke/kotlin
cargo run --quiet --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language kotlin --no-format \
  --out-dir target/bindings-smoke/kotlin
find target/bindings-smoke/kotlin -name '*.kt'
```
Expected: al menos un `.kt` generado, sin error.

- [ ] **Step 3: Generar los bindings Swift**

Run:
```bash
cd rust-core
mkdir -p target/bindings-smoke/swift
cargo run --quiet --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language swift --no-format \
  --out-dir target/bindings-smoke/swift
ls target/bindings-smoke/swift
```
Expected: un `.swift`, un `.h` y un `module.modulemap`. **Los tres importan**: sin el
`.h` y el `modulemap`, el XCFramework de la Fase 3 no expone ningún símbolo (hallazgo A1
del review de CONTEXT).

- [ ] **Step 4: Verificar que la API completa cruzó la frontera**

Run:
```bash
cd rust-core
for f in add subtract execute_transfer validate_cci calculate_itf validate_card encrypt decrypt core_version; do
  k=$(grep -rl "$f" target/bindings-smoke/kotlin | wc -l | tr -d ' ')
  s=$(grep -rl "$f" target/bindings-smoke/swift  | wc -l | tr -d ' ')
  printf "%-24s kotlin:%s swift:%s\n" "$f" "$k" "$s"
done
```
Expected: las nueve funciones con `kotlin:1` y `swift:1` o más. Si alguna sale en 0, el
tipo de esa función no cruza el FFI y hay que arreglarlo **ahora**, no en la Fase 2.

- [ ] **Step 5: Confirmar que los bindings no se commitean**

Run: `git status --porcelain rust-core/target | head`
Expected: vacío — `target/` ya está en `.gitignore`. Los bindings son artefactos
regenerables; se generan en cada fase desde el core.

---

## Task 13: Documentación de cierre — el gate de la fase

Sin esto la fase **no está terminada**, aunque los tests estén en verde.

**Files:**
- Create: `rust-core/README.md`
- Modify: `rust-core/CONTEXT.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Escribir `rust-core/README.md`**

Con el diagrama Mermaid y **solo comandos ya ejecutados** en las tareas anteriores:

````markdown
# rust-core

Núcleo de dominio de la POC. Es el único lugar donde vive lógica de negocio: las cuatro
apps lo consumen sin reescribirlo.

## Cómo está organizado

```mermaid
graph TD
    ffi["<b>crates/ffi</b> · core_financiero<br/>uniffi::export · cdylib<br/>único crate exportado"]
    domain["<b>crates/domain</b><br/>Rust puro · NO declara uniffi<br/>error · arithmetic · itf · transfer<br/>cci · card · crypto"]
    contrato[("contracts/cases.json<br/>v2.2.0 · 27 casos")]

    ffi --> domain
    ffi -. "tests/golden.rs" .-> contrato
```

Son dos crates y no más porque la POC argumenta **una** frontera: la lógica de negocio no
conoce el FFI. Y no es una convención — `crates/domain` no declara `uniffi` en su
`Cargo.toml`, así que un `#[uniffi::export]` ahí adentro **no compila**.

## Correr los tests

```bash
cargo test --workspace                          # todo: unitarias + proptest + golden
cargo test -p domain                              # solo el núcleo, sin compilar uniffi
cargo test -p core_financiero --test golden     # solo los vectores del contrato
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

El golden vive en `crates/ffi/tests/golden.rs`, **no** en `rust-core/tests/`: un `tests/`
en la raíz de un workspace sin paquete raíz nunca se compila ni se ejecuta, y el test
habría "pasado" sin correr jamás.

## Generar los bindings

No hace falta NDK ni targets de iOS para esto: `uniffi-bindgen` es un binario de este
mismo workspace y lee la librería del host.

```bash
cargo build --release -p core_financiero

cargo run --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language kotlin --no-format --out-dir target/bindings-smoke/kotlin

cargo run --bin uniffi-bindgen -- generate \
  --library target/release/libcore_financiero.dylib \
  --language swift --no-format --out-dir target/bindings-smoke/swift
```

En Swift se generan tres archivos y **los tres importan**: sin el `.h` y el
`module.modulemap`, el XCFramework de la Fase 3 no expone ningún símbolo.

Los comandos de exportación por plataforma (cargo-ndk, XCFramework, `ubrn`) están en
[CONTEXT.md](CONTEXT.md).

## Reglas que no se negocian

Están en [CONTEXT.md](CONTEXT.md) y en el [CLAUDE.md](../CLAUDE.md) de la raíz. Las dos
que más fácil se rompen:

- **Ningún `f32`/`f64` toca un monto.** Los montos son `String` en la frontera y
  `Decimal` adentro.
- **`panic = "unwind"`, nunca `abort`.** Con `abort` se desactiva el `catch_unwind` de
  uniffi y cualquier pánico mata la app.
````

- [ ] **Step 2: Corregir `rust-core/CONTEXT.md`**

Dos cambios, con su porqué:
1. La estructura: de cinco crates a dos (`domain` + `ffi`), con los módulos adentro de `domain`.
2. La ubicación del golden: de `rust-core/tests/` a `crates/ffi/tests/golden.rs`.

- [ ] **Step 3: Corregir `CLAUDE.md`**

En la lista de fases, cambiar "Workspace y los cinco crates (`domain`, `calculation`,
`validation`, `crypto`, `ffi`)" por "Workspace y los dos crates (`domain` + `ffi`)".

- [ ] **Step 4: Verificación final de la fase**

Run:
```bash
cd rust-core
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
grep -rn "f32\|f64" crates/ --include='*.rs' || echo "sin punto flotante ✅"
# awk corta cada archivo en su `#[cfg(test)]`: lo de abajo son tests, donde unwrap() si se permite
find crates/domain/src crates/ffi/src -name '*.rs' -exec awk '/#\[cfg\(test\)\]/{exit} /unwrap\(\)|expect\(/{print FILENAME":"FNR": "$0}' {} + | grep . || echo "sin unwrap/expect en produccion ✅"
```
Expected: todo verde y los dos `grep` sin resultados en código de producción.

- [ ] **Step 5: Commit**

```bash
git add rust-core/README.md rust-core/CONTEXT.md CLAUDE.md
git commit -m "docs(rust-core): README con diagrama Mermaid y correccion de los CONTEXT

Gate de cierre de la Fase 1: el README lleva el diagrama de como esta
organizado el crate y solo comandos efectivamente ejecutados.

Corrige dos cosas del CONTEXT que el diseno de la fase invalido: son dos
crates y no cinco, y el golden va dentro del paquete ffi porque en la
raiz del workspace cargo nunca lo habria ejecutado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Cerrar la fase**

Correr `/security-review` sobre la rama y luego
`superpowers:finishing-a-development-branch` para mergear a `main`.

---

## Notas de ejecución

**Lo que ya está verificado** (no hace falta re-descubrirlo):

| Qué | Resultado |
|---|---|
| `round_dp_with_strategy(2, MidpointAwayFromZero)` + `{:.2}` | da `0.18` para `3500×0.00005`, y `0.30`/`70.01` para los casos de aritmética |
| `chacha20poly1305` 0.11 | reproduce los tres vectores del contrato, derivados con Node 22 |
| `Key::from_slice` / `Nonce::from_slice` | **deprecados**: harían fallar `clippy -D warnings`. Usar `try_into` |
| `uniffi` 0.32 con `setup_scaffolding!`, `Record`, error con campos, `Vec<Account>` | compila y pasa clippy |
| Paquete llamado `core` | **choca**: dentro de `ffi`, un dependency llamado `core` tapa al `core` de la stdlib y `#[derive(thiserror::Error)]` no compila (`cannot find 'fmt' in 'core'`). Verificado con un workspace de prueba. Por eso el crate puro se llama **`domain`** |
| `tests/` en la raíz del workspace | **nunca se ejecuta** — por eso el golden va en `crates/ffi/tests/` |

**Orden:** las tareas 3 a 8 dependen de la 2, y la 8 de la 3 y la 4. La 11 depende de la
10. Las tareas 3-7 son independientes entre sí y podrían paralelizarse.

**Si un valor del contrato no cuadra:** no lo corrijas para que pase el código. Un cambio
a `cases.json` va siempre en su propio commit con la justificación aritmética en el
mensaje — es la única forma de auditar después si el contrato se dobló.
