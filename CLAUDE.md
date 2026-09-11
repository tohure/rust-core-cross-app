# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

POC para un núcleo de dominio escrito en Rust,
consumido sin reescribirse por cuatro frontends — Android nativo, iOS nativo,
React Native y web Angular.

La tesis que la POC debe probar es una sola: **la lógica de negocio (dominio + data)
se comparte, la UI varía por plataforma.** La evidencia es que las cuatro apps
producen strings idénticos carácter por carácter sobre el mismo set de casos.

**Idioma.** **Todo identificador va en inglés**, en las cinco bases de código: nombres de
archivos, carpetas, crates, ramas, funciones, tipos, campos, variables, constantes y
nombres de test (`validate_cci`, `execute_transfer`, `DomainError`, `Account.balance`).
Contenido de la documentación, comentarios, docs de función, textos de UI y mensajes de
commit: **español**. Commits en Conventional Commits.

Las siglas bancarias peruanas —`cci`, `itf`— **no se traducen**: son nombres propios, no
palabras. Sí llevan prefijo en inglés (`validate_cci`, `calculate_itf`, `ITF_RATE`).

**Excepción: `contracts/cases.json` conserva sus claves y sus nombres de error en
español** (`comision_itf`, `saldo`, `"MismaCuenta"`). Es un archivo de datos que las cinco
bases de código comparan por igualdad exacta de strings, no código; traducirlo obligaría a
un cambio *major* del contrato sin ganar nada. El puente vive en un solo lugar: en Rust,
`DomainError::contract_name()` devuelve el nombre en español que espera el contrato.

## Documentos de contexto por proyecto

**Lee el CONTEXT del subproyecto antes de tocar cualquier archivo dentro de él.**
Cada uno define su stack, su estructura, sus artefactos generados y sus prohibiciones.
Este CLAUDE.md solo cubre lo transversal; el detalle vive en esos archivos.

| Subproyecto | Contexto | Rol |
|---|---|---|
| `rust-core/` | [rust-core/CONTEXT.md](rust-core/CONTEXT.md) | Núcleo de dominio. Fuente de verdad del contrato de API. |
| `apps/android/` | [apps/android/CONTEXT.md](apps/android/CONTEXT.md) | Kotlin + Compose, vía uniffi (`.so` + bindings Kotlin). |
| `apps/ios/` | [apps/ios/CONTEXT.md](apps/ios/CONTEXT.md) | Swift + SwiftUI, vía uniffi (XCFramework). |
| `apps/react-native/` | [apps/react-native/CONTEXT.md](apps/react-native/CONTEXT.md) | RN nueva arquitectura, vía `ubrn`. **También produce el WASM.** |
| `apps/web-angular/` | [apps/web-angular/CONTEXT.md](apps/web-angular/CONTEXT.md) | Angular standalone, consume el WASM. |

Si un CONTEXT contradice a este archivo, gana el CONTEXT del subproyecto.
Si el contrato de API cambia, gana `rust-core/CONTEXT.md` y hay que propagarlo
a los cuatro consumidores más `contracts/cases.json` en el mismo cambio.

## Arquitectura: el grafo de dependencias de build

No es una estrella. Angular **no** consume el core directamente:

```
rust-core/crates/ffi  (único crate exportado; crates/domain es Rust puro y no conoce uniffi)
   │
   ├── cargo ndk + uniffi-bindgen kotlin ──> apps/android  (jniLibs/*.so + core/)
   ├── xcodebuild -create-xcframework    ──> apps/ios      (CoreFinanciero.xcframework + Generated/)
   └── ubrn (desde apps/react-native)
         ├── build android|ios --and-generate ──> apps/react-native (cpp/, src/generated/)
         └── build web                        ──> paquete WASM ──> apps/web-angular
```

Consecuencias que hay que tener presentes:

- **`apps/web-angular` depende del build de `apps/react-native`**, no del de `rust-core`.
  El `.wasm` se consume como paquete local del workspace (`@banco/core-financiero`);
  nunca se copia a mano dentro de `assets/`.
- `crates/domain` es Rust puro y no declara uniffi en su `Cargo.toml`. Eso lo mantiene
  testeable rápido, sin FFI de por medio, y hace que un `#[uniffi::export]` ahí adentro
  **no compile**: la frontera la sostiene el compilador. Solo `crates/ffi` lleva las macros.
