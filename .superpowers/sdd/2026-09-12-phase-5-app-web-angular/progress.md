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
- Implementada en `9cbb917`: `apps/web-angular/src/app/core/contract.spec.ts`, consumiendo
  `CoreFinancieroService` por `TestBed.inject` y `@banco/contract` + su subpath `/testing`.
  **36/36** — los 4 que ya existían, los 28 casos y las 4 guardias de runtime. La guardia 4 quedó
  fuera con razón: es de compilación y vive en `packages/core-financiero-wasm/src/guard.ts`.
  Ningún valor de `cases.json` se tocó: los 28 pasaron contra la v2.3.0 tal cual.
- **Al review con una lupa puesta:** el implementador describe su patrón como «`toThrow()` +
  `try/catch` separado», y el antipatrón que prohibí explícitamente —el `try` que contiene su
  propio `throw` y cae en su propio `catch` reportando la causa equivocada, hallazgo del review de
  la Fase 4— se describe casi igual. Un `try/catch` que sólo captura para afirmar sobre el `tag`
  es legítimo y es lo que hace el archivo de referencia. Pedí que el revisor cite las líneas y
  decida cuál de los dos está en el código. También pedí verificar que los 28 casos **se ejecuten
  de verdad**: un spec table-driven puede correr cero filas y reportar verde, que es exactamente
  la forma en que este gate podría mentir.
- **Review de la Task 7: spec ✅, calidad aprobada, sin Criticals ni Importants.** Las dos lupas
  cerradas: el único `throw` del archivo está en el helper `group()`, **fuera de todo `try`** —el
  antipatrón no está—, y los 28 casos corren de verdad, probado por aritmética (2+2+4+28 = 36,
  que es el total reportado; un caso perdido habría dado 35). El revisor además verificó las
  guardias contra el archivo real en vez de contra sí mismas: los conteos de la guardia 2
  coinciden uno a uno con `cases.json`, las claves de la 3 son exactamente las del archivo y la 5
  cubre las nueve variantes. Y descartó el fallo más silencioso posible: no hay `vi.mock` en toda
  la app, así que el spec pega contra el WASM real.
- **Mejora sobre la referencia, no ceremonia:** el spec consume `CoreFinancieroService` por
  `TestBed.inject` en vez de importar el paquete directo, así que falla si un método desaparece
  del seam que van a usar las pantallas.
- **Task 7: complete (commits `ffabc9d`..`9cbb917`, review clean).** 36/36. Angular es la quinta
  base de código corriendo `cases.json` con igualdad exacta de strings.
- **Minors diferidos al review final (los cuatro, y el primero es el que más importa):** (1)
  `contract.spec.ts:44-52` — el comentario de la guardia 2 afirma un mecanismo **falso** y encima
  se autodescribe como «verificado, no supuesto»: dice que Vitest falla un `it.each([])` como
  Jest, y no lo hace (`cases.forEach` no registra nada ni lanza). La protección existe igual por
  otra vía —el `describe` vacío falla con `No test found in suite`, porque el builder de Angular
  no setea `passWithNoTests`— y el `toHaveLength` la cubre aparte. Hay que corregirlo justamente
  porque su redacción actual («acá esta guardia no protege contra un grupo vacío») justificaría
  borrar una guardia que **sí** es red. (2) `esperadas`, `nombres` y `cuentas` son identificadores
  en español, heredados de la referencia, en una rama que ya tuvo un commit dedicado a lo
  contrario. (3) La ruta del `.wasm` en el spec es relativa a cwd —`loadCases()` en cambio
  resuelve desde `__dirname` y es inmune—; se arregla junto con la de la Task 6 o con ninguna.
  (4) El bloque de `tsc` del reporte está anotado a mano, no capturado verbatim.

### Task 8

- BASE `9cbb917`.
- Implementada en `7a163b2`: `formatPEN` + `MoneyPipe` y `userMessage`. **50 tests**, los tres
  gates en cero.
