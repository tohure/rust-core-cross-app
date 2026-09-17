# Pendientes y deuda de `apps/react-native`

> **Qué es este archivo, para no leerlo mal.** Es un registro de **decisiones tomadas y huecos
> conocidos**, no una lista de tareas. Buena parte de lo que hay aquí es la explicación de por qué
> el WASM quedó como quedó, y sigue escrito a propósito: **el valor está en el porqué**, que es lo
> que evita que alguien reabra la discusión o "arregle" algo deliberado. Que el archivo se llame
> `PENDING.md` no significa que todo lo de adentro esté pendiente.
>
> **Lo que sigue genuinamente abierto, al 2026-09-17:**
>
> - **Ninguna prueba automatizada cruza JSI**, y es la diferencia real de esta app con Android e
>   iOS. Jest mockea los nativos y no hay corredor en dispositivo, así que **el smoke manual es
>   obligatorio antes de una demo**. Está desarrollado en «No hay CI» y en
>   [TESTING.md](TESTING.md).
> - **El benchmark no saca las mediciones del hilo principal, y no puede.**
> - **`@ubjs/wasm` se publica sólo en ESM**, con su consecuencia para Angular.
>
> Lo demás está cerrado, es explicación, o es una decisión —como la de no tener CI—.

> **Lo transversal no está aquí.** El cuadro comparativo de los cuatro benchmarks —medidos en
> aparatos físicos y cerrado en la Fase 7—, la ausencia
> de CI en las cinco bases de código, el `catch` genérico que muestra texto de diagnóstico como
> mensaje de usuario, las divergencias de paridad abiertas y la regla de que un `Record` de uniffi
> se reemplaza y no se muta viven en
> **[docs/cross-app-pending.md](../../docs/cross-app-pending.md)**. Un tema, un dueño: antes estaban escritos con distintas
> palabras en tres archivos, y corregirlo en uno dejaba mintiendo a los otros dos.


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
invocaba**. Los 71 tests del core siguen en verde con el feature apagado.

Pero es un cambio al crate compartido: **Android e iOS entran en reverificación** (Task 14).

> **Ya se hizo, y esto lo declaraba abierto.** La reverificación se cerró en la Task 14 de la
> Fase 5, y su evidencia vivía sólo en el ledger de esa fase. La Fase 6 la volvió a confirmar por
> tercera vez: las dos suites de Android en verde (56 tests) y las 53 de iOS, éstas **sobre un
> iPhone físico**. Corregido aquí para que el documento deje de pedir algo que ya está hecho.

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

### ~~Bloqueante: el `index.ts` de wasm2 no typechecka~~ — RESUELTO en el script

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

### La consecuencia para Angular, que no es de build

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

### ~~El `exports` sin entrada web~~ — el hueco nunca llegó a abrirse

El `exports` de `package.json` **no tiene entrada web**. Hoy es:

```json
"banco-core-financiero-source": "./src/index.tsx",   ← Metro y Jest
"types": "./lib/typescript/src/index.d.ts",
"default": "./lib/module/index.js"                   ← el entrypoint JSI
```

Cuando Angular haga `import { calculateItf } from '@banco/core-financiero'` va a caer en
`default`, que llama a `installRustCrate()` y a Hermes. Nada de eso existe en un browser.

Ese era el riesgo previsto mientras la Fase 5 no existía: el artefacto construido y probado, pero
**sin la puerta por la que Angular entra a buscarlo**.

**Resuelto, pero no como se preveía aquí.** La Task 4 de la Fase 5 no le agregó una condición
`"web"` al `exports` de `@banco/core-financiero`: el WASM pasó a vivir en un paquete propio,
`packages/core-financiero-wasm`, con su propia fachada tipada y su propio `exports`. Angular (y el
test de contrato por WASM) importan ese paquete directamente, nunca `@banco/core-financiero` — así
que el hueco que describe este apartado no llegó a abrirse: no había una puerta que tapar, porque
la puerta de esta app nunca fue la que la Fase 5 termina usando.

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

Las dos con **espacio normal**. O sea que usar `Intl` aquí produciría `S/\u00A04,899.99` donde
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
aquí dio `ReferenceError: Property 'window' doesn't exist`, que no tiene nada que ver con la causa.

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

**Aquí no se cumple, y no es una omisión.** El JavaScript de React Native corre en un solo hilo y
esta app no tiene worker. El `setTimeout(0)` del hook sólo **cede el turno** para que el spinner
alcance a pintarse antes de que el bucle lo bloquee; mientras mide, la UI está congelada. Con
1000 iteraciones no se nota; con 999999 sí. Lo único que acota eso es el tope de 6 dígitos del
campo, igual que en las otras dos apps.

Si alguna vez importa de verdad, la salida sería un worker (`react-native-worklets` o similar),
que es una dependencia que esta POC no necesita.

