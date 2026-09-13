# SDD ledger — plan: docs/superpowers/plans/2026-09-12-phase-5-app-web-angular.md

**Spec:** docs/superpowers/specs/2026-09-12-phase-5-app-web-angular-design.md (leída; es la
autoridad vinculante, el plan es su argumento).
**Rama:** feat/phase-5-app-web-angular · merge-base `ba6df64` · HEAD al arrancar `effaa95`.

## Ruling P0 — se trabaja en este checkout, no en un worktree nuevo

La skill pide workspace aislado. Estamos en una rama de fase, **no en main**, que es la
condición dura. Mismo criterio que la Fase 4: las tareas de verificación dependen de estado que
vive sólo en este checkout —el emulador apareado, el simulador, los targets de Rust, los
artefactos generados que están gitignorados—. Un worktree obligaría a reconstruir todo eso.
**Costo si está mal:** un fallo a medias deja este checkout sucio en vez de un worktree
descartable; se recupera con `git reset` porque cada tarea commitea.

## Ruling P1 — el `.gitignore` de `.superpowers/sdd/` se restaura tras correr `sdd-workspace`

El script `scripts/sdd-workspace` escribe `*` en `.superpowers/sdd/.gitignore` y con eso borra la
regla que versiona los `progress.md`. **Esa regla es una decisión explícita del usuario de esta
sesión** —los rulings tienen que quedar auditables junto al código que explican—, y la
convención del plugin no la manda. Se restaura después de cada corrida del script.
**Costo si está mal:** el ledger de esta fase no entraría al historial y los rulings morirían
con el workspace, que es justo lo que la decisión buscaba evitar.

## Escaneo previo de conflictos

### Pares de tareas que comparten archivo o interfaz

| A → B | Qué produce A / consume B | Hallazgo |
|---|---|---|
| T1 → T4 | `ubrn.wasm.yaml` apuntado al paquete | T1 lo hace **temporal y revierte**; T4 lo hace definitivo. Deliberado y declarado |
| T1 → T2, T4 | `packages/` en `pnpm-workspace.yaml` | T1 lo agrega y revierte; T2 lo agrega de verdad. Sin choque |
| T2 → T3, T4 | `CONTRACT_NAMES`, `ContractTag` | los dos flavours consumen la misma tabla; nombres coherentes entre las tres tareas |
| T2 → T3 | `contractName` se muda | T3 borra `apps/react-native/src/contractName.ts` y reexporta del paquete. Orden correcto |
| T3 → T5 | RN importa `@banco/contract` | T5 repunta el test de contrato. Depende de T3, y va después |
| T4 → T5, T6 | `initCore` + nueve funciones tipadas | firma idéntica en las tres tareas (`initCore(source: ArrayBuffer \| Uint8Array)`) |
| T4 → T6 | el `.wasm` en `packages/…/generated/` | T6 lo declara asset de Angular y lo carga por bytes |
| T8 → T10-13 | `formatPEN` y `userMessage` | las cuatro pantallas los consumen; firmas fijadas en T8 |
| T9 → T10-13 | componentes compartidos | misma descomposición que las otras tres apps |
| T10 → T13 | `baseline.ts` / `nativeFloat` | **T10 lo crea en `features/benchmark/`, T13 lo consume.** Coherente, pero el archivo vive en el feature de otra pantalla — igual que en React Native, y por el mismo motivo: es la baseline que las dos usan |

### Autoconsistencia por tarea

| Tarea | ¿Su texto concuerda consigo mismo? |
|---|---|
| T1 | sí — crea, prueba, revierte, y su salida es una respuesta escrita |
| T2 | sí — los tests que especifica prueban lo que el código que especifica hace |
| T3 | sí — la guardia se verifica **por mutación en los dos sentidos**, no sólo compilando |
| T4 | sí — el test de la fachada no puede probar los tipos solo; por eso el paso exige `tsc --noEmit` aparte |
| T5-T14 | sí |

### Conflictos con la rúbrica de review

