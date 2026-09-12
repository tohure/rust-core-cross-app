# Fase 5 — `apps/web-angular`: diseño

**Estado:** aprobado, pendiente de plan.
**Entrada:** [`apps/web-angular/CONTEXT.md`](../../../apps/web-angular/CONTEXT.md), escrito
**antes** de que existiera el paquete WASM. Cuatro de sus premisas quedaron falsadas por lo que
la Fase 4 entregó; este documento las corrige y esos cambios hay que propagarlos al CONTEXT.

---

## Qué entrega esta fase

La cuarta y última app de la POC: Angular consumiendo el mismo núcleo de Rust, compilado a
WebAssembly, **sin una sola regla de negocio en TypeScript**. Con ella la tesis queda demostrada
en las cuatro plataformas que el proyecto se propuso: Android nativo, iOS nativo, React Native y
web.

Entrega además la **quinta base de código que corre `contracts/cases.json`** con igualdad exacta
de strings.

---

## Lo que el CONTEXT daba por hecho y no es así

El propio CONTEXT lo anticipa —«La Fase 4 entrega el paquete: contrastá sus `.d.ts` con esta
lista antes de escribir el servicio»—. Contrastado:

| El CONTEXT dice | La realidad de la Fase 4 |
|---|---|
| `await import("@banco/core-financiero")` da el WASM | El `exports` del paquete apunta sólo a `src/index.tsx`, el **turbo module JSI**. Inútil en un navegador |
| El comando es `ubrn build web` | Es `ubrn build wasm2 --config ubrn.wasm.yaml`. Sin ese `--config` **pisa los bindings JSI** |
| El `MoneyPipe` envuelve `Intl.NumberFormat` | `Intl` separa el símbolo con **U+00A0**; las otras tres apps usan **U+0020**. Rompe la comparación |
| Los errores se discriminan con `DomainError.instanceOf(e)` | Falla entre flavours. Se discrimina por `tag` (Ruling P1 de la Fase 4) |

Y una que el CONTEXT no podía saber: el entrypoint generado del WASM lleva **`@ts-nocheck`**,
porque no typechequea.

---

## El riesgo, y por qué ordena todo lo demás

Dos supuestos sostienen la arquitectura de paquetes y **ninguno está verificado**:

1. Que `ubrn build wasm2` acepte escribir su salida **fuera** de `apps/react-native`.
2. Que lo generado funcione importado **como paquete del workspace**, no por ruta relativa.

La Fase 4 ya se quemó con las opiniones de `ubrn` sobre rutas: el `--config` que faltaba escribía
los bindings de wasm dentro de `src/generated/` y rompía el build de la app, con el síntoma lejos
de la causa. Su Task 13 fue exactamente esto —un spike antes de comprometerse con cambios a
`crates/ffi`— y pagó.

**Por eso la fase arranca con un spike.** Si `ubrn` no coopera, el layout de paquetes cambia
entero, y es mejor saberlo antes de escribir código que lo dé por hecho.

---

## Decisiones

### D1 — Tres paquetes, con una responsabilidad cada uno

```
packages/contract/                @banco/contract
  contractName.ts                 variante DomainError → nombre del contrato
  sources.ts                      lectores de cases.json y messages.es.json

packages/core-financiero-wasm/    @banco/core-financiero-wasm
  generated/                      destino de `ubrn build wasm2` — no se edita
  index.ts                        fachada tipada: init + las nueve funciones

apps/web-angular/                 la app
```

**Por qué `@banco/contract` aparte.** El mapeo variante→nombre del contrato lo necesitan ahora
**tres** consumidores: el test de contrato de React Native, la app de React Native y Angular.
Hoy vive en `apps/react-native/src/contractName.ts`; que Angular lo importe de ahí lo ataría al
paquete de React Native, y escribir una segunda copia es lo que el proyecto prohíbe
explícitamente. Es conocimiento **del contrato**, no de un binding ni de un flavour: merece su
propio lugar.

**Por qué el paquete WASM es el destino de generación y no un envoltorio.** El artefacto vive
donde vive su dueño. Y tiene una consecuencia que vale por sí sola: el test de contrato por WASM
de React Native pasa a importar **del paquete**, o sea que prueba exactamente lo que Angular
consume, no una copia.

### D2 — El paquete WASM expone una fachada tipada, no reexporta el `@ts-nocheck`

El entrypoint que genera `ubrn` lleva `@ts-nocheck`: no typechequea, y la Fase 4 lo documentó
como bloqueante conocido y lo tapó.

**Reexportarlo tal cual le daría `any` a Angular en las nueve funciones**, y con eso se cae la
guardia 4 — el `satisfies Record<DomainError['tag'], string>` de `contractName` deja de tener un
tipo real contra el que verificar, y una décima variante del core pasaría en verde en vez de
romper `tsc`.

Ahora que el paquete es nuestro, se escribe a mano una fachada de nueve firmas sobre el módulo
generado. Son ~30 líneas. El `@ts-nocheck` queda **confinado al archivo generado** y Angular
recupera el compilador sosteniendo la frontera, que es la propiedad que el proyecto usa en las
otras tres plataformas.

### D3 — El WASM se carga por **bytes**, y por eso el MIME deja de importar

El CONTEXT llama a servir el `.wasm` con `application/wasm` «el punto donde más tiempo se pierde
en este proyecto», y pre-autoriza abandonar Angular por un Vite mínimo si el builder da pelea.

**Ese plan de contingencia probablemente sobre.** Verificado leyendo
`@ubjs/wasm/dist/core/src/module.js`:

```js
else if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    compiled = await WebAssembly.compile(source);        // ← no mira Content-Type
}
else if (typeof Response !== "undefined" && source instanceof Response) {
    compiled = await WebAssembly.compileStreaming(source); // ← éste sí lo exige
}
```

El `APP_INITIALIZER` hace `fetch(url) → arrayBuffer()` y pasa **bytes**. Se pierde la compilación
en streaming, que para 180 KB es irrelevante.

El plan B del CONTEXT (Vite mínimo) **se conserva escrito**, porque desactivar el riesgo conocido
no es lo mismo que garantizar que el builder de Angular no traiga otro.

### D4 — El formateador va a mano sobre el string, **no** con `Intl.NumberFormat`

El CONTEXT prescribe `Intl`. La Fase 4 lo midió sobre Hermes/Android, Hermes/iOS y Node: los tres
lo soportan y coinciden entre sí, **pero separan el símbolo con U+00A0**, espacio duro. Los
formateadores de Android y de iOS, los dos escritos a mano sobre el string, usan **U+0020**.

`S/ 4,899.99` contra `S/ 4,899.99`: un byte, invisible en pantalla, que rompe la comparación
carácter por carácter que es toda la tesis. Es el peor modo de fallar que existe en esta POC —
el que se ve bien el día de la demo.

Se porta el formateador de `apps/react-native/example/src/format/money.ts`, que ya está probado y
documentado.

### D5 — Errores: se discrimina por `tag`, y el mapeo se reusa

Nada de `DomainError.instanceOf(e)`: compara contra la clase de **su propio módulo** y falla
cuando el error viene de otro flavour. Se discrimina por la presencia de un `tag` reconocible,
igual que en React Native.

El texto de usuario sale de `contracts/messages.es.json`, indexado por **nombre del contrato**, y
la traducción ocurre **en el componente**, no en el servicio: el servicio propaga el error tal
cual. `userMessage` **no puede lanzar** — se llama siempre dentro de un `catch`, y si lanzara la
excepción escaparía del handler. Lleva el fallback que la Fase 4 tuvo que agregarle.

### D6 — Las cinco pantallas, con los labels de `ui-spec.md`

Aritmética, Transferencia, Tarjeta, Benchmark, y el pie de `coreVersion()` visible en las cuatro
— que es la «quinta pantalla» en la nomenclatura de `ui-spec.md`, aunque no sea una pantalla
aparte sino la franja inferior de las otras.
Los labels y el orden de campos son los de [`docs/ui-spec.md`](../../ui-spec.md), textuales.

**Y se contrastan contra el texto normativo, no contra el wireframe ASCII.** La Fase 4 copió
`Transf.` y `Bm` del wireframe —que abrevia por ancho de columna— y quedaron divergiendo de
Android e iOS hasta que el review los cazó.

### D7 — Cuatro bloques, y el test de contrato antes que las pantallas

1. **Spike** — verificar los dos supuestos de generación. Su salida es una respuesta, no código.
2. **Extracción de paquetes** — `@banco/contract` y `@banco/core-financiero-wasm`, con los tests
   de la Fase 4 en verde antes de tocar Angular.
3. **Test de contrato desde Angular** — 28/28 antes de escribir una pantalla.
4. **Las pantallas y el cierre.**

**Por qué la extracción va en su propio bloque:** mover `contractName` toca código ya mergeado. Si
va mezclado con la app nueva y algo se rompe, el fallo no es atribuible; separado, un `git bisect`
lo aísla en un commit.

**Por qué el contrato antes que las pantallas:** es lo que hizo la Fase 4, y que 28/28 pasara
antes de escribir UI fue lo que evitó que las pantallas arrastraran deuda.

---

## El riesgo que no se puede quitar

`wasm32-unknown-unknown` **impone** `panic = "abort"`: el `panic = "unwind"` del perfil se ignora
ahí. **En esta app no existe la red del `catch_unwind`** que uniffi sí tiende en Android y en
iOS. Un pánico del core no vuelve como error del FFI: es un trap de WebAssembly que deja la
instancia del módulo inutilizable y obliga a recargar la página.

Lo único que protege esta app es la disciplina de la regla 5 —cero `panic!`/`unwrap()`/`expect()`
en producción— y los proptests `*_never_panics` del core. **No hay segunda red, y no se debilita.**

Esto no se diseña: se documenta y se respeta.

---

## Lo que esta fase corrige de las anteriores

- `apps/react-native/src/contractName.ts` se muda a `@banco/contract`; React Native lo importa de
  ahí. Su test de contrato por WASM pasa a importar del paquete nuevo.
- `apps/react-native/ubrn.wasm.yaml` apunta su salida al paquete WASM.
- `apps/web-angular/CONTEXT.md` se corrige en los cuatro puntos de la tabla de arriba.

---

## Fuera de alcance

Re.Pack, Module Federation, cliente HTTP, SQLite, runtime async, SSR, PWA, y cualquier
almacenamiento seguro de la clave. Tampoco pantalla de CCI: las cuatro apps tienen **el mismo
juego de pantallas**, y agregar una obliga a agregarla en las cuatro a la vez.

---

## Criterio de cierre

Las tres cosas que `CLAUDE.md` exige, más la que esta fase agrega por ser la última:

1. El test de contrato **28/28** en verde desde Angular.
2. `apps/web-angular/README.md` con los comandos **efectivamente ejecutados** y su diagrama
   Mermaid.
3. Las cuatro pantallas con los labels exactos, y el pie de `coreVersion()` en todas.
4. **Las cuatro apps mostrando el mismo string de `coreVersion()`**, verificado en pantalla. Es
   el primer paso del runbook y, con las cuatro existiendo por primera vez, es también el
   cierre de la POC.