- **Ruling T8-1 — el CONTEXT de la app mandaba `Intl.NumberFormat` y lo corrijo yo, en commit
  aparte (`846e633`).** El implementador lo levantó como concern y lo verifiqué: la sección
  «Formateo» pedía envolver `Intl.NumberFormat("es-PE", {style: "currency"})`, texto anterior a
  la medición de la Fase 4. **No es doc drift ordinario:** `CLAUDE.md` dice que ante un conflicto
  gana el CONTEXT del subproyecto y manda leerlo antes de tocar nada adentro, así que tal como
  estaba **autorizaba justo lo que la fase prohíbe**, con más autoridad que la constraint global.
  La lista de «Prohibiciones» tampoco mencionaba `Intl`, así que quedaba coherente consigo misma
  y equivocada. Corregido en los dos lugares.
  Lo corrijo yo y no el implementador por el mismo criterio del Ruling T4-2: los documentos de
  diseño y entrada son míos; los comentarios del código son suyos.
  **Costo si está mal:** un commit de docs. Al revés, el próximo que lea el CONTEXT antes de
  tocar la app —que es lo que el proyecto le ordena hacer— implementa el separador equivocado y
  la demo falla por un byte que no se ve en pantalla.
- **El implementador hizo lo correcto:** siguió el brief por encima del CONTEXT stale y lo
  reportó en vez de resolverlo en silencio o de seguir el documento equivocado.
- **Review de la Task 8: spec ✅, calidad aprobada, sin Criticals ni Importants.** Las cuatro
  sondas que pedí dieron bien: el separador se afirma **por code point**
  (`formatPEN('4899.99').codePointAt(2)` contra `0x20`), no contra un literal donde U+0020 y
  U+00A0 se ven iguales; ningún monto toca `number` —el agrupado es regex más `String#replace`—;
  `userMessage` quedó trazado como incapaz de lanzar para las siete formas de entrada, porque
  `contractName` lanza en todas las raras y el `try/catch` las cubre; y el import sale del barrel
  y no de `/testing`, verificado contra el mapa de `exports` del paquete.
- **Task 8: complete (commits `9cbb917`..`7a163b2`, review clean).** 50 tests.
- **Minors diferidos al review final:** identificadores en español (`signo`, `entera`,
  `plantilla`, `campos`…) heredados letra por letra de la referencia de la Fase 4 —o se arreglan
  en las dos o en ninguna—; el test del pipe es casi tautológico (`transform = formatPEN` lo
  garantiza); y un camino **teórico** en `user-message.ts:38` donde un `inner` primitivo haría
  que `clave in campos` lance **fuera** del `try/catch`. Ese último roza un requisito categórico
  —«`userMessage` no puede lanzar»— aunque el shape real del `DomainError` no lo produce; existe
  idéntico en la referencia de React Native, así que si se arregla, se arregla en las dos.

### Task 9

- BASE `846e633`.
- **Ruling T9-1 — Angular es la web de escritorio, no una cuarta app móvil, y los estilos no se
  pulen.** El usuario miró la pantalla andando y corrigió la dirección: Android, iOS y React
  Native son las versiones móviles; ésta debe verse como una web de PC, aprovechando el ancho, y
  adaptarse sólo si achicás la ventana. CSS mínimo y funcional: sin sistema de diseño, sin
  tokens, sin temas, sin animaciones. Motivo explícito: es una POC, lo que demuestra es que las
  cuatro apps producen los mismos strings, y el esfuerzo en apariencia no compra nada de eso.
  Se lo mandé al implementador de la Task 9 mientras corría, para que ajuste el CSS y el
  contenedor raíz sin tocar la descomposición ni los tests.
  **Lo que NO cambia:** los labels exactos y el orden de campos de `ui-spec.md`, las cuatro
  pantallas montadas con `[hidden]`, y el pie recibiendo el string como input. **La paridad entre
  las cuatro apps es de contenido y estructura, no de apariencia** — conviene que esto quede
  dicho así en el README de la Task 14, porque un lector que compare capturas va a preguntarlo.
  **Costo si está mal:** la web se ve sosa en la demo. Barato: el criterio de la demo es que los
  strings coincidan carácter por carácter, no el diseño.
- Implementada en `91c9b34`: los seis componentes compartidos y el shell de cuatro pestañas.
  **69 tests**, los tres gates en cero. El `max-width` pasó de 480 a 720 px por el Ruling T9-1.
- **El aparato volvió a encontrar lo que los tests no podían, por segunda fase consecutiva:**
  `[hidden]` **no hacía nada**, porque el `display: flex` de la hoja de estilos pisaba la regla
  `[hidden] { display: none }` del user-agent. O sea que el requisito de que el estado sobreviva
  al cambio de pestaña estaba escrito, implementado… y roto. Un test que afirme `el.hidden ===
  true` **no** lo caza: la propiedad está puesta en los dos casos y el elemento se ve igual. La
  guarda real es leer `getComputedStyle`.
