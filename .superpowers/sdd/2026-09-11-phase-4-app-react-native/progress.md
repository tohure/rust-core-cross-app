# SDD ledger — plan: docs/superpowers/plans/2026-09-11-phase-4-app-react-native.md

**Spec:** docs/superpowers/specs/2026-09-11-phase-4-app-react-native-design.md (leída; es la
autoridad vinculante, el plan es su argumento).
**Rama:** feat/phase-4-app-react-native · merge-base `ca3d93e` · HEAD al arrancar `0e002b9`.

## Ruling P0 — se trabaja en este checkout, no en un worktree nuevo

La skill pide workspace aislado. Estamos en una rama de fase, **no en main**, que es la
condición dura. No se crea worktree porque las Tasks 2, 3 y 14 dependen de estado que vive
sólo en este checkout: `apps/android/local.properties`, el proyecto Xcode con su scheme, el
emulador ya apareado y los targets de Rust. Un worktree obligaría a reconstruir todo eso.
**Costo si está mal:** un fallo a medias deja este checkout sucio en vez de un worktree
descartable; se recupera con `git reset` porque cada tarea commitea.

## Escaneo previo de conflictos

### Pares de tareas que comparten archivo o interfaz

| A → B | Qué produce A / consume B | Hallazgo |
|---|---|---|
| T1 → T2, T3 | uniffi 0.31 → bindings regenerados | limpio; T2/T3 son el gate de T1 |
| T1 → T14 | `Cargo.toml` del workspace vs `crates/ffi/Cargo.toml` | archivos distintos, sin choque |
| T2, T3 → T14 | T14 repite la regeneración, condicionada | duplicación deliberada y declarada |
| T5 → T7 | bloque `ubrn.config.yaml` del CONTEXT → archivo real | coinciden campo a campo |
| T6 → T8 | T6 borra `src/index.tsx`, T8 lo crea | orden correcto |
| T6 → T8, T16, T18 | nombre del paquete `@banco/core-financiero` | los tres importan ese nombre; coherente |
| T6 → T7, T9 | T6 borra `ios/`, T9 lo regenera con `ubrn build ios` | correcto |
| **T6 → sí mismo** | `pnpm-workspace.yaml` + el `workspaces` de builder-bob | **CONFLICTO POSIBLE, ver R-P2** |
| T7 → T11, T8 | nombre real de `src/generated/<x>.ts` | el plan manda anotarlo y sustituirlo; queda como dato que T7 entrega |
| T8 → T11 | `src/index.tsx` existe antes de que T11 le añada el export | orden correcto |
| T11 → T12, T16 | `contractName`, `group`, `loadCases` | **CONFLICTO REAL, ver R-P1** |
| T11 → T15 | `contractName` contra bindings de otro flavour | ya resuelto en el plan (T15 Step 2) y R-P1 lo cierra del todo |
| T10 → T12 | `core.napi.test.ts` aparte de `contract.napi.test.ts` | conteos del plan cuadran: 1 + 32 + 32 = 65 |
| T16 → T19-T22 | `core`, `Core`, `userMessage`, `fakeCore`, `initialAccounts` | limpio |
| T16 → T21 | `demoKey()` / `demoNonce()` | corregido en el auto-review del plan |
| T17 → T20 | `formatPEN` | limpio; T22 no la usa, y es correcto: µs no es dinero |
| T18 → T19-T22 | los cinco componentes y `BancoApp` | limpio; T18 Step 5 declara que `tsc` falla por las pantallas ausentes |
| T19 → T22 | `nativeFloat` desde `example/src/benchmark/NativeBaseline.ts` | limpio |
| **T19 ↔ T22** | `nativeFloat` vs `baselineAdd`/`baselineSubtract` | **DUPLICACIÓN, ver R-P3** |
| T1-T22 → T23 | números reales para el README | limpio |

### Autoconsistencia por tarea

Revisadas las 23. Todas cuadran sus tests contra su código y sus `Files` contra lo que
tocan, salvo lo anotado abajo.

- **T10 Step 5** admite que el test puede pasar directamente si el Step 1 ya generó, o sea
  que no siempre se lo ve fallar. Está declarado en el propio plan. **Ruling:** aceptable —
  es una tarea de cableado de toolchain, no de lógica; el TDD literal se exige desde T11 en
  adelante, donde hay comportamiento que diseñar. **Costo si está mal:** un test que nunca
  se vio fallar podría estar verificando nada; lo cubre que T11 y T12 sí siguen el ciclo.

## Rulings previos a la ejecución

### Ruling P1 — `contractName` discrimina por `tag`, no por `DomainError.instanceOf`

**El conflicto:** el plan define `contractName` con una guardia `DomainError.instanceOf(e)`,
pero los tests de T16, T19, T21 y T22 lanzan **objetos planos** `{ tag, inner }` desde
`fakeCore`. Esos objetos no son instancias de la clase generada, así que `instanceOf`
devuelve `false` y `contractName` lanzaría "no es un DomainError" en todos esos tests. Y el
mismo defecto rompería el test de contrato por WASM, porque un error del módulo wasm no es
instancia de la clase del módulo JSI.

**Decisión:** `contractName` se queda con el `switch` exhaustivo y su `default` que asigna a
`never` —esa es la guardia 4 y no se toca—, pero la puerta de entrada pasa a ser la
presencia de un `tag` reconocible en vez de la identidad de clase. Con eso desaparecen los
dos problemas de una sola vez, y **no hay dos copias del mapeo**, que es lo que la spec
prohíbe. Se le dice al implementador de T11 explícitamente.

**Costo si está mal:** un objeto cualquiera con un `tag` que coincida pasaría el filtro. Es
barato: `messageFor` lanza si el nombre del contrato no existe en `messages.es.json`, así que
un `tag` inventado falla igual, sólo que un renglón más abajo.

### Ruling P2 — pnpm manda; si builder-bob declara `workspaces`, se quita

**El conflicto:** T6 crea `pnpm-workspace.yaml` en la raíz, y `create-react-native-library`
suele dejar un campo `"workspaces": ["example"]` en el `package.json` de la librería, que es
convención de yarn. Los dos mecanismos a la vez desordenan la resolución de `node_modules`.

**Decisión:** el stack fijado usa **pnpm 11.21.x**, así que `pnpm-workspace.yaml` es la
autoridad y el campo `workspaces` del `package.json` se elimina si aparece. Se le dice al
implementador de T6 que lo compruebe.

**Costo si está mal:** si algún script del scaffolding dependía del campo, se rompe y se ve
de inmediato al instalar; se revierte poniendo el campo de vuelta.

### Ruling P3 — las dos baselines se quedan separadas, cada una con su comentario

**El conflicto:** `example/src/benchmark/NativeBaseline.ts` (T19) y
`__benchmarks__/baseline.ts` (T22) hacen aritmética IEEE-754 sobre montos casi idéntica. Un
revisor puede marcarlo como duplicación de un bloque de lógica.

**Decisión:** se quedan las dos. Viven en paquetes distintos —una en la app, otra en la
librería— y sirven a cosas distintas: la de la app se **pinta en pantalla** y la de la
librería existe para que un test **exhiba la divergencia** contra `cases.json`. Unificarlas
obligaría a exportar `__benchmarks__` desde la superficie pública del paquete, que es
justamente lo que no debe pasar: es la única aritmética prohibida del proyecto y no puede
volverse API. La spec y `CLAUDE.md` nombran las dos por separado. Cada archivo lleva el
comentario obligatorio que dice por qué existe, y en la revisión se pasa este ruling como
contexto.

**Costo si está mal:** dos archivos que hay que cambiar a la vez si el patrón de la baseline
cambia. Son cuatro líneas cada uno y los dos están cubiertos por tests.

---

## Progreso

### Task 1

- BASE `0e002b9` → `46ad3c8`. Implementador: sonnet. 67 passed, clippy y fmt limpios.
- Revisión: **Spec ✅**. Un hallazgo **Importante**: `rust-core/BUILD.md:209` sigue diciendo
  "uniffi 0.32 nombra el modulemap según el crate", mientras el `Cargo.toml` ya dice 0.31.
- **Ruling T1-1:** el hallazgo es correcto y se arregla. Choca con el texto del plan —su Step 7
  acotaba el grep a `CONTEXT.md`—, así que gano yo contra mi propio plan: el defecto es del
  brief, que definió mal el alcance. La spec pide coherencia entre la documentación del core y
  su manifiesto, y `CONTEXT.md` **apunta a `BUILD.md`** como la doc de toolchain: dejarlo
  citando 0.32 manda a la próxima persona a leer el número equivocado por el puntero oficial.
  Se corrige sólo el número de versión; el paso de renombrar el modulemap sigue siendo
  necesario en 0.31 y no se toca.
  **Costo si está mal:** ninguno funcional — es un número en una frase de documentación.
- Task 1: fix round 1/5 despachado — reanudado el implementador original `a1afde7247f3315c9`
  con el hallazgo de `BUILD.md` textual. Esperando commit.
- **Ruling T1-2:** el implementador commiteó el fix (`1d4de3f`) pero **no anexó** su informe de
  ronda a `task-1-report.md`. La skill pide confirmar ese informe antes de re-revisar. Sigo sin
  perseguirlo: es un cambio de documentación de una línea, sin tests que correr, y la
  verificación (`grep -rn "0\.32" rust-core/*.md`) la corrí yo con la salida a la vista — los
  seis aciertos restantes están todos en `PENDING.md` y son correctos, porque explican por qué
  0.32 no se puede usar. La re-revisión acotada juzga el diff, que es la evidencia real.
  **Costo si está mal:** ninguno material; queda el hueco de proceso anotado acá.
- Task 1: fix round 1/5 (1 addressed, 0 open — BUILD.md citaba uniffi 0.32; commits 46ad3c8..1d4de3f)
- **Task 1: complete (commits 0e002b9..1d4de3f, review clean)**

### Task 2

- BASE `1d4de3f`. Regenerar Android sobre el core 0.31 y volver a 43/43. Emulador
  `emulator-5554` conectado y verificado antes de despachar.
- Task 2 implementada: 28 JVM + 15 instrumentados = **43/43**, nueve funciones a 1 cada una,
  `git status --short apps/android` vacío. **Cero commits**: los artefactos están gitignorados.
- **Ruling T2-1:** la Task 2 no produce diff, así que su revisión no puede ser una revisión de
  diff. La skill dice "nunca despaches un revisor sin archivo de diff", y aquí el entregable
  **es la evidencia**, no código. Despacho una revisión de evidencia: contrasta el informe
  contra el brief y comprueba el estado del repo por su cuenta (el `.kt` regenerado, las tres
  `.so`, `git status`). **Costo si está mal:** una revisión sin diff puede tragarse un cambio
  no commiteado; lo cubre que `git status` esté limpio y que el revisor lo verifique él mismo.
- Tres observaciones del implementador, pendientes de veredicto: (1) los tamaños de las `.so` y
  del `.kt` ya no coinciden con la tabla de `apps/android/BUILD.md`; (2) dos warnings nuevos en
  el `.kt` generado; (3) un `Unable to strip ... libcore_financiero.so` no documentado.
- Revisión T2: **Spec ✅**, calidad aprobada, un Menor. El revisor verificó los conteos contra
  los XML de `app/build/`, no contra el informe: 28 unitarios y 15 instrumentados (9 de
  contrato), `CoreSmokeTest.theLibraryLoadsAndJnaResolvesSymbols` entre ellos.
- **Ruling T2-2 (observación 1 y 3, diferidas):** la tabla de tamaños de `apps/android/BUILD.md`
  quedó vieja (+0.4%/+0.8% en las `.so`, -4% en el `.kt`) y el mensaje `Unable to strip …` no
  está documentado. Las dos son reales y las dos se **difieren hasta después de la Task 14**,
  no por pereza: si el spike de `wasm2` obliga a poner el feature `single-threaded`
  incondicional en `crates/ffi`, la Task 14 regenera Android otra vez y **estos números
  cambian de nuevo**. Actualizar `BUILD.md` ahora sería trabajo que hay que repetir. Se hace
  una vez, con los números finales. **Costo si está mal:** quien siga `BUILD.md` entre ahora y
  la Task 14 ve un tamaño que no coincide; el riesgo es que lo lea como alarma. Mitigado
  porque el propio `BUILD.md` no usa el tamaño como criterio de fallo.
- **Ruling T2-3 (observación 2, descartada):** los dos warnings "Expression is unused" del `.kt`
  son del código **generado** por uniffi —referencias deliberadas a `UniffiLib` para forzar la
  inicialización entre crates, con el comentario del propio generador explicándolo—. El
  proyecto prohíbe editar lo generado, así que no hay nada que arreglar sin parchear upstream.
  Sin acción. **Costo si está mal:** ninguno; no rompen el build y no hay `-Werror`.
- **Task 2: complete (sin commits — artefactos gitignorados; 43/43 verificados, review clean)**

### Task 3

- BASE `1d4de3f`. Regenerar iOS sobre el core 0.31 y volver a 47/47.
- Task 3 implementada: **47 tests en 12 suites, `** TEST SUCCEEDED **`** en simulador iPhone 17
  Pro. Sin commits (artefactos gitignorados). Estado DONE_WITH_CONCERNS.