- Cada app tiene un directorio de **artefactos generados que nunca se editan a mano**
  (ver el CONTEXT de cada una). Si algo generado está mal, se corrige en `rust-core`
  y se regenera.

## El invariante que sostiene toda la POC

Es una cadena. Romperla en cualquier eslabón invalida la demo:

```
rust_decimal::Decimal  (interno del core)
      → String         (frontera FFI, ya con la escala correcta: 2 decimales PEN)
      → String         (adapter, viewmodel, estado, props)
      → String         (hasta el widget de texto)
      → formateo solo en el borde de presentación (S/, separadores)
```

Reglas derivadas, válidas en los cinco proyectos:

1. **Ningún tipo de punto flotante toca un monto. Nunca.** Ni `f32`/`f64` en la API
   pública de Rust, ni `Double`/`Float` en Kotlin/Swift, ni `number`/`parseFloat`/
   `Number()`/aritmética en TypeScript. Tampoco en tests.
2. **Cero reglas de negocio fuera de `rust-core`.** Ninguna validación de CCI con
   regex, ninguna fórmula de cuota, ninguna tasa. Si estás escribiendo aritmética
   sobre montos en Kotlin, Swift o TS, estás haciendo lo contrario de lo que la POC
   demuestra. Única excepción permitida: los archivos `baseline` del benchmark
   (`__benchmarks__/baseline.ts`, `features/benchmark/baseline.ts`, `ui/benchmark/NativeBaseline.kt`
   en Android), que existen justamente para exhibir la divergencia de
   centavos y deben llevar un comentario que lo diga.
3. **Ninguna librería de decimales en las apps** (`decimal.js`, `big.js`, etc.).
   Necesitarla es señal de que el cálculo está en el lugar equivocado. Para comparar
   u ordenar en UI: `BigDecimal` (Kotlin) o `Decimal` de Foundation (Swift).
4. **Sin red, sin persistencia, sin async, sin I/O.** En el core son funciones puras;
   en las apps está fuera de alcance. Esto es una POC de dominio.
5. El core no hace `panic!`/`unwrap()`/`expect()` en producción: todo error es
   `Result` con `DomainError`. El mapeo a mensaje de usuario ocurre en la capa de
   UI, no en el adapter — el adapter propaga tal cual.

## `contracts/cases.json` — el contrato compartido

Es el artefacto central de la POC, no un detalle de testing. Un solo archivo de
vectores de contrato que las cinco bases de código leen: Rust (`tests/`), Android
(`androidTest/`), iOS (`XCTest`, desde el bundle de test), React Native (Jest) y
Angular (spec).

Las comparaciones son **igualdad exacta de strings** (`assertEquals` / `XCTAssertEqual`
/ `toBe`), nunca comparación numérica con tolerancia. Que ese test pase en las cuatro
plataformas *es* la demostración.

Reglas de cambio: agregar una función pública al core obliga a actualizar
`cases.json` en el mismo cambio. Si un caso de negocio no está en `cases.json`,
no lo implementes: pregunta primero. No se inventan reglas de dominio.

**Datos dummy.** Tasas, códigos de banco y montos son inventados: la POC demuestra que
cuatro plataformas producen el mismo string, no exactitud financiera. Los algoritmos sí
son internamente consistentes. Ver [contracts/README.md](contracts/README.md).

**Los seis casos de `aritmetica` divergen bajo IEEE-754** — está verificado. Si alguno
deja de diverger deja de servir para la demo y hay que reemplazarlo.

**El cifrado usa nonce fijo a propósito**, para que las cuatro plataformas produzcan el
mismo hex. En producción eso sería catastrófico; ver [contracts/README.md](contracts/README.md).

## Paridad entre apps

Los wireframes, los labels exactos y el orden de campos están en
**[docs/ui-spec.md](docs/ui-spec.md)**, normativo para las cuatro apps y única copia: los
CONTEXT apuntan ahí en vez de repetir la lista.

Las cuatro apps tienen las **mismas cinco pantallas, con los mismos labels y el mismo
orden de campos**: Aritmética, Transferencia, Tarjeta, Benchmark, y el valor de
`core_version()` visible al pie —la función se llama así en Rust; el binding generado es
`coreVersion()` en Kotlin, Swift y TypeScript—. Esto no es cosmético: la demo consiste en poner las cuatro lado a lado
y comparar. Cambiar un label en una app obliga a cambiarlo en las cuatro.

