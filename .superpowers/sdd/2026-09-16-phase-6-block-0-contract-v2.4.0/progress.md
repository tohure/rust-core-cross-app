# SDD ledger — plan: docs/superpowers/plans/2026-09-16-phase-6-block-0-contract-v2.4.0.md

Spec: docs/superpowers/specs/2026-09-16-phase-6-hardening-design.md (leída, alcanzable)
Rama: feat/phase-6-hardening (no es main; se trabaja en el checkout principal)

Ruling: no se crea worktree aislado — se trabaja en la rama `feat/phase-6-hardening` del
checkout principal. Motivo: las tareas 8-11 construyen artefactos nativos (cargo-ndk, Xcode,
ubrn) cuyas rutas y cachés están atadas a este checkout, y un worktree obligaría a reconstruir
toda la toolchain. Costo si me equivoco: el árbol de trabajo del usuario queda ocupado por esta
fase mientras dure; se revierte con `git checkout main`.

## Escaneo previo de conflictos

| # | Par / tarea | Produce → consume | Hallazgo |
|---|---|---|---|
| 1 | T1 → T2, T3 | `DomainError::Decryption` / `contract_name() = "Descifrado"` | OK. T2 y T3 declaran el consumo y usan el mismo nombre exacto. |
| 2 | T1 → T4 | el string `"Descifrado"` | OK. T4 lo usa como valor del campo `error` y como clave de `messages.es.json`. |
| 3 | T2 (consigo misma) | tests nuevos vs. tests existentes de `crypto.rs` | OK. El Step 4 nombra los cuatro asserts que cambian de `"Cifrado"` a `"Descifrado"` y dice explícitamente que no se borra ningún test. |
| 4 | T3 → T8-T11 | enum uniffi regenerado | OK. Las cuatro tareas de app regeneran antes de compilar. |
| 5 | **T4 → T5** | `cases.json` v2.4.0 / guardias | **CONFLICTO REAL**: el commit de T4 deja el test de contrato de Rust en rojo hasta que T5 lo cierra. Ver ruling abajo. |
| 6 | T4 → T6 | textos de `messages.es.json` / tabla de `rust-core/README.md` | OK. T6 verifica la igualdad literal con un script. |
| 7 | T5 → T8-T11 | `contract_decrypt` como referencia a espejar | OK. Los valores exactos (2.4.0, 3 casos, contador en 3) están repetidos en cada tarea, no por referencia. |
| 8 | T7 → T8-T12 | la secuencia de generación documentada | OK. T7 va antes que todas las que regeneran. |
| 9 | T10 → T11 | el paquete WASM v2.4.0 | OK. El plan lo dice explícitamente y el orden lo respeta. |
| 10 | **T8-T11 → T12** | artefactos regenerados | **Duplicación intencional**: T12 vuelve a regenerar los cuatro. Ver ruling abajo. |
| 11 | T4 (consigo misma) | conteos del Step 3 | OK. 12 claves + `descifrado` = 13; 9 mensajes + `Descifrado` = 10; 28 + 3 = 31. Coincide con Global Constraints. |
| 12 | T5 (consigo misma) | tabla `EXPECTED` de 6 grupos | OK. `cuentas_iniciales` sigue fuera del conteo, como hoy: es fixture, no grupo de casos. |
| 13 | T8, T9, T10, T11 (cada una) | guardia de versión vs. recorrido nuevo | OK. Cada una sube la versión Y agrega el recorrido; ninguna hace una sola de las dos. |

Ruling (fila 5): el commit de `contracts/*.json` se deja solo aunque deje el test de contrato en
rojo por un commit. Motivo: el CLAUDE.md lo exige — «Corregir un valor esperado en cases.json
siempre va en su propio commit» — y es la única forma de auditar después si el contrato se dobló
para que pasara el código. La ventana en rojo dura exactamente un commit y la cierra T5. Costo si
me equivoco: alguien que haga checkout de ese commit puntual encuentra la suite roja.

Ruling (fila 10): T12 regenera de nuevo los cuatro artefactos aunque T8-T11 ya los regeneraron.
Motivo: `coreVersion()` congela el SHA de HEAD en tiempo de compilación, y T8-T11 commitean por
separado, así que cada app quedaría con un SHA distinto. Sin T12 los cuatro pies no coinciden y
el primer paso del runbook de demo falla. Costo si me equivoco: tiempo de build repetido.

Riesgo ambiental (no es conflicto del plan): T8 necesita dispositivo o emulador Android y T9
necesita Xcode con simulador o aparato. Si no están disponibles, esas tareas se paran y se
reporta; no se declaran completas sin la corrida.

