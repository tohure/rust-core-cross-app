# Pendientes y deuda de `apps/web-angular`

Lo que quedó abierto al cerrar la Fase 5, con el porqué de cada cosa. Nada de acá bloquea la
demo; lo que sí la toca está marcado.

## `ng serve` no funciona, y no es de esta fase — **toca la demo**

El optimizador de dependencias de Vite se rompe con `@banco/contract`, que es un paquete del
workspace consumido por código de producción (`core/user-message.ts`). Es **preexistente**: se
detectó en la Tarea 12, que fue la primera en que una pantalla importó `userMessage`, no la que
lo introdujo.

Workaround, y es el que se usó en **todas** las verificaciones visuales de la fase:

```bash
cd apps/web-angular
pnpm exec ng build --configuration development
cd dist/web-angular/browser && python3 -m http.server 4311
```

**Ningún gate depende de `ng serve`**: los 99 tests corren en jsdom y la verificación en
navegador se hizo por CDP contra ese servidor estático. Pero quien levante la app en vivo lo va a
pisar, así que el runbook usa el servidor estático y no `ng serve`.

No se arregló porque el CONTEXT es explícito en no quemar tiempo de demo en el build, y el
workaround es de dos líneas. Si alguien lo ataca: mirar `optimizeDeps.exclude` para los paquetes
del workspace.

## El benchmark corre en el hilo principal, y no puede no hacerlo

JavaScript en el navegador es de un solo hilo por pestaña. A diferencia de Android
(`withContext(Dispatchers.Default)`) o iOS (`Task.detached`), acá no hay un adaptador de
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

## En wasm no hay red de `catch_unwind`, y no se arregla desde acá

`wasm32-unknown-unknown` **impone** `panic = "abort"`: el `panic = "unwind"` del perfil de
release se ignora en ese target. uniffi envuelve cada llamada en `catch_unwind` para convertir un
pánico de Rust en un error del FFI, y acá esa red **no existe**. Un pánico del core no vuelve como
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

## Minors del review de las Tareas 10-12, diferidos a propósito

Ninguno es de corrección; los tres son de cobertura o de claridad:

- **`Comisión ITF` y `Total debitado` sólo se verifican en el navegador**, no por `data-testid`
  en el spec de Transferencia.
- **El test de «editar consume el error» cubre `setOrigin`** pero no `setDestination` ni
  `setAmount`, que son idénticos.
- **El patrón imperativo `child.value.set(...)`** de `LabeledField` provoca una llamada
  re-entrante inocua que merece un comentario donde ocurre.

## No hay CI

Igual que en las otras tres apps de la POC. Los cuatro gates (`pnpm test`, `pnpm lint`,
`pnpm build`, `pnpm format:check`) se corren a mano. `pnpm format:check` se cableó recién al
cerrar la fase: había un `.prettierrc` que nadie ejecutaba y 13 archivos lo violaban.

## El pie de `coreVersion()` se congela al construir

No es deuda de esta app sino del diseño, y se repite acá porque es lo que invalida una demo sin
avisar: el SHA se inyecta **en tiempo de compilación** (`git rev-parse --short HEAD` en el
`build.rs` de `crates/ffi`). Cada artefacto congela el HEAD del momento en que se construyó, así
que **los cuatro hay que regenerarlos desde el mismo HEAD antes de la demo**, y cualquier commit
posterior los desactualiza a los cuatro. El primer paso del runbook es comparar los cuatro
strings justamente por esto.