Ese string visible en las cuatro es la prueba en pantalla de que corren exactamente el
mismo build. No es automático: cada artefacto congela el SHA del momento en que se
construyó, así que hay que regenerar los cuatro desde el mismo HEAD antes de la demo (ver
[rust-core/README.md](rust-core/README.md)).

## Estado actual y flujo de trabajo (SDD con superpowers)

**Fases 0, 1, 2 y 3 completadas.** El núcleo existe, funciona, y Android e iOS lo consumen.
`rust-core/` tiene dos crates —`domain` (Rust puro, siete módulos) y `ffi` (paquete
`core_financiero`, la fachada uniffi)— con ~1930 líneas de Rust, **67 tests en verde** y el
**test de contrato pasando 28/28** contra `contracts/cases.json` **v2.3.0**. Los bindings Kotlin
y Swift se generaron y se verificó que las nueve funciones cruzan la frontera.

`apps/android/` es el primer consumidor real y **ya ejercita el borde FFI de verdad**: 43
tests en verde —28 de JVM y 15 instrumentados sobre dispositivo, de los cuales 9 son el
test de contrato—, las cuatro pantallas funcionando y el pie con `coreVersion()` visible en todas. Ver
[apps/android/README.md](apps/android/README.md).

`apps/ios/` es el segundo consumidor: las cuatro pantallas andando y **47 tests en verde**,
incluido el test de contrato 28/28, **verificados también sobre hardware real** —o sea sobre el
slice `aarch64-apple-ios`, que es el que se embarca y es un binario distinto del de simulador—.
El benchmark ya tiene número, y confirma la hipótesis por goleada: el piso del cruce cuesta
**0,33 µs en iOS contra 172 µs en Android**, o sea **521×** menos, porque iOS enlaza el `.a`
estáticamente mientras Android paga JNA. Está medido en un iPad M1 y no en un teléfono, así que
las cifras exactas son provisionales —la brecha es demasiado grande para que la explique el
chip, pero hay que repetirlo en un iPhone con iOS 17+—. Ver
[apps/ios/README.md](apps/ios/README.md) y [apps/ios/PENDING.md](apps/ios/PENDING.md).

Lo que **no** existe todavía: ni una línea de TypeScript. Lo que sigue es la Fase 4,
`apps/react-native`.

Este proyecto se desarrolla con **Spec-Driven Development** usando el plugin
`superpowers`. El flujo por fase es:

1. `superpowers:brainstorming` → spec en `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`
2. `superpowers:writing-plans` → plan en `docs/superpowers/plans/YYYY-MM-DD-<fase>.md`
3. `superpowers:subagent-driven-development` (o `executing-plans` sin subagentes) → ejecución
4. `superpowers:test-driven-development` durante la implementación —
   aquí es literal: el test de contrato de `cases.json` se escribe **antes** que el cálculo
5. `superpowers:verification-before-completion` antes de declarar una fase terminada
6. `superpowers:requesting-code-review` + `finishing-a-development-branch` para cerrar

Los CONTEXT de cada subproyecto **ya son la spec de entrada** de su fase: el
brainstorming de cada fase parte de ellos, no de cero.

`superpowers` 6.3.0 ya está habilitado para este repositorio vía
`.claude/settings.json`. Las skills se cargan al iniciar sesión: si `/plugin` no las
lista, reinicia Claude Code.