- **Hallazgo transversal de entorno, y hay que anotarlo donde se use:** la verificación visual en
  este entorno **sí es posible por CDP** (Chrome DevTools Protocol) — clicks, tipeo y capturas
  reales—, que es un mecanismo distinto del de AppleScript y no necesita los permisos de
  Accesibilidad ni de Grabación de Pantalla que macOS bloquea acá. Las Fases 3 y 4 dieron por
  imposible la captura y verificaron por vías indirectas. Va al README de la Task 14.
- **Review de la Task 9: spec ✅, calidad aprobada.** El revisor confirmó lo que más importaba:
  la regresión lee `getComputedStyle` y no `.hidden` —o sea que **puede** fallar por el bug real—,
  y el estado se verifica **por valor**, tipeando en Aritmética, cambiando de pestaña y volviendo,
  no sólo comprobando que el nodo siga en el DOM. Los cuatro labels coinciden carácter por
  carácter con el texto normativo de `ui-spec.md`, no con el wireframe que abrevia `Transf.`/`Bm`.
  El pie se testea **sin proveedor del servicio**, que es la prueba de que no lo inyecta.
- **Ruling T9-2 — el único Important era evidencial y lo resolví corriendo el gate yo, no con un
  fix round.** El reporte elidía el cuerpo del output de `pnpm test` con `...`, así que no se
  podía descartar un warning entre líneas. Corrido completo acá: **69/69, exit 0, cero
  coincidencias** de `warn|deprecat|error|failed` en todo el log. Gastar un dispatch más un
  re-review para que alguien vuelva a pegar un texto que yo podía generar en diez segundos no se
  justifica.
  **Costo si está mal:** ninguno — la evidencia es de la misma corrida que pedía el revisor.
- **Task 9: complete (commits `846e633`..`91c9b34`, review clean).** 69 tests.
- **Minors diferidos al review final:** el desglose de conteo del reporte no cierra (45+24 contra
  el 50+19 real, aunque el total de 69 sí es correcto), y el comentario de `app.css:66-74`
  atribuye a especificidad lo que en realidad es **origen de cascada** —una declaración de autor
  le gana a la del user-agent sin importar la especificidad—. El fix es correcto; la explicación
  escrita al lado, no del todo.

### Tasks 10-12 (lote)

- BASE `91c9b34`.
- **Ruling T10-1 — Aritmética, Transferencia y Tarjeta van en UN solo dispatch y UN solo review;
  Benchmark queda aparte.** Las tres son la misma forma —campos de `ui-spec.md`, llamada al core,
  fila de resultado, error por `userMessage`— sobre componentes compartidos que ya existen y ya
  están aprobados, que es exactamente el caso que la skill manda batchear. Benchmark no entra al
  lote: es la única con juicio propio, porque lleva el `baseline` de punto flotante que existe
  para **exhibir** la divergencia y es una de las poquísimas excepciones documentadas a la regla
  de que ningún monto toca `number`.
  **Costo si está mal:** un review más grande y un `git bisect` con un escalón menos. A favor:
  tres ciclos de review se vuelven uno, que es donde de verdad se van los tokens — y el usuario
  pidió explícitamente no quemarlos.
- **Ruling T10-2 — las carpetas de las pantallas van en inglés, contra el texto del plan.** El
  plan escribe `features/aritmetica/aritmetica.component.ts`, pero `CLAUDE.md` incluye
  explícitamente «nombres de archivos, carpetas» en la regla de identificadores en inglés. Mismo
  criterio que los Rulings T2-3 y T6-3: la constraint dura gana sobre el texto del plan, que
  escribí yo. Quedan `features/arithmetic/`, `features/transfer/`, `features/card/` y
  `features/benchmark/` — que además coinciden con los módulos del core (`arithmetic`, `card`,
  `transfer`), así que el nombre de la carpeta y el del módulo de dominio que consume son el
  mismo. Los labels de UI siguen en español, que es lo que manda `ui-spec.md`.
  También se sigue la convención de nombres que ya dejó la Task 9 —`screen-header.ts`, sin el
  sufijo `.component`— y no la del plan, que es anterior al scaffold.
  **Costo si está mal:** un rename de carpetas.
- Implementadas en `fecbae5` (Aritmética), `eebb630` (Transferencia) y `5b9c3d5` (Tarjeta).
  **88 tests / 14 archivos**, los tres gates en cero, verificadas en navegador por CDP contra el
  WASM real.
