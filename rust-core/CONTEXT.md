# rust-core

Núcleo de dominio financiero. Única fuente de verdad para cálculo y validación
bancaria. Se consume desde Android nativo, iOS nativo, React Native y web.

## Reglas duras (no negociables)

1. **Funciones puras.** Sin I/O, sin red, sin acceso a disco, sin async, sin
   threads. Entra data, sale data. Si una función necesita I/O, no pertenece aquí.
2. **Nunca `f32` ni `f64` en la API pública.** Los montos son `String` en el
   límite FFI. Internamente se usa `rust_decimal::Decimal`.
3. **Nunca `panic!`, `unwrap()` ni `expect()` en código de producción.** Todo
   error se modela con `Result` y un `DomainError`. El enum vive dos veces: en
   `crates/domain` es un `thiserror` puro y **solo** la copia de `crates/ffi` lleva
   `#[derive(uniffi::Error)]`.
4. **Toda función pública de `crates/ffi` lleva `#[uniffi::export]`.** No se escriben
   bindings a mano para ninguna plataforma. **En `crates/domain` es exactamente al
   revés:** ahí no hay ni una macro de uniffi, y no puede haberla —el crate no declara
   la dependencia, así que un `#[uniffi::export]` adentro no compila (ver "Estructura")—.
   Las reglas 4 y 5 hablan del crate de la fachada, no del dominio.
5. **Sin `#[cfg(target_arch)]` sobre las macros de uniffi.** Si necesitas
   comportamiento por plataforma, usa un feature de cargo, nunca condicionar
   `uniffi::export`.
6. Todo string monetario que sale del core ya viene con la escala correcta
   (2 decimales para PEN). El formateo con separadores y símbolo lo hace la UI.

## Estructura

Son **dos crates**, no cinco. La estructura de cinco (`domain`, `calculation`,
`validation`, `crypto`, `ffi`) que este documento describía antes de la Fase 1 se descartó
al implementarla: la POC argumenta **una** frontera —la lógica de negocio no conoce el
FFI—, y esa frontera la defiende un solo límite de crate. Cinco `Cargo.toml` para ~1000
líneas de Rust puro habrían sido ceremonia sin nada que el compilador estuviera
defendiendo. Lo que eran crates hoy son módulos de `domain`.

```
rust-core/
├── Cargo.toml                    workspace virtual (sin paquete raíz)
├── README.md                     comandos ejecutados + diagrama de la Fase 1
├── crates/
│   ├── domain/                   Rust puro. NO declara uniffi
│   │   ├── src/error.rs          DomainError, definido una sola vez
│   │   ├── src/arithmetic.rs     add · subtract
│   │   ├── src/itf.rs            calculate_itf · ITF_RATE
│   │   ├── src/transfer.rs       execute_transfer · Account · TransferRequest · TransferResult
│   │   ├── src/cci.rs            validate_cci
│   │   ├── src/card.rs           validate_card (Luhn)
│   │   ├── src/crypto.rs         encrypt · decrypt (ChaCha20-Poly1305)
│   │   └── tests/properties.rs   proptest
│   └── ffi/                      paquete `core_financiero`, el único crate exportado
│       │                         crate-type = cdylib + staticlib + lib:
│       │                         .so/.dylib para Android, .a para el XCFramework de iOS
│       ├── src/lib.rs            uniffi::export, los Record y DomainError con piel de uniffi
│       ├── build.rs              inyecta el SHA de git para core_version()
│       ├── uniffi-bindgen.rs     el [[bin]] que genera los bindings
│       └── tests/contract.rs       los 28 casos de ../contracts/cases.json
```

`domain` NO conoce uniffi. Solo `ffi` depende de uniffi, y eso **no es una convención**:
`crates/domain/Cargo.toml` no declara `uniffi`, así que un `#[uniffi::export]` ahí adentro
no compila. Lo sostiene el compilador. Además mantiene el dominio testeable en Rust puro y
rápido, sin FFI de por medio.

**El crate puro se llama `domain`, no `core`.** Un paquete llamado `core` hace que el
`--extern core` que cargo pasa al compilar `ffi` tape al `core` de la stdlib, y
`#[derive(thiserror::Error)]` deja de compilar con `cannot find 'fmt' in 'core'`. Se
verificó con un workspace de prueba antes de elegir el nombre; no es una preferencia
estética y no se puede volver atrás.

## Contrato de API pública

Esta es la superficie completa de la POC. No agregues funciones sin actualizar
también `contracts/cases.json`.

Tres casos de uso, en orden de fuerza para la audiencia: **(1)** el float rompe el
dinero y el core no, **(2)** una transferencia real vive una sola vez, **(3)** el
cifrado de una tarjeta es idéntico en las cuatro plataformas.

