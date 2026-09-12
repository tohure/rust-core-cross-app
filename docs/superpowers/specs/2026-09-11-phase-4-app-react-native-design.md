# Fase 4 — `apps/react-native`: diseño

**Fecha:** 2026-09-11
**Rama:** `feat/phase-4-app-react-native`
**Entrada:** [apps/react-native/CONTEXT.md](../../../apps/react-native/CONTEXT.md) y
[docs/ui-spec.md](../../ui-spec.md)
**Estado:** aprobado, pendiente de plan de implementación

## Qué entrega esta fase

El tercer consumidor de `rust-core`, el primero que cruza por **JSI** —ni JNA ni un `.a`
enlazado— y el que **desbloquea la Fase 5** produciendo el paquete WASM. Al cerrar, la fase
deja:

1. El **test de contrato en verde por dos rutas**, 28/28 por N-API y 28/28 por WASM contra
   `contracts/cases.json` v2.3.0, más el smoke JSI verificado en emulador y en aparato.
2. `apps/react-native/README.md` con los comandos **efectivamente ejecutados** y su diagrama
   Mermaid, más `BUILD.md`, `TESTING.md` y `PENDING.md`.
3. Las cinco pantallas de [`docs/ui-spec.md`](../../ui-spec.md), con los mismos labels y el
   mismo orden de campos que Android e iOS.

**Lo que existe hoy:** `apps/react-native/` contiene un único archivo, `CONTEXT.md`. No hay
una línea de TypeScript, ni `package.json`, ni workspace en la raíz del repo.

## El riesgo, y por qué ordena todo lo demás

En la Fase 2 el riesgo era que nada había cruzado JNA; en la Fase 3, que nada había enlazado
el XCFramework. Acá el riesgo es anterior y peor: **la herramienta no puede consumir el core
tal como está.**

| Riesgo | Estado verificado durante el brainstorming |
|---|---|
| `ubrn` fija `uniffi = "=0.31"`; el core usa **0.32** | **confirmado** en su `Cargo.toml:27-30`, y también en la rama `main` |
| El choque no avisa limpio | `UNIFFI_CONTRACT_VERSION` sigue en `30` en las dos versiones, pero el **encoding de metadata cambió**: 0.32 escribe un `orig_name: Option<String>` extra por función y record, y reasignó códigos de tipo (`TYPE_BOX` 26, `TYPE_HASH_SET` 27 donde 0.31 tenía `TYPE_CALLBACK_TRAIT_INTERFACE` 25). Un lector 0.31 sobre bytes 0.32 se desincroniza |
| `ubrn` no está instalado, y **se compila con cargo** al primer uso | `which ubrn` → nada; `bin/cli.cjs` hace `cargo run --manifest-path node_modules/.../ubrn_cli/Cargo.toml` |
| El flavour `wasm2` con nuestro crate | nunca ejecutado, y **sin página de documentación** (ver D5) |
| Que JSI resuelva los símbolos en un aparato | nunca ocurrió |

De ahí el orden, que es el mismo que ya pagó dos veces en esta POC: **el primer commit no es
una pantalla.** Es la cadena entera —bajar el core a 0.31, instalar ubrn, generar, compilar el
turbo module— hasta **llamar a `coreVersion()`**. Si pasa, el resto es mecánico. Si falla,
falla en el minuto diez con un mensaje claro y no en la hora doce.

Lo que sí es nuevo respecto de las dos fases anteriores: hay un **paso cero, y es en
`rust-core`**. Bajar el core y descubrir tres días después que rompió Android sería el peor
momento posible para enterarse.

El entorno verificado sobre el que se apoya todo esto: Node 22.16, pnpm 11.1.3, Java 21 LTS,
Xcode 26.6, NDK 30.0.16248370, Rust 1.98.1 con los cinco targets de Android e iOS ya
instalados, y un emulador Android disponible.

---

## Decisiones

### D1 — El core baja a uniffi 0.31, y eso es el paso cero de la fase

`uniffi = "0.31"` en el `Cargo.toml` del workspace, que resuelve a **0.31.2**. Desde
`0.31.0-5` ubrn relajó su pin de `=0.31.0` a `=0.31`, así que no hay que clavar el patch.

**Por qué no las alternativas**, con la documentación de upstream y no con opinión:

- **Esperar a que ubrn soporte 0.32** no tiene fecha. El
  [issue #449](https://github.com/jhugman/uniffi-bindgen-react-native/issues/449) —*"Upgrade
  to uniffi-rs 0.32 (next release becomes 0.32.0-6)"*— está **abierto, sin asignar y con cero
  comentarios** desde el 2026-08-21. uniffi-rs 0.32.0 salió el 2026-06-30.
- **Forkear y subir el pin** no es subir un pin. El propio autor lo dimensiona en ese issue:
  *"`[ByRef] bytes` now crosses the FFI as `ForeignBytes` … This is the big one. `ForeignBytes`
  appears 22 times across the generator and every runtime … Every flavour — jsi, napi, wasm,
  wasm2 — needs checking"*, y cierra con *"0.29 → 0.30 and 0.30 → 0.31 were both real
  migrations rather than dependency bumps … Budget accordingly."*
- **Una versión distinta del core para RN** rompe el invariante de la POC: cuatro strings
  idénticos de `coreVersion()` en pantalla son la prueba de que las cuatro apps corren el
  mismo build.

**Lo que cuesta la bajada, medido y no estimado.** Verificado en copia aislada del workspace:

| Comprobación | Resultado |
|---|---|
| `cargo test --workspace` sobre uniffi **0.31.2** | **67 en verde**: 3 del lib de `ffi`, 11 del test de contrato (los 28 vectores), 47 de `domain`, 6 de `proptest` |
| API pública **Kotlin** 0.31 vs 0.32 | **idéntica** — mismas nueve funciones, mismas subclases de `DomainException`, mismos campos de los Records |
| API pública **Swift** 0.31 vs 0.32 | **idéntica** — mismas nueve funciones, y `DomainError` conserva `Swift.Error, Equatable, Hashable, Foundation.LocalizedError` |

O sea: **ni Android ni iOS tocan una línea de código de app.** Cambian solo los archivos
generados, y solo por dentro. `crates/ffi` usa únicamente la superficie más vieja y estable de
uniffi —`setup_scaffolding!`, `uniffi::Error`, `uniffi::Record` y `#[uniffi::export]` sobre
funciones libres— y ahí no hay nada que 0.31 no tenga.

Va en **su propio commit en `rust-core`**, separado de todo lo demás, con la justificación en
el mensaje. **`rust-core/PENDING.md` registra el techo**: el core queda anclado a 0.31 *por
ubrn*, y el issue #449 es la condición para desanclarlo. Sin esa nota, dentro de seis meses
alguien va a ver un pin viejo sin saber por qué está.

**Gate duro:** Android 43/43 e iOS 47/47 en verde *sobre el core en 0.31* antes de que exista
una línea de TypeScript.

### D2 — Librería + app en `example/`

`ubrn` genera **archivos de una librería**: `codegenConfig` en `package.json`, un podspec, un
`android/build.gradle`, un `CMakeLists.txt` y un `index.tsx` que es *el entrypoint de la
librería*. Su tutorial parte de `create-react-native-library` tipo turbo module, con la app de
demo en `example/`. El `Estructura` del CONTEXT, que dibuja un proyecto único con `src/screens/`
al lado de `src/generated/`, no contempla eso (ver Correcciones).

La librería posee la frontera nativa —`cpp/`, `src/generated/`, podspec, `CMakeLists.txt`— y
expone **una sola superficie**: las nueve funciones en TypeScript. `example/` tiene las cuatro
pantallas y **nunca importa uniffi**.

Eso no es solo seguir el camino documentado: es el mismo desacople que la evaluación técnica de
Android propone en su recomendación 3.2 —extraer `:core-financiero` del monolito `:app`, que hoy
es un único `include(":app")`—, conseguido por **frontera de paquete**
en vez de módulo Gradle. Sus tres beneficios escritos valen igual: la app no conoce la capa
nativa, el bundler no la reevalúa al tocar una pantalla, y sustituir el core por otra fuente
—WASM, un mock, KMP— cambia el paquete y no las pantallas. **`apps/react-native` es la primera
app de la POC que nace con esa estructura**; Android e iOS se retrofitean en su propia rama, no
en esta (D7).

Y desbloquea la Fase 5 sin inventar nada: ese paquete es el
`@banco/core-financiero` que el diagrama de `CLAUDE.md` ya tiene dibujado.

**El README lleva escrito, en prosa, por qué el turbo module es agnóstico del bundler.** Es una
pregunta que la demo va a recibir —*"a ustedes les funciona porque usan Metro; nosotros
construimos con Re.Pack"*— y la respuesta es que la premisa es falsa: un turbo module **no lo
bundlea nadie**. Es código nativo que enlazan Gradle y CocoaPods y que se registra contra el
runtime de JS; Metro, Re.Pack, rspack y webpack bundlean *JavaScript*. Cambiar de bundler no
cambia cómo se compila, se enlaza ni se llama al core.

Va más lejos, y conviene tenerlo listo: **el core no se puede federar aunque se quisiera.**
Module Federation reparte bundles de JS en runtime; el core es binario que viaja dentro del
`.apk` y del `.ipa`. Se pueden federar las pantallas que lo llaman, nunca el core. Re.Pack y el
split de módulos de Android **no son dos formas de lo mismo**: uno resuelve distribución en
runtime y el otro frontera de compilación, y el que esta POC necesita es el segundo.

### D3 — Stack pinneado y público, sin Re.Pack

| Paquete | Versión | Verificado |
|---|---|---|
| `react-native` | 0.85.3 | existe en npm público |
| `react` | 19.2.3 | existe |
| `@react-native-community/cli` | 20.1.0 | existe |
| Node (engine) | ≥22 | instalado: 22.16 |
| pnpm | 11.21.x | instalado: **11.1.3 — hay que subirlo** |

Nueva arquitectura obligatoria, que en RN 0.85 ya es el default. **Sin
`@mbbk/react-native-preset`**: devuelve **404 en npm público**, es un paquete privado y este
entorno no tiene credenciales para su registry. **Sin Re.Pack ni Module Federation**, que es lo
que `CLAUDE.md` y el CONTEXT ya dicen, con el argumento de D2 escrito donde se pueda encontrar.

Riesgo anotado, no resuelto: `create-react-native-library` está en **0.63.1** y el tutorial de
ubrn se probó con 0.35.1 y 0.42.3 sobre RN 0.75 y 0.76. Su CI declara una matriz *date-derived*
que cubre los últimos 12 meses de React Native, así que 0.85 debería entrar. Si hay drift, se
baja a lo que ubrn cubra y **se documenta el porqué** en `BUILD.md`.

Dependencias obligatorias del código generado, que el CONTEXT no menciona: **`@ubjs/core`** (el
runtime TypeScript, lo importa todo lo generado) y **`@ubjs/node`** (el addon N-API, para la
ruta de test de D4). `uniffi-bindgen-react-native` es dependencia regular, no de desarrollo,
porque además del CLI trae el runtime C++/JSI contra el que compila el turbo module.

### D4 — Tres rutas al mismo core, y qué prueba cada una

| Verificación | Qué prueba, que ninguna otra puede | Dónde | Cuándo |
|---|---|---|---|
| Smoke `coreVersion()` por **JSI** — **manual**, ver abajo | que el turbo module carga y los símbolos resuelven — el camino que la app embarca | emulador y aparato | **primer commit** |
| Contrato **N-API**, 28 casos | TS ↔ Rust nativo, igualdad exacta de strings | Jest, en el host | segundo |
| Contrato **WASM**, 28 casos | el artefacto que consume la Fase 5, probado ya en la 4 | Jest, en el host | con el spike de D5 |
| Hooks con `FakeCore` | estados, errores, limpieza | Jest | con cada pantalla |
| Baseline TS **en rojo a propósito** | que TypeScript diverge sobre `cases.json` | Jest | material de presentación |

La primera fila **no es una suite y no se automatiza**: React Native no tiene corredor de
tests en dispositivo. El porqué y su consecuencia están en "La corrección que el diseño se hace
a sí mismo", más abajo, y van escritos en `PENDING.md`.

La ruta N-API existe desde `ubrn 0.31.0-3`: `ubrn generate napi bindings --library <cdylib>
--ts-dir <dir> --lib-colocated` genera bindings que cargan con libffi el `cdylib` que produce un
`cargo build` normal del host. No hay comando `build` de punta a punta para napi: se compila con
cargo y se genera. Detalle que importa y que está en el CHANGELOG: el cuelgue de
`worker_threads` —que es como Jest corre los tests por defecto— **se arregló justo en
`0.31.0-5`**, la versión que usamos.

**Las cinco guardias van igual**, por el mismo motivo que en Rust, Kotlin y Swift: versión
`2.3.0` y moneda `PEN`; conteo por grupo (`aritmetica` 6, `cci` 4, `itf` 5, `tarjeta` 6,
`transferencia` 7, `cuentas_iniciales` 2); claves de primer nivel desconocidas **y** faltantes,
en los dos sentidos; el `switch` exhaustivo de las nueve variantes de `DomainError` con el
`default` que asigna a `never`; y la que ata el `messages.es.json` realmente cargado a esas
nueve variantes.

Con una advertencia propia de esta plataforma: en Rust y en Swift **se verificó por mutación**
que un grupo vaciado a `[]` reporta éxito, y esa es la razón por la que existe la guardia de
conteo. En Jest el comportamiento de `it.each([])` es distinto y **hay que verificarlo por
mutación en esta fase, no asumirlo**. La guardia va igual; lo que tiene que ser verdadero es el
motivo escrito al lado.

### D5 — `wasm2`, con spike antes del commit y plan B escrito

`ubrn 0.31.0-5` trae **dos** flavours de WASM. Se elige **`wasm2`**: un solo build de cargo, sin
crate shim, y el bundle sale neutral —el mismo sirve para Node, navegador y React Native—, que
es exactamente lo que la Fase 5 necesita.

Los tres requisitos, leídos del validador en `crates/ubrn_cli/src/wasm2/commands.rs` y no de un
manual: el crate debe producir **`cdylib`** (ya lo hace), enlazar **`uniffi-runtime-wasm`**, y
declarar **`uniffi_core` (o `uniffi`) con el feature `single-threaded`** — wasm es monohilo, y
sin eso uniffi exige `Send + Sync`. `ubrn build wasm2` valida los tres por adelantado con
mensajes explícitos, en vez de dejar que cargo falle después.

**Lo que hay que saber antes de elegirlo, y por eso está escrito acá:** `wasm2` se publicó el
2026-08-20/21, tiene tres semanas, y **no tiene página en el libro de documentación de ubrn**.
Buscado: `wasm2` aparece en un único archivo del libro, y es `contributing/cutting-a-release.md`.
La guía web documenta el flavour **viejo**. Lo que existe para `wasm2` son las notas de release,
que son detalladas, y la suite de fixtures de CI, que sí lo cubre entera. En la práctica: **si
algo falla, no hay página que consultar** — hay que leer el código de ubrn y sus fixtures.

De ahí que el diseño absorba ese riesgo de dos maneras:

1. **El primer commit de la parte WASM es un spike**: construir y llamar a `coreVersion()`,
   **antes** de commitear ningún cambio a `crates/ffi`.
2. **Plan B escrito**: el flavour `wasm` viejo, que es barato justamente porque no toca el core
   —genera un crate shim anotado con `wasm-bindgen` y lo compila con `wasm-pack`—. Si `wasm2` no
   sale, se cae ahí y se documenta.

**Duda abierta que el spike tiene que contestar:** si el chequeo de ubrn —que lee `cargo
metadata`— ve un feature declarado bajo una dependencia condicionada por target
(`[target.'cfg(target_arch = "wasm32")'.dependencies]`). Si lo ve, el cambio queda confinado a
wasm y Android e iOS no se enteran. Si no lo ve, el feature va incondicional: **inerte para
nosotros** —el core no exporta objetos, así que `Send + Sync` no aplica a nada— pero es un
cambio al crate compartido, y entonces Android e iOS vuelven a entrar en reverificación.

Y lo que ya está escrito y sigue valiendo: en wasm **no hay red de `catch_unwind`**, porque
`wasm32-unknown-unknown` impone `panic = "abort"`. Lo único que protege esa ruta es la regla 5
—cero `panic!`/`unwrap()`/`expect()` en producción— y los proptests `*_never_panics` del core.

### D6 — Lo que NO se desacopla, y es decisión, no olvido

**Sin `toDomain()`.** `Account`, `TransferRequest`, `TransferResult`, `ValidCci` y `ValidCard` se
usan tal como los emite ubrn. El adapter **reexporta, no traduce**: una segunda nomenclatura en
TypeScript hay que mantenerla a mano y se desincroniza en la primera regeneración de bindings.
Es la misma decisión de Android (D5 de su spec) y de iOS (D9).

**El mapeo `e.tag` → nombre del contrato sí va en producción.** `contracts/messages.es.json`
está indexado por el nombre del contrato (`Longitud`, `DigitoControl`, `MismaCuenta`…), no por
el de la variante, así que la UI lo necesita para mostrar un mensaje. Va exhaustivo, con el
`default` que asigna a `never` para que una décima variante rompa `tsc` en vez de pasar en
verde. **El test de contrato reusa esa misma función** en vez de escribir su copia: así se
verifica contra `cases.json` el mapeo que la UI usa de verdad.

**El `message` del binding es diagnóstico, nunca texto de usuario.** uniffi no usa los
`#[error("...")]` en español del core: arma el mensaje con los campos de la variante y lo deja
vacío para las que no tienen campos. Es el modo de fallar más caro, porque rompe la paridad sin
que ningún test falle.

**Los placeholders se interpolan crudos** —`{available}`, `{id}`, `{code}`, `{required}`,
`{field}`— tal como los devuelve el core. Nada de `Intl.NumberFormat` ahí: los formateadores de
Android, iOS y el navegador no coinciden entre sí, y una diferencia rompe la comparación
carácter por carácter que es toda la tesis.

### D7 — La evaluación de Android se transfiere a los PENDING, y el documento no se versiona

`docs/android-rust-core-evaluation.md` es un **documento de trabajo local, deliberadamente no
versionado**: se escribió para ser leído y destilado, no para vivir en el repo. Verificado hoy:
`git status` lo marca `??`, `git log` no tiene una sola entrada para él, y **ningún archivo del
repo lo menciona** — ni `apps/android/PENDING.md`, ni `apps/ios/PENDING.md`, ni `CLAUDE.md`.

Eso deja siete recomendaciones —dos de prioridad Alta: extraer `:core-financiero` y configurar
`ndk.abiFilters`— viviendo únicamente en un archivo que nadie versiona. Es el modo de fallar que
`CLAUDE.md` ya describe: *"Una recomendación que vive solo en una conversación no existe."*

Esta fase **transfiere su contenido**, en su propio commit y sin aplicar ninguna recomendación:

| Destino | Qué va |
|---|---|
| `apps/android/PENDING.md` | las siete recomendaciones con su prioridad, redactadas para valer por sí solas |
| `apps/ios/PENDING.md` | las que apliquen a iOS — la modularización es la principal, porque el argumento de KMP vale igual ahí |

**El criterio de "transferido" es que el documento original se pueda borrar sin perder nada.**
Esa es la prueba de que la transferencia está completa, y es lo que autoriza a borrarlo: hasta
que los dos `PENDING.md` estén escritos, el archivo se queda donde está.

**No aplica ninguna recomendación**: modularizar Android o iOS es trabajo de sus fases, en su
propia rama.

### D8 — Estructura: espejo de Android e iOS

```
apps/react-native/                    ← el paquete
├── CONTEXT.md · BUILD.md · TESTING.md · PENDING.md · README.md
├── ubrn.config.yaml · package.json · tsconfig.json · jest.config.js
├── cpp/ · android/ · ios/            turbo module generado · gitignorado
├── src/
│   ├── generated/                    bindings JSI · NO EDITAR
│   ├── generated-napi/               bindings N-API · NO EDITAR
│   ├── generated-wasm/               bindings wasm2 + .wasm · NO EDITAR
│   └── index.tsx                     entrypoint: las nueve funciones
├── __tests__/                        contrato N-API · contrato WASM · guardias
├── __benchmarks__/baseline.ts        la excepción, comentada
└── example/                          ← la app de la demo
    ├── App.tsx                       cuatro pestañas + pie de coreVersion()
    └── src/
        ├── adapter/                  core.ts · ContractMessages.ts
        ├── contract/                 ContractSource · MessageSource
        ├── format/                   money.ts
        ├── ui/components/            ScreenHeader · LabeledField · ResultRow
        │                             SectionDivider · CoreVersionFooter
        ├── screens/                  arithmetic · transfer · card · benchmark
        │                             (Screen + UiState + useXxx por pantalla)
        └── benchmark/                NativeBaseline.ts (la excepción, comentada)
```

**Identificadores en inglés**, como manda `CLAUDE.md`. El espejo archivo por archivo con
`apps/android/app/src/main/java/dev/tohure/android_rust_test/` y con
`apps/ios/ios-rust-test/` no es estética: la demo es una comparación lado a lado, y el code
review también.

**Tres directorios generados en vez de uno**, porque son tres flavours del mismo core. Mezclarlos
sería el modo de fallar más caro de esta fase: un test en verde contra bindings que no son los
que la app embarca.

Estado por pantalla según [`docs/ui-spec.md`](../../ui-spec.md): un objeto de estado inmutable
en un hook `useXxx()`, con `useState`/`useReducer`. Todos los montos del estado son `string`, el
estado no calcula, y un error del core es un campo del estado ya resuelto a texto de usuario.

### D9 — Gates por tarea

Sin cambios respecto de las fases 2 y 3: **TDD** → **`/simplify`** → **`requesting-code-review`**
→ **`verification-before-completion`**. `/security-review` no es gate acá: `skills-by-phase.md`
lo reserva para `rust-core`.

Formato y lint: Prettier y ESLint con la configuración que traiga el scaffolding, más `tsc`
en modo estricto. `src/generated*/` queda fuera del lint —es artefacto— pero **dentro** de
`tsc` si `strictTypeChecking` lo permite.

---

## La corrección que el diseño se hace a sí mismo

Al bajar a detalle de archivos se cae un supuesto: **el smoke JSI no puede ser un test
automatizado.** React Native no tiene corredor de tests en dispositivo; Jest mockea los módulos
nativos, y lo único que cruzaría JSI de verdad sería un e2e con Detox — una pila entera que esta
POC no necesita y que `CLAUDE.md` no pide.

El smoke JSI queda entonces como **gate manual documentado**: correr la app en emulador y en
aparato y verificar que el pie muestra el mismo string que las otras tres apps. Sigue siendo el
primer commit y sigue ordenando la fase, pero es una verificación con comando escrito en el
`README.md`, no una suite.

**La consecuencia va escrita en `PENDING.md`, no escondida: nada automatizado prueba el camino
JSI en esta app.** Android sí lo tiene —15 tests instrumentados— y acá no lo vamos a tener. Lo
que sí queda automatizado y cruzando a Rust real son las dos rutas de contrato, 28/28 cada una,
que es más de lo que automatiza la suite rápida de Android, donde los 28 corren contra un
`FakeCoreFinanciero`.

---

## Correcciones que esta fase arrastra

Cada una en su propio commit, separada de la implementación. Todas encontradas verificando:

1. **`CLAUDE.md` tiene mal el comando de verificación de la Fase 4.** Dice `npx ubrn --version`,
   y eso falla con **E404**: `ubrn` no existe como paquete en npm. El binario lo trae
   `uniffi-bindgen-react-native`, y el comando real sale de ahí.
2. **El `Estructura` del CONTEXT** no contempla librería + `example/` (D2).
3. **El `ubrn.config.yaml` del CONTEXT** usa `web: wasmCrateName:`, que es del flavour viejo; con
   `wasm2` cambia (D5).
4. **Los scripts del CONTEXT** dicen `ubrn build web`; con `wasm2` es otro subcomando.
5. **El CONTEXT no menciona `@ubjs/core` ni `@ubjs/node`**, hoy dependencias obligatorias del
   código generado (D3).
6. **La nota del CONTEXT sobre los nombres derivados se mantiene y se ejecuta**: contrastar
   `src/generated/` contra la lista de nueve funciones al primer `--and-generate`, **antes** de
   escribir el adapter. Si algo difiere, se corrige el CONTEXT con el archivo generado a la
   vista.
7. **`rust-core/CONTEXT.md` y `rust-core/PENDING.md`** registran el ancla a uniffi 0.31 y el
   issue #449 como condición para desanclar (D1).

---

## Fuera de alcance

Re.Pack y Module Federation —con el argumento de D2 escrito de por qué no aplican—, Expo, Detox
y cualquier e2e, red, persistencia, async más allá del `simulatedLatencyMs`, i18n más allá del
español, publicación a npm, firma de release, y **aplicar** las recomendaciones de la
evaluación de Android (D7 solo las transfiere).

---

## Criterio de cierre

La fase termina cuando están las cuatro cosas, no una:

1. **Gate previo:** Android 43/43 e iOS 47/47 en verde sobre el core en uniffi 0.31.
2. **Contrato 28/28 por N-API y 28/28 por WASM**, más el smoke JSI verificado en emulador y en
   aparato.
3. **`apps/react-native/README.md`** con los comandos efectivamente ejecutados y su diagrama
   Mermaid —el camino desde el crate `ffi` hasta la pantalla, con las tres salidas—, más
   `BUILD.md`, `TESTING.md` y `PENDING.md`.
4. **Las cinco pantallas**, con los labels exactos de [`docs/ui-spec.md`](../../ui-spec.md).