Documentos vigentes:
- **Recorte de alcance:** [docs/superpowers/specs/2026-09-08-scope-simplification-design.md](docs/superpowers/specs/2026-09-08-scope-simplification-design.md) — aprobado y aplicado; define la API pública vigente
- **Revisión de los CONTEXT:** [docs/superpowers/specs/2026-09-08-context-review.md](docs/superpowers/specs/2026-09-08-context-review.md) — hallazgos A1-A5 y B1-B6, todos resueltos y aplicados
- **Skills y gates por fase:** [docs/superpowers/skills-by-phase.md](docs/superpowers/skills-by-phase.md) — qué instalar en cada fase, y los gates de TDD / `/simplify` / seguridad
- Spec Fase 0: [docs/superpowers/specs/2026-09-08-toolchain-and-contract-design.md](docs/superpowers/specs/2026-09-08-toolchain-and-contract-design.md)
- Plan Fase 0: [docs/superpowers/plans/2026-09-08-phase-0-toolchain-and-contract.md](docs/superpowers/plans/2026-09-08-phase-0-toolchain-and-contract.md)
- Spec Fase 1: [docs/superpowers/specs/2026-09-08-phase-1-rust-core-design.md](docs/superpowers/specs/2026-09-08-phase-1-rust-core-design.md) — decisiones D1-D6 del núcleo
- Plan Fase 1: [docs/superpowers/plans/2026-09-08-phase-1-rust-core.md](docs/superpowers/plans/2026-09-08-phase-1-rust-core.md) — trece tareas, todas completas; su "Estado de ejecución" lista las seis desviaciones respecto del plan original
- **Cierre de la Fase 1:** [rust-core/README.md](rust-core/README.md) — qué es y cómo está organizado, con el diagrama. La doc del núcleo está partida en un archivo por pregunta: [BUILD.md](rust-core/BUILD.md) (toolchain, compilación y bindings), [TESTING.md](rust-core/TESTING.md) (qué prueba y qué **no** prueba el test de contrato, y sus siete guardias), [FFI.md](rust-core/FFI.md) (**las dos cosas que no cruzan el FFI**: el mapeo variante → nombre del contrato y los mensajes de error en español) y [PENDING.md](rust-core/PENDING.md)
- Ledger de ejecución de la Fase 1: `.superpowers/sdd/2026-09-08-phase-1-rust-core/progress.md` — las rulings tarea por tarea y la evidencia de cada review

## Fases de desarrollo

El orden no es negociable: lo impone el grafo de dependencias de build de arriba.

- **Fase 0 — Toolchain y contrato.** ✅ **Completada.** Rust 1.98.1 (solo target host) y
  `contracts/cases.json`, escrito a mano. La fase lo entregó como **v2.0.0 con 26 casos**;
  la Fase 1 lo llevó a **v2.3.0 con 28**: la v2.1.0 agregó `comprobante` y
  `latencia_simulada_ms` a los esperados de `transferencia`, la v2.2.0 sumó `itf-005` y la
  v2.3.0 sumó `tr-007`, el monto con más de 2 decimales.
  Ningún valor esperado anterior se corrigió. Los vectores de cifrado se
  derivaron con ChaCha20-Poly1305 de Node 22, independiente de Rust. El alcance se recortó
  antes de la Fase 1: fuera el cronograma francés, la TCEA y `validar_ruc`; dentro
  aritmética decimal, transferencia y cifrado de tarjeta (ver
  [recorte de alcance](docs/superpowers/specs/2026-09-08-scope-simplification-design.md)).
- **Fase 1 — `rust-core`.** ✅ **Completada.** Workspace y los dos crates: `domain` (Rust
  puro, con los módulos `arithmetic`, `card`, `cci`, `crypto`, `error`, `itf`, `transfer`) y
  `ffi` (paquete `core_financiero`, la fachada uniffi). Entregó **67 tests en verde** —47
  unitarios de `domain`, 6 de `proptest`, 3 del lib de `ffi` y 11 del test de contrato— y el **contrato
  28/28** contra `cases.json` v2.3.0, sin haber corregido un solo valor esperado para que
  pasara. El contrato subió de v2.1.0 a v2.3.0 durante la fase: la v2.2.0 agregó `itf-005`,
  el único caso que distingue `MidpointAwayFromZero` de banker's rounding (los cuatro casos
  de `itf` anteriores **no** lo distinguían, contra lo que afirmaba el comentario del test);
  la v2.3.0 agregó `tr-007` junto con la guardia de escala de `execute_transfer`: un monto o
  un saldo con más de 2 decimales devuelve `MontoInvalido`, porque sin esa puerta el
  redondeo al formatear movía la suma de saldos y el invariante de conservación del dinero
  dejaba de valer.
  Fue la única fase donde se decidió lógica de negocio. Ver
  [rust-core/README.md](rust-core/README.md).
- **Fase 2 — `apps/android`.** ✅ **Completada.** Primer consumidor real: validó el pipeline
  uniffi y el test de contrato sobre un dispositivo. Entregó **43 tests en verde** —28 de JVM con
  `FakeCoreFinanciero` y 15 instrumentados que sí cruzan el FFI, de los cuales 9 son el
  test de contrato— y las cuatro pantallas de [docs/ui-spec.md](docs/ui-spec.md). Fue la fase que
  probó lo que el test de contrato de Rust no podía: `System.loadLibrary`, la resolución de símbolos
  de JNA, y que el `strip` del perfil release no se comiera nada. Ver
  [apps/android/README.md](apps/android/README.md).