```rust
// ---------- Caso 1: aritmética decimal
#[uniffi::export] pub fn add(a: String, b: String)      -> Result<String, DomainError>;
#[uniffi::export] pub fn subtract(a: String, b: String) -> Result<String, DomainError>;

// ---------- Caso 2: transferencia entre cuentas
#[derive(uniffi::Record)]
pub struct Account { pub id: String, pub holder: String, pub balance: String }

#[derive(uniffi::Record)]
pub struct TransferRequest {
    pub origin: String, pub destination: String, pub amount: String,
}

#[derive(uniffi::Record)]
pub struct TransferResult {
    pub accounts: Vec<Account>,        // el estado NUEVO, ya aplicado
    pub itf_fee: String,
    pub total_debited: String,
    pub receipt: String,
    pub simulated_latency_ms: u32,     // "simula" la llamada HTTP; no hay red
}

#[uniffi::export] pub fn execute_transfer(
    accounts: Vec<Account>,
    request: TransferRequest,
) -> Result<TransferResult, DomainError>;

#[derive(uniffi::Record)]
pub struct ValidCci {
    pub bank_code: String, pub bank_name: String,
    pub branch: String, pub account: String,
}
#[uniffi::export] pub fn validate_cci(cci: String) -> Result<ValidCci, DomainError>;
#[uniffi::export] pub fn calculate_itf(amount: String) -> Result<String, DomainError>;

// ---------- Caso 3: tarjeta y cifrado
#[derive(uniffi::Record)]
pub struct ValidCard {
    pub brand: String,   // Visa | Mastercard | Amex
    pub masked: String,  // "4111 **** **** 1111"
}
#[uniffi::export] pub fn validate_card(number: String) -> Result<ValidCard, DomainError>;

#[uniffi::export] pub fn encrypt(
    text: String, key_hex: String, nonce_hex: String,
) -> Result<String, DomainError>;        // devuelve hex de (ciphertext || tag)

#[uniffi::export] pub fn decrypt(
    ciphertext_hex: String, key_hex: String, nonce_hex: String,
) -> Result<String, DomainError>;

// ---------- meta
#[uniffi::export] pub fn core_version() -> String;

#[derive(uniffi::Error, Debug, thiserror::Error)]
pub enum DomainError {
    #[error("longitud inválida en {field}: se esperaban {expected} dígitos, llegaron {received} caracteres")]
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
```

**Los identificadores están en inglés y los nombres del contrato en español.** El enum vive
dos veces —`domain::DomainError`, sin uniffi, y este, con la piel de uniffi— y el puente
hacia `contracts/cases.json` es `DomainError::contract_name()`, que devuelve `"MismaCuenta"`
para `SameAccount` y así con las nueve. **Ese método es Rust y no cruza el FFI:** en Kotlin
y Swift el enum generado trae solo los nombres en inglés, así que cada app necesita escribir
ese mapeo de nueve líneas **en su test de contrato**, no en producción. Si diverge, el test de contrato de
esa app falla contra el contrato. Ver [FFI.md](FFI.md).

`core_version()` devuelve versión del crate + SHA corto de git, inyectados en
compilación por `build.rs` vía `env!`. Un semver escrito a mano no probaría nada: las
cuatro apps podrían mostrar `1.0.0` viniendo de builds distintos. Con la huella de
compilación, cuatro strings idénticos **sí** son evidencia de que corren el mismo build.

## La transferencia es una función pura

Entra el estado, sale el estado nuevo — como un reducer. La app guarda las cuentas en
memoria y las tira al cerrar: **sin BD, sin cache, sin red**. `simulated_latency_ms` es
un número que el core devuelve y que la app espera antes de pintar, para que la demo
"parezca" una llamada HTTP. No hay ningún cliente HTTP en ninguna parte.

Esto permite "registrar" una transferencia sin romper la regla 1 (funciones puras), y es
lo que mantiene el core testeable idénticamente en las cuatro plataformas.

## Reglas de dominio

Las reglas y sus constantes están especificadas en
[`../contracts/README.md`](../contracts/README.md), que es la fuente normativa. Resumen:

- **CCI**: 20 dígitos. 1-3 banco, 4-6 oficina, 7-18 cuenta, 19-20 dígitos de control.
  Valida los dígitos de control, no solo la longitud.
- **Tarjeta**: algoritmo de Luhn. La marca sale del prefijo (Visa `4`, Mastercard
  `51-55`/`2221-2720`, Amex `34`/`37`). El enmascarado muestra los primeros y últimos 4.