- **Bug real en `LabeledField`, que es código de la Task 9 ya aprobada y que ningún test de la
  Task 9 podía ver.** El binding declarativo `[value]="value()"` **omite la escritura al DOM**
  cuando el valor nuevo coincide con el último que Angular escribió — aunque el DOM haya cambiado
  por fuera, que es exactamente lo que pasa cuando una persona tipea. Lo reemplazó por un
  `effect()` que compara contra el DOM vivo. **Habría llegado a producción**, no es un artefacto
  de test; el spec de la Task 9 sigue pasando sin tocarlo. Es la tercera vez en la fase que un
  defecto sólo aparece al ejercitar la cosa de verdad, y las tres veces fue en el borde de UI.
- **`ng serve` está roto y hay que decirlo antes de la demo.** El dependency-optimizer de Vite
  falla con `@banco/contract`; es preexistente y recién ahora alcanzable, porque ésta es la
  primera tarea en que una pantalla importa `userMessage`. El implementador lo esquivó con
  `ng build` + servidor estático para las verificaciones por CDP, así que **ningún gate depende
  de `ng serve`** — pero el runbook de demo sí lo usaría. Va al README/PENDING de la Task 14 con
  el workaround exacto. Si el arreglo resulta ser una línea de configuración, entra ahí; si pelea,
  se documenta y se sigue: el CONTEXT es explícito en no quemar tiempo de demo en el build.
- **Review del lote 10-12: las tres spec ✅, calidad aprobada, sin Criticals ni Importants.** El
  revisor no se conformó con que las guardias existieran: verificó que **puedan fallar**. La de
  `Restar` mostraría `'NO DEBE LLAMARSE'` si la rama llamara a `add`; la de los CCI inyecta un
  contrato con ids falsos y afirma **contra ésos**, así que un literal hardcodeado la rompe; la
  del monto captura el `request.amount` real y compara contra `'100.5'`, no contra `'100.50'`
  formateado; y el centinela de Tarjeta es distinto del número tecleado, que es lo único que
  distingue «lo descifró el core» de «la pantalla repitió lo que escribiste».
- **El fix de `LabeledField` quedó validado, incluida la pregunta que importaba:** no hay bucle
  —escribir `el.value` no dispara `input`, así que el `effect()` no se realimenta— y la regresión
  reproduce el modo de fallo exacto: revertir a `'100.00'`, y después revertir **otra vez al mismo
  valor**, que es justo lo que el binding declarativo se saltaba.
- **Tasks 10-12: complete (commits `91c9b34`..`5b9c3d5`, review clean).** 88 tests / 14 archivos.
- **Minors diferidos al review final:** `Comisión ITF` y `Total debitado` sólo se verifican en el
  navegador, no por `data-testid`; el test de «editar consume el error» cubre `setOrigin` pero no
  `setDestination`/`setAmount`, que son idénticos; el patrón imperativo `child.value.set(...)`
  provoca una llamada re-entrante inocua que merece un comentario; y el fallo de `ng serve` sigue
  sin estar escrito en el README —va a la Task 14—.

### Task 13

- BASE `5b9c3d5`.
- Implementada en `b3f572e`. **97 tests**, los tres gates en cero, las cinco guardias verificadas
  por mutación.
- **El número del benchmark no mide nada, y eso hay que resolverlo antes de la demo.** Medido en
  Chrome por CDP con 1000 iteraciones: core p50 **0,00 µs** y p95 **100,00 µs**; nativo 0,00 y
  0,00. La causa está bien diagnosticada: `performance.now()` está cuantizado a ~100 µs por la
  mitigación de Spectre —sin `crossOriginIsolated` no hay reloj fino—, o sea que el reloj es ~100×
  más grueso que lo que se quiere medir. A 999999 iteraciones hasta el p95 del core cayó a 0,00.
  Los percentiles que salen de ahí son artefactos de la cuantización, no del código.
  **El implementador lo dijo en vez de inventarlo, que es exactamente lo que le pedí**, y vale
  reconocerlo: había un camino fácil de fingir paridad con los 172 µs de Android y los 0,33 de
  iOS, y no lo tomó.
  Mi lectura, que mandé al revisor a juzgar sin hedge: una pantalla que siempre muestra
  `0,00 µs` **no exhibe nada mientras parece que funcionó**, y eso es un problema de corrección,
  no cosmético — la pantalla existe para mostrar el costo del cruce. La técnica estándar cuando el
  reloj es más grueso que la operación es **cronometrar lotes de K iteraciones como una muestra**
  y dividir: con muchas muestras, el p50 y el p95 vuelven a significar algo y el problema de
  resolución desaparece. Si el revisor coincide, entra al fix loop.
