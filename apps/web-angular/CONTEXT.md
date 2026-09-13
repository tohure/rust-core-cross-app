# app-web-angular

App Angular que consume `rust-core` compilado a WebAssembly. Demuestra que el
mismo núcleo corre en el web sin reescribirse y sin migrar el front a React.

Stack: Angular standalone components, TypeScript, WASM generado por
`ubrn build wasm2` desde `apps/react-native`.

> **Corregido al cerrar la Fase 5.** Este archivo se escribió antes de que el paquete WASM
> existiera, y la ejecución falsó cuatro de sus premisas: el nombre del paquete, la forma del
> servicio, el MIME del `.wasm` y los nombres de las carpetas de `features/`. Las cuatro quedaron
> corregidas abajo y marcadas así. Lo construido manda; el detalle está en
> [README.md](README.md) y [PENDING.md](PENDING.md).

## Regla central

Idéntica a React Native, y por la misma razón: **nunca conviertas un monto a
`number`**. Los montos son strings desde el WASM hasta el template.

Cero reglas de negocio en TypeScript. Ni validación de CCI, ni Luhn, ni alícuota de ITF.

## La superficie del core: nueve funciones y cinco Records

Esto es **todo** lo que el core expone después de la Fase 1. No hay cronograma de cuotas,
no hay TCEA y no hay validación de RUC: se recortaron del alcance antes de implementar.
Si algo no está en esta lista, no existe.

```ts
function add(a: string, b: string): string;
function subtract(a: string, b: string): string;
function calculateItf(amount: string): string;
function validateCci(cci: string): ValidCci;
function validateCard(number: string): ValidCard;
function encrypt(text: string, keyHex: string, nonceHex: string): string;
function decrypt(ciphertextHex: string, keyHex: string, nonceHex: string): string;
function executeTransfer(accounts: Account[], request: TransferRequest): TransferResult;
function coreVersion(): string;
```

Las ocho primeras **lanzan** `DomainError`; `coreVersion()` no.

```ts
type Account = { id: string; holder: string; balance: string };
type TransferRequest = { origin: string; destination: string; amount: string };
type TransferResult = {
  accounts: Account[];
  itfFee: string;
  totalDebited: string;
  receipt: string;
  simulatedLatencyMs: number;   // el ÚNICO número de toda la superficie
};
type ValidCci = { bankCode: string; bankName: string; branch: string; account: string };
type ValidCard = { brand: string; masked: string };
```

> **Ya no están derivados: están verificados.** Cuando se escribió esto el paquete WASM no
> existía y los nombres se dedujeron de la regla de uniffi. La Fase 5 los contrastó contra el
> paquete real y la lista de arriba **coincide**: las nueve funciones y los cinco Records salen
> tal cual. Lo único que cambió es el **nombre del paquete**, que es
> `@banco/core-financiero-wasm` y no `@banco/core-financiero` como decía acá — corregido en todo
> este archivo.

**Los identificadores están en inglés; los nombres del contrato, en español.**
`contracts/cases.json` nombra los errores `"Longitud"`, `"DigitoControl"`, `"MismaCuenta"`…
y **ese mapeo no cruza el FFI**: hay que escribir las nueve líneas **en el spec del test de contrato, no
en producción**. En TypeScript la exhaustividad no la da el compilador sola: se consigue
con un `default` que asigne a `never` (`const _exhaustive: never = e.tag`), para que una
décima variante rompa `tsc` en vez de pasar en verde. Ver
[rust-core/FFI.md](../../rust-core/FFI.md).

## Consumir el paquete WASM

El artefacto se genera en `apps/react-native` con `ubrn build wasm2` y se
consume aquí como paquete local del workspace. No lo copies a mano en
`assets/`.

**Premisa corregida en la Fase 5: el servicio quedó SÍNCRONO.** Este archivo bocetaba métodos
`async` con un `await this.ready()` por llamada. Se construyó al revés, y conviene entender por
qué antes de "arreglarlo": el módulo se inicializa **una sola vez al arrancar**, en un app
initializer, y después las nueve funciones se reexportan tal cual. Un `await` por método habría
vuelto `async` a las cuatro pantallas sin ganar nada — el WASM ya está cargado antes de que se
pinte la primera.

```ts
@Injectable({ providedIn: 'root' })
export class CoreFinancieroService {
  add = add;
  subtract = subtract;
  // … las nueve, reexportadas sin envolver
  coreVersion = coreVersion;
}

/** Corre una vez, en el app initializer. Pasa BYTES, no la `Response` — ver «Configuración del build». */
export async function loadCore(): Promise<void> {
  const response = await fetch('core_financiero.wasm');
  if (!response.ok) throw new Error(`… ¿Está construido @banco/core-financiero-wasm?`);
  await initCore(await response.arrayBuffer());
}
```