- **Ruling T3-1 (gate de hardware, parcial — se sigue):** la corrida sobre aparato no se pudo
  hacer. Había un iPad Air 5 con iPadOS 26.6.1 conectado y el build, la firma y el
  provisioning funcionaron, pero el aparato estaba **bloqueado con pantalla**
  (`deviceprep Code=-3 "Unlock … to Continue"`) y eso necesita acceso físico. El plan
  contempla este escenario y autoriza seguir: el verde de simulador más el verde de Android
  son evidencia suficiente para continuar la fase. **Queda como gate parcialmente cumplido y
  hay que cerrarlo antes de la demo** — es lo único que ejercita el slice `aarch64-apple-ios`,
  que es el binario que se embarca y es distinto del de simulador.
  **Costo si está mal:** si ese slice estuviera roto, no lo sabríamos hasta la demo. Mitigado
  porque el slice se construye con el mismo comando que en la Fase 3, que sí corrió en aparato.
- **Hallazgo para el usuario, no para un subagente:** `apps/ios/PENDING.md` afirma que el
  iPhone disponible está en **iOS 16.5**, por debajo del target 17.0. `xcrun xctrace list
  devices` lo mostró en **18.6.2**. Si eso es cierto, el pendiente con fecha de vencimiento de
  la Fase 3 —repetir el benchmark en un teléfono en vez de un iPad— **está desbloqueado**.
  No se pudo confirmar porque el aparato estuvo `unavailable` toda la tarea.
- Observación difierida junto al Ruling T2-2: los dos slices del XCFramework salieron ~4.6% más
  grandes que la tabla de `apps/ios/BUILD.md`, escrita bajo 0.32.
- Revisión T3: **Spec ✅**, calidad aprobada, un Menor (los tamaños del XCFramework, ya cubierto
  por el Ruling T2-2). El revisor verificó el 47/47 contra el `.xcresult` que dejó la corrida
  —`"passedTests":47, "failedTests":0`— y confirmó que `Generated/include/module.modulemap`
  existe con el nombre correcto, que es la trampa de esta plataforma.
- Sobre el gate de hardware, el revisor confirma que **no había vía sin acceso físico**: no
  existe desbloqueo remoto en iOS por diseño, y el implementador descartó antes que fuera
  certificado o perfil vencido. Interrumpir fue correcto.
- **Task 3: complete (sin commits — artefactos gitignorados; 47/47 en simulador, review clean,
  gate de hardware parcial por Ruling T3-1)**

### Task 4

- BASE `1d4de3f`. Transferir la evaluación técnica de Android a los dos PENDING.
- **Ruling T4-1:** el Step 4 del brief manda borrar `docs/android-rust-core-evaluation.md`. El
  usuario autorizó borrarlo ("borralo si quieres"), pero **el borrado me lo quedo yo**: el
  implementador transfiere y verifica, y yo compruebo la transferencia antes de ejecutar el
  `rm`. Es la única acción irreversible de la fase y el archivo no está versionado, así que un
  borrado prematuro no se recupera con git. **Costo si está mal:** un turno más de latencia.
- Task 4 implementada (`d6c0339`), estado DONE_WITH_CONCERNS. Los dos `grep -c` dan 1. El `rm`
  no se ejecutó, por el Ruling T4-1.
- **Ruling T4-2 (preocupación de alcance, se amplía antes de revisar):** el implementador avisa
  que el original trae detalle que el texto destilado **no** recoge: el árbol de directorios
  propuesto para `:core-financiero` (3.2), el snippet Gradle `Exec` (3.3), el ejemplo de
  `AccountUi` inmutable (3.4) y la cifra de App Bundle ~3-5 MB (3.5). Mi criterio escrito era
  "se puede borrar sin perder nada", así que la preocupación es correcta y la atiendo antes de
  la revisión, como manda la skill para DONE_WITH_CONCERNS de alcance.
  **Decisión:** se añaden **dos** de las cuatro — el árbol de directorios, porque es la
  recomendación de prioridad Alta y sin él queda abstracta, y la cifra del App Bundle, porque
  es un dato medido que re-derivar cuesta. **No** se añaden el snippet de Gradle ni el ejemplo
  de `AccountUi`: son boilerplate que quien ejecute la recomendación escribe igual, y copiarlos
  convertiría un PENDING en un tutorial.
  **Costo si está mal:** si alguien echa de menos el snippet, lo reescribe en diez minutos.
- Task 4: fix round 1/5 (ampliación por Ruling T4-2; commits d6c0339..051dd50)
- Revisión T4: **Spec ✅**, calidad aprobada, un Menor. Sobre el juicio central —¿se puede
  borrar el original sin pérdida?— **implementador y revisor coinciden por separado en que sí**.
  El revisor además verificó que lo no transferido no queda huérfano: el diagrama Mermaid ya
  está en `apps/android/README.md` y el dato de alineación de 16 KB en el `CLAUDE.md` raíz.
- **Ruling T4-3 (mensaje de commit, se deja como está):** el mensaje de `d6c0339` dice "el
  documento original se borra" en pasado y el `rm` corrió después, en un turno aparte. No se
  corrige: el archivo nunca estuvo trackeado, así que **ninguna acción futura puede hacer que
  esa frase quede respaldada por un diff**; y corregirla exigiría reescribir historia, que el
  proyecto prohíbe salvo pedido explícito. Cambiar un defecto menor de redacción por una
  violación de una regla mayor es mal negocio. **Costo si está mal:** una frase imprecisa en
  un mensaje de commit, ya documentada acá.
- **Borrado ejecutado por mí** tras verificar la transferencia: `docs/android-rust-core-evaluation.md`
  ya no existe y `git status` queda limpio.
- **Task 4: complete (commits 1d4de3f..051dd50, review clean)**

## BLOQUE 0 COMPLETO — el core en 0.31 no rompió nada: 67 + 43 + 47 en verde.

### Task 5

- BASE `051dd50`. Corregir `CLAUDE.md` y `apps/react-native/CONTEXT.md` antes de construir.
- Task 5: el implementador `ae92cf9bb108f9583` se cortó por **límite de gasto de la API**
  (HTTP 429), no por un fallo del trabajo. Estado al cortarse: `CLAUDE.md` y
  `apps/react-native/CONTEXT.md` editados y **sin commitear**; las ediciones verificadas por mí
  como correctas (la fila de la Fase 4 apunta a `pnpm exec ubrn --version`; en el CONTEXT no
  queda ni `wasmCrateName` ni `build web`). Reanudado para cerrar juicio + commit.
- **Dos contradicciones residuales que detecté yo al leer el CONTEXT**, pasadas al implementador
  para que las verifique y reporte, no para que las arregle:
  1. El CONTEXT **se contradice a sí mismo** sobre el mapeo de errores: en "La superficie del
     core" dice que va "en el test de contrato de Jest, **no en producción**", y en la sección
     de `messages.es.json` dice que "hace falta **en producción**". La segunda es la correcta
     (spec D6). Es load-bearing: la Task 11 implementa `contractName` en la librería.
  2. "Cómo consumir el core" importa desde `"../generated/core_financiero"`, ruta relativa que
     la estructura nueva invalida: el adapter vive en `example/src/adapter/` y consume **el
     paquete**.
- Task 5 commit `016414e` (`CLAUDE.md` + `CONTEXT.md`), árbol limpio. El agente se cortó de
  nuevo antes de escribir su informe.
- **Ruling T5-1 (las contradicciones residuales SÍ se corrigen en esta tarea):** el propósito
  entero de la Task 5 es que el CONTEXT deje de contradecir lo que la fase construye. Dejarlas
  sería dejar la tarea sin hacer: el implementador de la Task 11 lee el CONTEXT como spec de
  entrada. Son tres, no dos — encontré una tercera yo:
  1. Línea 64-65: "las nueve líneas **en el test de Jest, no en producción**" contra la línea
     186, que dice lo contrario. Gana producción (spec D6).
  2. Líneas 146 y 165: imports desde `"../generated/core_financiero"`; con la estructura nueva
     el adapter consume **el paquete** `@banco/core-financiero`.
  3. **La más grave:** el CONTEXT enseña `if (DomainError.instanceOf(e))`, que es justo lo que
     el **Ruling P1** descartó. Falla con los dobles de prueba de las pantallas (objetos planos
     con `tag`) y falla en el test de contrato por WASM (los errores del módulo wasm no son
     instancias de la clase del módulo JSI). Pasa a discriminar por `tag`, conservando el
     `switch` exhaustivo y el `default` que asigna a `never`.
  **Costo si está mal:** son tres ediciones de documentación, reversibles con un commit.
- **Ruling T5-2 (las correcciones las aplico yo, y entran a revisión):** el implementador se
  cortó dos veces por límite de API y mi segundo mensaje quedó encolado después de que parara,
  así que nunca recibió las tres correcciones. La skill dice no arreglar hallazgos desde el
  coordinador, y su motivo real es que un arreglo del coordinador **se saltea la revisión**.
  Lo aplico yo y **cubro ese motivo**: la revisión de la Task 5 se despacha sobre el rango
  completo `051dd50..HEAD`, así que mis ediciones se revisan igual que las suyas.
  **Costo si está mal:** mi contexto se ensucia con tres ediciones de markdown. Aceptable
  frente a un tercer despacho que puede volver a cortarse.
- Sobre la duda del implementador —si corregir el import era especular—: medio punto. El nombre
  del **archivo generado** sí es incógnita hasta la Task 7, pero el del **paquete** lo fija la
  Task 6 y no es especulación. Es exactamente para eso que existe `src/index.tsx`: la app
  importa el paquete y el nombre del archivo generado deja de ser asunto suyo. Así quedó escrito.
- Revisión T5: **Spec ✅**, y **un hallazgo CRÍTICO contra mi propio commit** `bc81ddc`,
  verificado por el revisor con `tsc --strict`: castear a `{ tag?: unknown }` hace que
  `const _exhaustive: never = tag` falle **siempre** (`TS2322`), con las nueve variantes
  cubiertas o sin ellas — o sea que mi ejemplo destruía la guardia que su propio texto decía
  conservar. Corregido al tipo del companion. **Ésta es la justificación de haber mandado mis
  propias ediciones a revisión.**
- Hallazgo **Importante** de la misma revisión: la decisión no se había propagado al plan. Las
  Tasks 11 y 15 seguían escritas con `instanceOf`, y el revisor encontró que el plan **se
  rompía contra sí mismo**: la Task 16 construye dobles de prueba como objetos planos, que
  `instanceOf` rechaza. Propagado: Task 11 discrimina por `tag`, Task 15 ya no parametriza por
  flavour, Task 7 anota además si el binding exporta el tipo del companion.
- Hallazgo **Menor**: la línea 59 del CONTEXT seguía diciendo "contrastá `src/generated/` antes
  de escribir el adapter", topología vieja. Corregido a `src/index.tsx`.
- Task 5: fix round 1/5 (3 addressed, 0 open; commits bc81ddc..HEAD)
- Re-revisión T5 (ronda 1): los tres hallazgos **ADDRESSED**, verificados con `tsc --strict` en
  las dos direcciones — con el tipo del companion compila limpio con las nueve cubiertas y da
  error **específico** al comentar un `case`; con `unknown` falla siempre. Pero levantó una
  **rotura nueva introducida por mi propia corrección**: escribí `DomainErrorTag`, identificador
  que no existe (`Cannot find name 'DomainErrorTag'`). La Task 11 no habría compilado de entrada.
- Task 5: fix round 2/5 (1 addressed — el identificador inventado; commit `54495cc`).
- **Ruling T5-3 (no hay ronda 3 para esto):** la corrección es renombrar a `DomainError_Tags`,
  y el propio re-revisor **ya ejecutó `tsc` sobre esa forma exacta** en las dos direcciones. Su
  evidencia es la verificación; una ronda más sólo la repetiría. Aproveché para cerrar el matiz
  que su prueba deja a la vista: `DomainError_Tags` sirve como tipo si `ubrn` lo genera como
  `enum`, pero si lo genera como objeto constante hay que indexarlo con
  `(typeof X)[keyof typeof X]`. Cuál de las dos es se mira en la Task 7, que ya lo tiene entre
  lo que debe anotar. **Costo si está mal:** el implementador de la Task 11 encuentra la forma
  correcta en el primer `tsc`, que es un paso del propio plan.
- **Task 5: complete (commits 051dd50..54495cc, review clean)**

## Estado: 5/23 tareas completas. Bloque 0 cerrado, bloque 1 arranca en la Task 6.

## GATE DE HARDWARE iOS CERRADO

El usuario desbloqueó el iPad. Corrida sobre aparato: `** TEST SUCCEEDED **`,
`Test run with 47 tests in 12 suites passed`. Eso ejercita el slice `aarch64-apple-ios`, que
es el binario que se embarca y es distinto del de simulador. **El Ruling T3-1 queda saldado: el
bloque 0 está completo sin asteriscos.** Nota: `xctrace` listaba el iPad como Offline mientras
`devicectl` decía `available (paired)` — cuando discrepen, gana `devicectl`.

### Task 6

- BASE `54495cc`. Commit `939160c`, estado DONE_WITH_CONCERNS.
- **Hallazgo del implementador, y era mío el error:** `ubrn` **no define `--version`**
  (`error: unexpected argument '--version' found`). O sea que en la Task 5 corregí el comando
  equivocado de `CLAUDE.md`... por otro equivocado. Verificado por mí. El comando real es
  `pnpm exec ubrn --help` más `pnpm ls uniffi-bindgen-react-native`.
- **Verificación que desactiva dos riesgos grandes del diseño**, hecha por mí sobre el CLI ya
  instalado: `ubrn build --help` lista `android · ios · web · **wasm2**` y `ubrn generate
  --help` lista `jsi · **napi** · wasm · wasm2`. El flavour `wasm2` (D5) y la ruta N-API (D4)
  **existen de verdad** en la versión fijada; hasta acá eran supuestos leídos de notas de
  release. Se añade un Step 6b al plan para que esto se compruebe siempre.