- **Para el README de la Task 14, dos advertencias que no se deben omitir:** la medición corre en
  el **hilo principal** (sin Web Worker: reinstanciar el WASM ahí quedó fuera de alcance) y el
  número de esta pantalla **no es comparable** con el de las tres apps nativas, que miden con
  relojes de resolución de nanosegundos. Una diferencia de método declarada sirve para la demo;
  presentarla como comparación justa, no.
- **Review de la Task 13: spec ✅ en todo, calidad NO aprobada por un Important — el de la
  medición.** El revisor coincidió sin hedge y lo argumentó mejor que yo: si subir N tres órdenes
  de magnitud hace que el p95 **caiga** a cero en vez de estabilizarse, el número nunca midió el
  costo del cruce, midió cuántas muestras caen bajo el piso de cuantización. Todo lo demás está
  impecable: las cinco guardias verificadas por mutación una por una, los dos párrafos obligatorios
  contrastados contra `ui-spec.md` **y** contra las tres apps anteriores —o sea que es el texto
  establecido entre las cuatro, no una copia del wireframe—, y el archivo de 234 líneas en línea
  con sus hermanos.
- **Segunda causa, que el revisor encontró y yo no había visto:** `measure(n, f: () => void)`
  **descarta el valor de retorno** y las dos llamadas pasan literales constantes en cada
  iteración. Entrada constante + función pura + resultado sin usar es exactamente lo que un JIT
  puede sacar del bucle. Es una explicación de la caída a `0,00` **al menos tan plausible** como
  el calentamiento que proponía el reporte, y arreglar sólo el reloj la dejaría intacta.
- **Task 13: fix round 1 despachado** reanudando al implementador original —contexto intacto— con
  las dos mitades del fix: cronometrar lotes (≥1 ms por lote, ≥20 muestras) y consumir el retorno
  dentro del bucle para blindarlo contra la eliminación de código muerto. Le dejé explícito que si
  tras el arreglo el core sigue saliendo indistinguible del nativo, ése es un resultado legítimo y
  lo quiero tal cual: ahora sería una medición y no un artefacto.
- **Verificado para la Task 14: el cierre de la POC ES ejecutable en esta máquina.** Chequeado
  antes de despachar, para que el implementador no lo descubra a mitad de camino: `adb devices`
  da `emulator-5554 device`, `xcrun simctl` muestra un **iPhone 17 Pro booteado**, Xcode 26.6 y
  cargo 1.98.1. O sea que el Step 2 —las cuatro apps mostrando el mismo `coreVersion()`, que es la
  primera vez que las cuatro existen a la vez— se puede comprobar de verdad y no hay que
  declararlo pendiente.
- **El fix midió, y la POC tiene su cuarto dato.** Con lotes calibrados y el trabajo blindado
  contra la eliminación del JIT: **core p50 1,50 µs / p95 4,70 µs contra nativo 0,07 / 0,08** —
  una brecha real de ~20×. La prueba de que ahora mide no es el número sino su **estabilidad**:
  a 100, 1000 y 999999 iteraciones el p50 del core se queda en el mismo orden de magnitud
  (1,4-1,8 µs) en vez de colapsar a cero.
  Puesto junto a las otras tres: Android 172 µs, iOS 0,33 µs, y WASM ~1,5 µs queda **en el
  medio** — unas cien veces más rápido que el puente JNA de Android y unas cuatro veces más lento
  que el `.a` enlazado estáticamente de iOS. **El método no es el mismo** (acá se cronometran
  lotes porque el reloj del navegador está cuantizado, allá se mide cruce por cruce con relojes
  de nanosegundos), así que la cifra ubica el orden de magnitud y no sirve para una comparación
  centavo a centavo. Eso hay que decirlo en el README y en el runbook.
- **Al re-review, dos cosas con lupa.** (a) El implementador **reescribió las cinco guardias**
  para usar aserciones estructurales en vez de valores exactos, porque el arnés de Angular bloquea
  `vi.mock` sobre imports relativos — reescribir tests para acomodar un cambio es la forma típica
  en que una guardia se debilita en silencio, y la de «una llamada por iteración» es la que más
  puede haber perdido sentido bajo batching. (b) Declara un tope de 2M iteraciones pero reporta
  que 999999 bloquea el hilo principal ~66 s porque la semántica de lotes lo multiplica ~36×:
  **un tope que no topa es peor que ninguno**, porque se lee como protección. Pedí que verifique
  si acota el trabajo de verdad.
