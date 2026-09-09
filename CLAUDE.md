# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este repositorio

POC para un núcleo de dominio escrito en Rust,
consumido sin reescribirse por cuatro frontends — Android nativo, iOS nativo,
React Native y web Angular.

La tesis que la POC debe probar es una sola: **la lógica de negocio (dominio + data)
se comparte, la UI varía por plataforma.** La evidencia es que las cuatro apps
producen strings idénticos carácter por carácter sobre el mismo set de casos.

Idioma: documentación, identificadores de dominio y commits en español
(`validar_cci`, `generar_cronograma`, `ErrorDominio`). Commits en Conventional Commits.

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
a los cuatro consumidores más `contratos/casos.json` en el mismo cambio.

## Arquitectura: el grafo de dependencias de build

No es una estrella. Angular **no** consume el core directamente:

```
rust-core/crates/ffi  (único crate exportado; dominio/calculo/validacion no conocen uniffi)
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
- Los crates internos (`dominio`, `calculo`, `validacion`) son Rust puro y no
  dependen de uniffi. Eso los mantiene testeables rápido, sin FFI de por medio.
  Solo `crates/ffi` lleva las macros `#[uniffi::export]`.
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
   `Result` con `ErrorDominio`. El mapeo a mensaje de usuario ocurre en la capa de
   UI, no en el adapter — el adapter propaga tal cual.

## `contratos/casos.json` — el contrato compartido

Es el artefacto central de la POC, no un detalle de testing. Un solo archivo de
vectores golden que las cinco bases de código leen: Rust (`tests/`), Android
(`androidTest/`), iOS (`XCTest`, desde el bundle de test), React Native (Jest) y
Angular (spec).

Las comparaciones son **igualdad exacta de strings** (`assertEquals` / `XCTAssertEqual`
/ `toBe`), nunca comparación numérica con tolerancia. Que ese test pase en las cuatro
plataformas *es* la demostración.

Reglas de cambio: agregar una función pública al core obliga a actualizar
`casos.json` en el mismo cambio. Si un caso de negocio no está en `casos.json`,
no lo implementes: pregunta primero. No se inventan reglas de dominio.

**Datos dummy.** Tasas, códigos de banco y montos son inventados: la POC demuestra que
cuatro plataformas producen el mismo string, no exactitud financiera. Los algoritmos sí
son internamente consistentes. Ver [contratos/README.md](contratos/README.md).

**Caso canario:** `cred-002` tiene seguro `0.00`, así que su TCEA debe dar exactamente
igual a su TEA (22.00%). Si ese caso no cuadra, el Newton-Raphson está mal por más que
los otros dos pasen.

## Paridad entre apps

Las cuatro apps tienen las **mismas cuatro pantallas, con los mismos labels y el mismo
orden de campos**: Simulador de crédito, Validador de CCI, Benchmark, y `version_core()`
visible al pie. Esto no es cosmético: la demo consiste en poner las cuatro lado a lado
y comparar. Cambiar un label en una app obliga a cambiarlo en las cuatro.

`version_core()` visible en todas es la prueba en pantalla de que corren exactamente
el mismo build.

## Estado actual y flujo de trabajo (SDD con superpowers)

**Fase 0 completada; no hay código de producción todavía.** Existen los CONTEXT, este
CLAUDE.md, la spec + plan de la Fase 0 y el contrato `contratos/casos.json`. Ni una línea
de Rust, Kotlin, Swift o TypeScript: lo que sigue (Fase 1) es el primer código real.

Este proyecto se desarrolla con **Spec-Driven Development** usando el plugin
`superpowers`. El flujo por fase es:

1. `superpowers:brainstorming` → spec en `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`
2. `superpowers:writing-plans` → plan en `docs/superpowers/plans/YYYY-MM-DD-<fase>.md`
3. `superpowers:subagent-driven-development` (o `executing-plans` sin subagentes) → ejecución
4. `superpowers:test-driven-development` durante la implementación —
   aquí es literal: el test golden de `casos.json` se escribe **antes** que el cálculo
5. `superpowers:verification-before-completion` antes de declarar una fase terminada
6. `superpowers:requesting-code-review` + `finishing-a-development-branch` para cerrar

Los CONTEXT de cada subproyecto **ya son la spec de entrada** de su fase: el
brainstorming de cada fase parte de ellos, no de cero.

