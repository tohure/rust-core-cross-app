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
   (`__benchmarks__/baseline.ts`, `features/benchmark/baseline.ts`, la baseline
   Kotlin en `androidTest`), que existen justamente para exhibir la divergencia de
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
vectores golden que las cinco bases de código leen: Rust (`tests/`), Android
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

**Fases 0 y 1 completadas. El núcleo existe y funciona; no hay todavía ninguna app.**
`rust-core/` tiene dos crates —`domain` (Rust puro, siete módulos) y `ffi` (paquete
`core_financiero`, la fachada uniffi)— con ~1930 líneas de Rust, **54 tests en verde** y el
**test golden pasando 27/27** contra `contracts/cases.json` **v2.2.0**. Los bindings Kotlin
y Swift se generaron y se verificó que las nueve funciones cruzan la frontera.

Lo que **no** existe todavía: ni una línea de Kotlin, Swift o TypeScript. Lo que sigue
—Fase 2, `apps/android`— es el primer consumidor real, y el primero que va a ejercitar el
borde FFI de verdad: el golden de Rust llama a las funciones como funciones Rust ordinarias,
así que nada cruzó JNI ni el ABI de C todavía.

Este proyecto se desarrolla con **Spec-Driven Development** usando el plugin
`superpowers`. El flujo por fase es:

1. `superpowers:brainstorming` → spec en `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`
2. `superpowers:writing-plans` → plan en `docs/superpowers/plans/YYYY-MM-DD-<fase>.md`
3. `superpowers:subagent-driven-development` (o `executing-plans` sin subagentes) → ejecución
4. `superpowers:test-driven-development` durante la implementación —
   aquí es literal: el test golden de `cases.json` se escribe **antes** que el cálculo
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
- **Cierre de la Fase 1:** [rust-core/README.md](rust-core/README.md) — los comandos efectivamente ejecutados, el diagrama, qué prueba y qué no prueba el golden, y las dos cosas que **no** cruzan el FFI (el mapeo variante → nombre del contrato y los mensajes de error en español)
- Ledger de ejecución de la Fase 1: `.superpowers/sdd/2026-09-08-phase-1-rust-core/progress.md` — las rulings tarea por tarea y la evidencia de cada review

## Fases de desarrollo

El orden no es negociable: lo impone el grafo de dependencias de build de arriba.

- **Fase 0 — Toolchain y contrato.** ✅ **Completada.** Rust 1.98.1 (solo target host) y
  `contracts/cases.json`, escrito a mano. La fase lo entregó como **v2.0.0 con 26 casos**;
  la Fase 1 lo llevó a **v2.2.0 con 27**: la v2.1.0 agregó `comprobante` y
  `latencia_simulada_ms` a los esperados de `transferencia`, y la v2.2.0 sumó `itf-005`.
  Ningún valor esperado anterior se corrigió. Los vectores de cifrado se
  derivaron con ChaCha20-Poly1305 de Node 22, independiente de Rust. El alcance se recortó
  antes de la Fase 1: fuera el cronograma francés, la TCEA y `validar_ruc`; dentro
  aritmética decimal, transferencia y cifrado de tarjeta (ver
  [recorte de alcance](docs/superpowers/specs/2026-09-08-scope-simplification-design.md)).
- **Fase 1 — `rust-core`.** ✅ **Completada.** Workspace y los dos crates: `domain` (Rust
  puro, con los módulos `arithmetic`, `card`, `cci`, `crypto`, `error`, `itf`, `transfer`) y
  `ffi` (paquete `core_financiero`, la fachada uniffi). Entregó **54 tests en verde** —37
  unitarios de `domain`, 6 de `proptest`, 3 del lib de `ffi` y 8 del golden— y el **golden
  27/27** contra `cases.json` v2.2.0, sin haber corregido un solo valor esperado para que
  pasara. El contrato subió de v2.1.0 a v2.2.0 durante la fase: se agregó `itf-005`, el
  único caso que distingue `MidpointAwayFromZero` de banker's rounding (los cuatro casos de
  `itf` anteriores **no** lo distinguían, contra lo que afirmaba el comentario del test).
  Fue la única fase donde se decidió lógica de negocio. Ver
  [rust-core/README.md](rust-core/README.md).
- **Fase 2 — `apps/android`.** Primer consumidor: valida el pipeline uniffi + el test
  golden en una plataforma real.
- **Fase 3 — `apps/ios`.** Espejo funcional de Android.
- **Fase 4 — `apps/react-native`.** Turbo Module vía `ubrn`. Desbloquea la fase 5.
- **Fase 5 — `apps/web-angular`.** Consume el WASM producido en la fase 4.

Cada fase termina con tres cosas, no una:

1. **Su test golden en verde** contra `cases.json`.
2. **El `README.md` de su subproyecto** — `rust-core/README.md` en la Fase 1,
   `apps/<plataforma>/README.md` de la Fase 2 en adelante — con los comandos
   **efectivamente ejecutados** para construir, correr la demo y correr el golden. Se
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

Cuando existan al menos dos apps se agrega `docs/demo-runbook.md`: el guion de poner las
cuatro pantallas lado a lado. Hasta entonces no hay guion real que escribir.

Fuera de alcance para esta POC (no lo agregues): Re.Pack / Module Federation, cliente
HTTP, SQLite, runtime async, optimización de performance antes de que exista el benchmark.

### Ramas y commits

Una rama por fase, mergeada a `main` recién cuando su test golden pasa:

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
| 1 | nada — ✅ **hecho** (crates puros, se testean en el host) | `cargo test --workspace` → 54 passed |
| 2 | `cargo install cargo-ndk` + 3 targets Android | `cargo ndk --version` |
| 3 | 2 targets iOS (`aarch64-apple-ios`, `-sim`) | `rustup target list --installed` |
| 4 | `uniffi-bindgen-react-native` en `apps/react-native` | `npx ubrn --version` |
| 5 | target `wasm32-unknown-unknown` + Angular CLI | `ng version` |

Los comandos exactos están en el plan de cada fase.

```bash
# Desarrollo del core (desde rust-core/)
cargo test --workspace              # todo: 54 tests
cargo test -p domain                # un solo crate, sin compilar uniffi
cargo test -p domain rounds_half_away_from_zero_not_to_even   # un solo test por nombre
cargo test -p core_financiero --test golden       # solo los vectores de cases.json
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