- **Fase 3 — `apps/ios`.** ✅ **Completada.** Espejo funcional de Android: las cuatro pantallas
  de [docs/ui-spec.md](docs/ui-spec.md) y **47 tests en verde**, de los cuales 10 son el test de
  contrato (5 guardias + 5 grupos parametrizados que expanden a los 28 casos). Corrieron en
  simulador **y sobre hardware real**, que es lo que prueba lo que ninguna corrida de simulador
  podía: que el slice `aarch64-apple-ios` está enlazado, que sus símbolos resuelven y que el
  `strip` del perfil release no se comió nada.
  A diferencia de Android **no hay dos suites**: el core se enlaza estáticamente, así que los
  tres niveles corren en el mismo bundle — y por eso nada obliga a que el seam de
  `CoreFinanciero` exista, cosa que allá sí fuerza la plataforma.
  El benchmark quedó medido y el resultado es el más contundente de la POC: **el piso del cruce
  cuesta 0,33 µs contra los 172 µs de Android, 521× menos.** El mismo núcleo; lo que cambia es
  el puente. Provisional hasta repetirlo en un iPhone —está medido en un iPad M1—, pero la
  brecha no la explica el chip. Ver [apps/ios/PENDING.md](apps/ios/PENDING.md).
- **Fase 4 — `apps/react-native`.** Turbo Module vía `ubrn`. Desbloquea la fase 5.
- **Fase 5 — `apps/web-angular`.** Consume el WASM producido en la fase 4.

Cada fase termina con tres cosas, no una:

1. **Su test de contrato en verde** contra `cases.json`.
2. **El `README.md` de su subproyecto** — `rust-core/README.md` en la Fase 1,
   `apps/<plataforma>/README.md` de la Fase 2 en adelante — con los comandos
   **efectivamente ejecutados** para construir, correr la demo y correr el test de contrato. Se
   escribe al final de la fase copiando comandos que ya corrieron, nunca deducidos del
   CONTEXT: un README con comandos sin ejecutar se descubre roto el día de la demo, que
   es el único día que importa.
3. **Un diagrama de arquitectura en Mermaid dentro de ese README**, que muestre cómo está
   organizado ese subproyecto: los crates y sus dependencias en `rust-core`; en cada app,
   el camino desde el artefacto que produce el core hasta la pantalla. Si la estructura no
   se ve en un diagrama, no está justificada — crates que nadie puede ver de un vistazo son
   ceremonia, no arquitectura.

Una fase sin las tres no está terminada, por más que la UI se vea bien.

Y la regla vale para todo el proyecto, no solo para el cierre de fase: **cualquier
decisión que requiera ejecutar o aplicar algo se documenta en el README del subproyecto
que toca** — el comando exacto, qué hace, y qué se debe ver cuando funciona. Una
recomendación que vive solo en una conversación no existe: quien la ejecute dentro de seis
meses es otra persona, o vos sin el contexto de hoy.

**[docs/demo-runbook.md](docs/demo-runbook.md)** es el guion de poner las pantallas lado a
lado: qué se tipea en cada acto, qué strings tienen que coincidir carácter por carácter, y las
preguntas que la audiencia va a hacer. Se escribió con Android e iOS; cuando existan React
Native y Angular se extiende, no se reescribe.

Su primer paso no es opcional: **verificar que el pie de `core_version()` muestre el mismo
string en todas las apps**. Si no coinciden, alguien regeneró un artefacto y no los otros, y la
comparación deja de valer aunque las pantallas se vean bien.

Fuera de alcance para esta POC (no lo agregues): Re.Pack / Module Federation, cliente
HTTP, SQLite, runtime async, optimización de performance antes de que exista el benchmark.

### Ramas y commits

Una rama por fase, mergeada a `main` recién cuando su test de contrato pasa:

| Fase | Rama |
|---|---|
| 0 | `feat/phase-0-toolchain-and-contract` |
| 1 | `feat/phase-1-rust-core` |
| 2 | `feat/phase-2-app-android` |
| 3 | `feat/phase-3-app-ios` |
| 4 | `feat/phase-4-app-react-native` |
| 5 | `feat/phase-5-app-web-angular` |

Commits en **Conventional Commits, en español**, con scope = subproyecto:
`feat(rust-core):`, `feat(android):`, `test(ios):`, `docs(contracts):`, `chore(ffi):`.

Commits frecuentes y pequeños: uno por tarea del plan, no uno por fase. Cierre de rama
con `superpowers:finishing-a-development-branch`.

