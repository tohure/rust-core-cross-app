# Pendientes y deuda de `apps/react-native`

## El WASM

**`wasm2` funciona con este crate.** Verificado de punta a punta: el módulo carga en Node y
responde.

```
coreVersion()      = 1.0.0+eb87650
add("0.1","0.2")   = 0.30
```

La vía que funcionó es la **confinada a wasm** —la buena—, pero con una excepción que hay que
decir en voz alta: **un cambio sí tocó el crate compartido y obliga a reverificar Android e iOS**.

### Lo que quedó confinado a wasm

En `rust-core/crates/ffi/Cargo.toml`, bajo `[target.'cfg(target_arch = "wasm32")'.dependencies]`.
Android e iOS ni lo resuelven:

```toml
[target.'cfg(target_arch = "wasm32")'.dependencies]
uniffi = { workspace = true, features = ["wasm-unstable-single-threaded"] }
uniffi-runtime-wasm = "0.31.0-5"
```

Y en `rust-core/crates/ffi/src/lib.rs`, gated por `cfg`:

```rust
#[cfg(target_arch = "wasm32")]
extern crate uniffi_runtime_wasm as _;
```

**El chequeo de `ubrn` sí ve dependencias condicionadas por target** — ésa era la pregunta que
este spike existía para contestar, y la respuesta es la buena. Más aún: el mensaje de error de
`check_wasm_ready`, leído en el código de `ubrn`, **recomienda exactamente esa forma**.

### Lo que NO quedó confinado, y por qué

En `rust-core/Cargo.toml`:

```toml
chacha20poly1305 = { version = "0.11", default-features = false, features = ["alloc"] }
```

Sus features por defecto son `alloc` + `getrandom`. `getrandom` arrastra `js-sys 0.3.105`, que
exige un `wasm-bindgen` más nuevo que el **`=0.2.100` que `ubrn` lleva compilado adentro**
(`wasm-bindgen-cli-support = "=0.2.100"` en su `Cargo.toml`). Con ese desajuste el build muere en:

```
rust Wasm file schema version: 0.2.128
   this binary schema version: 0.2.100
```

No se puede bajar `wasm-bindgen` a 0.2.100 mientras `getrandom` esté: `js-sys` no lo permite. Y no
se puede subir el binario: ubrn usa la **librería** `wasm-bindgen-cli-support`, no un ejecutable
del PATH, así que instalar `wasm-bindgen-cli` no cambia nada.

**El feature es inerte para este core, verificado leyendo el código:** `crates/domain/src/crypto.rs`
no usa `OsRng` ni nada aleatorio — la clave y el nonce llegan como hex del llamador, y el nonce es
fijo a propósito. `getrandom` entraba transitivamente por `chacha20poly1305 → aead` y **nunca se
invocaba**. Los 67 tests del core siguen en verde con el feature apagado.

Pero es un cambio al crate compartido: **Android e iOS entran en reverificación** (Task 14).

### `ubrn.wasm.yaml`: por qué hay un segundo archivo de config

Todos los flavours de `ubrn` escriben en el directorio que diga `bindings.ts`. Correr
`build wasm2` con `ubrn.config.yaml` **pisa los bindings JSI** de `src/generated/`: el build de la
app queda roto y el síntoma aparece lejos del comando que lo causó. Pasó en este spike.

```bash
pnpm exec ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml
```

**El `.wasm` que sirve es el que `--and-generate` *stagea*, no el que deja cargo.** El de
`rust-core/target/wasm32-unknown-unknown/release/` es la salida cruda y le faltan los símbolos que
inyecta el paso de wasm-bindgen; cargarlo falla con
`required export "__ubrn_alloc" not found in wasm module`.

### Tres cosas que el plan tenía mal, corregidas

1. **`uniffi-runtime-wasm = "0.31"` no resuelve**: sólo existe como prerelease. La versión es
   `0.31.0-5`, la misma que el `ubrn` que este proyecto fija.
2. **El feature no se llama `single-threaded` sino `wasm-unstable-single-threaded`.**
3. **Declarar la dependencia no alcanza**: sin el `extern crate uniffi_runtime_wasm as _`, nada
   la referencia, rustc no enlaza sus símbolos `#[no_mangle]` y el módulo sale sin `__ubrn_alloc`,
   `__ubrn_free`, `__ubrn_install_panic_hook` ni `__ubrn_set_panic_log`. Con la línea puesta, el
   módulo pasa de 89 a 93 exports. Es el mismo patrón que llevan **todos** los fixtures de ubrn.

### Bloqueante conocido para la Task 15: el `index.ts` de wasm2 no typechecka

`ubrn` **se olvidó el `@ts-nocheck`** en el entrypoint que genera para wasm2. Todos los demás
archivos generados lo llevan; ése no. Y tiene un error de tipos real contra `@ubjs/wasm`:

```
error TS2345: Argument of type '{ readonly symbols: … }' is not assignable to parameter of type
'ModuleDefinitions'. … The type 'readonly [...]' is 'readonly' and cannot be assigned to the
mutable type 'FfiTypeDesc[]'.
```

Rompe `tsc --noEmit` y también `bob build`, o sea el `prepare` que corre en **cada
`pnpm install`**.

**Resuelto**, y no editando el generado a mano —eso se pierde en la próxima corrida— sino en el
script, que aplica la corrección **después de generar, en cada corrida**:

```json
"wasm:generate": "ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml && node -e \"… si no tiene @ts-nocheck, se lo antepone …\""
```

