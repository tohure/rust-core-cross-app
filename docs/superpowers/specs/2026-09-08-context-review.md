# Revisión de los CONTEXT.md

**Fecha:** 2026-09-08 · **Alcance:** los cinco CONTEXT antes de arrancar la Fase 1.

## Veredicto

Los CONTEXT están **por encima del promedio**: son opinionados, prohíben explícitamente
lo que no se debe hacer, y explican el *porqué* de cada regla en vez de solo enunciarla.
Eso es exactamente lo que hace que un documento de contexto sirva.

Los hallazgos de abajo no los invalidan. Son de tres tipos: **(A) bugs** que harían
fallar el build, **(B) decisiones de API** que conviene resolver antes de escribir código
en cuatro plataformas, y **(C) una observación estructural**.

---

## A. Bugs — se corrigen ya

### A1. `xcodebuild -create-xcframework` sin `-headers` (iOS) — el comando falla

El comando en `apps/ios/CONTEXT.md` pasa solo los `.a`. uniffi genera además un `.h` y un
`module.modulemap` que **deben** ir en el XCFramework, o Swift no ve ningún símbolo. Es el
fallo de integración más común en iOS + uniffi.

```bash
# hay que armar un dir de headers por slice y pasarlo:
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcore_financiero.a     -headers ../apps/ios/Generated/include \
  -library target/aarch64-apple-ios-sim/release/libcore_financiero.a -headers ../apps/ios/Generated/include \
  -output ../apps/ios/CoreFinanciero.xcframework
```

### A2. Falta la dependencia JNA (Android)

Los bindings Kotlin de uniffi corren sobre **JNA, no JNI**. Sin
`implementation("net.java.dev.jna:jna:5.14.0@aar")` la app compila y revienta en runtime
al primer llamado. (El diagrama también dice "Kotlin y JNI"; conviene corregirlo ahí.)

### A3. `rust_decimal` no hace potencias fraccionarias por defecto

`TEM = (1+TEA)^(1/12)` necesita `MathematicalOps::powd`, que vive tras el feature `maths`:
`rust_decimal = { version = "1", features = ["maths"] }`. Sin eso el core no compila.

### A4. La estructura documentada de Android no es la que emite uniffi

El CONTEXT dice `pe/banco/poc/core/`, pero `uniffi-bindgen --out-dir app/src/main/java`
emite en `uniffi/<nombre_crate>/`. O se ajusta la doc, o se mueve con un paso de build.

### A5. `ubrn build web` necesita config propia

Verificado: `ubrn build web` **sí existe** y delega en `wasm-bindgen`/`wasm-pack` — el
CONTEXT y el diagrama dicen lo mismo, no hay contradicción. Pero el `ubrn.config.yaml` del
CONTEXT no tiene sección `web:`, y el build web requiere al menos `wasmCrateName`. El
script tampoco pasa `--and-generate`, que sí lleva la doc oficial.

---

## B. Decisiones de API — resolver antes de la Fase 1

### B1. `panic = "abort"` contradice el argumento de seguridad ⚠️

Es el hallazgo más importante. uniffi envuelve cada llamada en `catch_unwind` justamente
para convertir un pánico de Rust en un error del FFI en vez de matar la app. Con
`panic = "abort"` esa red de seguridad **se desactiva**: cualquier pánico aborta el proceso
del banco, sin catch posible.

El CONTEXT a la vez (a) prohíbe `panic!`, (b) exige un proptest de que `validar_cci` nunca
entra en pánico, y (c) configura `panic = "abort"`, que hace fatal precisamente el caso que
(a) y (b) intentan prevenir. Para una POC que quiere argumentar robustez ante un banco,
el default correcto es `panic = "unwind"`.

### B2. `opt-level = "z"` debilita el benchmark

La POC tiene una pantalla de benchmark que compara Rust contra Kotlin/TS. `"z"` optimiza
tamaño a costa de velocidad. O se usa `opt-level = 3`, o se reportan ambas métricas
(tamaño y velocidad) siendo explícito sobre el trade-off. Medir velocidad con un build
optimizado para tamaño y presentarlo como "lo rápido que es Rust" es un resultado tramposo.

### B3. `generar_cronograma` tiene dos `String` adyacentes intercambiables

```rust
generar_cronograma(monto: String, tea_porcentaje: String, numero_cuotas: u32, tasa_seguro_mensual: String)
```

`tea_porcentaje` y `tasa_seguro_mensual` son ambos `String`. Transponerlos **compila sin
error** en las cuatro plataformas y devuelve un cronograma plausible pero incorrecto.

Propuesta (Parameter Object): un `#[uniffi::Record] SolicitudCronograma`. Cada campo se
nombra en el call site, agregar un campo no rompe los cuatro consumidores (OCP), y sigue
el mismo estilo `Record` que ya usan las salidas (DRY).

### B4. `validar_ruc() -> Result<(), ErrorDominio>` es asimétrico

`validar_cci` devuelve un `CciValido` con datos; `validar_ruc` devuelve `()`. Propuesta:
`RucValido { numero, tipo_contribuyente }` por simetría y para que la UI tenga qué mostrar.

### B5. `ErrorDominio::Longitud { esperado }` no dice de qué campo

Un solo enum de error para cuatro validadores, y la variante no lleva `campo` ni el valor
recibido. La UI no puede mapear el error a un input concreto. Propuesta:
`Longitud { campo: String, esperado: u32, recibido: u32 }`.

### B6. `version_core()` no prueba lo que dice probar

El CONTEXT dice que existe "para que la demo muestre que las cuatro apps corren
exactamente el mismo build". Un semver escrito a mano **no prueba eso**: las cuatro apps
pueden mostrar `1.0.0` viniendo de builds distintos.

Propuesta: que devuelva una huella de compilación — versión del crate + SHA corto de git,
inyectado por `build.rs` vía `env!`. Ahí sí, cuatro strings idénticos son evidencia. Es un
cambio chico que convierte una afirmación decorativa en la prueba central de la demo.

---

## C. Observación estructural — la regla del float está repetida cinco veces

La regla "nunca uses punto flotante para dinero" aparece en los cinco CONTEXT, redactada
distinto cada vez. Es una violación de DRY a nivel documentación: cambiarla obliga a editar
cinco archivos y es cuestión de tiempo que se desincronicen.

**Mejor forma:** el invariante vive **una vez** en `CLAUDE.md` (ya está ahí, en la sección
"El invariante que sostiene toda la POC"), y cada CONTEXT solo declara **su expresión
concreta en esa plataforma** — `Double`/`Float` en Kotlin y Swift, `number`/`parseFloat` en
TS, `f32`/`f64` en la API pública de Rust — y enlaza al invariante para el porqué.

Aplicado a los cinco, cada CONTEXT baja de tamaño y gana foco: queda solo lo que es cierto
de *esa* plataforma. Es la misma razón por la que los crates internos no conocen uniffi.