Ninguno. El plan no manda ningún test que no asierta nada ni duplicación verbatim de un bloque
de lógica. **Las dos baselines de punto flotante** (`features/benchmark/baseline.ts` acá y las de
las otras apps) son casi idénticas y un revisor puede marcarlas como duplicación: están
declaradas como la excepción permitida en las Global Constraints del plan y en `CLAUDE.md`, con
el comentario obligatorio. Se le pasa ese contexto al revisor.

## Progreso

### Task 1 (spike) — los dos supuestos, contestados

- BASE `effaa95`. **No commitea nada**: el spike revierte todo lo que toca. Verificado: `packages/`
  borrado, `ubrn.wasm.yaml`, `pnpm-workspace.yaml` y `pnpm-lock.yaml` revertidos —el lockfile no
  estaba en el brief y cambió con el `pnpm install`; el implementador lo cazó— y
  `apps/react-native/pnpm test` de vuelta en **113/13**, idéntico al baseline.

- **Supuesto 1 — CONFIRMADO SIN MATICES.** `ubrn build wasm2 --config` acepta escribir fuera de
  `apps/react-native`: escribió sólo en `packages/core-financiero-wasm/generated/` y **no** tocó
  `src/generated-wasm/` (timestamps intactos). El D1 de la spec se sostiene.

- **Supuesto 2 — CONFIRMADO, PERO CON CONDICIONES QUE EL PLAN NO ANTICIPABA.** Consumir el
  generado como paquete del workspace **no funciona con la forma literal del brief**. Probado:
  - `main: "./generated/index.ts"` + `import('./generated/index.js')` bajo Node puro →
    `ERR_MODULE_NOT_FOUND`. Node no ejecuta TypeScript.
  - `--experimental-strip-types` → falla en el primer import interno **sin extensión**.
  - Precompilar con `tsc` → compila (con un error de tipos preexistente, que **confirma
    independientemente por qué `wasm:generate` inyecta `@ts-nocheck`**), pero el `.js` emitido
    conserva los imports sin extensión y Node sigue fallando.
  - **Empaquetar con `esbuild` → FUNCIONA**, y devolvió exactamente `1.0.0+effaa95` y `0.30`.
  - Y hubo que declarar `@ubjs/wasm` y `@ubjs/core` **a mano** en el `package.json` nuevo: pnpm
    no los hoistea.

- **Ruling T1-1 — el paquete WASM empaqueta con esbuild; no se apuesta al camino no verificado.**
  El spike probó que el bundle funciona y **no** probó que consumir el `.ts` crudo funcione. La
  tentación es decir «pero Jest ya transpila TS hoy, y el builder de Angular usa esbuild por
  dentro, así que va a andar»: eso es exactamente un supuesto no verificado del mismo tipo que el
  spike existía para eliminar. Se toma el camino con evidencia.
  **Costo si está mal:** un paso de build más que hay que encadenar a `wasm:generate` y volver a
  correr tras cada regeneración. Si más adelante se comprueba que Angular consume la fuente
  directo, se quita el paso y se simplifica — es un cambio contenido, al revés no.

- **Ruling T1-2 — `@ubjs/wasm` y `@ubjs/core` van declarados explícitamente en el paquete nuevo.**
  Hallazgo del spike: pnpm no los hoistea y el import falla sin ellos. Es la octava cara de la
  estrictez de pnpm en este proyecto.
  **Costo si está mal:** ninguno; declarar una dependencia real que ya se usa no tiene contra.

- **Ruling T1-3 — un spike no pasa por task review.** Su diff es vacío por construcción: revierte
  todo. Lo que se revisa es el reporte, y lo revisé yo contra los dos supuestos que la tarea
  existía para contestar. **Costo si está mal:** un hallazgo del reporte mal leído se propaga a
  la Task 4; mitigado porque el Ruling T1-1 toma el camino conservador.

- **Ruling P1 aplicado otra vez:** `scripts/task-brief` también reescribe
  `.superpowers/sdd/.gitignore` con `*`. Hay que restaurarlo después de **cada** corrida de los
  scripts de la skill, no sólo de `sdd-workspace`.