Es reproducible y sobrevive a cualquier regeneración. Sigue siendo un **bug de `ubrn` 0.31.0-5**:
si una versión futura agrega el `@ts-nocheck` que le falta, la segunda mitad del script queda
inerte —comprueba antes de escribir— y se puede borrar.

### `@ubjs/wasm` se publica sólo en ESM

Queda declarado como devDependency. El proyecto `napi` de Jest corre CommonJS, así que necesita
transpilarlo; el `transformIgnorePatterns` de `jest.config.js` ya lo contempla. Es el mismo
fenómeno que con el preset de React Native, por la misma razón de siempre.

### La consecuencia para la Fase 5, que no es de build

```
wasm32-unknown-unknown  panic="abort"
aarch64-linux-android   panic="unwind"
aarch64-apple-ios       panic="unwind"
```

Verificado con `rustc --print cfg`. **En wasm no hay red de `catch_unwind`.** El `panic = "unwind"`
del perfil se ignora en ese target, así que un pánico del core en la ruta WASM no vuelve como error
del FFI: es un trap que deja la instancia del módulo inutilizable. Lo único que protege a la app
Angular es la disciplina de la regla 5 (cero `panic!`/`unwrap()`/`expect()` en producción) y los
proptests `*_never_panics` del core. No hay segunda red.

El binario, para referencia: **178 KB** en release.

### Y el hueco que la Fase 5 va a encontrar si nadie lo tapa

El `exports` de `package.json` **no tiene entrada web**. Hoy es:

```json
"banco-core-financiero-source": "./src/index.tsx",   ← Metro y Jest
"types": "./lib/typescript/src/index.d.ts",
"default": "./lib/module/index.js"                   ← el entrypoint JSI
```

Cuando Angular haga `import { calculateItf } from '@banco/core-financiero'` va a caer en
`default`, que llama a `installRustCrate()` y a Hermes. Nada de eso existe en un browser.

El artefacto va a estar construido y probado, pero **sin la puerta por la que la Fase 5 entra a
buscarlo**. Corresponde resolverlo en el Bloque 3, cuando `src/generated-wasm/` exista y se sepa a
qué archivo apuntar.

## `Intl.NumberFormat` y por qué el formateador está escrito a mano

El plan asumía que había que escribirlo a mano porque **Hermes no garantiza** pasar un string a
`format()`. Se comprobó sobre los tres runtimes y **esa premisa es falsa**: los tres lo soportan y
además coinciden entre sí.

| Runtime | Resultado | Code points |
|---|---|---|
| Hermes / Android (emulador Pixel 9, API 36) | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |
| Hermes / iOS (simulador iPhone 17 Pro) | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |
| Node / V8 (proxy del navegador) | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |

**Y sin embargo la decisión del plan era la correcta, por una razón mucho más fuerte.** Mirá el
tercer code point: `a0`. Es **U+00A0, espacio duro**, no un espacio normal (`20`).

Las otras dos apps formatean a mano:

- `apps/android/.../format/MoneyFormatter.kt` → `"S/ $sign$grouped.$decimals"`
- `apps/ios/.../Format/MoneyFormatter.swift` → `"S/ \(parsed.sign)\(grouped).\(...)"`

Las dos con **espacio normal**. O sea que usar `Intl` acá produciría `S/\u00A04,899.99` donde
Android y iOS producen `S/ 4,899.99`: **una diferencia de un byte, invisible en pantalla, que
rompe exactamente la comparación carácter por carácter que la POC existe para demostrar.** El
peor modo de fallar posible — el que se ve bien en la demo y está mal.

Hay además una razón de fondo: la coincidencia entre los tres runtimes **no es contractual**. Sale
de que hoy, en esta máquina, los tres empaquetan datos de ICU compatibles. Android delega en el
ICU del sistema, que cambia con la versión de Android; iOS en el de Apple; cada navegador en el
suyo. Apostar la tesis central de la POC a que cuatro plataformas mantengan ICU alineado es una
apuesta que no hace falta tomar.

`formatPEN` replica la semántica de las otras dos, incluido separar el signo **antes** de agrupar
—sin eso, `-123456.78` sale como `S/ -,123,456.78`, que es un bug que Android ya encontró y dejó
documentado en su formateador—.

## `react-native-safe-area-context` en vez del `SafeAreaView` del core

El plan usaba el `SafeAreaView` de React Native. **No alcanza, y el motivo no es cosmético.**

1. Está **deprecado** en RN 0.87 y emite un `console.warn` en cada render. En builds de desarrollo
   eso levanta el banner de LogBox, que **tapa el pie de `coreVersion()`** — justo el elemento que
   la demo compara entre las cuatro apps.
2. **En Android no aplica inset inferior**, así que la barra de cuatro pestañas quedaba pegada al
   borde, solapada con la zona de gestos del sistema. Medido: la barra estaba en `y[2727-2856]`
   sobre una pantalla de 2856 px de alto. Con la librería pasa a `y[2655-2784]`, despejada.

Costo: un módulo nativo más, o sea reconstruir las dos apps. `pod install` pasó de 87 a 88 pods.

Y destapó otra vez la estrictez de pnpm: cualquier librería con `codegenConfig` dispara
`generateCodegenSchemaFromJavaScript`, que invoca `example/node_modules/@react-native/codegen`, que
no existe porque es transitiva de `react-native`. Se declara como devDependency directa, igual que
`@react-native/gradle-plugin`.

**Advertencia para quien agregue otra librería nativa:** después de instalarla hay que **reiniciar
Metro con `--reset-cache`**. Sin eso el bundle viejo sigue sirviéndose y el síntoma es engañoso —
acá dio `ReferenceError: Property 'window' doesn't exist`, que no tiene nada que ver con la causa.
