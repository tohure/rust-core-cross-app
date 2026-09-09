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
│   ├── dominio/             tipos, máquina de estados de transferencia
│   ├── calculo/             cronogramas, TEA/TCEA, ITF, comisiones
│   ├── validacion/          CCI, RUC, DNI, celular
│   └── ffi/                 fachada con uniffi::export, el único crate exportado
└── tests/

Los crates internos NO conocen uniffi. Solo `ffi` depende de uniffi. Esto
mantiene el dominio testeable en Rust puro y rápido.

## Contrato de API pública

Esta es la superficie completa de la POC. No agregues funciones sin
actualizar también `contratos/casos.json`.

```rust
#[derive(uniffi::Record)]
pub struct Cuota {
    pub numero: u32,
    pub capital: String,
    pub interes: String,
    pub seguro: String,
    pub cuota_total: String,
    pub saldo: String,
}

#[derive(uniffi::Record)]
pub struct Cronograma {
    pub cuotas: Vec<Cuota>,
    pub tcea: String,
    pub total_intereses: String,
}

#[derive(uniffi::Record)]
pub struct CciValido {
    pub codigo_banco: String,
    pub nombre_banco: String,
    pub oficina: String,
    pub cuenta: String,
}

#[derive(uniffi::Error, Debug, thiserror::Error)]
pub enum ErrorDominio {
    #[error("longitud inválida: se esperaban {esperado} dígitos")]
    Longitud { esperado: u32 },
    #[error("dígito de control inválido")]
    DigitoControl,
    #[error("banco no reconocido: {codigo}")]
    BancoDesconocido { codigo: String },
    #[error("monto inválido: {detalle}")]
    MontoInvalido { detalle: String },
    #[error("parámetro fuera de rango: {campo}")]
    FueraDeRango { campo: String },
}

#[uniffi::export]
pub fn validar_cci(cci: String) -> Result<CciValido, ErrorDominio>;

#[uniffi::export]
pub fn validar_ruc(ruc: String) -> Result<(), ErrorDominio>;

#[uniffi::export]
pub fn calcular_itf(monto: String) -> Result<String, ErrorDominio>;

#[uniffi::export]
pub fn generar_cronograma(
    monto: String,
    tea_porcentaje: String,
    numero_cuotas: u32,
    tasa_seguro_mensual: String,
) -> Result<Cronograma, ErrorDominio>;

#[uniffi::export]
pub fn version_core() -> String;
```

`version_core()` existe para que la demo muestre en pantalla que las cuatro
apps corren exactamente el mismo build.

## Reglas de dominio (Perú)

- **CCI**: 20 dígitos. Posiciones 1-3 código de banco, 4-6 oficina,
  7-18 cuenta, 19-20 dígitos de control. Valida los dígitos de control, no
  solo la longitud.
- **RUC**: 11 dígitos, dígito verificador por módulo 11 con pesos
  `[5,4,3,2,7,6,5,4,3,2]`.
- **ITF**: alícuota configurable como constante nombrada, no como número
  suelto en medio del cálculo. Debe ser trivial cambiarla y ver que las cuatro
  apps se actualizan (esto es parte del guion de la demo).
- **Cronograma**: método francés, cuota constante. Redondeo a 2 decimales con
  `RoundingStrategy::MidpointAwayFromZero`. La diferencia por redondeo se
  ajusta en la última cuota para que la suma de capitales sea exactamente el
  monto del préstamo.
- **TCEA**: se resuelve por Newton-Raphson sobre el flujo de caja real
  (incluyendo seguro y comisiones), con tolerancia 1e-10 y máximo 100
  iteraciones. Si no converge, devuelve `FueraDeRango`.

## Pruebas

Tres niveles, los tres obligatorios:

1. **Unitarias** en cada crate, en Rust puro.
2. **Property-based** con `proptest`. Invariantes mínimas:
   - la suma de capitales del cronograma == monto exacto, siempre
   - todo saldo es >= 0 y el saldo final es exactamente 0
   - `validar_cci` nunca entra en pánico con ninguna entrada de texto
3. **Vectores golden** desde `../contratos/casos.json`. Este archivo es el
   contrato compartido con las cuatro apps: cada plataforma corre los mismos
   casos y debe producir strings idénticos carácter por carácter.

Formato de `casos.json`:

```json
{
  "version": "1.0.0",
  "cronograma": [
    {
      "id": "cred-001",
      "entrada": { "monto": "15000.00", "tea": "18.50", "cuotas": 24, "seguro": "0.05" },
      "esperado": { "tcea": "22.34", "primera_cuota": "756.12", "total_intereses": "3146.88" }
    }
  ],
  "cci": [
    { "id": "cci-001", "entrada": "00219100123456789012", "valido": true, "banco": "Banco X" }
  ]
}
```

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

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

## Qué NO hacer

- No agregues cliente HTTP, SQLite ni ningún runtime async. Se sale del alcance
  y hace que la POC no termine.
- No expongas tipos de `rust_decimal` a través del FFI.
- No inventes reglas de negocio. Si un caso no está en `casos.json`, pregunta
  antes de implementar.
- No optimices por performance antes de que el benchmark exista.