- **Riesgo abierto, anotado y no resuelto:** nadie verificó todavía si el builder de Angular
  resuelve esto igual que el bundle manual del spike. Se contesta en la Task 6, que es la primera
  que levanta Angular de verdad. No se da por hecho.

- **Task 1: complete (spike, sin commits — revierte por diseño).**

### Task 2

- BASE `effaa95`.
- **Ruling T2-1 — los paquetes se testean con Jest, no con vitest (DEFECTO DEL PLAN).** El plan
  escribe `import { describe, expect, it } from 'vitest'` en las Tasks 2 y 4. **Vitest no se usa
  en ninguna parte de este repo**: todo el JavaScript se prueba con el Jest multi-proyecto de
  `apps/react-native`, que ya abarca `__tests__`, `example/__tests__`, `src/__tests__` y
  `__benchmarks__`, con `@jest/globals` importado explícitamente porque no hay `@types/jest`.
  Meter un segundo runner por dos paquetes chicos es ceremonia, y además duplica la pila de
  transformación —cosa que la Fase 4 ya había rechazado al descartar `ts-jest`—.
  **Decisión:** los tests de `packages/*` corren en el proyecto `napi` del Jest existente,
  extendiendo su `testMatch`, que es exactamente lo que la Fase 4 hizo con `__benchmarks__`.
  Un solo runner, una sola pila de transformación, un solo `pnpm test`.
  **Costo si está mal:** acopla los tests de los paquetes a la config de un consumidor, que
  conceptualmente está al revés. Si los paquetes crecen hasta merecer vida propia, se les da su
  config y se sacan del `testMatch` — es un cambio de dos líneas. La alternativa, montar hoy
  babel + config por paquete, es trabajo real a cambio de una pureza que esta POC no cobra.

- **Review de la Task 2: spec ✅, calidad NO aprobada.** Un Critical y cuatro Important.
- **Ruling T2-2 — el barrel del paquete tiene que ser seguro para bundlers; lo que toque
  `node:fs` vive detrás de un subpath.** El hallazgo C1 es real y lo verifiqué en el reporte del
  revisor con salida de `esbuild`: `sources.ts` se portó con `readFileSync`/`__dirname`, el barrel
  lo reexporta, y por eso importar **sólo `contractName`** desde `@banco/contract` ya arrastra
  `node:fs` al grafo. Eso rompe la Task 3 (Metro) y la Task 8 (esbuild de Angular), que son
  código de producción en un navegador. No es un detalle de estilo: el paquete existe para servir
  a tres consumidores y hoy sirve a uno.
  **La dirección**, porque tengo el contexto de las tareas que vienen y el implementador no:
  `messageFor` lo necesita **producción** en el navegador, así que va con `import` estático de
  JSON, que es como funciona hoy en React Native y por qué funciona. `loadCases`/`loadMessages`
  los necesitan los **tests** en Node, así que pueden quedarse con `fs` detrás de un subpath.
  **Costo si está mal:** un subpath más en el `exports`. Al revés —descubrirlo en la Task 8— son
  dos tareas construidas sobre un paquete que no se puede importar.
- **Ruling T2-3 — M1 entra al fix aunque el revisor lo marcó Minor.** `const nombre` viola «todo
  identificador va en inglés», que es una constraint dura del proyecto, no una preferencia. El
  revisor lo bajó a Minor por ser herencia del archivo original — pero la Task 3 **borra** ese
  original, así que esta pasa a ser la única copia y la herencia deja de ser excusa.
  **Costo si está mal:** ninguno, es un rename.
- **Minors diferidos** (no entran al loop, van al review final): M2 —el tercer
  `modulePathIgnorePatterns` es código muerto porque `../..` queda literal dentro de la regex y
  nunca matchea; conviene borrarlo **antes** de que alguien lo copie al paquete WASM— y M3
  —`resolveJsonModule` sin uso y `ContractCase` exportado sin consumidor todavía—.