- **Task 13: fix round 1/5 (2 addressed, 1 nuevo abierto — I1 batching y I2 anti-DCE cerrados;
  entra el bloqueo de 66 s que introdujo el propio fix; commit `b3f572e`..`3106d62`).**
  El re-review verificó las dos mitades: `timedBatch` cronometra `k` llamadas dentro de **un solo**
  par de `performance.now()`, la calibración duplica hasta pasar 1 ms, y son 5 lotes de
  calentamiento más 30 muestras. El checksum vive en un campo de instancia —no en un local
  descartable— y `varyingOperand` varía la entrada con aritmética **entera sobre el índice**, sin
  tocar un float monetario.
- **Sobre la reescritura de las guardias, que era mi principal sospecha: «cambió de alcance, no la
  vaciaron».** La de «una llamada por iteración» **no puede** sobrevivir literalmente al batching,
  porque el total depende de un `k` que se decide en runtime. La reemplazó por tres invariantes
  estructurales, y el revisor chequeó la aritmética en vez de creerle: `k ≥ n` siempre y los lotes
  son de tamaño `n·2^r`, así que la cota inferior de `36n` y el módulo son invariantes reales, no
  tautologías disfrazadas. La mutación la caza **el módulo**, no el `not.toBe(1)`. Sigue cazando
  las dos regresiones concretas para las que existe.
- **Hallazgo del arnés que vale para cualquier test que mida tiempo:** `vi.useFakeTimers()` **a
  secas congela también `performance.now()`**, lo que forzaba en silencio cada calibración al tope
  y hacía que cada test tardara ~8 s en vez de ~300 ms. Se arregla con
  `toFake: ['setTimeout','clearTimeout']`. Es load-bearing: sin eso, la evidencia de mutación de
  las cinco guardias no sería confiable.
- **Ruling T13-1 — el bloqueo de 66 s entra a round 2 en vez de documentarse y seguir.** El tope
  declarado acota el **tamaño del lote**, no el trabajo total, que es `~36k`; con 999999 tecleado
  el `k` despeja el piso en la primera ronda y ninguno de los dos topes llega a engancharse. En
  una demo en vivo, alguien maximiza el campo y la pestaña queda congelada más de un minuto **sin
  forma de cancelar**. Podría haberlo mandado al runbook como riesgo conocido; no lo hago porque
  el arreglo es acotado —presupuesto de operaciones totales del que se deriven `k` y las
  muestras— y porque el modo de fallo se dispara justo con el gesto más probable de un curioso
  frente a un campo numérico en una demo.
  **Costo si está mal:** una ronda más de fix sobre una pantalla que ya cumple su función.

### Task 13 — fix round 2 (verificación y cierre)

La sesión anterior se cortó a mitad de la verificación por mutación (iba 4/7). Al retomar, el
árbol estaba limpio —ninguna mutación quedó pegada— y la suite daba 99 en verde, así que **rehíce
las siete mutaciones completas** en vez de asumir cuáles habían pasado. Cada una se aplicó con un
arnés que **aborta si el patrón no aparece exactamente una vez**, para no confundir «la guardia
no caza» con «el sed no aplicó».

- **Las siete cazadas, cada una por exactamente su propia guardia** (1 failed / 98 passed en las
  siete, sin daño colateral): nota de recorte que nunca aparece; nota que aparece siempre; se
  quita el recorte al presupuesto; `userMessage` → error crudo; la corrida fallida no borra las
  medidas de la anterior; el filtro deja de topar en 6 dígitos; se altera el texto normativo.
- **Evidencia extra del recorte, que no esperaba y vale más que el assert:** con la mutación que
  quita el clamp, ese test tarda **4341 ms contra 243 ms**. O sea que el presupuesto no sólo se
  afirma, se ve: es lo único que separa 243 ms de un orden de magnitud más.

