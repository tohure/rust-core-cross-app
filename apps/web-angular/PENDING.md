# Pendientes y deuda de `apps/web-angular`

Lo que quedó abierto al cerrar la Fase 5, con el porqué de cada cosa. Nada de aquí bloquea la
demo; lo que sí la toca está marcado.

> **Qué es este archivo, para no leerlo mal.** Es un registro de **decisiones tomadas y huecos
> conocidos**, no una lista de tareas. Buena parte de lo que hay aquí está cerrado o se decidió
> no hacer, y sigue escrito a propósito: **el valor está en el porqué**, que es lo que evita que
> alguien reabra la discusión dentro de seis meses o "arregle" algo que es deliberado. Que el
> archivo se llame `PENDING.md` no significa que todo lo de adentro esté pendiente.
>
> **Lo que sigue genuinamente abierto, al 2026-09-17:**
>
> - **`MAX_CALIBRATION_ROUNDS` ya no acota nada** — código inalcanzable, la única deuda de esta
>   app que se podría borrar hoy.
> - **En wasm no hay red de `catch_unwind`** — no se arregla desde aquí.
> - **`@ts-nocheck` en el generado** — aceptado, con su razón.
>
> Lo demás son hechos que conviene tener escritos —que el benchmark no es comparable con el de
> las otras tres, que el pie se congela al construir— o decisiones, como la de no tener CI.

> **Lo transversal no está aquí.** El cuadro comparativo de los cuatro benchmarks —medidos en
> aparatos físicos y cerrado en la Fase 7—, la ausencia
> de CI en las cinco bases de código, el `catch` genérico que muestra texto de diagnóstico como
> mensaje de usuario, las divergencias de paridad abiertas y la regla de que un `Record` de uniffi
> se reemplaza y no se muta viven en
> **[docs/cross-app-pending.md](../../docs/cross-app-pending.md)**. Un tema, un dueño: antes estaban escritos con distintas
> palabras en tres archivos, y corregirlo en uno dejaba mintiendo a los otros dos.


## ~~`ng serve` no funciona~~ — ARREGLADO

**Funciona.** `pnpm exec ng serve` levanta la app en `http://localhost:4200/` con recarga
automática, igual que en cualquier proyecto Angular.

El diagnóstico anterior —«el optimizador de dependencias de Vite se rompe con
`@banco/contract`»— era **el primero de dos fallos encadenados**, y por eso parecía irreparable:
arreglado ése, aparecía el siguiente.

**Fallo 1: `@banco/contract` se consume como fuente TypeScript.** Su `exports` apunta a
`./src/index.ts`, y ese archivo reexporta con rutas sin extensión (`from './messageFor'`). El
pre-bundler de Vite es esbuild sin la resolución de TypeScript, así que no las encuentra:

```
✘ [ERROR] Could not resolve "./messageFor"
    ../../packages/contract/src/index.ts:9:27
```

Se resuelve **excluyéndolo del pre-bundling**, en `angular.json`:

```json
"serve": { "configurations": { "development": {
  "prebundle": { "exclude": ["@banco/contract"] }
} } }
```

**Fallo 2, el que estaba tapado: `@banco/core-financiero-wasm` no era autocontenido.** Su `build`
marcaba `@ubjs/wasm` y `@ubjs/core` como externos, así que su `dist/index.js` salía con imports
desnudos. `ng build` los resuelve porque esbuild parte de la ubicación real del archivo y llega al
`node_modules/` del propio paquete; **el dev-server no**, porque Vite los resuelve desde la raíz
de la app Angular, donde pnpm no los hoistea:

```
Failed to resolve import "@ubjs/wasm/core" from ".angular/vite-root/web-angular/main.js"
```

Se resuelve sacando los dos `--external` del build de ese paquete. **Es lo correcto
independientemente de Vite**: ese paquete no se publica, lo consume sólo esta app, y un artefacto
de navegador debería traer su runtime adentro. El `dist/index.js` pasó de 106 KB con imports
desnudos a 106 KB autocontenido — el `.wasm` viaja aparte y no cambió.

**Lo que se probó, no deducido:** `ng serve` levanta, la app renderiza las cuatro pantallas y el
pie muestra `1.0.0+959025f`, o sea que el WASM cruzó de verdad. Los 102 tests siguen verdes, el
build de producción también, y los 129 de React Native —que consumen el mismo paquete WASM por
otro camino— tampoco se movieron.

## El benchmark corre en el hilo principal, y no puede no hacerlo

JavaScript en el navegador es de un solo hilo por pestaña. A diferencia de Android
(`withContext(Dispatchers.Default)`) o iOS (`Task.detached`), aquí no hay un adaptador de
concurrencia liviano: sacar el bucle del hilo principal exige **reinstanciar el módulo WASM en un
Web Worker**, que es infraestructura nueva y quedó fuera de alcance.

Consecuencia medida: la pestaña se bloquea 43 ms con `Iteraciones = 100`, 133 ms con el default
de 1000, y **3372 ms** con el tope de 999999. El `setTimeout(0)` del código no saca nada del hilo
principal: sólo cede un tick para que se pinte el spinner antes de bloquear.

## Los números del benchmark no son comparables con los de las otras tres apps

Y hay que decirlo al presentarlo, no omitirlo. El `performance.now()` del navegador está
cuantizado a ~100 µs por la mitigación anti-Spectre (sin `crossOriginIsolated` no hay reloj
fino), o sea ~100× más grueso que lo que se quiere medir. Por eso esta pantalla **cronometra
lotes** de K llamadas y divide, mientras Android e iOS miden cruce por cruce con relojes de
nanosegundos.

**Es una diferencia de método, no de escala.** Declarada sirve para la demo; presentada como
comparación justa, no.