## Los números del benchmark — **medidos en los dos aparatos físicos**

Con `FfiCostProbe`, en release, sobre un **Pixel 6** y un **iPhone 12**, contra el artefacto
`1.0.0+959025f`. 2.000 iteraciones de calentamiento, 20.000 medidas, p50:

| | piso `coreVersion()` | `add` | `validateCard` (lanza) | baseline JS |
|---|---|---|---|---|
| React Native / Android — Pixel 6 | 4,23 µs | 9,44 µs | 14,89 µs | 1,18 µs |
| React Native / iOS — iPhone 12 | 2,29 µs | 4,71 µs | 7,58 µs | 0,67 µs |
| *(app nativa Android, mismo Pixel 6)* | *47,10 µs* | *145,9 µs* | *113,1 µs* | *2,12 µs* |
| *(app nativa iOS, mismo iPhone 12)* | *0,062 µs* | *0,42 µs* | *3,58 µs* | *0,15 µs* |

**Esta app es la que vuelve interesante al cuadro comparativo**, por dos motivos:

1. **El orden se da vuelta.** En el Pixel 6, React Native cruza **15× más barato** que la app
   nativa de Kotlin; en el iPhone 12, la app nativa cruza **11× más barato** que React Native. No
   hay un ganador de plataforma: hay un puente caro, que es JNA.
2. **Es el único control del hardware que existe en la POC.** Como usa el mismo puente JSI en los
   dos teléfonos, la diferencia entre sus dos filas **es** el aparato: 1,8× en el piso y 1,76× en
   la baseline de JS. Sin eso, a la comparación Android-nativo contra iOS-nativo se le puede
   objetar que son teléfonos distintos.

**El emulador mentía, y para el lado optimista.** La tabla anterior de este archivo daba 3,96 µs
para `add` en emulador; en el teléfono da 9,44. Misma lección que se llevó la app nativa de
Android.

### Cómo se mide, y por qué es más tosco que en las otras dos

La sonda vive en `example/src/benchmark/FfiCostProbe.tsx` y **se prende cambiando `PROBE_ON` a
`true`**, en vez de con un argumento del comando como en Android (`-e probe true`) o iOS
(`PROBE=1`). No es pereza: el preset de Babel de React Native **no inlinea `process.env`**, así
que una variable del build no llega al bundle sin agregar un plugin.

Los comandos exactos, y las tres cosas que cuesta descubrir —que `console.log` no sobrevive al
release, que hay que usar `nativeLoggingHook` **a nivel error**, y que en el iPhone el resultado
se lee de una captura de pantalla— están en [BUILD.md](BUILD.md).


## Tres divergencias entre las apps, encontradas al escribir ésta

Ninguna rompe la comparación de strings, y ninguna se tocó desde aquí porque son código de otras
fases. Quedan anotadas para la revisión:

1. ~~**El campo `Hex cifrado` acepta mayúsculas en Android y no en iOS.**~~ **Cerrada** por la
   Fase 6, bloque 1: Android era el que divergía de su propia spec y fue el que cedió. Ahora las
   tres rechazan lo que no sea `[0-9a-f]`.
2. **El texto de ayuda de iOS se lista a sí mismo:** dice «el hex que produjo la app de iOS,
   React Native o Angular» **dentro de la app de iOS**. Android nombra correctamente a las otras
   tres. No está entre los labels normativos, pero es incorrecto.
3. ~~**Con cero iteraciones, Android e iOS vuelven en silencio.**~~ **Cerrada** por la Fase 6:
   las dos adoptaron el texto que React Native ya mostraba, y `docs/ui-spec.md` lo volvió
   normativo. Las cuatro apps lo cumplen.

## `theme.mono` tuvo que partirse por plataforma

`'Courier'` es una familia real en iOS y **no existe en Android**, donde React Native cae en
silencio a la tipografía por defecto. Se descubrió en la pantalla de Tarjeta, donde
`ui-spec.md` exige que el hex «pueda compararse a simple vista contra las otras tres pantallas»
—con proporcional no se puede—. Ahora es `Platform.select({ ios: 'Courier', default:
'monospace' })`, el equivalente del `FontFamily.Monospace` que usa Android nativo.

**Si se agrega otra fuente al tema, verificarla en las dos plataformas antes de darla por
buena:** el modo de fallar es silencioso y sólo se ve mirando la pantalla.

## No hay CI, y el scaffold que simulaba tenerla se borró

> **No es un pendiente: se decidió no hacer CI en esta POC.** El razonamiento completo —y por qué
> el riesgo que iba a cubrir ya está cubierto por el chequeo del pie— está en
> [docs/cross-app-pending.md](../../docs/cross-app-pending.md). Lo de abajo se conserva porque
> explica por qué el scaffold que venía de fábrica no servía, que es lo que habría que evitar si
> algún día se retoma.