Corregir un valor esperado en `cases.json` **siempre va en su propio commit**, con la
justificación aritmética en el mensaje. Nunca mezclado con cambios al core: es la única
forma de auditar después si el contrato se dobló para que pasara el código.

## Comandos

### Toolchain incremental

Ya instalado y sin acción: Node 22.16, pnpm 11.1, Java 21 LTS, Xcode, NDK 29/30 (cumple
el requisito de r27+; con NDK anterior la librería compila pero crashea al cargar en
dispositivos con páginas de 16 KB).

**Rust no está instalado.** No lo instales todo de golpe: cada fase agrega solo lo suyo,
y cada instalación se verifica antes de seguir.

| Fase | Se agrega | Verificación |
|---|---|---|
| 0 | `rustup` + stable + clippy + rustfmt — ✅ **hecho** (1.98.1) | `cargo --version` |
| 1 | nada — ✅ **hecho** (crates puros, se testean en el host) | `cargo test --workspace` → 67 passed |
| 2 | `cargo install cargo-ndk` + 3 targets Android — ✅ **hecho** (cargo-ndk 4.1.2, NDK 30.0.16248370) | `cargo ndk --version`; `./gradlew :app:connectedDebugAndroidTest` → 15 passed |
| 3 | 2 targets iOS (`aarch64-apple-ios`, `-sim`) — ✅ **hecho** (XCFramework con los dos slices) | `rustup target list --installed`; `xcodebuild test …` → **47 passed en simulador y en aparato** |
| 4 | `uniffi-bindgen-react-native` en `apps/react-native` | `npx ubrn --version` |
| 5 | target `wasm32-unknown-unknown` + Angular CLI | `ng version` |

Los comandos exactos están en el plan de cada fase.

```bash
# Desarrollo del core (desde rust-core/)
cargo test --workspace              # todo: 67 tests
cargo test -p domain                # un solo crate, sin compilar uniffi
cargo test -p domain rounds_half_away_from_zero_not_to_even   # un solo test por nombre
cargo test -p core_financiero --test contract       # los vectores y las guardias del contrato
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

Los comandos de exportación por plataforma (cargo-ndk, uniffi-bindgen,
`xcodebuild -create-xcframework`, `ubrn build android|ios|web`) están en
[rust-core/CONTEXT.md](rust-core/CONTEXT.md); no los dupliques aquí, se desincronizan.

Perfil de release del core (tamaño del binario es criterio de la demo):
`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "unwind"`.

**`panic = "abort"` está prohibido.** uniffi envuelve cada llamada en `catch_unwind` para
convertir un pánico de Rust en un error del FFI; con `abort` esa red se desactiva y
cualquier pánico mata el proceso de la app. Ver hallazgo B1 del
[review de CONTEXT](docs/superpowers/specs/2026-09-08-context-review.md) y el perfil
completo en [rust-core/CONTEXT.md](rust-core/CONTEXT.md).

**Salvedad: en wasm la regla no se puede cumplir, y no es opcional.** El target
`wasm32-unknown-unknown` **impone** `abort` — no hay unwinding en el wasm base, así que el
`panic = "unwind"` del perfil se ignora ahí. Verificable sin instalar nada:

```bash
rustc --print cfg --target wasm32-unknown-unknown | grep panic   # panic="abort"
rustc --print cfg --target aarch64-linux-android  | grep panic   # panic="unwind"
rustc --print cfg --target aarch64-apple-ios      | grep panic   # panic="unwind"
```

La regla sigue valiendo tal cual para Android e iOS, que es donde hay algo que elegir. La
consecuencia es para la **Fase 5**: la app Angular no va a tener la red del `catch_unwind`,
así que un pánico del core ahí no vuelve como error del FFI — es un trap de WebAssembly que
deja la instancia del módulo inutilizable. Lo único que protege esa app es la disciplina de
la regla 5 (cero `panic!`/`unwrap()`/`expect()` en producción) y los proptests
`*_never_panics` del core. No hay segunda red: no la debilites.

## Si el build de Angular pelea con el WASM

Servir el `.wasm` con MIME `application/wasm` es el punto donde más tiempo se pierde en
este proyecto. Si el builder de Angular no coopera, **no quemes tiempo de demo ahí**:
levanta la pantalla en un Vite mínimo, deja la integración Angular documentada como
pendiente y sigue. La POC no se juega en eso.
