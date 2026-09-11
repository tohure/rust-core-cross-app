# app-web-angular

App Angular que consume `rust-core` compilado a WebAssembly. Demuestra que el
mismo núcleo corre en el web sin reescribirse y sin migrar el front a React.

Stack: Angular standalone components, TypeScript, WASM generado por
`ubrn build web` desde `apps/react-native`.

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

> **Estos nombres están derivados, no generados.** Los de Kotlin y Swift se leyeron de
> bindings reales en la Fase 1; el paquete WASM lo produce `ubrn build web` en la Fase 4 y
> todavía no existe, así que los de acá salen de la misma regla de uniffi ya verificada en
> las otras dos plataformas —`snake_case` de Rust a lowerCamelCase, campos de Record
> camelCase—. **La Fase 4 entrega el paquete: contrastá sus `.d.ts` con esta lista antes de
> escribir el servicio**, y si algo difiere se corrige acá y en
> [`../react-native/CONTEXT.md`](../react-native/CONTEXT.md), que describe la misma
> superficie.

**Los identificadores están en inglés; los nombres del contrato, en español.**
`contracts/cases.json` nombra los errores `"Longitud"`, `"DigitoControl"`, `"MismaCuenta"`…
y **ese mapeo no cruza el FFI**: hay que escribir las nueve líneas **en el spec del test de contrato, no
en producción**. En TypeScript la exhaustividad no la da el compilador sola: se consigue
con un `default` que asigne a `never` (`const _exhaustive: never = e.tag`), para que una
décima variante rompa `tsc` en vez de pasar en verde. Ver
[rust-core/FFI.md](../../rust-core/FFI.md).

## Consumir el paquete WASM

El artefacto se genera en `apps/react-native` con `ubrn build web` y se
consume aquí como paquete local del workspace. No lo copies a mano en
`assets/`.

El módulo WASM se carga de forma asíncrona una sola vez, en un servicio con
`providedIn: 'root'`:

```ts
@Injectable({ providedIn: "root" })
export class CoreFinancieroService {
  private core?: typeof import("@banco/core-financiero");

  private async ready() {
    if (!this.core) this.core = await import("@banco/core-financiero");
    return this.core;
  }

  async transfer(accounts: Account[], request: TransferRequest) {
    return (await this.ready()).executeTransfer(accounts, request);
  }

  async encryptCard(number: string, keyHex: string, nonceHex: string) {
    return (await this.ready()).encrypt(number, keyHex, nonceHex);
  }
}
```

El servicio **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
TypeScript es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración del paquete.

Usa un `APP_INITIALIZER` para precargar el módulo al arranque, de modo que las
pantallas no tengan que esperar en la primera interacción.

Un detalle a confirmar en la Fase 4, cuando el paquete exista: **un módulo WASM suele
exigir una inicialización explícita** (un `default export` de init, o un `initSync`) antes
de la primera llamada. Si `ubrn build web` la genera, el `APP_INITIALIZER` es el lugar donde
va — no cada método.

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

El `.wasm` debe servirse con MIME `application/wasm`. Con el builder de
Angular basado en esbuild, decláralo como asset y verifica en la pestaña
Network que no llegue como `text/html`. Este es el punto donde más tiempo se
pierde en este proyecto.

Si el builder de Angular da pelea, **no quemes tiempo de demo ahí**: levanta
la pantalla en un Vite mínimo, deja la integración Angular documentada como
pendiente, y sigue. La POC no se juega en esto.

Nota sobre el pánico, que en esta app no es teoría: `wasm32-unknown-unknown` impone
`panic = "abort"`, así que **acá no existe la red del `catch_unwind` de uniffi** que sí
tienen Android e iOS. Un pánico del core no vuelve como error: es un trap que deja la
instancia del módulo inutilizable y obliga a recargar la página. Ver
[rust-core/PENDING.md](../../rust-core/PENDING.md) — "En wasm no hay red de
`catch_unwind`, y no se puede arreglar desde acá".

## Estructura

src/app/
├── core/core-financiero.service.ts    único punto de contacto con el WASM
├── format/money.pipe.ts
└── features/
    ├── aritmetica/
    ├── transferencia/
    ├── tarjeta/
    └── benchmark/          incluye baseline.ts, la implementación en `number` que diverge

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el spec del test de contrato. Este CONTEXT listaba además un feature `validador-cci/` que
ninguna de las otras tres apps tiene; se sacó por la regla de paridad del
[CLAUDE.md](../../CLAUDE.md) —las cuatro apps tienen **las mismas cinco pantallas**—. Si se
quiere pantalla de CCI, se agrega **en las cuatro a la vez**.

## Formateo

Un `MoneyPipe` que envuelve `Intl.NumberFormat("es-PE", { style: "currency",
currency: "PEN" })` y recibe el string del core. No uses `CurrencyPipe` de
Angular directamente: espera un `number` y ahí se pierde la precisión.

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
- No uses `CurrencyPipe` de Angular sobre montos del core.
- No agregues `decimal.js` ni equivalentes.
- No copies el `.wasm` manualmente entre proyectos.
