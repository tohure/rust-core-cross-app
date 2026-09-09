# rust-core

Núcleo de dominio financiero. Única fuente de verdad para cálculo y validación
bancaria. Se consume desde Android nativo, iOS nativo, React Native y web.

## Reglas duras (no negociables)

1. **Funciones puras.** Sin I/O, sin red, sin acceso a disco, sin async, sin
   threads. Entra data, sale data. Si una función necesita I/O, no pertenece aquí.
2. **Nunca `f32` ni `f64` en la API pública.** Los montos son `String` en el
   límite FFI. Internamente se usa `rust_decimal::Decimal`.
3. **Nunca `panic!`, `unwrap()` ni `expect()` en código de producción.** Todo
   error se modela con `Result` y un enum `#[derive(uniffi::Error)]`.
4. **Toda función pública lleva `#[uniffi::export]`.** No se escriben bindings
   a mano para ninguna plataforma.
5. **Sin `#[cfg(target_arch)]` sobre las macros de uniffi.** Si necesitas
   comportamiento por plataforma, usa un feature de cargo, nunca condicionar
   `uniffi::export`.
6. Todo string monetario que sale del core ya viene con la escala correcta
   (2 decimales para PEN). El formateo con separadores y símbolo lo hace la UI.

## Estructura

rust-core/
├── Cargo.toml               workspace
├── crates/
│   ├── domain/              Cuenta, Tarjeta, máquina de estados de transferencia
│   ├── calculation/         aritmética decimal, ITF
│   ├── validation/          CCI, Luhn de tarjeta
│   ├── crypto/              ChaCha20-Poly1305
│   └── ffi/                 fachada con uniffi::export, el único crate exportado
└── tests/

Los crates internos NO conocen uniffi. Solo `ffi` depende de uniffi. Esto
mantiene el dominio testeable en Rust puro y rápido.

## Contrato de API pública

Esta es la superficie completa de la POC. No agregues funciones sin actualizar
también `contracts/cases.json`.

Tres casos de uso, en orden de fuerza para la audiencia: **(1)** el float rompe el
dinero y el core no, **(2)** una transferencia real vive una sola vez, **(3)** el
cifrado de una tarjeta es idéntico en las cuatro plataformas.

```rust
// ---------- Caso 1: aritmética decimal
#[uniffi::export] pub fn sumar(a: String, b: String)  -> Result<String, ErrorDominio>;
#[uniffi::export] pub fn restar(a: String, b: String) -> Result<String, ErrorDominio>;

// ---------- Caso 2: transferencia entre cuentas
#[derive(uniffi::Record)]
pub struct Cuenta { pub id: String, pub titular: String, pub saldo: String }

#[derive(uniffi::Record)]
pub struct SolicitudTransferencia {
    pub origen: String, pub destino: String, pub monto: String,
}

#[derive(uniffi::Record)]
pub struct ResultadoTransferencia {
    pub cuentas: Vec<Cuenta>,       // el estado NUEVO, ya aplicado
    pub comision_itf: String,
    pub total_debitado: String,
    pub comprobante: String,
    pub latencia_simulada_ms: u32,  // "simula" la llamada HTTP; no hay red
}

#[uniffi::export] pub fn ejecutar_transferencia(
    cuentas: Vec<Cuenta>,
    solicitud: SolicitudTransferencia,
) -> Result<ResultadoTransferencia, ErrorDominio>;

#[derive(uniffi::Record)]
pub struct CciValido {
    pub codigo_banco: String, pub nombre_banco: String,
    pub oficina: String, pub cuenta: String,
}
#[uniffi::export] pub fn validar_cci(cci: String) -> Result<CciValido, ErrorDominio>;
#[uniffi::export] pub fn calcular_itf(monto: String) -> Result<String, ErrorDominio>;

// ---------- Caso 3: tarjeta y cifrado
#[derive(uniffi::Record)]
pub struct TarjetaValida {
    pub marca: String,        // Visa | Mastercard | Amex
    pub enmascarado: String,  // "4111 **** **** 1111"
}
#[uniffi::export] pub fn validar_tarjeta(numero: String) -> Result<TarjetaValida, ErrorDominio>;

#[uniffi::export] pub fn cifrar(
    texto: String, clave_hex: String, nonce_hex: String,
) -> Result<String, ErrorDominio>;        // devuelve hex de (ciphertext || tag)

#[uniffi::export] pub fn descifrar(
    cifrado_hex: String, clave_hex: String, nonce_hex: String,
) -> Result<String, ErrorDominio>;

// ---------- meta
#[uniffi::export] pub fn version_core() -> String;

#[derive(uniffi::Error, Debug, thiserror::Error)]
pub enum ErrorDominio {
    #[error("longitud inválida en {campo}: se esperaban {esperado} dígitos, llegaron {recibido}")]
    Longitud { campo: String, esperado: u32, recibido: u32 },
    #[error("dígito de control inválido")]
    DigitoControl,
    #[error("banco no reconocido: {codigo}")]
    BancoDesconocido { codigo: String },
    #[error("monto inválido: {detalle}")]
    MontoInvalido { detalle: String },
    #[error("cuenta no encontrada: {id}")]
    CuentaNoEncontrada { id: String },
    #[error("origen y destino son la misma cuenta")]
    MismaCuenta,
    #[error("saldo insuficiente: disponible {disponible}, requerido {requerido}")]
    SaldoInsuficiente { disponible: String, requerido: String },
    #[error("error de cifrado: {detalle}")]
    Cifrado { detalle: String },
    #[error("parámetro fuera de rango: {campo}")]
    FueraDeRango { campo: String },
}
```