**Ruling T13-2 — el fix de N2 defiende un camino que el propio fix de N1 volvió inalcanzable.**
Lo encontré con una octava mutación de sonda: cambiar `return lastTested` por `return k` **no
rompe ningún test**. No es una guardia faltante, es código muerto, y lo verifiqué con la
aritmética en vez de deducirlo: `MAX_BATCH_SIZE` = 54054 (2.000.000 / 37), así que aun arrancando
desde el `k` más chico posible (1) la duplicación lo alcanza en la **ronda 16** y el bucle sale
por `k >= MAX_BATCH_SIZE`, **ocho rondas antes** del tope de 24. `MAX_CALIBRATION_ROUNDS` ya no
acota nada: lo acota el presupuesto. El peor caso cierra: 54054 × 36 = **1.945.944 ≤ 2.000.000**.
**No abro un round 3:** el comportamiento es correcto y el código se conserva porque deja de ser
inalcanzable apenas alguien suba `TOTAL_OPERATIONS_BUDGET` (con 10⁹ hacen falta 25 rondas). Lo que
sí era un defecto es el **comentario**, que lo describía como load-bearing y habría hecho que el
próximo lector creyera que ese `return` corre. Corregido en el mismo archivo, con la aritmética.
**Costo si está mal:** un comentario de más sobre una rama que no se ejecuta.

**El fix está verificado contra el WASM real, no sólo contra el doble.** El test unitario usa un
`add` trivial: prueba el **conteo** de llamadas, nunca el **tiempo de pared**, que es justamente
lo que el round 2 promete. Reproduje el método de la Tarea 13 (`ng build` + `python3 -m
http.server` + Chrome headless por CDP, porque `ng serve` sigue roto):

| Iteraciones | core p50 / p95 | nativo p50 | bloqueo | nota de recorte |
|---|---|---|---|---|
| 100 | 3,00 / 7,00 µs | 0,09 µs | 43 ms | no |
| 1000 (default) | 1,50 / 4,90 µs | 0,07 µs | 133 ms | no |
| 999999 (tope) | 1,32 / 2,22 µs | 0,07 µs | **3372 ms** | sí, con las dos cifras |

**El bloqueo de 66 s pasó a 3,4 s —~20× menos— y la pantalla avisa qué corrió de verdad.** Es el
finding N1 cerrado con la medición que lo abrió.

**Ruling T13-3 — un dato del round 1 no era reproducible y lo corrijo en vez de dejarlo pasar.**
El round 1 anotó «~1,4-1,8 µs de p50, estable» para 100, 1000 y 999999, y eso quedó escrito
además **dentro del código**. Es falso en n=100: da **3,00 µs**, y no es ruido — tres corridas por
valor, idénticas al centésimo. La tendencia es monótona (3,00 → 1,50 → 1,32) y tiene causa: lo
reportado es el costo por operación **dentro de un lote**, y a mayor lote más caliente está el JIT
cuando arranca la medición (los `WARMUP_BATCHES` van de ~2.000 llamadas a ~270.000). El round 2 no
tocó el camino de n=100, así que esto ya estaba mal medido antes, no lo introdujo el fix.
**Consecuencia para el README y el runbook:** lo estable de esta pantalla es el **orden de
magnitud** y la brecha contra la baseline nativa (**20-40×**), no la cifra exacta — y **dos
corridas sólo son comparables si tecleaste el mismo valor en Iteraciones**. Corregido el
comentario del código.

**Parqueado para la Task 14 (no es de esta tarea): prettier no es gate en `web-angular`.** Hay
`.prettierrc` pero ningún script ni hook que lo aplique, y **13 archivos del app fallan
`--check`**, incluidos los de las Tareas 1-12 ya revisadas. Correr `--write` ahora reformatearía
esos 13 y reventaría el diff de un commit de fix-round tocando código de otras tareas. Decisión
para la 14: o se cablea el gate y se reformatea todo en **su propio commit**, o se borra el
`.prettierrc`, que es peor que inútil si nadie lo corre.

- **Task 13: fix round 2/5 — N1 y N2 cerrados, sin findings nuevos abiertos. Gates: 99 tests,
  lint limpio, build limpio.** Verificación por mutación 7/7 y en navegador contra el WASM real.

### Task 14 — el cierre de la fase y de la POC

Alcance decidido con el usuario: **saltear las suites lentas de Android e iOS** —sus fases ya las
dejaron en verde y nada de esta fase toca su código— e ir directo a lo único que nunca se había
comprobado: **las cuatro apps mostrando el mismo `coreVersion()`**. Y cablear prettier, que
estaba puesto sin correrse.

- **Prettier era una norma que nadie aplicaba: 13 archivos violaban `--check`**, incluidos los de
  Tareas 1-12 ya revisadas. Se cablearon `format` y `format:check` y se reformateó en **commit
  propio** (`4caf34a`), para no mezclar ruido de formato con cambios de comportamiento. Sin
  cambios funcionales: 99 tests, lint y build en verde después.
