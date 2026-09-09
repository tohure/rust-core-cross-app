# Fase 0 — Toolchain y contrato

**Fecha:** 2026-09-08
**Estado:** propuesto, pendiente de aprobación
**Fases siguientes que desbloquea:** todas

## Problema

El repositorio tiene cinco documentos de especificación (los `CONTEXT.md`) y cero
código. Antes de escribir la primera línea de Rust faltan dos cosas, y solo dos:

1. **No hay toolchain de Rust en la máquina.** `cargo`, `rustc` y `rustup` no están
   instalados. Node 22, pnpm, Java 21, Xcode y NDK 29/30 sí (el NDK cumple el
   requisito de r27+ que exige `rust-core/CONTEXT.md`).
2. **No existe `contratos/casos.json`.** Es el criterio de aceptación de las seis
   fases: sin él, ninguna fase tiene forma de declararse terminada.

## Decisión de diseño: toolchain incremental, no big-bang

Instalar de golpe todos los targets de Rust (Android × 3 ABIs, iOS × 2, wasm) más
`cargo-ndk` más `ubrn` más Angular CLI cuesta tiempo y disco para herramientas que no
se usan hasta la fase 4 o 5. Peor: si algo se rompe, el fallo aparece lejos de su causa.

**Se instala lo mínimo de cada fase al inicio de esa fase.** Cada instalación queda
verificada con un comando que imprime versión antes de continuar.

| Fase | Herramienta | Instalación | Verificación |
|---|---|---|---|
| 0 | `rustup`, `cargo`, `rustc` (stable, target host) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | `cargo --version` |
| 1 | ninguna extra — los crates son Rust puro y se testean en host | — | `cargo test --workspace` |
| 2 | `cargo-ndk` + 3 targets Android | `cargo install cargo-ndk` + `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android` | `cargo ndk --version` |
| 3 | 2 targets iOS | `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` | `rustup target list --installed` |
| 4 | `uniffi-bindgen-react-native` (`ubrn`) | `npm i -D uniffi-bindgen-react-native` en `apps/react-native` | `npx ubrn --version` |
| 5 | target wasm + Angular CLI | `rustup target add wasm32-unknown-unknown` + `npm i -g @angular/cli` | `ng version` |

Ya disponible y sin acción: Node 22.16, pnpm 11.1, Java 21 LTS, Xcode, NDK 29/30.

## Decisión de diseño: `casos.json` se escribe a mano y antes que el código

Es tentador generar los valores esperados corriendo el core. Eso invierte la relación:
el archivo dejaría de ser un contrato para volverse un snapshot de la implementación, y
un bug en el cálculo quedaría consagrado como "lo esperado".

`casos.json` se escribe a mano, con valores derivados de las reglas de negocio del
dominio, **antes** de que exista el cálculo. El core se escribe hasta que pase.
Esto es TDD literal a nivel de proyecto, no solo de función.

Cobertura mínima de la versión 1.0.0:

- **cronograma**: un caso base (monto redondo), un caso cuyo redondeo obligue a ajustar
  la última cuota (el invariante "suma de capitales == monto exacto"), y un caso de
  plazo largo (48+ cuotas) donde la deriva de `f64` sea visible en la baseline.
- **cci**: uno válido con banco conocido, uno con dígito de control malo, uno con
  longitud incorrecta.
- **ruc**: uno válido, uno con dígito verificador malo.
- **itf**: un monto sobre el umbral y un monto que exhiba redondeo al centavo.

Cada caso lleva `id` estable (`cred-001`, `cci-001`), porque los cinco proyectos van a
reportar fallos por ese id.

## Fuera de alcance de esta fase

No se escribe Rust. No se crea el workspace de cargo — eso es Fase 1. Esta fase entrega
un entorno que compila y un contrato que todavía nadie satisface.

## Criterio de aceptación

1. `cargo --version` imprime una versión stable.
2. `contratos/casos.json` existe, es JSON válido, tiene `version: "1.0.0"` y cubre los
   cuatro grupos de casos de arriba.
3. `CLAUDE.md` ya no marca `contratos/` como pendiente.
4. Todo commiteado en `feat/fase-0-toolchain-y-contrato`.

## Riesgos

- **Los valores esperados a mano pueden salir mal.** Mitigación: cada caso de cronograma
  lleva un comentario con la fórmula y los pasos intermedios. Si en Fase 1 un caso no
  cuadra, se revisa la aritmética del caso antes de tocar el core — pero la corrección
  del caso se hace y se commitea aparte, con su justificación.
- **TCEA por Newton-Raphson a mano es costoso.** Mitigación: en `casos.json` v1.0.0 la
  TCEA se marca con `"tcea": null` en los casos donde no se calculó a mano; el test la
  omite mientras sea `null`. Se completa en Fase 1 con verificación cruzada contra una
  hoja de cálculo, y ese llenado es un commit propio y revisable.