- **Ruling T6-1 (React Native sube a 0.87.0):** decisión del usuario sobre datos, no preferencia.
  RN 0.87.0 salió el 2026-08-11 y ubrn 0.31.0-5 el 2026-08-21, diez días después; el CHANGELOG
  de ubrn dice que sus checks per-PR corren «the latest versions only», así que 0.87.0 es con
  alta probabilidad la versión contra la que ubrn probó al publicarse. El `stack.png` fija
  0.85.3, que sólo entra en el barrido histórico nocturno. **No se va a 0.87.1**: salió cinco
  días *después* de ubrn. Plan actualizado (5 ediciones). Queda para `PENDING.md` que el stack
  corporativo está dos minors atrás.
  **Costo si está mal:** si 0.87 pelea con el scaffolding o con ubrn, se baja y se documenta;
  el plan ya contempla esa salida y ahora mismo es barato — dos pins y un reinstall.
- Task 6 ronda 2: commit `a8c0707` (RN 0.87.0 + comando de `CLAUDE.md` arreglado) y `df87450`
  (mis ediciones al plan). `react` queda en 19.2.3, que satisface el peer `^19.2.3` que declara
  RN 0.87.0 — verificado contra el registro, no contra el informe.
- Revisión T6: **Spec ✅**, calidad aprobada, dos Menores. El revisor verificó contra los
  archivos reales: RN 0.87.0 en los dos `package.json` y en `node_modules`, cero apariciones de
  `0.85.3` en el lockfile, `newArchEnabled=true`, sin campo `workspaces` ni `packageManager:
  yarn`, `.gitignore` comprobado con `git check-ignore -v`, el `CONTEXT.md` intacto, y **corrió
  el comando nuevo de `CLAUDE.md`** en vez de creerle al informe. También confirmó mis fechas de
  npm y que `build wasm2` y `generate napi` existen.
- **Ruling T6-2 (el preview de Vite se borra, en la Task 23):** el scaffolding dejó
  `example/index.html`, `example/vite.config.mjs` y cuatro scripts `web`/`build:web`. Es un
  preview del ejemplo vía `react-native-web`, **un camino distinto del que esta POC documenta**:
  el "web" real de la Fase 5 es el `.wasm` que produce `ubrn`, consumido por Angular. No rompe
  nada, pero es un señuelo — y `CLAUDE.md` ya avisa que el MIME del `.wasm` en Angular es donde
  más tiempo se pierde en este proyecto. **Decisión tomada para que nadie tenga que volver a
  decidirla: se borra**, junto con sus scripts, al escribir el README en la Task 23.
  **Costo si está mal:** si alguien quería ese preview, son dos archivos que el scaffolding
  regenera.
- **Ruling T6-3 (el import roto de `multiply` se queda):** `example/src/App.tsx` importa algo
  que ya no existe. La Task 8 reescribe ese archivo entero. Poner un placeholder hoy es trabajo
  tirado. **Costo si está mal:** `example/` no compila entre la Task 6 y la 8, y eso está bien:
  ninguna tarea de ese tramo lo requiere.
- **Task 6: complete (commits 54495cc..df87450, review clean)**

### Task 7

- BASE `df87450`. Primera generación real de bindings JSI. Rama verificada:
  `feat/phase-4-app-react-native`; `main` intacta en `ca3d93e`.
- Task 7 implementada: commits `96f3b88` (bindings JSI) y `aaed7db` (fix de `.gitignore` para no
  commitear 692 MB de `.a` de debug). Estado DONE_WITH_CONCERNS.
- **El contraste salió limpio y eso vale decirlo:** el archivo generado se llama
  `src/generated/core_financiero.ts` —como predecía el CONTEXT—, las nueve funciones están a 1
  cada una, y los cinco Records coinciden **campo por campo, tipo por tipo y en orden**.
  `simulatedLatencyMs` es el único `number` de los Records. (`DomainError.Length` trae
  `expected`/`received` como `number`, pero son conteos de dígitos `u32`, no montos.)
- **`DomainError_Tags` es un `enum` real de TypeScript**, no un objeto constante: sirve directo
  como tipo en el `switch`, sin el patrón `(typeof X)[keyof typeof X]`. Queda cerrada la
  incógnita que el Ruling T5-3 dejó abierta.
- **Difiere del CONTEXT una cosa:** no existe una `class DomainError`. Es un objeto congelado que
  agrupa nueve clases internas más un `instanceOf` genérico, y por separado un
  `export type DomainError` (unión de las nueve). **Refuerza el Ruling P1**: discriminar por
  `tag` era lo correcto, y por más razones de las que yo tenía.
- **Ruling T7-1 (DEFECTO DEL PLAN, corregido antes de la Task 8):** `src/index.tsx` **lo genera
  ubrn**, y contiene `installer.installRustCrate()`, que es lo que registra el crate con Hermes.
  Mi Task 8 le decía al implementador que **creara** ese archivo a mano con reexports: lo habría
  sobrescrito, JSI no habría instalado nunca, y el síntoma no aparece al compilar sino al abrir
  la app. Esto el escaneo previo no podía cazarlo — sólo se ve cuando ubrn genera de verdad.
  **Corrección:** `turboModule.entrypoint: src/bindings.tsx` en `ubrn.config.yaml` para que ubrn
  genere ahí, y `src/index.tsx` pasa a ser nuestro, reexportando `./bindings` y sumando
  `contractName`. Descartado congelar el generado con `noOverwrite`: congelaría justo el archivo
  que lleva el registro de Hermes.
  **Costo si está mal:** si `turboModule.entrypoint` no se comporta como documenta la config de
  ubrn, se vuelve a `noOverwrite` y se asume el congelamiento. Lo dice el Step 1 reescrito.
- **Ruling T7-2 (el build del core va en `release`, no `dev`):** la Task 7 compiló en perfil
  debug. Se rehace en release, y el motivo no es cosmético: **la pantalla de Benchmark compara
  el core contra una baseline de punto flotante nativo y es el centro de la demo**. Medir un
  core en debug lo haría ver mucho más lento de lo que es y distorsionaría justo la comparación
  que la POC existe para mostrar. Además el perfil de release es deliberado (`opt-level = "z"`,
  `lto`, `codegen-units = 1`, `strip`) y el tamaño del binario es criterio de la demo.
  **Costo si está mal:** un rebuild.
- **Ruling T7-3 (el *glue* generado se ignora, no se commitea):** `android/build.gradle`,
  `cpp-adapter.cpp`, `CMakeLists.txt`, `android/src/`, `src/NativeCoreFinanciero.ts` y
  `src/bindings.tsx` son artefactos de `ubrn`. El proyecto trata todo lo generado igual —Android
  ignora sus `.so` y sus bindings Kotlin— y el comando de regeneración vive en `BUILD.md`.
  `CMakeLists.txt` está trackeado, así que necesita `git rm --cached`, no sólo la entrada.
  `src/index.tsx` es la excepción: queda sin commitear hasta la Task 8, que lo convierte en
  archivo nuestro. **Costo si está mal:** un clon fresco no compila hasta correr el comando de
  `BUILD.md`, exactamente como pasa hoy en Android e iOS.
- **iPhone 12 (iOS 18.7.8):** primera corrida falló con `The developer disk image could not be
  mounted`. Estado `connected (no DDI)`, con `developerModeStatus: enabled` y
  `pairingState: paired`. Reintento lanzado. **No bloquea nada**: el gate de hardware ya está
  cerrado con el iPad (47/47).
- **Ruling T7-4 (el CONTEXT se alinea con el binding real, lo hago yo — commit `ae42ad1`):**
  la predicción del CONTEXT acertó en las nueve funciones y los cinco Records, y **falló en el
  error**. Lo real, leído del archivo generado:
  - `export enum DomainError_Tags { Length = 'Length', … }` — enum de strings, sirve como tipo.
  - `export const DomainError = (() => { … })()` — objeto congelado con nueve clases internas.
  - `export type DomainError = InstanceType<…>` — **la unión**, con el mismo nombre que el const.
  Que ubrn exporte **dos cosas llamadas igual** es justo lo que hace fácil importar la
  equivocada; por eso el ejemplo usa `type DomainError` explícito.
  Y hay una noticia mejor de lo que yo había asumido: cada variante declara
  `tag: DomainError_Tags.Length` —el **miembro concreto**, no el enum entero—, así que
  `DomainError` es una **unión discriminada de verdad** y el `switch` angosta solo hasta `never`
  sin inventar ningún cast. El plan queda corregido: `const { tag } = e as DomainError`.
  **Costo si está mal:** lo verifica `tsc` en la Task 11, que es un paso del propio plan.
- Task 7 ronda 2: commit `cd517d9` — rebuild en **release** (`ubrn build android --release
  --and-generate`, el flag ya existía: `-r, --release`) y *glue* gitignorado. `git status` queda
  sólo con `src/index.tsx`, como manda el Ruling T7-1. Tamaños release: 86/77/81 MB los `.a`.
- Revisión T7: **Spec ✅**, calidad con hallazgos. Verificó todo contra el repo real, incluido
  que `simulatedLatencyMs` es el único `number` de los cinco Records.
- **El `.a` en `jniLibs/` quedó resuelto con evidencia, no con lectura:** el revisor
  **descompiló `MergeNativeLibsTask` de AGP** (9.2.1/9.4.0, el que usa este proyecto) y encontró
  el predicado real: `PatternSet().include("**/*.so")` más una allowlist de dos nombres
  (`gdbserver`, `gdb.setup`). `libcore_financiero.a` no matchea ninguno → **queda fuera del
  merge de nativos en los dos empaquetados**, `.aar` y `.apk`. Mi lectura era correcta y ahora
  está probada. El Step 4b de la Task 8 se queda igual: confirma en la práctica lo que el
  bytecode promete, y cubre una `packagingOptions` custom que lo reintrodujera.
- **Ruling T7-5 (tres de los cuatro hallazgos eran míos, corregidos por mí):**
  1. *Importante:* `CONTEXT.md:72` seguía con el cast viejo `{ tag: DomainError_Tags }` mientras
     la línea 212 ya decía `DomainError`, la unión. **Corregí una sección y dejé la otra — y la
     vieja es la que se lee primero.** Es la segunda vez que una corrección mía queda a medias.
  2. *Menor:* el CONTEXT describía `instanceOf` como un `instanceof` de JS. El hallazgo del
     implementador era exacto: compara `obj[uniffiTypeNameSymbol] === 'DomainError'` contra el
     símbolo de **su propia copia** de `@ubjs/core`. Razón aún más fuerte para no usarlo, y
     ahora escrita.
  3. *Menor:* el `git rm --cached` de `CMakeLists.txt` terminó dentro de mi commit `ae42ad1`, de
     documentación, por una carrera de working tree entre los dos agentes. Inofensivo. **No se
     reescribe historia por eso**; queda anotado acá.
- Hallazgo del implementador, en corrección: `BUILD.md` documenta `pnpm run ubrn:clean`, que
  **no existe**. Se arregla creando los cuatro scripts que el CONTEXT ya promete —con
  `--release` en android e ios— y **corriéndolos**, no borrando la sección.
- Task 7: fix round 1/5 — los cuatro hallazgos **ADDRESSED**. El clean+regenerate corrió de
  verdad y los tres `.a` volvieron **byte por byte idénticos**: el build es reproducible.
- Re-revisión: dos roturas nuevas y una corrección **contra mí**:
  1. *Importante:* `BUILD.md` afirmaba que `wasm2` **no acepta perfil de build**. **Falso**,
     verificado por mí: `ubrn build wasm2 --help` expone `-r, --release` y `-p, --profile`.
     Peligroso, porque alguien construiría el WASM en debug confiando en esa frase, y el tamaño
     del binario es criterio de la demo.
  2. *Importante:* `CONTEXT.md` volvió a quedar desincronizado con `package.json` — sus scripts
     siguen sin `--release` y sin `src/bindings.tsx`. Mismo defecto que el hallazgo original,
     en el archivo hermano.
  3. **Ruling T7-6 (mi justificación estaba sobrestatada):** escribí que `instanceOf` falla con
     WASM porque "el símbolo mismo difiere entre módulos". El re-revisor lo **probó en Node** y
     no es así: `uniffiTypeNameSymbol` es `Symbol.for("typeName")`, registro **global**,
     compartido entre copias del módulo en el mismo proceso. Lo que sí está verificado —y
     alcanza— es que los dobles de prueba son objetos planos **sin la marca**. Se corrige el
     texto para afirmar sólo eso y **bajar el caso WASM a sospecha por verificar**, diciendo
     explícitamente que la decisión de discriminar por `tag` no depende de él.
     **Costo si está mal:** ninguno técnico — la decisión se sostiene sola. El costo era de
     honestidad: una razón inventada en un documento normativo se propaga.
- **Ruling T7-7 (delego el CONTEXT en vez de corregirlo yo):** van dos veces que una corrección
  mía a ese archivo queda a medias. Esta ronda va entera al implementador, que ha sido preciso,
  para que quede coherente de una sola pasada. **Costo si está mal:** un turno más.
- Task 7: fix round 2/5 (3 addressed, 0 open; commit `21b4553`). Re-revisión: los tres
  ADDRESSED, cero roturas. El texto sobre `instanceOf` quedó honesto — afirma lo probado, admite
  que el caso WASM es "sospecha sin verificar", y deja claro que la decisión no depende de él.