- **Task 2: fix round 1/5 (6 addressed, 0 open — C1 barrel seguro para bundlers, I1+I4 guardia por
  valor, I2 typecheck en verde, I3 `Object.hasOwn`, M1 identificador a inglés; commits
  `acb1a29`..`ee5f258`).** El re-revisor reprodujo las cuatro sondas de esbuild por su cuenta y
  mutó `Cifrado`→`CifradoMalo` confirmando que sólo el test nuevo lo caza. No pudo correr la
  mutación de I3 —el clasificador de auto-mode bloqueó ejecutar jest sobre una versión con la
  guardia debilitada— y lo dijo en vez de fingirla, razonando desde la semántica de JS.
- **Task 2: complete (commits `effaa95`..`ee5f258`, review clean).** 118 tests, 15 suites.

### Task 3

- BASE `ee5f258`. **Spec ✅, calidad aprobada, sin Criticals.**
- **Defecto del plan que encontró el implementador y el revisor confirmó de forma independiente:**
  el `Equal<A,B>` del plan **nunca podría haber estado en verde**. `DomainError['tag']` sale de una
  unión de clases generada, no de una unión de literales, y la mitad `literal → enum` falla
  siempre por nominalidad. Fix mínimo: `` `${DomainError['tag']}` `` en el sitio de uso, sin
  tocar la forma de `Equal`. El revisor corrió **cuatro** mutaciones —las dos pedidas sobre la
  tabla más dos propias sobre el `DomainError` generado, que es el caso real— y las cuatro
  rompen `tsc` con el mismo error. La guardia discrimina: no compila siempre ni falla siempre.
- **Precisión que conviene saber, y no es un agujero:** la guardia sigue a la **unión de clases**,
  no al `enum`. Agregarle un miembro al enum a mano no la dispara; agregar una variante a la unión
  sí. uniffi emite las dos juntas en cada regeneración, así que en la práctica no hay hueco.
- **Ruling T3-1 — los dos Important doc-only entran al fix ahora, no se difieren.** `TESTING.md`
  describe la guardia 4 con el mecanismo viejo y enlaza a `src/contractName.ts`, que este commit
  **borró** —link roto—, y cita como evidencia dos errores de `tsc` que hoy son imposibles.
  `README.md` lista ese archivo como pieza de arquitectura y su diagrama Mermaid —entregable de
  fase por `CLAUDE.md`— no menciona `@banco/contract` ni `guard.ts`. El motivo de no diferirlos es
  concreto: **la Task 14 no toca `apps/react-native/`**, así que nadie los recogería y se irían a
  la demo así. **Costo si está mal:** un commit de docs de más.
- **Minors diferidos al review final:** el warning `no-void` de `guard.ts` (viene literal del
  plan), `_guardia` como identificador en español (patrón preexistente y tolerado: `plantilla`,
  `esperadas`), y el `release-it` con `npm.publish` sobre un paquete `private`.
- **Anotado para las Tasks 6 y 11:** Angular va a necesitar `initialAccounts`, `demoKey` y
  `demoNonce`, que hoy viven **sólo** en `example/src/contract/sources.ts`. Es el próximo
  candidato a duplicarse. Lo natural es que `@banco/contract` crezca esos tres sobre el import
  estático de `cases.json`, que ya usa.
- **Task 3: fix round 1/5 (5 addressed, 0 open — TESTING.md y README.md al mecanismo real,
  `@banco/contract` declarado en el example, reexport muerto fuera, comentario duplicado;
  commits `1774708`..`318c95e`).** El re-revisor reprodujo las **cuatro** mutaciones y confirmó
  que el texto del doc coincide byte a byte con lo que `tsc` produce hoy, incluida la que
  demuestra que agregar sólo al `enum` **no** dispara la guardia (`EXIT:0`).
- **Task 3: complete (commits `ee5f258`..`318c95e`, review clean).** 118 tests, 15 suites.

### Task 4