### Y el número depende de `Iteraciones`

Medido en Chrome headless contra el WASM real, tres corridas por valor, idénticas al centésimo:

| Iteraciones | core p50 | core p95 | baseline nativa p50 | bloqueo |
|---|---|---|---|---|
| 100 | 3,00 µs | 7,00 µs | 0,09 µs | 43 ms |
| 1000 (default) | 1,50 µs | 4,90 µs | 0,07 µs | 133 ms |
| 999999 (tope) | 1,32 µs | 2,22 µs | 0,07 µs | 3372 ms |

La tendencia es monótona y tiene causa: lo reportado es el costo por operación **dentro de un
lote**, y a mayor lote más caliente está el JIT cuando arranca la medición (los lotes de
calentamiento van de ~2.000 llamadas a ~270.000). **Lo estable es el orden de magnitud y la
brecha de 20-40× contra la baseline**, no la cifra. Dos corridas sólo se comparan si se tecleó el
mismo valor.

## `MAX_CALIBRATION_ROUNDS` ya no acota nada, y el código que lo respalda es inalcanzable

`MAX_BATCH_SIZE` se deriva del presupuesto de operaciones totales y vale 54054 (2.000.000 / 37).
Arrancando desde el `k` más chico posible (1), la duplicación lo alcanza en la **ronda 16**, ocho
antes del tope de 24: el bucle siempre sale por `k >= MAX_BATCH_SIZE` y el `return` de después
del `for` **no se ejecuta nunca**. Verificado por mutación: cambiarlo por `return k` no rompe
ningún test.

Se conservan los dos —el tope de rondas y el `lastTested` que devuelve un tamaño efectivamente
cronometrado— porque dejan de ser inalcanzables apenas alguien suba `TOTAL_OPERATIONS_BUDGET`
(con 10⁹ hacen falta 25 rondas). El comentario del código lo dice así, con la aritmética, para
que nadie lo lea como si corriera.

## En wasm no hay red de `catch_unwind`, y no se arregla desde aquí

`wasm32-unknown-unknown` **impone** `panic = "abort"`: el `panic = "unwind"` del perfil de
release se ignora en ese target. uniffi envuelve cada llamada en `catch_unwind` para convertir un
pánico de Rust en un error del FFI, y aquí esa red **no existe**. Un pánico del core no vuelve como
`DomainError`: es un trap de WebAssembly que deja la instancia del módulo inutilizable y obliga a
recargar la página.

Lo único que protege esta app es la disciplina del core (regla 5 del CLAUDE.md: cero
`panic!`/`unwrap()`/`expect()` en producción) y los proptests `*_never_panics`. **No hay segunda
red: no la debiliten.** Ver [`rust-core/PENDING.md`](../../rust-core/PENDING.md).

## `@ts-nocheck` en el generado, y por qué queda ahí

`packages/core-financiero-wasm/generated/index.ts` no pasa `tsc`; el `pnpm wasm:generate` le pega
`@ts-nocheck` como parte del build. La directiva queda **confinada** a `generated/`:
`src/index.ts` envuelve ese generado a mano con una superficie tipada y estable, que es lo que la
app consume. Quitar el `@ts-nocheck` rompe el typecheck del paquete; mover la fachada a
`generated/` la haría desaparecer en la próxima regeneración.

## ~~Minors del review de las Tareas 10-12~~ — CERRADOS en la Fase 6

Los tres eran de cobertura o de claridad, ninguno de corrección, y los tres están cerrados:

- **`Comisión ITF` y `Total debitado` sólo se verificaban en el navegador.** No tenían
  `data-testid`, así que el spec no podía mirarlos — y son justamente los dos números que la demo
  compara centavo a centavo entre las cuatro apps. Ahora los tiene y hay un test que los aserta
  formateados (`S/ 0.01`, `S/ 100.01`), con timers falsos, porque la pantalla espera
  `simulatedLatencyMs` antes de pintar y con `whenStable()` todavía no están en el DOM.
- **El test de «editar consume el error» cubría sólo `setOrigin`.** Ahora es `it.each` sobre los
  tres campos. Eran idénticos en implementación, y por eso mismo se daba por cubiertos los otros
  dos: así es como una regresión en `setAmount` pasa desapercibida.
- **La llamada re-entrante de `child.value.set(...)`** está documentada **donde ocurre**, en
  `LabeledField.onInput`, con la cadena completa y el argumento de por qué termina en el segundo
  `set` en vez de ciclar.

De paso, una trampa que costó una compilación rota y que conviene no volver a pisar: **el
`template` de un componente es un template literal**, así que un backtick dentro de un comentario
HTML lo cierra a la mitad. El error sale en `styles:`, veinte líneas más abajo.

## No hay CI, y es una decisión, no un olvido

Igual que en las otras tres apps de la POC, y **se decidió que quede así**: el razonamiento está
en [docs/cross-app-pending.md](../../docs/cross-app-pending.md). Los cuatro gates (`pnpm test`,
`pnpm lint`, `pnpm build`, `pnpm format:check`) se corren a mano. `pnpm format:check` se cableó recién al
cerrar la fase: había un `.prettierrc` que nadie ejecutaba y 13 archivos lo violaban.

## El pie de `coreVersion()` se congela al construir

No es deuda de esta app sino del diseño, y se repite aquí porque es lo que invalida una demo sin
avisar: el SHA se inyecta **en tiempo de compilación** (`git rev-parse --short HEAD` en el
`build.rs` de `crates/ffi`). Cada artefacto congela el HEAD del momento en que se construyó, así
que **los cuatro hay que regenerarlos desde el mismo HEAD antes de la demo**, y cualquier commit
posterior los desactualiza a los cuatro. El primer paso del runbook es comparar los cuatro
strings justamente por esto.