- **Ruling T7-8 (dos desincronizaciones más, diferidas a la Task 8):** el implementador encontró
  y **no tocó** —bien hecho— dos restos en `CONTEXT.md`: (1) el blockquote de las nueve
  funciones sigue diciendo que "`ubrn` todavía no está instalado" y que hay que contrastar
  `src/generated/`, cosas que ya ocurrieron; (2) la sección de consumo dice que el nombre del
  archivo generado "hay que confirmarlo" y no menciona `src/bindings.tsx`. **Se difieren a la
  Task 8 a propósito**: esa tarea es la que crea `bindings.tsx`, así que documentarlo antes
  sería describir algo que no existe. El (1) se aprovecha para registrar el resultado del
  contraste, que es información valiosa: la predicción acertó.
- **Task 7: complete (commits df87450..21b4553, review clean)**

## Estado: 9/23 completas. **Bloque 1 cerrado**: JSI cruza en Android y en iOS, mismo string. Sigue el Bloque 2 (Task 10).

### Task 8

- BASE `21b4553`. El gate: `coreVersion()` cruzando JSI en el emulador.

- **Ruling T8-1 (la línea de `contractName` NO va en la Task 8 — DEFECTO DEL PLAN):** el Step 1
  mandaba poner `export { contractName } from './contractName';` en `index.tsx`, diciendo que
  hasta la Task 11 "`tsc` va a marcar esa línea". Subestima el daño: no es un error de tipos, es
  un **módulo que Metro no puede resolver**, así que el bundle no se arma y la app ni carga JS —
  justo el gate que esta tarea existe para pasar. La línea se omite; la agrega la Task 11 junto
  con el archivo. Beneficio extra: preserva el rojo del TDD de la Task 11, que espera fallar
  porque `../src/contractName` **no existe**. Hay que corregir su Step 4, que dice "`src/index.tsx`
  ya la exporta: comprobarlo y no duplicarla" — pasa a "agregarla".
- **`turboModule.entrypoint` funciona, con una salvedad que el plan no decía:**
  `ubrn generate jsi turbo-module --config …` toma las namespaces como **argumento posicional**.
  Sin él escribe `bindings.tsx` vacío —sin `export * from './generated/core_financiero'`, sin
  `initialize()`, `export default {}`—, que compila y no hace nada. Con `core_financiero` al
  final, el generado salió **byte por byte idéntico** al `index.tsx` que había: el archivo se
  movió intacto. No hizo falta `noOverwrite`, o sea que el fallback del Ruling T7-1 queda sin
  usar.
- **El gate pasó: `1.0.0+288ee44` en pantalla, campo de error vacío**, sobre emulador Pixel 9 Pro
  API 36 (arm64-v8a). El SHA es anterior a HEAD (`21b4553`) y **es correcto**: el `.a` se
  construyó a las 18:51 bajo `288ee44`, y `git diff --stat 288ee44..HEAD -- rust-core/` sale
  vacío, o sea que ningún commit posterior tocó el core. Verificado, no supuesto.
- **Step 4b: cero `.a` en el APK**, confirmado con `unzip -l`. El core viaja enlazado dentro de
  `libbanco-core-financiero.so` (4,0 MB en arm64). Pero el listado destapó un defecto que el plan
  no anticipaba: `gradle.properties` empaquetaba **cuatro** ABIs y `ubrn.config.yaml` compila
  **tres**, así que el APK salía con un `lib/x86/` **sin** el core adentro — un slice que instala
  y crashea al cargar. Alineadas: APK de 125 MB → **95 MB**.

### Task 8: seis incompatibilidades de toolchain que el plan no anticipaba

Ninguna es culpa del plan: se ven recién cuando el example compila por primera vez. Una sola raíz
con muchas caras — **el esqueleto de `react-native-builder-bob` asume un monorepo yarn/npm con
`node_modules` aplanado, y una línea base de toolchain más vieja que la del repo.** Todas están
documentadas en `BUILD.md` con su síntoma, su causa y dónde quedó el arreglo.

1. **Metro no arrancaba** (`No 'workspaces' field found`): pnpm declara workspaces en
   `pnpm-workspace.yaml`. Opción `workspaces` explícita en `metro.config.js`.
2. **`Unable to resolve module @babel/runtime/…`**: pnpm enlaza al store de la raíz del repo y
   Metro no sirve fuera de sus raíces vigiladas. `watchFolders` extendido. La raíz **no** puede
   pasarse como `root` del helper: éste lee su `package.json` sin condicional y ahí no hay
   ninguno.
3. **Lo mismo desde `src/bindings.tsx`**: la librería se consume como fuente, babel le inyecta
   helpers que resuelve desde `apps/react-native/`. `@babel/runtime` a `dependencies` de la
   librería (es dependencia real: su salida compilada la requiere).
4. **`@react-native/gradle-plugin does not exist`**: transitiva de `react-native`, pnpm no la
   aplana. Declarada como devDependency directa del example, pinneada a `0.87.0`.
5. **AGP 9**, tres cambios rompientes seguidos: wrapper a Gradle **9.6.0** (la misma de
   `apps/android`), `proguard-android-optimize.txt`, y `android.builtInKotlin=false` +
   `android.newDsl=false`.
6. **`react-native.config.js` declaraba la librería como C++ TurboModule** y no lo es.

- **Ruling T8-2 (`android.builtInKotlin=false` en vez de la migración oficial):** la skill
  `agp-9-upgrade` manda quitar `kotlin-android` de cada módulo. **Acá no se puede:** el módulo
  librería lo genera `ubrn` y lo aplica en su plantilla, y este proyecto no edita generados. El
  opt-out es la salida que la propia guía de Google prevé. **Horizonte: AGP 10 lo elimina**, y
  para entonces la salida tiene que venir de `ubrn`, no de un parche nuestro. Anotado en
  `BUILD.md` y en el propio `gradle.properties`.
- **Ruling T8-3 (las claves `cxxModule*` eran una sola causa de dos errores):** el error del `.a`
  faltante y el de `'CoreFinancieroImpl.h' file not found` parecían independientes. **No lo eran.**
  `react-native.config.js` —archivo **nuestro**, del esqueleto de la Task 1, commit `939160c`—
  declaraba `cxxModuleCMakeListsPath` y `cxxModuleHeaderName`. Eso hacía dos cosas a la vez:
  (a) el autolinking metía nuestro `CMakeLists.txt` como subdirectorio del build CMake **de la
  app**, donde `CMAKE_SOURCE_DIR` apunta al `default-app-setup` de RN y no a nuestro módulo, así
  que el `.a` se buscaba dentro de React Native; (b) generaba un `autolinking.cpp` con un
  `#include` de un header que nadie produce. `ubrn` genera un TurboModule **Kotlin** y no menciona
  `cxxModule` en ningún template ni doc suyo.
  **Yo había diagnosticado (a) como bug del template de ubrn** (`CMAKE_SOURCE_DIR` donde debía ir
  `CMAKE_CURRENT_SOURCE_DIR`) y llegué a probar el parche, que funcionaba. Era un síntoma.
  Quitadas las tres claves, el módulo construye su propio `.so` con su `externalNativeBuild` —el
  camino para el que ubrn genera ese CMakeLists, donde `CMAKE_SOURCE_DIR` **sí** es el correcto—
  y el parche sobra. **Está revertido: el generado quedó intacto.** Lección: el parche que
  funciona no es prueba de que la causa esté encontrada.
- **La trampa que costó dos corridas: `autolinking.json` está cacheado y no se invalida solo.**
  Editar `react-native.config.js` y reconstruir **no tiene ningún efecto visible** —
  `autolinkLibrariesFromCommand()` cachea en `android/build/generated/autolinking/` y el build
  sigue fallando con el error viejo, como si el arreglo no sirviera. El que manda es el de
  `android/build/…` (raíz del proyecto Gradle), **no** el de `android/app/…`. Comando de
  invalidación en `BUILD.md`.
- **Preexistente, NO roto por esta tarea, y bloquea la Task 12: `pnpm test` falla.**
  `@react-native/jest-preset/jest/setup.js` usa `import` ESM y babel no lo transforma porque
  `transformIgnorePatterns` no contempla la forma de ruta de pnpm
  (`node_modules/.pnpm/@react-native+jest-preset@…/node_modules/…`). El único test que hay es el
  placeholder `it.todo('write a test')` del esqueleto (commit `939160c`), así que la suite nunca
  corrió en este repo. **Misma raíz que los seis de arriba.** Se deja para la Task 12, que es
  donde Jest se vuelve carga y donde el arreglo se puede escribir bajo TDD en vez de a ciegas.
- **`CoreFinanciero.podspec` e `ios/CoreFinanciero.{h,mm}` pasan a gitignorados.** El paso de
  turbo-module de ubrn los escribe —el podspec ahora lleva su cabecera "Generated by
  uniffi-bindgen-react-native" y reemplazó al del esqueleto de bob—, así que siguen el Ruling
  T7-3 como el resto del *glue*. El podspec estaba trackeado: necesitó `git rm --cached`.
- **Lint arreglado, y en el lugar correcto:** los dos errores de prettier estaban en
  `NativeCoreFinanciero.ts` y `bindings.tsx`, **los dos generados**. Se agregan a los `ignores` de
  `eslint.config.mjs` junto con los tres `src/generated*`, mismo criterio con que ya están en
  `.gitignore`. `src/index.tsx` **no** entra: desde esta tarea es nuestro. `lint` y
  `tsc --noEmit` quedan en verde.
- `SafeAreaView` está deprecado en RN 0.87 y tiraba un warning en pantalla. El smoke no necesita
  safe-area, así que usa `View` — no se suma `react-native-safe-area-context` por una pantalla de
  una línea. Lo deciden las pantallas reales, de la Task 16 en adelante.

- **Task 8: complete (commit `96934b9`).** Gate verde, `tsc` y `lint` en cero, APK medido.
  Pendiente heredado para la Task 12: `pnpm test` no corre (ver arriba, preexistente).

### Addendum a la Task 8: Jest arreglado (se adelantó desde la Task 12, a pedido)

- **La séptima cara de la misma raíz.** El `transformIgnorePatterns` de
  `@react-native/jest-preset` —`node_modules/(?!((jest-)?react-native|@react-native…)/)`— está
  escrito para `node_modules` aplanado. Con pnpm la ruta real tiene **dos** `node_modules/` y el
  patrón matchea en el **primero**, porque lo sigue `.pnpm/`; como a `transformIgnorePatterns` le
  basta un match en cualquier parte de la ruta, el segundo —el que sí va seguido de
  `@react-native/`— nunca se evalúa. Babel no transpila `jest/setup.js`, que está en ESM y corre
  en `setupFiles`, o sea antes que cualquier test: la suite entera muere al cargar. Arreglo: un
  solo lookahead `(?!\.pnpm/)`, conservando la lista blanca del preset. Validado contra siete
  rutas reales antes de escribirlo (RN, preset, js-polyfills, lodash, @ubjs/core, layout plano y
  nuestro `src/`).
- **Ruling T8-4 (mi justificación del `sourceCondition` estaba equivocada, y la mutación lo
  probó):** afirmé que el placeholder sin renderizar `"<%- project.sourceCondition -%>"` hacía que
  Jest resolviera el paquete por `lib/` en vez de por fuente. **Falso.** Romperlo a propósito no
  cambia la resolución: sigue dando `src/index.tsx`. Lo que gobierna es la clave
  `banco-core-financiero-source` del `exports` de `package.json` — borrarla **sí** manda la
  resolución a `lib/module/index.js`. El placeholder se corrige igual, porque una plantilla sin
  renderizar en un archivo de configuración está mal de por sí, pero **el changelog, el comentario
  del test y `BUILD.md` dicen explícitamente que no arregla nada observable.**
  Es exactamente el Ruling T7-6 otra vez, y esta vez lo cazó la mutación y no un revisor: el
  primer comentario que escribí en el test atribuía el efecto al lugar equivocado.
  **Lección operativa: el test que pasa no prueba que la causa esté encontrada — hay que mutar la
  causa supuesta y ver el rojo.** Es el mismo error de forma que el Ruling T8-3, donde un parche
  que funcionaba tampoco era la causa.
- Ambas guardias verificadas por mutación, no por lectura:
  - sin `transformIgnorePatterns` → `SyntaxError`, `Tests: 0 total`, suite muerta.
  - sin la clave del `exports` → el test falla con
    `Received: ".../lib/module/index.js"`.
- El placeholder `it.todo('write a test')` del esqueleto (`src/__tests__/index.test.tsx`) se
  reemplaza por `src/__tests__/jest-setup.test.ts`, **2 tests en verde**. No toca
  `contracts/cases.json`: los vectores siguen siendo trabajo de las Tasks 12 y 15, que ahora
  arrancan con Jest funcionando en vez de teniendo que arreglarlo primero.

### Task 9

- BASE `05a4195`. Se regeneran **los dos** artefactos desde ese HEAD, no sólo iOS: el Step 3
  compara el string de iOS contra el de Android, y Android venía de `288ee44`. Sin el rebuild de
  los dos, el chequeo fallaría por una razón legítima pero no interesante — o peor, se
  "arreglaría" bajando el criterio.
- **Android regenerado en release: `1.0.0+05a4195`, que es HEAD exacto.** 1:04 de rebuild.
  `src/index.tsx` **sobrevivió intacto** a un `--and-generate` completo, que es la primera
  confirmación en caliente de que el `turboModule.entrypoint` de la Task 8 resuelve el problema
  de verdad y no por casualidad.