`create-react-native-library` dejó un `apps/react-native/.github/` con un `ci.yml`. **No podía
correr nunca**, por tres razones independientes:

1. GitHub Actions sólo lee `.github/workflows` en la **raíz del repositorio**, y en esta raíz no
   hay ningún `.github/`. El archivo era inerte.
2. Aun reubicado, `actions/setup/action.yml` corría `yarn install --immutable` y cacheaba por
   `hashFiles('yarn.lock')`. Este repo usa **pnpm**: no existe ningún `yarn.lock`.
3. El job de test corría `yarn test`, pero el proyecto `napi` de Jest necesita
   `src/generated-napi/` y `packages/core-financiero-wasm/generated/`, que están **gitignorados**
   y los produce `napi:generate` / `wasm:generate` — que a su vez necesitan Rust instalado.
   Ningún paso hacía nada de eso.

Un verde de esa CI no habría significado nada, y un rojo tampoco. Se eliminó entero en vez de
dejarlo simulando cobertura.

**Si alguna vez se quiere CI de verdad**, tiene que vivir en la raíz del repo y hacer, como
mínimo: instalar Rust con los targets, instalar pnpm, correr `napi:generate` y `wasm:generate`
antes de `pnpm test`, y correr también `cargo test --workspace`. Los tests instrumentados de
Android y los de iOS necesitan además emulador/simulador en el runner —y los 53 de iOS, que
corren sobre un iPhone, no los hace ningún runner—. **Nada de eso cruza JSI igual**, así que el
smoke manual seguiría siendo obligatorio antes de una demo.

## `packages/contract` tiene que declarar `@babel/runtime` — ahora con guardia

Encontrado al cerrar la Fase 5, corriendo la app en el emulador para comparar el pie de
`coreVersion()` entre las cuatro. La app arrancaba en **pantalla roja**:

```
Unable to resolve module @babel/runtime/helpers/interopRequireDefault
from packages/contract/src/messageFor.ts
```

**Causa.** La Fase 5 sacó el mapeo del contrato a `packages/contract` y esta app pasó a
consumirlo (`example/src/contract/sources.ts` reexporta `messageFor` desde ahí). Metro transpila
ese TypeScript con Babel, que inyecta `interopRequireDefault`, y **resuelve los helpers relativo
al archivo que transpila** — o sea desde `packages/contract/`, no desde el `example/`. Bajo el
`node_modules` estricto de pnpm ese paquete sólo veía `typescript` y `@types/node`. Verificado a
mano: `require.resolve('@babel/runtime/helpers/interopRequireDefault')` resolvía desde
`apps/react-native/example` y **no** desde `packages/contract`.

**Arreglo:** `@babel/runtime` como dependencia de `packages/contract`. Cualquier paquete del
workspace cuyo **código fuente** consuma esta app tiene que declararlo; no alcanza con que lo
tenga el consumidor.

**Por qué ningún test lo agarró, que es lo que importa.** Jest resuelve módulos distinto que
Metro y los 129 tests seguían en verde con la app rota. Es el mismo patrón que el
`collapsable={false}` de Fabric: **el aparato encuentra lo que el runner no puede**. Esta app no
tiene corredor de tests en dispositivo, así que la única red es el smoke manual — y esta vez
saltó recién al montar la demo de las cuatro apps, semanas después del cambio que lo introdujo.

**Desde la Fase 6 hay guardia**, en `src/__tests__/jest-setup.test.ts`: deriva de los
`package.json` qué paquetes del workspace consume esta app **por fuente** —los que tienen un
entrypoint `.ts`, o sea los que Metro transpila con Babel— y comprueba que cada uno tenga
`node_modules/@babel/runtime`. Bajo el `node_modules` estricto de pnpm ese symlink existe si y
sólo si el paquete lo declara, que es exactamente la condición que Metro necesita.

**Y comprueba el filesystem, no el resolver, tras dos intentos fallidos que vale la pena dejar
escritos.** Dentro de Jest no se puede preguntar «¿esto resolvería bajo pnpm?»: Jest parchea
`Module._resolveFilename` globalmente, así que su `require.resolve` ignora el `paths` que se le
pase, y hasta un `createRequire` de `node:module` termina pasando por su resolver. Las dos vías
daban **verde** para `@banco/core-financiero-wasm`, que no declara `@babel/runtime` — o sea una
guardia vacua, el mismo defecto que esta fase vino a corregir en otros lados. Se descubrió
mutando la guardia para que mirara también ese paquete; con la versión de filesystem, la mutación
falla como debe.

Lo que la guardia **no** cubre sigue igual: reproduce la condición, no el resolver de Metro. La
red real para esta app sigue siendo el smoke manual.