- **Docs antes que artefactos, invirtiendo el orden del brief.** El brief ponía la verificación
  del pie (Step 2) antes del commit final (Step 7), y ese orden se invalida a sí mismo: el SHA se
  inyecta en **tiempo de compilación** (`git rev-parse --short HEAD` en el `build.rs` de
  `crates/ffi`), así que cualquier commit posterior desactualiza los cuatro artefactos. Se
  commitearon primero las docs (`3bd5cfc`) y recién después se regeneró todo desde ese HEAD.

**Ruling T14-1 — el verificador ingenuo del pie da falsos negativos, y casi me come.** El primer
chequeo hacía `strings <artefacto> | grep -Eo '1\.0\.0\+[0-9a-f]+'` y devolvía
`1.0.0+3bd5cfcca` — nueve caracteres donde el SHA tiene siete. No era otra versión: **las strings
de Rust no son null-terminated**, así que en el pool del binario la versión queda pegada a la
palabra siguiente (`...3bd5cfc` + `called`) y el `[0-9a-f]+` se come las letras que siguen. Cada
artefacto habría "inventado" un sufijo distinto según qué string tuviera al lado, y el reporte
habría dicho DIVERGENCIA con los cuatro artefactos correctos. El verificador quedó anclado al
string **exacto** `1.0.0+<sha>`.

**Antes de regenerar, los artefactos estaban en tres SHA distintos** — RN en `b5b1388`, WASM en
`318c95e`, Android e iOS en otro. O sea que **las cuatro apps nunca habrían coincidido** en la
demo. Es exactamente la deriva que el primer paso del runbook existe para atrapar, observada en
vivo: no es una precaución teórica.

**Los cuatro pies, verificados EN PANTALLA y no sólo en el binario** (HEAD `3bd5cfc`):

| App | Cómo se leyó | Pie |
|---|---|---|
| Android | `uiautomator dump` sobre el emulador | `1.0.0+3bd5cfc` |
| iOS | captura del simulador (iPhone 17 Pro), leída a ojo | `1.0.0+3bd5cfc` |
| React Native | `uiautomator dump` sobre el emulador | `1.0.0+3bd5cfc` |
| Angular | CDP sobre Chrome headless, WASM real | `1.0.0+3bd5cfc` |

Más los binarios: `.so` de Android, los dos slices del XCFramework, las tres ABIs de `.a` de RN y
el `.wasm`, todos con el string exacto. **Es la primera vez en la POC que las cuatro coinciden.**

**Ruling T14-2 — el aparato encontró un bug que 120 tests no veían, y es de esta fase.** Al
levantar React Native para leer su pie, la app arrancó en **pantalla roja**: `Unable to resolve
module @babel/runtime/helpers/interopRequireDefault from packages/contract/src/messageFor.ts`.
No es el entorno: la Fase 5 sacó el mapeo del contrato a `packages/contract` y RN pasó a
consumirlo, Metro transpila ese TS con Babel —que inyecta `interopRequireDefault`— y **resuelve
los helpers relativo al archivo que transpila**, o sea desde `packages/contract`, que bajo pnpm
estricto sólo veía `typescript` y `@types/node`. Verificado a mano con `require.resolve` desde los
dos directorios antes y después del arreglo.
**Lo grave no es el bug sino lo que revela:** los 120 tests de RN pasaban con la app rota, porque
Jest resuelve distinto que Metro. Es el mismo patrón que el `collapsable={false}` de Fabric en la
Fase 4 — sin corredor de tests en dispositivo, la única red de esa app es el smoke manual, y esta
vez el defecto sobrevivió desde el commit que lo introdujo hasta el día de montar la demo.
Arreglado en `62d7975` y anotado en `apps/react-native/PENDING.md` al lado del caso de Fabric.
**Costo si está mal:** una dependencia declarada de más en un paquete del workspace.

**El commit del arreglo movió HEAD a `62d7975`, y los artefactos siguen valiendo.** No por
descuido: el criterio del runbook no es «el pie coincide con HEAD» sino «los pies coinciden entre
sí **y** `git diff --stat <sha-del-pie>..HEAD -- rust-core/` sale vacío». Sale vacío: lo único que
cambió después son `packages/contract/package.json`, el lockfile y un PENDING.

- **Task 14: complete.** Gates de `web-angular`: 99 tests, lint, build y `format:check`, los
  cuatro en verde. React Native: 120 tests. Las cuatro apps con el mismo pie, en pantalla.