- **HALLAZGO PARA EL BLOQUE 3 — el `exports` del paquete no tiene entrada web.** Hoy es
  `banco-core-financiero-source` → `src/index.tsx` (Metro y Jest), `types`, y `default` →
  `lib/module/index.js`, que es el **entrypoint JSI**: `installRustCrate()`, Hermes, TurboModule
  nativo. Cuando Angular haga `import { calculateItf } from '@banco/core-financiero'` va a caer
  ahí, y nada de eso existe en un browser.
  El Bloque 3 **toca `package.json` sólo para agregar un script** (`wasm:generate`), no para
  agregar la condición de exportación. O sea que el plan deja el artefacto construido y probado
  28/28 pero **sin la puerta por la que la Fase 5 entra a buscarlo**.
  No bloquea nada hoy y el lugar natural de arreglarlo es la Task 13-15, cuando exista
  `src/generated-wasm/` y se sepa a qué archivo apuntar. `ubrn` ya tiene la noción: el
  `bindings.tsx` generado menciona "parity with the index.web.ts version of this file".
  **Anotado acá para que ese bloque no lo descubra el día que Angular no importa.**
- `pod install` dejó cambios reales en tres archivos trackeados del proyecto Xcode del example
  —`RCTNewArchEnabled` en el `Info.plist`, la agregación del manifiesto de privacidad, y
  `CLANG_CXX_LANGUAGE_STANDARD` a c++20 en el `pbxproj`—. **Se comitean**: son configuración del
  proyecto, no artefactos.
- Al gitignore se suman `BancoCoreFinancieroFramework.xcframework/` (lo produce `ubrn:ios`, mismo
  criterio que los `.a` de Android) y `example/ios/CoreFinancieroExample.xcworkspace` (lo crea
  `pod install` y referencia `Pods/`, que ya estaba ignorado). **`Podfile.lock` y `Gemfile.lock`
  sí se comitean**: este repo comitea sus lockfiles —`pnpm-lock.yaml`, `Cargo.lock`— para que el
  build sea el mismo en otra máquina, y no hay razón para tratar a CocoaPods distinto.

- **`run-ios` cierra con `error code '65'` y el gate igual pasó.** Construye para el simulador,
  instala y lanza —la app queda corriendo— y **después** arranca una segunda pasada contra un
  aparato físico que nadie pidió, que falla por firma. El `error` final no dice nada sobre el
  gate. Documentado en `BUILD.md` qué mirar en el log, porque perseguir ese 65 cuesta una tarde.
- **Task 9: complete (commit siguiente a `05a4195`).** iOS y Android en `1.0.0+05a4195`,
  idénticos. Bloque 1 cerrado.

### Task 10

- BASE `d4f534c`. **Verde: 3 tests en 2 proyectos.** `coreVersion()` por N-API devuelve
  `1.0.0+d4f534c`, o sea HEAD exacto, y `add("0.1","0.2")` da `0.30` y no
  `0.30000000000000004`: **la tesis de la POC se ve por primera vez en TypeScript.**
- **Ruling T10-1 (dos *projects* de Jest, no el preset único del plan — DEFECTO DEL PLAN):** el
  Step 3 pedía crear `jest.config.js` con `preset: 'ts-jest'` y `testMatch` sólo de
  `__tests__/`. Rompía tres cosas a la vez: (a) un `jest.config.js` tiene **precedencia** sobre la
  clave `jest` de `package.json`, así que se llevaba puesto el preset de RN y los dos arreglos del
  commit `05a4195`; (b) dejaba fuera del `testMatch` a `src/__tests__/jest-setup.test.ts`;
  (c) sumaba `ts-jest` al lado de babel-jest, que ya transpila TS vía `babel.config.js`.
  Verificado que los dos entornos hacen falta de verdad: las Tasks 19-22 usan `renderHook` de
  `@testing-library/react-native`, que necesita el preset; y el entorno de RN **mockea los
  módulos nativos**, o sea que el contrato por N-API corriendo ahí cruzaría a un fake y no
  probaría nada. No es una preferencia de estilo: son incompatibles.
- **Ruling T10-2 (el comando de generación del plan no corre, por dos razones):**
  1. `--library` es un **flag booleano** («tratá la entrada como librería»), no una opción con
     valor. La ruta va como **posicional** al final.
  2. Hay que correrlo **desde un directorio con `Cargo.toml`**: `ubrn` ejecuta `cargo metadata`
     en el cwd pase lo que pase, y `apps/react-native` no tiene manifiesto. Muere con
     ``manifest path `Cargo.toml` does not exist`` antes de mirar los argumentos.
     **`--crate core_financiero` no lo salva** — probado.
  La forma que sí anda quedó en el script `napi:generate`, y se probó **de punta a punta borrando
  `src/generated-napi/` primero**, no sólo leyéndola.
- **`import.meta` y por qué el arreglo va en Babel:** los bindings resuelven el `.dylib` con
  `callerUrl: import.meta.url`, que sólo existe en ESM; Jest corre CommonJS. **`--lib-absolute`
  no lo evita** —agrega el `override` pero sigue emitiendo la línea, verificado leyendo el
  archivo generado—, así que el arreglo es un plugin inline de diez líneas.
  Va bajo **`env.test`** y eso no es cosmético: Jest define `NODE_ENV=test`, Metro y `bob build`
  no. Reescribir `import.meta` en el bundle de RN sería meterse con Hermes por una razón que sólo
  existe en los tests. Sin dependencia nueva: el plugin es inline.
- El test importa los globales de `@jest/globals` en vez de instalar `@types/jest`, que es lo que
  sugería el mensaje de `tsc` y lo que pedía el plan. Mismo criterio que
  `src/__tests__/jest-setup.test.ts`, y una dependencia menos.
- **Casi rompo la config sin querer, y vale anotarlo:** escribí
  `cd apps/react-native && cat > jest.config.js <<EOF`, el `cd` falló porque ya estaba ahí, el
  `&&` cortó — y el `python` que borraba la clave `jest` de `package.json` iba en una línea
  aparte, así que **sí** corrió. Quedó el paquete sin ninguna config de Jest por un minuto. Lo
  cazó el `pnpm test` siguiente. Encadenar `cd` con `&&` a una escritura destructiva es frágil.
- **Task 10: complete.** `tsc` y `lint` en cero, `pnpm test` 3/3.

### Task 11

- **Verde: 7 tests en 3 suites** (4 guardias + 1 de N-API + 2 de infraestructura). `tsc` y `lint`
  en cero. Los valores del plan se contrastaron contra `contracts/` **antes** de escribir el
  test y coinciden todos: v2.3.0, `PEN`, las 12 claves, los conteos 6/4/5/6/7/2 y los nueve
  nombres de `messages.es.json`.
- **Ruling T11-1 (el `switch` con `default: never` del plan NO es implementable — DEFECTO DEL
  PLAN, y el plan lo marcaba como "no son estilo y no se cambian"):** ese `switch` necesita
  `DomainError_Tags` **en runtime**, y ese enum sólo existe dentro de un flavour. Importarlo
  desde `./bindings` arrastra React Native al proyecto `napi` de Jest, que corre en Node.
  **Verificado empíricamente**, no deducido: un test sonda que hace `require('../src/bindings')`
  muere con `SyntaxError: Cannot use import statement outside a module`. Y no es un problema
  local de esta tarea — habría vuelto a aparecer en la **Task 15**, donde el mismo `contractName`
  tiene que atender errores del módulo **WASM**.
  **Salida:** tabla `const NOMBRES = {...} as const satisfies Record<DomainError['tag'], string>`
  con `import type` —que babel borra—, así que `contractName` **no depende de ningún flavour en
  runtime**, que es precisamente lo que su rol exige.
  **La guardia no se debilita, se refuerza**, verificado por mutación en los dos sentidos:
  - falta una variante → `Property '[DomainError_Tags.SameAccount]' is missing in type … but
    required in type 'Record<DomainError_Tags, string>'` — **nombra la variante**.
  - sobra una mal escrita → `'OutOfRangeee' does not exist in type 'Record<DomainError_Tags,
    string>'. Did you mean to write 'OutOfRange'?`
  El `switch` con `never` sólo cazaba el primer caso. Lo demás del plan se respeta tal cual:
  discriminar por `tag` y **no** por `DomainError.instanceOf`, por las razones que ya estaban
  escritas (dobles de prueba y el flavour WASM).
- **Step 7 — el modo de fallar de Jest, verificado y DISTINTO del de Rust y Swift.** Allá un
  grupo vaciado a `[]` genera cero casos y **reporta éxito**. Jest falla ruidosamente:
  ``Error: `.each` called with an empty Array of table data.``
  **Consecuencia para el texto, que es lo que el plan pedía que fuera verdadero:** la guardia 2
  acá **no** protege contra un grupo vacío —de eso se encarga Jest— sino contra uno
  **incompleto**: cinco casos donde debería haber seis pasarían en verde sin que nada avise. El
  comentario al lado de la guardia dice eso. Va a `TESTING.md` en la Task 12, que es la que crea
  ese archivo.
- La línea `export { contractName } from './contractName'` en `index.tsx` cierra el **Ruling
  T8-1**: la Task 8 la omitió a propósito porque un import a un archivo inexistente impide que
  Metro arme el bundle, y habría bloqueado su gate de JSI.
- **Task 11: complete (commit `4bf9a08`).**

### Task 12

- **EL CONTRATO PASA 28/28 POR N-API.** `pnpm test contract.napi` → **32 passed** (28 casos + 4
  guardias), exactamente el número que el plan predecía. Suite completa: **35 tests en verde**,
  3 suites, `tsc` y `lint` en cero.
- **Ningún valor esperado se tocó.** Tercera plataforma que pasa el contrato sin doblarlo, después
  de Rust (28/28) y Android/iOS.
- La forma de cada grupo y las firmas de los bindings se contrastaron contra el JSON y el archivo
  generado **antes** de escribir el test; el plan acertó en todo: `bankCode/bankName/branch/
  account`, `brand/masked`, `itfFee/totalDebited/receipt/simulatedLatencyMs/accounts`, y
  `executeTransfer(accounts, request)`.
- **Verificada la afirmación que sostiene la demo, con el Node de este repo y no de memoria: los
  seis casos de `aritmetica` divergen bajo IEEE-754.** La tabla quedó en `TESTING.md` y es
  material de demo directo:
  `0.1+0.2` → JS `0.30000000000000004` / core `0.30`; `100.00-99.99` → JS `0.010000000000005116`
  / core `0.01`; y los otros cuatro. CLAUDE.md pide reemplazar cualquiera que deje de diverger:
  ninguno dejó.
- `ContractCase` se tipa laxo (`Record<string, any>`, con el `eslint-disable` puntual) a
  propósito: los grupos tienen formas distintas entre sí y tiparlo fino sería **una segunda copia
  del contrato** en TypeScript, que es justo lo que la spec prohíbe. La comparación real la hace
  `toBe` contra el JSON.
- `TESTING.md` escrito con lo que el Step 8 pedía, y con una sección **"Qué NO prueba nada de
  esto"** al final: ninguna de las dos rutas del host cruza JSI, así que un `pnpm test` entero en
  verde no dice nada sobre si la app corre en un aparato. Eso lo prueba el smoke manual de
  `BUILD.md`.
- **Task 12: complete. Bloque 2 cerrado.**

## Estado: 12/23 completas. Bloques 0, 1 y 2 cerrados. Sigue el Bloque 3 (Task 13), que es el que desbloquea la Fase 5.

### Task 13 (spike)

- **RESPUESTA DEL SPIKE: `wasm2` funciona con este crate.** Verificado de punta a punta, no
  deducido: el módulo carga en Node y responde `coreVersion() = 1.0.0+eb87650`,
  `add("0.1","0.2") = "0.30"`. Binario **178 KB** en release.
- **La pregunta central se contesta que SÍ, y por partida doble:** `check_wasm_ready` **ve** las
  dependencias condicionadas por target, y además el mensaje de error de esa misma función —leído
  en el código de ubrn— **recomienda exactamente esa forma**. O sea el Step 3 del plan, el mundo
  bueno.
- **PERO un cambio NO quedó confinado, y obliga a la reverificación de la Task 14:**
  `chacha20poly1305` pasa a `default-features = false, features = ["alloc"]` en el
  `Cargo.toml` del workspace. Cadena: sus defaults traen `getrandom` → `js-sys 0.3.105` → exige un
  `wasm-bindgen` más nuevo que el **`=0.2.100` que ubrn lleva compilado adentro**
  (`wasm-bindgen-cli-support = "=0.2.100"`). No se puede bajar `wasm-bindgen` (js-sys lo impide) ni
  subir el binario (ubrn usa la **librería**, no un ejecutable del PATH: instalar
  `wasm-bindgen-cli` no cambia nada). **El feature es inerte, verificado leyendo
  `crates/domain/src/crypto.rs`:** cero `OsRng`, cero aleatoriedad — clave y nonce llegan como hex
  del llamador. Los **67 tests del core siguen en verde** con el feature apagado.
- **Tres errores del plan, corregidos:**
  1. `uniffi-runtime-wasm = "0.31"` **no resuelve**: sólo existe como prerelease, `0.31.0-5` — la
     misma versión que el ubrn que el proyecto fija.
  2. El feature **no** se llama `single-threaded` sino **`wasm-unstable-single-threaded`**. Cargo
     lista los disponibles en el error.
  3. **Declarar la dependencia no alcanza.** Nada del crate la referencia, así que rustc no enlaza
     sus símbolos `#[no_mangle]`: el módulo salía con 89 exports y **sin** `__ubrn_alloc`. Falta
     `#[cfg(target_arch = "wasm32")] extern crate uniffi_runtime_wasm as _;` en `lib.rs`, que es
     lo que llevan **todos** los fixtures de ubrn. Con la línea, 93 exports y los cuatro símbolos
     (`__ubrn_alloc`, `__ubrn_free`, `__ubrn_install_panic_hook`, `__ubrn_set_panic_log`).
     Diagnóstico hecho leyendo `crates/ubrn_cli/src/wasm2/commands.rs` y los fixtures, que es
     exactamente lo que el plan anticipaba que habría que hacer porque wasm2 no tiene página en el
     libro.