- BASE `318c95e`. **Spec ✅, calidad NO aprobada:** un Critical, tres Important, cinco Minor.
- **C1 (Critical, real y verificado):** `__tests__/contract.wasm.test.ts` sigue importando
  `apps/react-native/src/generated-wasm/`, que está **gitignoreado** y que tras la repunta **ya no
  lo produce ningún script**. El revisor lo movió a scratchpad y la suite dio
  `Cannot find module`, **0 tests**. Pasa en verde sólo por estado local previo: en un clone
  limpio —o después de un `ubrn:clean`, que además borra justo ese directorio— el gate central de
  la POC no arranca.
- **Ruling T4-1 — la Task 5 se absorbe en el fix de la Task 4.** El plan las separó, y esa
  separación es la que crea la ventana rota: la Task 5 es precisamente «repuntar el test de
  contrato al paquete». Dejar el repo un commit entero con el gate 28/28 apoyado en un artefacto
  huérfano no se justifica para preservar un límite de tareas que yo mismo dibujé.
  **Costo si está mal:** la Task 5 queda vacía y su commit se funde con éste, así que el
  `git bisect` pierde un escalón. Barato contra dejar el gate irreproducible.
- **Ruling T4-2 — la justificación de la fachada que escribí en la spec es FALSA, y se corrige.**
  El D2 de la spec dice que reexportar el generado «le daría `any` a Angular en las nueve
  funciones y con eso se cae la guardia 4». **Las dos mitades son incorrectas**, y el revisor lo
  probó: `@ts-nocheck` suprime diagnósticos pero **no borra los tipos exportados** —importó `add`
  del generado y asignarlo a `number` da `TS2322`—, y la guardia 4 **no depende de `index.ts`**:
  `guard.ts` lee el tipo del generado por su cuenta. La prueba estaba dentro del propio commit.
  **La fachada igual se justifica, por las razones verdaderas**, que el revisor verificó: el
  generado **no typechequea** (quitarle el `@ts-nocheck` pone el `tsc` del paquete en rojo, o sea
  que es load-bearing y confinarlo es un logro real), da una superficie estable escrita a mano
  frente al churn del generador, y `initCore` **angosta** `WasmSource` de seis formas a bytes.
  Corrijo el D2 de la spec yo, porque es mi documento de diseño; los comentarios del código los
  corrige el implementador.
  **Costo si está mal:** ninguno — es cambiar una justificación falsa por la verdadera sobre una
  decisión que sigue siendo correcta.
- **Minors diferidos al review final:** M2 (`types`→fuente y `default`→bundle sin hook de
  `prepare`, se pueden desalinear en silencio), M3 (el `typecheck` del paquete no está en ningún
  gate) y M5 (el test de la fachada no toca el camino de error, que el revisor sí probó a mano y
  funciona).
- **Task 4: fix round 1/5 (5 addressed, 0 open — C1 el test de contrato repuntado al paquete y el
  generado huérfano borrado, I2 la justificación real de la fachada, I3 test que sí puede fallar,
  I4 doc drift, M4 dependencia a devDependencies; commits `57d84f0`..`a99148b`).**
  El re-revisor reprodujo la verificación que importa: movió `generated/` y `dist/` fuera del repo
  y confirmó que el gate **falla ruidosamente** (`Cannot find module` en las dos suites
  dependientes), no en silencio; restauró y volvió a 120/16. También quitó el `@ts-nocheck` del
  generado y confirmó el `TS2345`, o sea que la razón (a) de la fachada es cierta.
- **Task 4: complete (commits `318c95e`..`a99148b`, review clean).** 120 tests, 16 suites.
- **Task 5: absorbida en la Task 4 por el Ruling T4-1.** Su entregable —el test de contrato por
  WASM importando del paquete— está hecho y verificado: 28/28 contra `@banco/core-financiero-wasm`.
- **Minors diferidos al review final (de la fisura que dejó el fix):** quedan tres referencias
  **muertas** a `src/generated-wasm` —en `.gitignore:22`, en `eslint.config.mjs:36` y un párrafo
  viejo de `PENDING.md:152` que quedó contradiciendo al párrafo correctivo que el fix agregó
  debajo—. Son inertes, no rompen nada, pero la de PENDING.md deja el archivo diciendo dos cosas
  distintas y conviene barrerlas antes de cerrar la fase.