## Progreso
Task 1: complete (commits 5de8a27..7f964db, review clean)
Task 2: implementada (commits 7f964db..65632b7), en revisión
Task 2: minor (deferred): dos ramas de error de `decrypt` —hex de clave no válido y texto descifrado no UTF-8— no tienen test que aserte la variante; la corrección está garantizada estructuralmente porque `prepare` ya no construye variantes, y el proptest `decrypt_never_panics` las ejercita sin verificar el nombre.
Task 2: complete (commits 7f964db..65632b7, review clean)
Task 3: complete (commits 65632b7..5d0b710, review clean)
Task 4: minor (deferred): el mensaje del commit d52f21e dice que de-001 es el hex de tj-001 "leído al revés", queriendo decir la operación inversa (descifrar) y no el string invertido. Redacción ambigua en un mensaje ya commiteado; reescribir historia por eso no se justifica.
Task 4: complete (commits 5d0b710..d52f21e, review clean — los tres vectores verificados ejecutando decrypt contra el core real)
Task 5: complete (commits d52f21e..24034ee, review clean — 12 tests de contrato, 71 en el workspace; ninguna guardia aflojada)
Task 6: implementada (commit 9023d5c) con DONE_WITH_CONCERNS.
Task 6: Ruling: la tabla de mensajes NO vive en `rust-core/README.md` como afirmaba el plan, sino en `rust-core/FFI.md` desde el commit 5a07492, cuando el README se partió en cinco archivos. El plan lo afirmó porque lo leyó del campo `_fuente` de `contracts/messages.es.json`, que quedó desactualizado en ese refactor. Decisión: la tabla NO se mueve —partir el README fue una decisión de diseño documentada—, se actualiza donde está, y se corrige `_fuente` para que deje de mentir. El plan estaba mal, no el implementador. Costo si me equivoco: `_fuente` apunta a un archivo distinto del que alguien espera; se revierte con una línea.
Task 6: fix round 1/5 en curso — corregir `_fuente` en messages.es.json (alcance ampliado a ese campo, y solo a ese) y cerrar las menciones residuales a "nueve"/2.3.0/28 casos en rust-core/*.md
Task 6: fix round 1/5 (1 addressed, 0 open — `_fuente` corregido y menciones residuales cerradas; commit 04fa661)
Task 6: complete (commits 24034ee..04fa661, review clean — los diez mensajes verificados idénticos entre FFI.md y messages.es.json)
Task 7: Ruling: el plan escribía `ubrn build web` para el paso de wasm y ese comando NO existe en el repositorio; el vigente es `pnpm run wasm:generate`, que envuelve `ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml`. El `--config` no es opcional: sin él se pisan los bindings JSI (hay un script `ubrn:wasm` que se borró por eso, documentado en apps/react-native/CONTEXT.md). Decisión: vale el comando real, no el del plan. Costo si me equivoco: la secuencia documentada no genera el wasm y la Task 11 (Angular) se queda sin artefacto — se detecta al ejecutarla.
Task 7: implementada (commit 6949bbe). Revisión: spec ✅, calidad no aprobada — 1 Important (dice que los bindings Kotlin quedan en `core/`, directorio que no existe; la ruta real es app/src/main/java/uniffi/core_financiero/) + 1 Minor (cita falsa en el reporte de auditoría, sin impacto en lo publicado).
Task 7: Ruling: el `core/` es una inexactitud HEREDADA del diagrama de CLAUDE.md ("apps/android (jniLibs/*.so + core/)"), no un invento del implementador. Decisión: se corrige en los dos lugares en el mismo commit, ampliando el alcance a CLAUDE.md solo para esa línea. Costo si me equivoco: una línea de diagrama distinta de lo que alguien esperaba leer.
Task 7: fix round 1/5 en curso
Task 7: fix round 1/5 (1 addressed, 0 open — ruta de los bindings corregida en BUILD.md y en el diagrama de CLAUDE.md; commit a82798c)
Task 7: complete (commits 04fa661..a82798c, review clean)
Task 8: implementada (commit 3a7e431) — JVM 29/29, instrumentada 16/16 sobre Pixel 6 real (25251FDF60033N).
Task 8: Ruling: el brief listaba solo las tres aserciones de versión de Android, pero la app espeja MÁS guardias del test de contrato de Rust: el conteo por grupo, el set de claves de primer nivel, la versión de messages.es.json y el conteo de mensajes en AssetSourcesTest. El implementador las corrigió todas por su cuenta. Decisión: correcto, quedan. Costo si me equivoco: ninguno visible — sin esos cambios la suite instrumentada quedaba roja.
Task 8: Ruling: `theMessagesAssetCoversTheNineErrorVariants` quedó cubriendo nueve variantes de diez y con un nombre que ya no es cierto. Aunque no falla, NO se difiere: una guardia que afirma cubrir algo que no cubre es el mismo defecto que esta fase vino a corregir en los PENDING.md. Entra en ronda de arreglo. Costo si me equivoco: una ronda de más sobre un test que ya pasaba.
Task 8: fix round 1/5 en curso
Task 8: fix round 1/5 (1 addressed, 0 open — `theMessagesAssetCoversTheNineErrorVariants` pasó a `…TheTenErrorVariants`, construye `DomainException.Decryption` y exige diez nombres de contrato distintos; commit e91f4ae). Suites re-corridas: JVM 29/29 y instrumentada 16/16.
Task 8: Ruling: la corrida instrumentada del fix round fue sobre el AVD `Pixel_9_Pro` y no sobre el Pixel 6, que no estaba conectado. Motivo: el AVD es arm64 (`sdk_gphone64_arm64`), así que carga el mismo slice `arm64-v8a` que el teléfono; y lo que este fix round cambió son aserciones de test, no el borde FFI, que ya quedó verificado sobre aparato real en el commit 3a7e431. Costo si me equivoco: la evidencia del fix round no es de hardware; se repite con `./gradlew :app:connectedDebugAndroidTest` con el teléfono enchufado.
Task 8: Hallazgo fuera de alcance (va a la Task 11 del bloque 1, documentación de Android): la v2.4.0 dejó desactualizados `apps/android/CONTEXT.md:66` («sus nueve subclases», son diez), `:70` («nueve líneas» del `when` de `contractName`), `:142` («los nueve textos de usuario») y `apps/android/README.md:194` («los 28 casos», son 31). No se tocaron acá porque el alcance de la Task 8 es código y tests, no docs.
Task 8: Hallazgo de repo (corregido aparte): `.superpowers/sdd/.gitignore` estaba modificado en el árbol de trabajo a `*` a secas, sin el `!*/` `!*/progress.md`. Efecto: el ledger de esta fase quedaba invisible para git mientras los de las fases 1, 3, 4 y 5 sí están versionados. Restaurado a la versión de HEAD y este ledger agregado al índice.