- **Descubierto y resuelto: `build wasm2` pisa los bindings JSI.** Todos los flavours escriben en
  `bindings.ts` del config. La primera corrida dejó `src/generated/` con archivos WASM y rompió el
  build de la app; el síntoma aparece lejos del comando que lo causó. Salida: **`ubrn.wasm.yaml`**,
  un config propio cuyo único fin es `ts: src/generated-wasm`. Los bindings JSI se regeneraron con
  `ubrn:android` y `tsc` volvió a cero.
- **Trampa relacionada:** el `.wasm` que sirve es el que `--and-generate` **stagea**, no el que
  deja cargo en `target/`. El crudo no tiene los símbolos que inyecta wasm-bindgen y falla con
  `required export "__ubrn_alloc" not found`. Perdí una iteración ahí.
- **BLOQUEANTE CONOCIDO PARA LA TASK 15:** el `index.ts` que ubrn genera para wasm2 **no lleva
  `@ts-nocheck`** —todos los demás generados sí— y tiene un error de tipos real contra
  `@ubjs/wasm` (`readonly` tuple vs `FfiTypeDesc[]` mutable). Rompe `tsc --noEmit` **y** `bob
  build`, o sea el `prepare` de cada `pnpm install`. Por eso `src/generated-wasm/` **se borró al
  cerrar el spike**: la Task 15 lo regenera y tiene que resolverlo, con el script aplicando la
  corrección o parcheando el template — no editando el generado a mano.
- `@ubjs/wasm@0.31.0-5` queda declarado como devDependency; se publica **sólo en ESM**, así que el
  proyecto `napi` de Jest necesita transpilarlo. `jest.config.js` ya lo contempla. Mismo fenómeno
  que el preset de RN, misma raíz.
- Confirmado con `rustc --print cfg`: **wasm impone `panic="abort"`**, Android e iOS `unwind`. En
  la ruta WASM no hay red de `catch_unwind`, y eso es consecuencia para la **Fase 5**, no para esta.
- Estado al cerrar: **35 tests del paquete + 67 del core en verde, `tsc` y `lint` en cero.** Nada
  commiteado del crate, como manda el plan: eso es la Task 14.
- Todo escrito en `apps/react-native/PENDING.md`.

### Task 14

- **Ruling T14-1 (la tarea era condicional y salió al revés de lo que el plan preveía):** el plan
  decía reverificar Android e iOS **sólo si** el feature de uniffi quedaba incondicional. Quedó
  **confinado** —o sea el mundo bueno del Step 3—, así que por esa vía no hacía falta reverificar
  nada. **Pero se reverificó igual**, por una causa que el plan no anticipaba: el cambio de
  `chacha20poly1305` a `default-features = false` **sí** toca a las cuatro plataformas.
  Aplicar el condicional del plan al pie de la letra habría saltado la reverificación justo cuando
  hacía falta. El disparador correcto no es "qué vía funcionó" sino "¿algún cambio tocó el crate
  compartido?".
- **Gate de regresión cerrado en las tres patas, con conteos verificados en los XML de resultados
  y no leídos de la consola:**
  - core: **67 tests** + `clippy -D warnings` limpio
  - Android: **43** — 28 JVM (`tests="28" failures="0"`) + 15 instrumentados sobre el emulador
    (`tests="15" failures="0" errors="0"`)
  - iOS: **47 tests en 12 suites**, `** TEST SUCCEEDED **` en simulador
- Ojo con Gradle: `:app:testDebugUnitTest` reportó `UP-TO-DATE` y `BUILD SUCCESSFUL in 1s` **sin
  correr nada**, aunque los `.so` eran nuevos. Hubo que forzar con `--rerun-tasks` y después
  contar en `app/build/test-results/*.xml`. Un `BUILD SUCCESSFUL` de Gradle no es evidencia de que
  los tests corrieron.
- `Cargo.toml` del workspace y `crates/ffi/Cargo.toml` quedan comentados en el lugar: por qué el
  bloque va condicionado por target, por qué el feature es inerte, y por qué apagar `getrandom` es
  seguro **y** obligatorio. El comentario "TEMPORAL — sin commitear" del spike se reemplazó.
- `rust-core/BUILD.md` documenta el target de wasm y, sobre todo, **que ahí no hay red de
  `catch_unwind`** — con la salida real de `rustc --print cfg` para los tres targets. La
  consecuencia es de la Fase 5, y queda escrita donde la va a leer quien la ejecute.
- **Task 14: complete (commit `7f7956f`).**

### Task 15

- **EL CONTRATO PASA 28/28 TAMBIÉN POR WASM.** Suite completa: **67 tests en verde, 4 suites** —32
  por N-API, 32 por WASM, el smoke de `coreVersion()` y los dos de infraestructura—. `tsc` y `lint`
  en cero.
- **Con esto la Fase 5 arranca sin deuda**: el artefacto que Angular va a consumir ya está probado
  contra los mismos vectores y con la misma igualdad exacta de strings.
- **El Ruling T11-1 quedó validado en caliente, y por el modo de fallar que el plan predecía.** Los
  8 casos que esperan error pasaron. Con `DomainError.instanceOf(e)` habrían fallado los ocho: el
  error viene del módulo **wasm** y no es instancia de la clase del módulo **JSI**. Discriminar por
  la presencia de `tag` es lo que hace que el mismo mapeo sirva en los tres flavours. La decisión
  de la Task 11 —tomada por una razón distinta, que el enum no se puede importar en runtime— se
  sostiene por dos motivos independientes.
- **Bloqueante del spike resuelto, y en el lugar correcto.** `wasm:generate` corre
  `build wasm2 --release --and-generate --config ubrn.wasm.yaml` y **después** le antepone el
  `@ts-nocheck` al `index.ts` generado, comprobando antes para no duplicarlo. No es editar un
  generado a mano —eso se pierde en la próxima corrida— sino corregirlo en cada generación.
  Verificado: `tsc --noEmit` en cero **y** `pnpm run prepare` (bob build) completo. Si una versión
  futura de ubrn agrega el `@ts-nocheck` que le falta, la segunda mitad del script queda inerte y
  se puede borrar; queda anotado en `PENDING.md`.
- El test se generó **programáticamente** desde el de N-API, no copiado a mano, para que los
  cuerpos queden realmente idénticos y la única diferencia sea el import. Las dos diferencias
  reales están en el arranque y ninguna en las comparaciones: el módulo WASM se abre de forma
  asíncrona (`uniffiInitAsync`) y hay que pasarle los bytes del `.wasm` stageado.
- **Task 15: complete (commit `6f573de`). Bloque 3 cerrado.**

## Estado: 15/23 completas. Bloques 0, 1, 2 y 3 cerrados. **La Fase 5 ya no está bloqueada.** Sigue el Bloque 4 (Task 16), que es la app.

### Task 16

- **Verde: 69 tests, 5 suites.** `tsc` y `lint` en cero.
- **Ruling T16-1 (bloqueante estructural que el plan no anticipaba, y que habría reaparecido en
  las Tasks 19-22):** importar `@banco/core-financiero` en **cualquier** test muere con
  `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'CoreFinanciero' could not be
  found`. El entrypoint que genera ubrn llama a `installRustCrate()` **al cargar el módulo**, y en
  Jest no hay binario nativo. Verificado con una sonda antes de escribir una línea de la tarea.
  Afectaba al test de esta tarea (importa `DomainError_Tags` del paquete), a `userMessage` (importa
  `contractName` del paquete) y a **todos** los tests de hooks del Bloque 4, que importan el
  adapter.
  **Salida:** el proyecto `react-native` de Jest mapea `./bindings` a `src/generated-napi/
  core_financiero`, o sea que bajo test el paquete se sirve con los bindings **N-API del mismo
  core**. Verificado: `contractName` es función, `coreVersion()` devuelve un string real y
  `DomainError_Tags` trae los nueve.
  **Por qué ésta y no un stub:** es más real. Las nueve funciones responden de verdad contra el
  mismo Rust, así que un test que las llame sin querer falla por la razón correcta en vez de
  contra un doble silencioso. **Lo que NO prueba es el cruce de JSI**, y eso queda escrito en el
  propio `jest.config.js`: lo prueba el smoke manual de `BUILD.md`.
- También hubo que sumar `example/__tests__/**` al `testMatch` del proyecto `react-native`: el plan
  pone el test ahí y **ningún proyecto lo recogía**.
- `FakeCore` importa `type Core` con `import type` a propósito: así `./core` —que arrastra el
  paquete y todo el glue— no se carga en runtime por el solo hecho de usar el fake.
- Verificado que `initialAccounts()` hace el mapeo de campos bien (`titular`→`holder`,
  `saldo`→`balance`) y que la clave y el nonce del contrato miden 64 y 24 hex, o sea 32 y 12
  bytes. No se dio por supuesto.
- **Task 16: complete.**

### Task 17

- **Verde: 79 tests, 6 suites.** `tsc` y `lint` en cero.
- **Ruling T17-1 (la premisa del plan era falsa; la decisión, correcta por otra razón).** El plan
  mandaba escribir el formateador a mano porque «Hermes no garantiza» pasar un string a
  `Intl.NumberFormat.format()`. **Comprobado sobre los tres runtimes: sí lo soportan, y coinciden.**
  Sonda corrida en aparato, no en Node:
  | Runtime | Resultado | Code points |
  |---|---|---|
  | Hermes / Android (Pixel 9, API 36) | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |
  | Hermes / iOS (iPhone 17 Pro sim) | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |
  | Node / V8 | `S/ 4,899.99` | `53 2f a0 34 2c 38 39 39 2e 39 39` |
  **La razón verdadera la da el tercer code point: `a0` = U+00A0, espacio duro.** Los
  formateadores de Android (`MoneyFormatter.kt`) y de iOS (`MoneyFormatter.swift`), los dos
  escritos a mano sobre el string, usan `U+0020`. Usar `Intl` habría producido
  `S/ 4,899.99` contra el `S/ 4,899.99` de las otras dos apps: **un byte de diferencia,
  invisible en pantalla, que rompe la comparación carácter por carácter.** El peor modo de fallar
  que existe en esta POC — el que se ve bien el día de la demo.
  Razón de fondo, además: la coincidencia entre los tres runtimes **no es contractual**, sale de
  que hoy empaquetan ICU compatibles. Android delega en el ICU del sistema, que cambia con la
  versión; iOS en el de Apple; cada navegador en el suyo.
- Se agregan **dos tests que el plan no pedía**, los dos guardando lo que el hallazgo mostró:
  que el signo se separa **antes** de agrupar (sin eso `-123456.78` sale `S/ -,123,456.78`, bug
  que Android ya había encontrado y documentado) y que el separador es `U+0020`.
- **Divergencia con Swift, verificada y acotada:** `MoneyFormatter.swift` normaliza `"007.50"`,
  `".5"` y `"1e3"`; acá esas entradas no matchean y se devuelven tal cual. **No importa, y está
  comprobado por qué:** en las tres apps el formateador se aplica **sólo a valores que devuelve el
  core** —`itfFee`, `totalDebited`, `balance`—, nunca a lo que tipea el usuario. Verificado
  grepeando los usos en `TransferScreen.kt` y `TransferView.swift`.
- **Task 17: complete.**

### Task 18

- **Verde: 79 tests, `tsc` y `lint` en cero.** Navegación verificada **en el emulador**: las cuatro
  pestañas cambian de pantalla y **el pie de `coreVersion()` aparece en todas**, que es criterio de
  la demo. iOS reconstruido y verificado también.
- Labels contrastados contra `docs/ui-spec.md` **antes** de escribirlos: `[Aritmética][Transf.]
  [Tarjeta][Bm]`, textuales. La tabla de los cinco componentes también coincide.
- **Ruling T18-1 (`react-native-safe-area-context` en vez del `SafeAreaView` del core).** El plan
  usaba el del core. No alcanza, por dos razones medidas:
  1. Está deprecado en 0.87 y su `console.warn` levanta el banner de LogBox, que **tapa el pie de
     `coreVersion()`** — el elemento que la demo compara entre las cuatro apps.
  2. **En Android no aplica inset inferior**: la barra de pestañas quedaba en `y[2727-2856]` sobre
     una pantalla de 2856 px, o sea pegada al borde y solapada con la zona de gestos. Con la
     librería pasa a `y[2655-2784]`.
  Costo: un módulo nativo más y reconstruir las dos apps (`pod install` de 87 a 88 pods).
- **Corrección de un diagnóstico mío, que estuvo mal un rato.** Dije que el banner de LogBox
  «interceptaba los taps» de la barra de pestañas. **Falso.** Lo que pasó es que al cerrar el
  banner el layout se corrió hacia abajo y mi tap —fijo en `y=2790`— pasó a caer dentro de la barra
  por casualidad. Con el inset aplicado la barra está en `y[2655-2784]` y `2790` queda **afuera**,
  en la zona de gestos. Se resolvió midiendo los bounds en vez de reusar una coordenada vieja.
  **Misma lección que el Ruling T8-3 y el T10-2: que algo empiece a funcionar no prueba que la
  causa esté encontrada.**
- **Séptima cara de la estrictez de pnpm:** cualquier librería con `codegenConfig` dispara
  `generateCodegenSchemaFromJavaScript`, que invoca `example/node_modules/@react-native/codegen`,
  transitiva de `react-native` y por lo tanto ausente. Declarada directa, igual que
  `@react-native/gradle-plugin`.