### Task 6

- BASE `a99148b`. Implementada y commiteada en `98b6960`; **la sesión se cortó antes del review de
  tarea** — el reporte existe, el gate no había corrido. Se retoma exactamente ahí: review package
  `review-a99148b..98b6960.diff` (334 KB, el grueso es el scaffold de `ng new`).
- **Ruling T6-1 — Angular 21.2.24 en lugar de `@angular/cli@latest`, y va al README con ese
  número.** `@latest` resuelve hoy a 22.1.8, cuyo `engines.node` exige `^22.22.3 || ^24.15.0 ||
  >=26.0.0`; la base declarada del repo es Node 22.16.0 y subirla no es parte de esta fase. La
  serie 21.x (`v21-lts`) acepta `^22.12.0`. Es el techo compatible con el toolchain ya instalado,
  no una versión elegida a ciegas.
  **Costo si está mal:** la fase queda una major por detrás de Angular; migrar después es un
  `ng update`, no una reescritura. Al revés —subir Node en medio de la fase— toca las otras tres
  apps, que hoy están en verde.
- **Ruling T6-2 — el `.wasm` entra por symlink en `public/`, no por copia ni por entrada de
  `assets` en `angular.json`.** El builder `@angular/build:application` **rechaza** un asset
  fuera del workspace root de Angular (`The ../../packages/… asset path must be within the
  workspace root`), y `apps/web-angular/` es su propio workspace. Copiar el binario violaría
  «el `.wasm` se consume como paquete local del workspace; nunca se copia a mano».
  **Costo si está mal, y está anotado como pendiente real:** `ng build` resuelve el symlink a una
  ruta **absoluta** dentro de `dist/`, así que un `dist/` movido de máquina (CI, deploy) se rompe.
  Inocuo para `ng serve` y para la demo, que es el alcance de esta fase; hay que dejarlo escrito
  en el PENDING de la app (Task 14).
- **D3 de la spec: confirmado a medias, y la mitad que falló es buena noticia.** Cargar por
  **bytes** funciona —`WebAssembly.compile` no mira el Content-Type— pero el dev-server de
  Angular 21 (Vite) **ya sirve `application/wasm`**: `curl -sI` devolvió ese header, no
  `text/html`. O sea que el «punto donde más tiempo se pierde» del CONTEXT **no se manifestó** en
  este toolchain. El diseño por bytes sigue siendo la defensa correcta para un `dist/` servido
  desde otro host, pero el README no debe contar una batalla que no hubo.
- **Hallazgo del arnés, no de la app:** `readFileSync` devuelve un `Buffer` del realm de Node y
  el `unit-test` builder corre los specs en el realm de jsdom, así que el `instanceof Uint8Array`
  de `UniffiNativeModule.open` da `false`. Se envuelve en `new Uint8Array(...)`. No toca la app
  real, que carga por `fetch().arrayBuffer()` en un solo realm.
- **Review de la Task 6: spec ✅, calidad NO aprobada.** Cero Criticals, cuatro Important. El
  revisor verificó las dos afirmaciones que yo iba a usar para decidir: el lockfile pinea
  `@angular/cli 21.2.24` con specifiers `^21.2.0` que **no pueden derivar** a 22.x, y el `.wasm`
  entró como `new file mode 120000` —symlink— sin que ningún blob de 180 KB tocara git. También
  auditó las bajas del lockfile una por una: son re-keyings de peers por la entrada de `sass`,
  ningún bump alcanzó a `apps/react-native`.
- **Ruling T6-3 — I1 entra al fix: `cargarCore`/`respuesta` pasan a `loadCore`/`response`.** El
  brief los escribió en español y el implementador los preservó a propósito, que es exactamente
  el razonamiento que el Ruling T2-3 ya rechazó en este mismo ledger. «Todo identificador va en
  inglés» es constraint dura del proyecto; que el defecto venga del brief —lo escribí yo— no lo
  convierte en decisión de diseño. Son dos archivos y cuatro líneas hoy; después de once tareas
  que lo importen, no.
  **Costo si está mal:** ninguno, es un rename.