`superpowers` 6.3.0 ya está habilitado para este repositorio vía
`.claude/settings.json`. Las skills se cargan al iniciar sesión: si `/plugin` no las
lista, reinicia Claude Code.

Documentos vigentes:
- Spec Fase 0: [docs/superpowers/specs/2026-09-08-toolchain-y-contrato-design.md](docs/superpowers/specs/2026-09-08-toolchain-y-contrato-design.md)
- Plan Fase 0: [docs/superpowers/plans/2026-09-08-fase-0-toolchain-y-contrato.md](docs/superpowers/plans/2026-09-08-fase-0-toolchain-y-contrato.md)

## Fases de desarrollo

El orden no es negociable: lo impone el grafo de dependencias de build de arriba.

- **Fase 0 — Toolchain y contrato.** ✅ **Completada.** Rust 1.98.1 (solo target host) y
  `contratos/casos.json` v1.0.0 con 15 casos, derivados con una implementación de
  referencia independiente en Python.
- **Fase 1 — `rust-core`.** Workspace y los cuatro crates. Dominio y cálculo primero en
  Rust puro (unitarias + `proptest`), `ffi` al final. Es la única fase donde se decide
  lógica de negocio.
- **Fase 2 — `apps/android`.** Primer consumidor: valida el pipeline uniffi + el test
  golden en una plataforma real.
- **Fase 3 — `apps/ios`.** Espejo funcional de Android.
- **Fase 4 — `apps/react-native`.** Turbo Module vía `ubrn`. Desbloquea la fase 5.
- **Fase 5 — `apps/web-angular`.** Consume el WASM producido en la fase 4.

Cada fase termina con su test golden verde contra `casos.json`. Una fase sin ese test
pasando no está terminada, por más que la UI se vea bien.

Fuera de alcance para esta POC (no lo agregues): Re.Pack / Module Federation, cliente
HTTP, SQLite, runtime async, optimización de performance antes de que exista el benchmark.

### Ramas y commits

Una rama por fase, mergeada a `main` recién cuando su test golden pasa:

| Fase | Rama |
|---|---|
| 0 | `feat/fase-0-toolchain-y-contrato` |
| 1 | `feat/fase-1-rust-core` |
| 2 | `feat/fase-2-app-android` |
| 3 | `feat/fase-3-app-ios` |
| 4 | `feat/fase-4-app-react-native` |
| 5 | `feat/fase-5-app-web-angular` |

Commits en **Conventional Commits, en español**, con scope = subproyecto:
`feat(rust-core):`, `feat(android):`, `test(ios):`, `docs(contratos):`, `chore(ffi):`.

Commits frecuentes y pequeños: uno por tarea del plan, no uno por fase. Cierre de rama
con `superpowers:finishing-a-development-branch`.

Corregir un valor esperado en `casos.json` **siempre va en su propio commit**, con la
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
| 1 | nada (crates puros, se testean en host) | `cargo test --workspace` |
| 2 | `cargo install cargo-ndk` + 3 targets Android | `cargo ndk --version` |
| 3 | 2 targets iOS (`aarch64-apple-ios`, `-sim`) | `rustup target list --installed` |
| 4 | `uniffi-bindgen-react-native` en `apps/react-native` | `npx ubrn --version` |
| 5 | target `wasm32-unknown-unknown` + Angular CLI | `ng version` |

Los comandos exactos están en el plan de cada fase.

```bash
# Desarrollo del core (desde rust-core/)
cargo test --workspace              # todo
cargo test -p calculo               # un solo crate
cargo test -p calculo cronograma_suma_capitales   # un solo test por nombre
cargo test --test golden            # solo los vectores de casos.json
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

Los comandos de exportación por plataforma (cargo-ndk, uniffi-bindgen,
`xcodebuild -create-xcframework`, `ubrn build android|ios|web`) están en
[rust-core/CONTEXT.md](rust-core/CONTEXT.md); no los dupliques aquí, se desincronizan.

Perfil de release del core (tamaño del binario es criterio de la demo):
`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "abort"`.

## Si el build de Angular pelea con el WASM

Servir el `.wasm` con MIME `application/wasm` es el punto donde más tiempo se pierde en
este proyecto. Si el builder de Angular no coopera, **no quemes tiempo de demo ahí**:
levanta la pantalla en un Vite mínimo, deja la integración Angular documentada como
pendiente y sigue. La POC no se juega en eso.