- **Trampa anotada en PENDING.md:** después de instalar un módulo nativo hay que reiniciar Metro
  con `--reset-cache`. Sin eso el bundle viejo se sigue sirviendo y el síntoma engaña — acá dio
  `ReferenceError: Property 'window' doesn't exist`, que no tiene nada que ver con la causa.
- Las cuatro pantallas entran como **placeholders de una línea**, desviándose del plan, que dejaba
  `tsc` en rojo hasta la Task 22. Así cada commit queda verde y el pie en las cuatro pestañas se
  puede verificar ya. Cada tarea siguiente reemplaza su archivo entero.
- **Deuda visible:** el core de la app RN quedó en `1.0.0+eb87650` y el de iOS en `1.0.0+05a4195`
  —se regeneró Android durante el spike y iOS no—. No rompe nada ahora; antes de la demo hay que
  regenerar los cuatro desde el mismo HEAD, como ya dice el runbook.
- **Task 18: complete.**

### Task 19

- **Verde: 82 tests, 7 suites.** `tsc` y `lint` en cero. **Verificado en el emulador**, que es lo
  que la tarea pedía: con los valores por defecto, `0.30000000000000004` en el bloque rojo y
  `0.30` en el verde. La demo entera en una pantalla.
- Labels contrastados contra `docs/ui-spec.md` antes de escribirlos: `Operando A`, `Operando B`,
  `Sumar`, `Restar`, `Calcular`, `Punto flotante nativo`, `Core (Rust · Decimal)`, título
  `Aritmética`, subtítulo `El float rompe el dinero`. Todos textuales.
- **Ruling T19-1 (`renderHook` de RNTL v14 es asíncrono).** El plan escribía
  `const { result } = renderHook(...)` y `act(() => ...)`, que es la API de v13. En v14
  `renderHook` **devuelve una Promise**: sin `await`, `result` viene `undefined` y el error
  (`Cannot read properties of undefined`) no dice por qué. Y `act` también necesita `await`, si no
  el re-render no llega a ocurrir antes del `expect` y el estado se lee viejo — ese segundo
  síntoma es peor, porque el test **falla comparando `""` contra `"0.30"`**, que parece un bug del
  hook. Diagnosticado sondeando el objeto que devuelve `renderHook`: su prototipo tiene
  `then/catch/finally`. Las dos cosas quedan escritas en el test para las Tasks 20-22.
- **Ruling T19-2 (`PrimaryButton` en vez del `Button` de React Native).** El `Button` de RN
  renderiza el estilo Material en Android, que **pone el texto en mayúsculas**: el botón decía
  `CALCULAR`. Verificado que Android Compose (`Button { Text("Calcular") }`) e iOS
  (`Button("Calcular")`) muestran `Calcular`, y `ui-spec.md` fija los labels **exactos** porque la
  demo compara las pantallas lado a lado. Un label en mayúsculas es justo el tipo de diferencia
  que se ve y no se explica. `PrimaryButton` es un `Pressable`, que no transforma el texto.
  Lo consumen también las Tasks 20-22.
- Se agrega un tercer test que el plan no pedía —«restar llama a `subtract`, no a `add`»— con el
  fake devolviendo `'NO DEBE LLAMARSE'` en `add`: sin él, un hook que llamara siempre a `add`
  pasaría los otros dos.
- **Task 19: complete.**

### Task 20

- **Verde: 94 tests, 9 suites.** `tsc` y `lint` en cero. **Verificado en el emulador y en el
  simulador de iOS**, y ahí apareció el hallazgo que ningún test podía dar (Ruling T20-7).
- Labels contrastados contra `docs/ui-spec.md` antes de escribirlos: `Origen`, `Destino`,
  `Monto`, `Transferir`, `Resultado`, `Comisión ITF`, `Total debitado`, `Comprobante`,
  `Saldos`, cabecera `Transferencia` / `Dos cuentas en memoria`. Todos textuales, y el orden
  de campos —origen, destino, monto— sin alterar.
- **Ruling T20-1 (los dos CCI salen del contrato — DEFECTO DEL PLAN).** El plan hardcodeaba
  `origin: '00219100123456789047'` y `destination: '01122000987654321065'` en el estado
  inicial. Es justo lo que `initialAccounts()` existe para impedir, y lo que Android
  (`TransferViewModel.kt`) e iOS (`TransferViewModel.swift`) ya evitan: los dos derivan los
  CCI de `contract.initialAccounts()`. Con literales, el día que alguien edite `cases.json`
  las otras tres apps cambian y React Native no, en silencio.
  **El guard costó dos intentos y el primero mentía:** comparar `state.origin` contra
  `state.accounts[0].id` pasa igual con los literales puestos, porque hoy los valores
  coinciden — verificado por mutación, los 7 tests seguían en verde con el hardcode. El test
  que sirve sustituye el contrato por otro con ids distintos (`jest.doMock` +
  `isolateModules`) y se aplica a `initialTransferState`, **no al hook**: aislar el módulo del
  hook carga una segunda copia de React y el test muere en `useState`, por una razón que no
  tiene nada que ver con lo que mide.
- **Ruling T20-2 (`amount` arranca vacío, no en `'100.00'`).** Android (`val amount = ""`) e
  iOS (`var amount = ""`) arrancan vacíos y el monto lo tipea quien hace la demo
  (`docs/demo-runbook.md`, acto 2). El wireframe de `ui-spec.md` muestra `100.00` porque
  dibuja la pantalla **ya usada**, no el estado inicial. Tampoco lleva `placeholder`: ninguna
  de las otras dos lo pone.
- **Ruling T20-3 (editar un campo consume el error).** Los tres setters limpian `error`, como
  hacen `clearError()` en Android y en iOS. El plan no lo pedía; sin eso el mensaje queda en
  pantalla contradiciendo lo que el usuario acaba de corregir.
- **Ruling T20-4 (`PrimaryButton` con spinner adentro, no un `ActivityIndicator` suelto).** El
  plan usaba el `Button` de React Native —prohibido por el Ruling T19-2— y además **hacía
  desaparecer el botón** durante la carga, reemplazándolo por un spinner suelto. Android
  (`CircularProgressIndicator` dentro del `Button`) e iOS (`ProgressView` dentro del suyo)
  mantienen el botón en su sitio y lo deshabilitan. Un botón que se esfuma corre el layout
  justo cuando las pantallas se están mirando lado a lado. Se le agregó `loading` a
  `PrimaryButton`; lo consumen también las Tasks 21-22.
- **Ruling T20-5 (`Comprobante` monoespaciado).** Android pasa `mono = true` e iOS
  `monospaced: true`; el `ResultRow` de la Task 18 ya tenía la prop y el plan no la pasaba.
- **Ruling T20-6 (`render` de RNTL v14 también es asíncrono).** El Ruling T19-1 sólo había
  mordido en `renderHook`. `render` devuelve una Promise igual: sin `await`, `screen` queda
  sin montar y el error —«`render` function has not been called»— no dice por qué. Además v14
  **ya no expone `UNSAFE_root`**: expone `root` y `container`, y para inspeccionar props lo
  estable es caminar `screen.toJSON()`.
- **Ruling T20-7 (el bug que sólo se ve en el aparato: Fabric aplana los contenedores de fila
  y despega los labels).** Con todo en verde —94 tests, `tsc` y `lint` en cero— la pantalla en
  el emulador salía **rota**: el label `00219100123456789047  Ana Quispe` pintado ENCIMA de la
  fila `Comisión ITF`, y su saldo `S/ 4,899.99` huérfano debajo de `Saldos`. Ningún test de
  Jest puede cazarlo: RNTL renderiza un árbol JSON y no tiene layout nativo.
  **Causa raíz, acotada por bisección en el emulador** (Pixel 9 Pro API 36, RN 0.87, Fabric):
  un `View` que sólo aporta layout se aplana en Android —no se crea vista nativa y sus hijos se
  cuelgan del padre—. Al INSERTARSE el bloque `Resultado` encima de la lista de saldos, la
  contabilidad de índices nativos se corre y las filas de abajo quedan con su `<Text>` de label
  pegado a la vista equivocada. La bisección fue lo que lo encontró: **sin los tres
  `LabeledField` el defecto desaparece; con tres `<Text>` o tres `<TextInput>` pelados en su
  lugar, tampoco aparece.** No es el `TextInput` ni la cantidad de hermanos: es tener varios
  contenedores de fila APLANADOS. Arreglo: `collapsable={false}` en los tres contenedores
  compartidos (`LabeledField`, `ResultRow`, `SectionDivider`). En iOS la prop se ignora.
  **Cuatro hipótesis anteriores quedaron rechazadas con evidencia, no abandonadas:** envolver
  el bloque en un `View` (no cambia nada), quitar el `gap` del contenedor raíz (no cambia
  nada), darle a la lista de saldos su propio `View` (no cambia nada), y un contenedor estable
  y no aplanado para el bloque (**empeora**: pasan a descolocarse los dos labels en vez de
  uno). `collapsable={false}` en **uno solo** tampoco alcanza: el defecto no desaparece, se
  **mueve** de la primera fila a la segunda.
  **Dos trampas del camino, las dos ya conocidas de esta fase.** La primera: un `cp` de
  restauración falló en silencio por estar en otro directorio, y una corrida quedó con dos
  variables cambiadas a la vez — se detectó al leer el resultado, no después. La segunda: ante
  un resultado idéntico al anterior sospeché del bundle viejo (Task 18) y **lo verifiqué
  descargando el bundle de Metro y leyendo el código servido** en vez de suponerlo; estaba
  fresco, así que la hipótesis quedó rechazada de verdad. Y la lección de los Rulings T8-3 y
  T8-4 volvió a aplicar entera: el remonte forzado por `key` **arreglaba** la pantalla y no era
  la causa — era el síntoma tapado.
  La guarda que quedó **no prueba el layout** —no se puede— sino que impide que alguien quite
  la prop sin leer por qué está; verificada por mutación (quitando una sola: 3 → 2).
- **Verificado en el aparato, no sólo en tests:** transferir `100.00` da `S/ 0.01`,
  `S/ 100.01`, `TRF-9047-1065-10000` y los saldos `S/ 4,899.99` / `S/ 1,300.50`, **los mismos
  strings que el runbook fija para Android e iOS**. El filtro de monto se comprobó tipeando
  `0.001`: el campo queda en `0.00`, el tercer decimal no entra. El error `tr-005` —misma
  cuenta en origen y destino— muestra «La cuenta de origen y la de destino son la misma.»,
  limpia el resultado anterior y deja los saldos intactos. La pantalla de Aritmética, que
  también usa `LabeledField`, se volvió a verificar después del cambio y sigue bien.
  En el simulador de iPhone 17 Pro la pantalla se verificó con instrumentación temporal
  (pestaña inicial y una transferencia automática), porque el simulador no tiene con qué
  tapear: los strings salieron **idénticos carácter por carácter a los de Android**.
- `example/__tests__` pasa a aceptar `.test.tsx` además de `.test.ts`: sin eso ningún test de
  componente lo recoge, y las Tasks 21-22 se toparían con lo mismo.
- **Observación para la revisión de la fase, NO arreglada acá:** `theme.mono` es `'Courier'`,
  que iOS resuelve y Android no —ahí el `Comprobante` sale con la tipografía normal—. El string
  es el mismo, así que no rompe la comparación, y `ui-spec.md` no fija la tipografía; pero es
  una diferencia visible entre las dos plataformas de la MISMA app. Viene de la Task 18 y
  tocarlo desde acá cambiaría un archivo compartido por las cuatro pantallas.
- **Task 20: complete.**

### Regeneración de artefactos (fuera del plan, a pedido, en subagente)

- **Las cuatro apps muestran `1.0.0+b5b1388`**, que es HEAD exacto: Android nativo, iOS nativo,
  y React Native en Android y en iOS. Verificado leyendo el string en pantalla en las cuatro,
  no deducido. Cierra la deuda que anotó la Task 18.
- Estado previo: Android nativo, iOS nativo y RN-Android estaban en `eb87650`; sólo el
  xcframework de RN-iOS estaba en `05a4195`. El commit que faltaba propagar era `7f7956f`
  (`chore(ffi): el crate declara lo que wasm2 necesita`), verificado con
  `git diff --stat <sha>..HEAD -- rust-core/`.
- Ningún comando de los `BUILD.md` falló: salieron tal como están escritos. Única limpieza
  previa obligatoria no documentada: `xcodebuild -create-xcframework` falla si el directorio
  de salida ya existe, así que hay que borrar el `CoreFinanciero.xcframework/` viejo.
- **`pod install` modificó `Podfile.lock`, que está trackeado**: sólo la línea
  `COCOAPODS: 1.15.2 → 1.16.2`, cero cambios de dependencias. **Revertido**: registra qué gem
  tenía esta máquina, no una decisión del proyecto, y mezclado con la Task 21 quedaría
  invisible. Si el proyecto quiere mover CocoaPods, que sea su propio commit.
- **Warning preexistente anotado, no investigado:** `./gradlew :app:assembleDebug` de Android
  nativo dice `Unable to strip the following libraries, packaging them as they are:
  libcore_financiero.so`. No bloquea y no es de esta tarea, pero el perfil de release del core
  declara `strip = true` y el tamaño del binario es criterio de la demo: vale mirarlo en la
  Fase 5 o en el cierre.
- **Metro muere con el shell del subagente.** Al volver, la app quedó cayendo a
  `loadJSBundleFromAssets` y mostrando pantalla roja — que NO es un fallo del build, es que no
  había Metro. Hay que relevantarlo con `--reset-cache` antes de verificar nada.

### Task 21