- **Ruling T6-4 — I2, el gate de lint: un intento acotado, y si el toolchain pelea se documenta
  la ausencia en vez de forzarla.** La app no tiene `lint` ni config de ESLint, así que uno de
  los tres gates por tarea que el plan manda **no puede correr** — y el reporte lo evidenció sólo
  para `apps/react-native`. `ng add @angular/eslint` pinneado a la serie compatible con Angular 21
  es el arreglo correcto; pero ya sabemos por el Ruling T6-1 que este Node hace pelear a los
  `engines`, y quemar tiempo de fase ahí es justo lo que el CONTEXT advierte que no hagamos. Un
  intento: si `engines` falla, se revierte, se deja escrito que `web-angular` no tiene gate de
  lint y por qué, y se sigue.
  **Costo si está mal:** una devDependency de más, o una app con un gate menos — visible y
  anotada, que es lo contrario de que el plan afirme que los tres corrieron cuando uno no existe.
- **Ruling T6-5 — I3 entra al fix aunque el test salió literal del brief.** `toThrowError()` sin
  argumento acepta **cualquier** throw: borrar `validateCard` del servicio deja el spec en verde
  con un `TypeError: is not a function`. En una clase que es pura delegación, ésa es justo la
  mutación que importa, y el docblock afirma que lo que se propaga es el `DomainError` del core.
  **Costo si está mal:** ninguno — un test que hoy no puede fallar por la razón correcta.
- **Ruling T6-6 — I4: el `respuesta.ok` entra ahora; el prerequisito documentado va a la Task 14.**
  El symlink apunta a `packages/core-financiero-wasm/generated/`, que está **gitignoreado**: en un
  clone limpio queda colgado hasta que alguien corra `ubrn build wasm2`. Sin chequear `ok`, el
  `fetch` recibe el `index.html` del SPA con 200, `initCore` rechaza, el bootstrap muere y lo
  único que queda es una pantalla en blanco. Es el modo de fallo más caro posible el día de la
  demo y hoy nada en el repo avisa del prerequisito. El check es de **carga**, no de dominio: no
  traduce ningún error del core, así que no roza la regla del adapter.
  **Costo si está mal:** tres líneas en el camino de arranque.
- **Resolución de los dos ⚠️ del revisor, que son míos y no del fix:** (a) el reporte da conteos
  de test sin salida verbatim, así que **el fix round tiene que pegar la salida cruda** del
  `pnpm test` final —no puedo aceptar un gate sobre un número sin output donde mirar warnings—;
  (b) el symlink absoluto dentro de `dist/` ya quedó asentado en el Ruling T6-2 y su destino es
  el PENDING de la Task 14.
- **Minors diferidos al review final:** el wrapper de flecha de `executeTransfer`, el único
  distinto de sus ocho hermanos; siete de las nueve delegaciones sin ejercitar —la Task 7 las
  cierra con el contrato 28/28—; la ruta relativa a cwd en el spec; `package.json` sin newline
  final; y la basura del scaffold que alguna tarea posterior debe barrer —la página de bienvenida
  de 343 líneas, el `app.spec.ts` que afirma `'Hello, web-angular'`, el README en inglés,
  `.vscode/mcp.json` y `@angular/router` pese a `--routing=false`—.
- **Task 6: fix round 1/5 (4 addressed, 0 open — I1 `loadCore`/`response`, I2 el gate de lint
  entró con `@angular-eslint/schematics@21.4.0` sin arrastrar upgrade de toolchain, I3 el test
  ahora afirma `tag: 'Length'` sobre la forma real del `DomainError`, I4 `response.ok` con URL y
  status en el mensaje; commit `98b6960`..`0f75dd3`).** El Ruling T6-4 previó revertir el intento
  de lint si los `engines` peleaban: no pelearon, la serie 21.4.0 entró limpia. La mutación de I3
  ahora falla en **typecheck** (`TS2339`), no en runtime, que es aún mejor: rompe antes de correr.