`version_core()` devuelve versión del crate + SHA corto de git, inyectados en
compilación por `build.rs` vía `env!`. Un semver escrito a mano no probaría nada: las
cuatro apps podrían mostrar `1.0.0` viniendo de builds distintos. Con la huella de
compilación, cuatro strings idénticos **sí** son evidencia de que corren el mismo build.

## La transferencia es una función pura

Entra el estado, sale el estado nuevo — como un reducer. La app guarda las cuentas en
memoria y las tira al cerrar: **sin BD, sin cache, sin red**. `latencia_simulada_ms` es
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
  alcance para `monto + ITF`.
- **Aritmética**: entrada con escala libre, salida siempre con 2 decimales.

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
     no se crea ni se destruye dinero
   - ningún saldo queda negativo tras una transferencia aceptada
   - `descifrar(cifrar(x)) == x` para todo `x`
   - `validar_cci`, `validar_tarjeta` y `descifrar` **nunca entran en pánico** con
     ninguna entrada de texto. Es un test de seguridad, no solo de robustez:
     estas funciones reciben input arbitrario del usuario.
3. **Vectores golden** desde `../contracts/cases.json`. Este archivo es el
   contrato compartido con las cuatro apps: cada plataforma corre los mismos
   casos y debe producir strings idénticos carácter por carácter.

El formato de `cases.json` y la especificación normativa de cada algoritmo están en
[`../contracts/README.md`](../contracts/README.md). No los dupliques aquí: se desincronizan.

## Comandos de exportación

```bash
# Android: .so por ABI + Kotlin
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o ../apps/android/app/src/main/jniLibs build --release
cargo run --bin uniffi-bindgen -- generate --library target/release/libcore_financiero.so \
  --language kotlin --out-dir ../apps/android/app/src/main/java

# iOS: XCFramework + Swift
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
cargo run --bin uniffi-bindgen -- generate --library target/release/libcore_financiero.a \
  --language swift --out-dir ../apps/ios/Generated
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a \
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
justo el caso que la regla 3 y el proptest de `validar_cci` intentan prevenir.

```toml
[profile.release]
opt-level = "z"     # ver nota del benchmark abajo
lto = true
codegen-units = 1
strip = true
panic = "unwind"    # NO cambiar a abort: desactiva el catch_unwind de uniffi
```

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