- **Verde: 100 tests, 10 suites.** `tsc` y `lint` en cero. **Verificado en el emulador y en el
  simulador**, y otra vez el aparato mostró lo que los tests no podían (Ruling T21-6).
- Los **once labels** de `docs/ui-spec.md` y las **dos líneas de ayuda obligatorias**
  contrastadas por script contra el archivo, carácter por carácter, antes de verificar nada.
- **Ruling T21-1 (`PrimaryButton`, otra vez).** El plan volvía a usar el `Button` de React
  Native en los dos botones, que el Ruling T19-2 prohíbe. iOS distingue primario
  (`.borderedProminent`) de secundario (`.bordered`); Android usa el mismo estilo para los dos.
  `ui-spec.md` no fija estilo de botón, así que se sigue a Android: los dos `PrimaryButton`,
  sin inventar una variante para una diferencia que la spec no pide.
- **Ruling T21-2 (cada bloque consume SU error).** El plan no limpiaba el error al editar.
  Acá pesa más que en Transferencia: son dos bloques independientes, así que editar el número
  no puede apagar el error del bloque de abajo. Android e iOS tienen `clearError` y
  `clearForeignError`/`decryptError` separados. Hay test, y la mutación que los une lo caza.
- **Ruling T21-3 (monoespaciado en las tres filas).** `Enmascarado`, `Descifrado` y `Número
  recuperado` van `monospace`: Android pasa `mono = true` e iOS `monospaced: true` en las tres,
  y el plan no pasaba ninguna.
- **Ruling T21-4 (el hex va en caja).** `ui-spec.md` lo dibuja en recuadro, Android usa un
  `Card` e iOS un fondo redondeado; el plan lo dejaba como dos `<Text>` sueltos.
- **Ruling T21-5 (`theme.mono` era `'Courier'`, que en Android no existe).** Se había anotado
  como observación cosmética al cerrar la Task 20. **Dejó de ser cosmética acá:** `ui-spec.md`
  exige que el hex "pueda compararse a simple vista contra las otras tres pantallas", y con
  tipografía proporcional no se puede. `'Courier'` es una familia real en iOS y **no** en
  Android, donde React Native cae silenciosamente a la de por defecto. Ahora es
  `Platform.select({ ios: 'Courier', default: 'monospace' })`, el equivalente del
  `FontFamily.Monospace` que usa Android nativo. Efecto colateral verificado: el `Comprobante`
  de Transferencia también quedó monoespaciado en Android, como su app nativa.
- **Ruling T21-6 (el Ruling T20-7 estaba INCOMPLETO: son los CUATRO contenedores, no tres).**
  Con los 100 tests en verde, la pantalla en el emulador salía rota otra vez y de otra forma:
  el divisor `Descifrar un hex de otra plataforma` pintado **encima** de `Resultado` (los dos
  en y=918), y `Hex cifrado` y `Descifrar` varados entre las filas del bloque de arriba.
  Misma causa raíz que el T20-7, pero el arreglo de entonces no la cubría: `ScreenHeader` es un
  `<View style={style}>` **sin una sola propiedad visual** —el más aplanable de los cinco
  componentes— y había quedado sin `collapsable={false}`. Con los cuatro protegidos la pantalla
  queda bien. **La lección es la regla, no el parche:** el criterio no es "proteger el
  contenedor que falla hoy" sino **que ningún contenedor compartido quede aplanado**; de lo
  contrario el defecto reaparece en la próxima pantalla que inserte un bloque, que es
  exactamente lo que pasó entre la Task 20 y la 21. La guarda pasa de 3 a 4 y el comentario del
  componente lo explica.
- **Una mutación destapó que mi propio test mentía, y era EL test de la pantalla.** «Cifra y
  descifra en el mismo gesto» pasaba igual con `core.decrypt(...)` reemplazado por
  `state.number`: el fake devolvía justo el número tecleado, así que el test no distinguía
  «lo descifró el core» de «la pantalla repitió lo que tecleaste» — que es *la* propiedad que
  esta pantalla existe para demostrar. Ahora el fake devuelve un centinela distinto del input y
  además se verifica que descifra **el hex que acaba de producir**. Es el mismo error de forma
  que el Ruling T20-1: un test cuyo verde depende de que dos valores coincidan por casualidad.
- **Un tag inventado por mí lo cazó el código, no un revisor.** El primer test usaba
  `{ tag: 'InvalidCard' }`, que no es una variante de `DomainError`; `contractName` lo rechazó
  con «variante de DomainError sin nombre de contrato: InvalidCard». Es la guardia del Ruling
  P1 funcionando. Los tags reales de tarjeta son `CheckDigit` (tj-004, tj-005) y `Length`
  (tj-006).
- **Verificado en el aparato, no sólo en tests:** con `4111111111111111` el hex es exactamente
  `bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd`, que es `tj-001` del
  contrato, y la vuelta completa devuelve el número. **La demostración en vivo de la tesis
  funciona:** pegando el hex de `tj-002` en el segundo bloque sale `5555555555554444`. Con
  `41111` (`tj-006`) el core responde «El número ingresado no tiene la cantidad de dígitos
  correcta.» **y el resultado del bloque de abajo queda intacto** — la independencia de bloques,
  verificada en pantalla y no sólo en Jest. Aritmética y Transferencia se volvieron a verificar
  después de tocar los componentes compartidos: las dos siguen bien.
- **Observaciones para la revisión de la fase, ninguna arreglada acá:**
  1. **Android acepta el hex en MAYÚSCULAS y lo baja a minúsculas; iOS lo rechaza.**
     `ui-spec.md` dice `[0-9a-f]`, así que React Native sigue la spec y a iOS. Android diverge
     de su propia spec. Es inofensivo para la demo —el core sólo emite minúsculas, así que
     pegar entre apps siempre entra— pero es una diferencia real de comportamiento.
  2. **El texto de ayuda de iOS se lista a sí mismo:** dice «el hex que produjo la app de iOS,
     React Native o Angular» **en la app de iOS**. Android lo tiene bien y nombra a las otras
     tres. En React Native quedó «Android, iOS o Angular». Ese texto no está entre los labels
     normativos, así que no rompe nada, pero en iOS es sencillamente incorrecto.
- **Task 21: complete.**

### Task 22

- **Verde: 109 tests, 12 suites.** `tsc` y `lint` en cero. **Verificada en emulador y simulador.**
  Se ejecutó en dos mitades paralelas —la pantalla acá, la baseline y su test en un subagente—
  porque no comparten un solo archivo.
- Labels contrastados por script contra `docs/ui-spec.md`: `Iteraciones`, `Ejecutar`,
  `Core (Rust · Decimal)`, `Punto flotante nativo`, `Tiempo típico (p50)`, `Peor caso (p95)`,
  cabecera `Benchmark` / `Core vs. implementación nativa`, y **los dos párrafos completos**.
  Verificado además que los nombres de las dos implementaciones son **los mismos** que usa la
  pantalla de Aritmética, que es lo que `ui-spec.md` exige explícitamente.
- **Ruling T22-1 (las filas se pintan SIEMPRE, con `—`; el plan las ponía condicionales).**
  Android (`BenchmarkUiState.kt`) e iOS (`BenchmarkUiState.swift`) inicializan las cuatro
  medidas en `"—"` y pintan filas y párrafos desde el arranque; el plan las envolvía en
  `{state.coreP50 !== '' && (...)}`. Además de romper la paridad, eso reintroduce **el patrón
  exacto que disparó el defecto de aplanado de Fabric** en las Tasks 20 y 21: un bloque que se
  inserta encima de filas ya montadas. Pintarlas siempre lo esquiva de raíz.
  Efecto secundario útil: el test «produce las cuatro medidas» ya no puede conformarse con
  «distinto de vacío» —el estado arranca en `—`— y exige la forma real de una medida,
  `/^\d+\.\d{2} µs$/`.
- **Ruling T22-2 (`setTimeout(0)` NO saca la medición del hilo principal, y el comentario lo
  dice).** `ui-spec.md` afirma que ésta es «la única pantalla donde las llamadas al core van
  fuera del hilo principal». En Android eso es `withContext(worker)` y en iOS `Task.detached`:
  hilos de verdad. **En React Native no se puede cumplir:** el JS corre en un solo hilo y acá no
  hay worker. Lo único que hace el `setTimeout(0)` es ceder el turno para que el spinner alcance
  a pintarse antes de que el bucle lo bloquee. Es una diferencia de plataforma, no una decisión,
  y queda escrita en el hook en vez de fingir paridad. Con 1000 iteraciones la UI se congela unos
  milisegundos y no se nota; con 999999 sí se notaría — el tope de 6 dígitos es lo único que
  acota eso, igual que en las otras dos apps.
- **Ruling T22-3 (`percentile` del plan no compila).** `tsconfig.json` tiene
  `noUncheckedIndexedAccess: true`, así que `sorted[i]` es `number | undefined`. El `?? 0` va con
  el comentario de por qué el índice nunca se sale: `run()` corta antes si `n <= 0`.
- **Ruling T22-4 (`PrimaryButton` con `loading`, cuarta vez).** El plan volvía a usar el `Button`
  de React Native y a hacer desaparecer el botón durante la corrida. Ver T19-2, T20-4, T21-1.
- **Divergencia deliberada con Android e iOS: acá el error se MUESTRA.** Los dos vuelven en
  silencio cuando `n <= 0` (`?: return` y `guard ... else { return }`), así que el botón no hace
  nada y parece roto. React Native dice «Ingresa un número de iteraciones mayor que cero.».
  `ui-spec.md` no fija nada para este caso y no toca ningún label normativo. **Queda anotado para
  la revisión de la fase: es una mejora que las otras dos apps podrían adoptar.**
- **Una mutación volvió a encontrar un hueco que los tests del plan no cubrían:** si una corrida
  falla, las medidas de la corrida anterior se quedaban en pantalla **debajo del error**, como si
  fueran de ésta. Es la misma clase de guardia que «una transferencia fallida limpia el resultado
  anterior» (Task 20) y «un número que el core rechaza limpia el resultado» (Task 21). Siete
  mutaciones, las siete cazadas.
- **Verificado en el aparato:** con 1000 iteraciones salen las cuatro medidas en µs y el core es
  más lento que la baseline, que es el punto. Con `0` y con el campo vacío aparece el mensaje, el
  botón sigue diciendo `Ejecutar` —**no queda el spinner colgado**, que es la trampa que Android
  pagó en `ad45cac`— y las medidas se quedan en `—`. Confirmado de paso que `performance.now()`
  existe en Hermes. Y una confirmación en vivo del Ruling T21-6: el mensaje de error **sí** se
  inserta encima de las filas y éstas se corren bien (706 → 799), o sea que el arreglo de los
  cuatro contenedores aguanta.

**Números medidos, 1000 iteraciones** (provisionales: emulador y simulador, no aparatos):

| | p50 | p95 |
|---|---|---|
| React Native / Android (Pixel 9 Pro API 36) — core | 3,96 µs | 5,00 µs |
| React Native / Android — float nativo | 0,62 µs | 0,67 µs |
| React Native / iOS (sim. iPhone 17 Pro) — core | 8,75 µs | 10,83 µs |
| React Native / iOS — float nativo | 0,87 µs | 1,00 µs |

**Vale la pena mirarlo contra las otras dos apps, con cuidado.** El ledger de la Fase 3 anota
**172 µs para Android nativo (JNA) y 0,33 µs para iOS nativo (`.a` estático)**. Los 3,96 µs de
React Native en Android sugieren que **JSI es unas 43× más barato que el puente JNA** que usa la
app nativa de Android, lo cual es un dato fuerte para la demo. **Pero no es una comparación
limpia:** distinto arnés de medición, emulador contra aparato, y `performance.now()` de Hermes
contra `System.nanoTime()`. Antes de afirmarlo en la presentación hay que medir las tres con el
mismo criterio. Anotado para la Task 23 / PENDING.

#### La mitad del subagente (baseline y test de divergencia)

- **Defecto A del plan confirmado en vivo:** `__benchmarks__/` no lo recogía ningún proyecto de
  Jest, y se comprobó que `--listTests` **no** lo nombraba antes del arreglo. Un test que nunca
  corre y no avisa — el peor modo de fallar para uno cuyo propósito es ser material de
  presentación. Se suma al proyecto `napi` (no al `react-native`): lee `contracts/cases.json`
  desde Node y no toca nada que el preset de RN mockee, el mismo criterio con que ya está
  `__tests__/` ahí.
- **Defecto nuevo, que no estaba en el brief y lo cazó el gate de `tsc`:** el snippet del plan usa
  los globals de Jest, pero **este repo no tiene `@types/jest`** — todos los tests existentes
  importan de `@jest/globals` explícitamente. Sin ese import, `tsc --noEmit` falla con
  `TS2593`/`TS2304`.
- `ContractCase` es `Record<string, any>` a propósito (los grupos tienen formas distintas de
  `esperado`); los nombres de campo que asumía el plan —`op`, `a`, `b`, `esperado`— resultaron
  correctos.
- **Divergencia real: 6/6**, que coincide con lo que afirma `CLAUDE.md`. Verificado por mí
  aparte, caso por caso: `ar-005` es el más brutal (`100.00 − 99.99` da `0.010000000000005116`
  contra `0.01`).
- **Mutación verificada por mí, no sólo reportada:** reemplacé la baseline por aritmética exacta
  en centavos con `BigInt` y los dos tests se pusieron **rojos**. O sea que el test detecta de
  verdad que TypeScript dejó de diverger, que es para lo que existe.
- **Ruling P3 comprobado:** las dos baselines siguen separadas, ninguna importa a la otra, y cada
  una conserva su comentario obligatorio.
- **Task 22: complete.**