- **Ruling T6-7 — el `.gitignore` del workspace SDD lo pisa el script del skill, no un agente, y
  el ledger se commitea con `git add -f`.** Acusé al implementador de haber reducido
  `.superpowers/sdd/.gitignore` a `*`; **era falso y lo corrijo acá**. El script `sdd-workspace`
  del propio skill hace `printf '*\n' > "$base/.gitignore"` **incondicionalmente en cada
  invocación**, y `task-brief` y `review-package` lo llaman por dentro: lo volví a pisar yo mismo
  al generar el paquete del re-review, minutos después de restaurarlo.
  El conflicto es real y recurrente: el commit `b5b1388` versionó los ledgers a propósito —los
  rulings explican por qué el código quedó como quedó y eso no se deduce del diff— y el script
  borra esa excepción cada vez. La práctica que resuelve, y que hay que seguir al cerrar la fase:
  **restaurar el archivo desde HEAD y commitear el ledger con `git add -f`**, nunca con
  `git add -A`, que además arrastraría briefs, reports y diffs de review.
  **Costo si está mal:** el archivo aparece modificado en `git status` durante toda la ejecución y
  alguien puede commitearlo sin querer; el contenido bueno vive en HEAD, así que se recupera con
  un `git checkout`. Al revés —dejar que gane el `*`— los rulings de esta fase no llegan a quien
  clone el repo.
- **Fuera del plan, a pedido del usuario: `ffabc9d` `docs(react-native)`.** Una aclaración en
  `apps/react-native/CONTEXT.md` de que el `2` de `wasm2` es la generación del backend de codegen
  de `ubrn` y no una versión del estándar —con la mención explícita de que `wasm3` es un
  intérprete en C para embebidos, otra categoría—. Nace de que el usuario leyó el nombre como
  número de versión y preguntó si había que actualizar. Verificado antes de escribirlo: el
  `--help` del CLI instalado llama al flavour «Wasm2 (player-based)», y `npm view` da
  `latest: 0.31.0-5` tanto para `uniffi-bindgen-react-native` como para `@ubjs/wasm`, que es
  exactamente lo pinneado. **No hay update disponible**, y aunque lo hubiera, mover el generador
  a dos tareas del cierre obligaría a regenerar las tres salidas y re-verificar 28/28 en las
  cuatro apps para que los `coreVersion()` sigan coincidiendo.
- **Ojo con los rangos de review:** `ffabc9d` cae **después** de `0f75dd3`, que es el head que el
  re-review de la ronda 1 está mirando, y no toca `apps/web-angular`. La Task 7 parte de
  `ffabc9d`.
- **Re-review de la ronda 1: los cuatro ADDRESSED**, con evidencia verbatim limpia en los tres
  gates y la mutación de I3 por ambos lados. El re-revisor verificó lo que más importaba de I2: el
  bloque de `dependencies` de la app sigue intacto en `^21.2.0` y las cinco altas son todas de la
  cadena de ESLint, peer-compatibles con el CLI 21.2.24; ni el root ni `apps/react-native`
  cambiaron de specifier.
- **Hallazgo nuevo del re-review, y lo verifiqué yo en vez de aceptarlo:** el `pnpm install` del
  `ng add` recalculó peers en toda la workspace y movió una clave dentro del importer de
  `apps/react-native/example` —`@react-native-community/cli@20.1.0(typescript@6.0.3)` perdió el
  sufijo—. Ningún specifier cambió, pero la evidencia de «sin regresión» del reporte era **del
  commit anterior al cambio de lockfile**, o sea que no cubría esto. Corrido ahora contra el árbol
  real: **120 passed, 16 suites**. Benigno, confirmado, no heredado.
- **Task 6: complete (commits `a99148b`..`0f75dd3`, review clean).** Angular 21.2.24 con el
  servicio cargando el `.wasm` por bytes, los tres gates existiendo y en cero —el de lint recién
  desde esta ronda—, y 4 tests propios.

### Task 7

- BASE `ffabc9d`.