- **ITF**: alícuota como constante nombrada, nunca un número suelto en medio del cálculo.
  Debe ser trivial cambiarla y ver que las cuatro apps se actualizan — es parte del guion
  de la demo.
- **Transferencia**: el destino recibe `monto`; el origen se debita `monto + ITF`. Valida
  que ambas cuentas existan, que sean distintas, que el monto sea > 0 y que el saldo
  alcance para `monto + ITF`. Valida además la **escala de la entrada**: el monto y los
  dos saldos entran con 2 decimales como máximo, o el resultado es `InvalidAmount`
  (`MontoInvalido` en el contrato, caso `tr-007`). Sin esa puerta, el redondeo al
  formatear la salida mueve la suma total de saldos y el invariante de conservación del
  dinero deja de valer.
- **Aritmética**: entrada con escala libre, salida siempre con 2 decimales. Es la
  diferencia deliberada con la transferencia: la salida redondeada de `add`/`subtract` no
  alimenta ningún saldo.

### Cifrado

**ChaCha20-Poly1305** (IETF): clave de 32 bytes, nonce de 12 bytes, tag de 16 bytes, todo
en hex. La salida es el hex de `ciphertext || tag`.

El **nonce es un parámetro**, no se genera dentro del core. Dos razones, y las dos importan:

1. Generar un nonce aleatorio requiere entropía del sistema, o sea una syscall. Eso
   rompería la regla 1 (funciones puras, sin I/O).
2. Con el nonce como parámetro la salida es **determinista**, y por lo tanto comparable
   carácter por carácter entre las cuatro plataformas — que es justamente lo que el
   contrato necesita probar.

> ⚠️ **Esto es una POC.** Reutilizar el par (clave, nonce) en ChaCha20-Poly1305 es
> catastrófico en producción: filtra el keystream y permite falsificar el tag. Aquí el
> nonce es fijo **a propósito**, para que las cuatro plataformas produzcan el mismo string.
> Un sistema real usa un nonce único por mensaje y la clave nunca sale del keystore o el
> HSM. La gestión de claves está explícitamente fuera de alcance: la clave entra como
> parámetro en hex y la app de demo la trae harcodeada.

## Pruebas

Tres niveles, los tres obligatorios:

1. **Unitarias** en cada crate, en Rust puro.
2. **Property-based** con `proptest`. Invariantes mínimas:
   - una transferencia válida **conserva la suma total de saldos** (más el ITF debitado):
     no se crea ni se destruye dinero. El generador tiene que producir montos y saldos con
     **3 o más decimales**, no solo centavos enteros: sobre centavos enteros el invariante
     no puede fallar y el test pasa por construcción
   - ningún saldo queda negativo tras una transferencia aceptada
   - `decrypt(encrypt(x)) == x` para todo `x`
   - `validate_cci`, `validate_card` y `decrypt` **nunca entran en pánico** con
     ninguna entrada de texto. Es un test de seguridad, no solo de robustez:
     estas funciones reciben input arbitrario del usuario.
3. **Vectores de contrato** desde `../contracts/cases.json`. Este archivo es el
   contrato compartido con las cuatro apps: cada plataforma corre los mismos
   casos y debe producir strings idénticos carácter por carácter.

El test de contrato vive en **`crates/ffi/tests/contract.rs`**, dentro del paquete `ffi`, y no en
`rust-core/tests/` como decía antes este documento. La razón es mecánica y se descubrió al
implementarlo: `rust-core/` es un **workspace virtual**, sin paquete raíz, y un directorio
`tests/` en la raíz de un workspace así **nunca se compila ni se ejecuta**. Puesto ahí, el
test más importante de la POC habría figurado como "pasado" sin haber corrido una sola vez.
Dentro de `crates/ffi/`, `cargo test --workspace` sí lo alcanza — verificado.

El formato de `cases.json` y la especificación normativa de cada algoritmo están en
[`../contracts/README.md`](../contracts/README.md). No los dupliques aquí: se desincronizan.

## Comandos de exportación

