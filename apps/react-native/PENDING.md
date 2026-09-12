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

---

## `collapsable={false}` en los cuatro contenedores compartidos: un defecto de Fabric, no una preferencia

**Es la deuda más importante de este archivo**, porque es un workaround de un bug de React
Native que alguien va a querer "limpiar".

Un `View` que sólo aporta layout lo **aplana** Fabric en Android: no crea vista nativa y cuelga
sus hijos del padre. Cuando encima de una lista de esas filas se **inserta** otro bloque —el
`Resultado` de Transferencia al llegar el comprobante, el de Tarjeta al cifrar—, la contabilidad
de índices nativos se corre y las filas de abajo quedan con su `<Text>` de label **pegado a la
vista equivocada**: se pinta encima de otra fila y su valor queda huérfano.

Acotado por bisección en el emulador (Pixel 9 Pro API 36, RN 0.87, Fabric):

- **Sin los tres `LabeledField` el defecto desaparece.**
- Con tres `<Text>` o tres `<TextInput>` **pelados** en su lugar, tampoco aparece.
- O sea: no es el `TextInput` ni la cantidad de hermanos. Lo dispara tener **varios
  contenedores de fila aplanados**.

Cuatro hipótesis quedaron descartadas con evidencia, no abandonadas: envolver el bloque en un
`View`, quitar el `gap` del contenedor raíz, darle a la lista su propio `View`, y un contenedor
estable y no aplanado (esa **empeoró** el síntoma). Forzar el remonte con `key` **arreglaba** la
pantalla y no era la causa — era el síntoma tapado.

**Reglas que quedan, y no son negociables:**

1. `ScreenHeader`, `LabeledField`, `ResultRow` y `SectionDivider` llevan `collapsable={false}`.
   **Los cuatro.** Con tres —`ScreenHeader` sin proteger, que es un `View` sin una sola
   propiedad visual— la pantalla de Tarjeta seguía rota. Con uno solo, el defecto no desaparece:
   se **mueve** de una fila a la siguiente.
2. **Todo contenedor compartido que se agregue tiene que llevarlo.** El criterio es «ningún
   contenedor compartido queda aplanado», no «parchear el que falla hoy». Parchear el que falla
   fue exactamente lo que hizo que reapareciera entre una pantalla y la siguiente.
3. **Ningún test de Jest puede cazar esto.** RNTL renderiza un árbol JSON y no tiene layout
   nativo. La guarda de `example/__tests__/PrimaryButton.test.tsx` sólo comprueba que la prop
   siga puesta; **la verificación real es mirar la pantalla en el aparato.**

En iOS la prop se ignora, así que no cambia nada ahí. Si una versión futura de React Native
arregla el aplanado, esto se puede quitar — pero hay que **volver a verificarlo en el emulador**,
no deducirlo del changelog.

---

## El benchmark no saca las mediciones del hilo principal, y no puede

`docs/ui-spec.md` dice que el Benchmark es «la única pantalla donde las llamadas al core van
fuera del hilo principal». En Android eso es `withContext(worker)` y en iOS `Task.detached`:
hilos de verdad.

**Acá no se cumple, y no es una omisión.** El JavaScript de React Native corre en un solo hilo y
esta app no tiene worker. El `setTimeout(0)` del hook sólo **cede el turno** para que el spinner
alcance a pintarse antes de que el bucle lo bloquee; mientras mide, la UI está congelada. Con
1000 iteraciones no se nota; con 999999 sí. Lo único que acota eso es el tope de 6 dígitos del
campo, igual que en las otras dos apps.

Si alguna vez importa de verdad, la salida sería un worker (`react-native-worklets` o similar),
que es una dependencia que esta POC no necesita.

## Los números del benchmark, y por qué no son comparables todavía

Medido con 1000 iteraciones, **en emulador y simulador, no en aparatos**:

| | p50 | p95 |
|---|---|---|
| React Native / Android (Pixel 9 Pro API 36) — core | 3,96 µs | 5,00 µs |
| React Native / Android — float nativo | 0,62 µs | 0,67 µs |
| React Native / iOS (sim. iPhone 17 Pro) — core | 8,75 µs | 10,83 µs |
| React Native / iOS — float nativo | 0,87 µs | 1,00 µs |

La Fase 3 anotó **172 µs para Android nativo (JNA)** y **0,33 µs para iOS nativo** (`.a`
estático). Poniendo los números uno al lado del otro, los 3,96 µs de acá sugieren que **JSI es
unas 43× más barato que el puente JNA** de la app nativa de Android, lo cual sería un dato
fuerte para la demo.

**No lo afirmes todavía.** No es una comparación limpia: distinto arnés de medición, emulador
contra aparato, y `performance.now()` de Hermes contra `System.nanoTime()` de la JVM. Antes de
decirlo en una presentación hay que medir las tres con el mismo criterio y sobre el mismo tipo
de hardware.

## Tres divergencias entre las apps, encontradas al escribir ésta

Ninguna rompe la comparación de strings, y ninguna se tocó desde acá porque son código de otras
fases. Quedan anotadas para la revisión:

1. **El campo `Hex cifrado` acepta mayúsculas en Android y no en iOS.** Android las convierte a
   minúscula; iOS las rechaza. `docs/ui-spec.md` dice `[0-9a-f]`, así que React Native sigue la
   spec y a iOS — **Android diverge de su propia spec**. Es inofensivo (el core sólo emite
   minúsculas, así que pegar entre apps siempre entra), pero es comportamiento distinto.
2. **El texto de ayuda de iOS se lista a sí mismo:** dice «el hex que produjo la app de iOS,
   React Native o Angular» **dentro de la app de iOS**. Android nombra correctamente a las otras
   tres. No está entre los labels normativos, pero es incorrecto.
3. **Con cero iteraciones, Android e iOS vuelven en silencio** (`?: return` y `guard … else
   { return }`), así que el botón no hace nada y parece roto. React Native muestra «Ingresa un
   número de iteraciones mayor que cero.». `ui-spec.md` no fija nada para ese caso; es una
   mejora que las otras dos podrían adoptar.

## `theme.mono` tuvo que partirse por plataforma

`'Courier'` es una familia real en iOS y **no existe en Android**, donde React Native cae en
silencio a la tipografía por defecto. Se descubrió en la pantalla de Tarjeta, donde
`ui-spec.md` exige que el hex «pueda compararse a simple vista contra las otras tres pantallas»
—con proporcional no se puede—. Ahora es `Platform.select({ ios: 'Courier', default:
'monospace' })`, el equivalente del `FontFamily.Monospace` que usa Android nativo.

**Si se agrega otra fuente al tema, verificarla en las dos plataformas antes de darla por
buena:** el modo de fallar es silencioso y sólo se ve mirando la pantalla.