El chequeo de `response.ok` no es paranoia: el `.wasm` se sirve desde un **symlink** a un
artefacto gitignoreado, y en un clone limpio el server de Angular contesta el `index.html` del
SPA con status 200. Sin ese chequeo, `initCore` recibiría HTML y fallaría con un error opaco de
WebAssembly en vez de decir qué falta construir.

El servicio **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
TypeScript es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración del paquete.

El app initializer precarga el módulo al arranque, de modo que las pantallas no esperen en la
primera interacción. **El detalle que este archivo dejaba a confirmar quedó confirmado:** sí hace
falta una inicialización explícita, es `initCore`, y va en el initializer — no en cada método.

## Errores

Los errores del core llegan como excepciones tipadas; se mapean a mensaje de
usuario en el componente, no en el servicio. ubrn genera para el enum una clase
`DomainError` con un companion `DomainError_Tags`, y como las subclases de `Error` no
responden bien a `instanceof`, se discrimina con `DomainError.instanceOf(e)` y `e.tag`,
con los campos en `e.inner`.

**El `message` del binding es diagnóstico, nunca texto de usuario**: uniffi no
usa los `#[error("...")]` en español del core, arma el mensaje con los campos de
la variante y lo deja vacío para las que no tienen campos (`CheckDigit`,
`SameAccount`). Los nueve textos de usuario, iguales en las cuatro apps, viven
en [`contracts/messages.es.json`](../../contracts/messages.es.json), que esta app
lee igual que `cases.json`. Está indexado por el **nombre del contrato**
(`Longitud`, `DigitoControl`, …) y no por el de la variante, así que el mapeo
`e.tag` → nombre del contrato hace falta **en producción**, y el test de contrato reusa ese
mismo mapeo en vez de escribir el suyo. Va exhaustivo, con el `default` que
asigna a `never`. El porqué del archivo está en
[rust-core/FFI.md](../../rust-core/FFI.md) — "Los mensajes de error en
español NO cruzan el FFI".

## Configuración del build

**Premisa corregida en la Fase 5: el MIME NO hizo falta, y el problema no se manifestó.** Este
archivo advertía que servir el `.wasm` como `application/wasm` era «el punto donde más tiempo se
pierde en este proyecto». No lo fue, y la razón es concreta: `loadCore` pasa **bytes**
(`response.arrayBuffer()`) a `initCore`, y con bytes se usa `WebAssembly.compile`, que **no mira
el `Content-Type`**. Sólo `compileStreaming` lo exige. Se pierde la compilación en streaming, que
para 180 KB es irrelevante.

O sea que esta app **no depende** de cómo el builder sirva el MIME. El `.wasm` se expone como un
symlink en `public/`, que el builder copia como asset.

Lo que sí dio pelea fue otra cosa, y quedó sin arreglar: **`ng serve` se rompe** con el
optimizador de dependencias de Vite sobre `@banco/contract`. El workaround —`ng build` más un
servidor estático— está en [README.md](README.md) y [PENDING.md](PENDING.md). Ahí sí aplicó la
regla de no quemar tiempo de demo en el build.

Nota sobre el pánico, que en esta app no es teoría: `wasm32-unknown-unknown` impone
`panic = "abort"`, así que **acá no existe la red del `catch_unwind` de uniffi** que sí
tienen Android e iOS. Un pánico del core no vuelve como error: es un trap que deja la
instancia del módulo inutilizable y obliga a recargar la página. Ver
[rust-core/PENDING.md](../../rust-core/PENDING.md) — "En wasm no hay red de
`catch_unwind`, y no se puede arreglar desde acá".

## Estructura

**Premisa corregida en la Fase 5: las carpetas van en INGLÉS.** Este archivo las listaba en
español (`aritmetica/`, `transferencia/`, `tarjeta/`), contra la regla de identificadores del
[CLAUDE.md](../../CLAUDE.md) — todo identificador en inglés, en las cinco bases de código. Lo
construido, que es lo que manda:

```
src/app/
├── core/core-financiero.service.ts    único punto de contacto con el WASM (SÍNCRONO)
├── core/user-message.ts               DomainError → texto de usuario, en el borde de UI
├── contract/sources.ts
├── format/money.pipe.ts
├── ui/                                7 componentes compartidos por las cuatro pantallas
└── features/
    ├── arithmetic/
    ├── transfer/
    ├── card/
    └── benchmark/          incluye baseline.ts, la implementación en `number` que diverge
```

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el spec del test de contrato. Este CONTEXT listaba además un feature `validador-cci/` que
ninguna de las otras tres apps tiene; se sacó por la regla de paridad del
[CLAUDE.md](../../CLAUDE.md) —las cuatro apps tienen **las mismas cinco pantallas**—. Si se
quiere pantalla de CCI, se agrega **en las cuatro a la vez**.

## Formateo

Una función pura `formatPEN(amount: string): string` y un `MoneyPipe` de una línea que la
envuelve (`transform = formatPEN`). La función es la que lleva los tests; el pipe es
ceremonia de Angular.

**No uses `Intl.NumberFormat`.** La Fase 4 lo midió: con `style: "currency"` separa el
símbolo con **U+00A0**, y las otras tres apps usan **U+0020**. Es un byte invisible que en
pantalla no se ve y que rompe la comparación carácter por carácter sobre la que se apoya
toda la POC. El agrupado de miles se hace **manipulando el string**, nunca convirtiendo a
número, y el signo se trata **antes** de agrupar —por eso `-123456.78` sale como
`S/ -123,456.78`, con el menos fuera del agrupado—. Se porta de
[`apps/react-native/example/src/format/money.ts`](../react-native/example/src/format/money.ts),
que ya resolvió las dos cosas.

Tampoco uses `CurrencyPipe` de Angular: espera un `number` y ahí se pierde la precisión.

## El campo de monto acepta 2 decimales como máximo

Requisito de UI, igual en las cuatro apps. El core ya rechaza un monto con más decimales
—`InvalidAmount`, `"MontoInvalido"` en el contrato, caso `tr-007`—, pero **el usuario no
tiene que llegar hasta ahí**: es una demo y la pantalla tiene que verse bien. El límite se
fuerza en el campo, no en el core.

```html
<!-- nunca type="number": el valor llega como `number` y ahí se pierde la precisión -->
<input type="text" inputmode="decimal" [value]="monto()" (input)="onMonto($event)"
       placeholder="Monto" />
```

```ts
private static readonly MONTO = /^\d{0,9}(\.\d{0,2})?$/;

onMonto(e: Event) {
  const input = e.target as HTMLInputElement;
  if (TransferenciaComponent.MONTO.test(input.value)) this.monto.set(input.value);
  else input.value = this.monto();   // filtro de texto: se descarta la última tecla
}
```

Tres cosas que no son opcionales:

1. **Es un filtro de texto, no una regla de negocio.** No parsea, no redondea, no calcula:
   decide si el string que el usuario acaba de teclear se acepta en el campo. Quien valida
   sigue siendo el core, y `tr-007` sigue probándolo en el test de contrato.
2. **El string viaja al core tal como se tecleó:** punto decimal, sin `S/` y sin
   separadores de miles. Verificado contra el core: `"1,50"`, `"1 000.50"` y `"S/ 100.00"`
   devuelven `InvalidAmount`. El teclado `inputmode="decimal"` de un móvil con locale es-PE
   puede ofrecer coma: el filtro de arriba la descarta, que es justo lo que hay que hacer.
3. **La pantalla de Aritmética no lleva este límite.** Ahí el contrato acepta escala libre
   en la entrada (`ar-001` es `"0.1"`); los 2 decimales son normativos solo para la
   transferencia.

## Pantallas

Las mismas cinco en las cuatro apps, con los mismos labels y el mismo orden de campos, para
que la comparación lado a lado en la demo sea limpia: **Aritmética, Transferencia, Tarjeta,
Benchmark**, y el pie con `coreVersion()` visible en las cuatro.

**Los wireframes, los labels exactos y el orden de campos viven en
[`docs/ui-spec.md`](../../docs/ui-spec.md)** — normativo para las cuatro apps. No se
duplican acá: cuatro copias de la misma lista divergen, que es justo lo que la demo no puede
permitirse. Cambiar un label obliga a cambiarlo en las cuatro apps y en ese archivo, en el
mismo cambio.

## Pruebas

Spec que lee `contracts/cases.json` y compara strings exactos. Debe pasar con
los mismos resultados que Android, iOS y RN.

## Prohibiciones

- No uses `number`, `parseFloat` ni aritmética sobre montos.
- No uses `Intl.NumberFormat` sobre montos: separa con U+00A0 y las otras tres apps usan
  U+0020. Ver «Formateo».
- No uses `CurrencyPipe` de Angular sobre montos del core.
- No agregues `decimal.js` ni equivalentes.
- No copies el `.wasm` manualmente entre proyectos.