```bash
# Android: .so por ABI + Kotlin
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../apps/android/app/src/main/jniLibs build --release
# bindgen lee el `.dylib` del **host**, NO el `.so` de Android, por dos razones verificadas
# en la Fase 2: en macOS el host no produce `.so` (produce `.dylib`), y el `.so` de Android
# sale con `strip = true` del perfil release, que borra la metadata de uniffi — apuntarle da
# "No UniFFI metadata found". Los bindings no dependen de la arquitectura.
cargo run --bin uniffi-bindgen -- generate --library target/release/libcore_financiero.dylib \
  --language kotlin --out-dir ../apps/android/app/src/main/java

# iOS: XCFramework + Swift
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
# bindgen lee el `.a` del **host** (`target/release/`), no el de los targets de iOS, y es
# a propósito: los bindings que emite uniffi no dependen de la arquitectura. Los dos `.a`
# por arquitectura de arriba existen solo para armar el XCFramework.
cargo run --bin uniffi-bindgen -- generate --library target/release/libcore_financiero.a \
  --language swift --out-dir ../apps/ios/Generated

# uniffi 0.31 (anclado por React Native, ver PENDING.md) emite el modulemap
# como `core_financieroFFI.modulemap`, pero
# `-create-xcframework -headers <dir>` exige que el directorio traiga uno llamado
# exactamente `module.modulemap`. Sin este paso el XCFramework se construye SIN ERROR
# y después `import core_financieroFFI` no resuelve. Verificado en la Fase 1.
mkdir -p ../apps/ios/Generated/include
mv ../apps/ios/Generated/core_financieroFFI.h ../apps/ios/Generated/include/
cp ../apps/ios/Generated/core_financieroFFI.modulemap \
   ../apps/ios/Generated/include/module.modulemap

# `-headers` va una vez por cada `-library`, inmediatamente después del suyo.
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a \
  -headers ../apps/ios/Generated/include \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a \
  -headers ../apps/ios/Generated/include \
  -output ../apps/ios/CoreFinanciero.xcframework

# React Native y web: desde apps/react-native, vía ubrn
ubrn build android --and-generate
ubrn build ios --and-generate
ubrn build web
```

Requisito: NDK r27 o superior. Con NDK anterior la librería compila pero
crashea al cargar en dispositivos con páginas de 16 KB.

## Perfil de release

**`panic = "unwind"` es obligatorio, no una preferencia.** uniffi envuelve cada llamada en
`catch_unwind` para convertir un pánico de Rust en un error del FFI en vez de matar la app.
Con `abort` esa red se desactiva y cualquier pánico es un crash duro de la app del banco —
justo el caso que la regla 3 y el proptest de `validate_cci` intentan prevenir.

```toml
[profile.release]
opt-level = "z"     # ver nota del benchmark abajo
lto = true
codegen-units = 1
strip = true
panic = "unwind"    # NO cambiar a abort: desactiva el catch_unwind de uniffi
                    # (en wasm32 no aplica: ese target impone abort, ver abajo)
```

### En wasm la regla no se puede cumplir

`panic = "unwind"` vale para los cinco targets de Android e iOS. **No vale para
`wasm32-unknown-unknown`, que impone `abort` desde el target mismo**: el wasm base no tiene
unwinding, así que el perfil no tiene nada que elegir ahí. Se comprueba sin instalar el
target ni compilar nada:

```bash
rustc --print cfg --target wasm32-unknown-unknown  | grep panic
rustc --print cfg --target aarch64-linux-android   | grep panic
rustc --print cfg --target armv7-linux-androideabi | grep panic
rustc --print cfg --target x86_64-linux-android    | grep panic
rustc --print cfg --target aarch64-apple-ios       | grep panic
rustc --print cfg --target aarch64-apple-ios-sim   | grep panic
```

Qué se debe ver — `panic="abort"` en la primera línea y `panic="unwind"` en las otras cinco:

```
panic="abort"
panic="unwind"
panic="unwind"
panic="unwind"
panic="unwind"
panic="unwind"
```

Qué significa para la **Fase 5**: el paquete WASM que consume Angular **no tiene la red del
`catch_unwind` de uniffi**. Un pánico del core ahí no se convierte en un error del FFI; es
un trap de WebAssembly que deja la instancia del módulo inutilizable y obliga a recargar la
página. O sea que en la única plataforma donde no hay red, lo único que protege a la app es
la regla 3 de este documento —cero `panic!`/`unwrap()`/`expect()` en producción— y los
proptests `validate_cci_never_panics`, `validate_card_never_panics` y
`decrypt_never_panics`. Eso convierte esos tres tests, que se leen como robustez, en el
mecanismo de seguridad real de la Fase 5.

> **Nota para el benchmark:** `opt-level = "z"` optimiza tamaño a costa de velocidad. Si la
> pantalla de benchmark va a presentarse como "lo rápido que es Rust", hay que medir con
> `opt-level = 3` o reportar ambas métricas siendo explícito sobre el trade-off. Medir con
> un build optimizado para tamaño y venderlo como velocidad es un resultado tramposo.

## Qué NO hacer

- No agregues cliente HTTP, SQLite ni ningún runtime async. Se sale del alcance
  y hace que la POC no termine.
- No expongas tipos de `rust_decimal` a través del FFI.
- No inventes reglas de negocio. Si un caso no está en `cases.json`, pregunta
  antes de implementar.
- No optimices por performance antes de que el benchmark exista.