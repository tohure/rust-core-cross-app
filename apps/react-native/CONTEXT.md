# app-react-native

App React Native que consume `rust-core` vía Turbo Module generado por
`uniffi-bindgen-react-native` (CLI `ubrn`). Este proyecto también produce el
paquete WASM que consume la app Angular.

Stack: React Native con nueva arquitectura obligatoria, TypeScript, ubrn.

## Regla central

**Cero reglas de negocio en TypeScript.** Ni una validación de CCI con regex,
ni un algoritmo de Luhn, ni una multiplicación sobre un monto. Este punto es
más importante aquí que en las otras apps: en JS los montos se calculan con
`double` IEEE-754 y eso es exactamente el problema que la POC ataca.

**Nunca conviertas un monto a `Number`.** Ni con `parseFloat`, ni con `+`, ni
con `Number()`. Los montos son strings desde el core hasta el `<Text>`.

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
> bindings reales en la Fase 1; `ubrn` es toolchain de la Fase 4 y todavía no está
> instalado, así que los de acá salen de la misma regla de uniffi ya verificada en las
> otras dos plataformas —`snake_case` de Rust a lowerCamelCase, campos de Record
> camelCase— y de la documentación de ubrn, que genera cada Record como un `type` de
> objetos planos. **Al primer `ubrn build android --and-generate`, contrastá
> `src/generated/` con esta lista antes de escribir el adapter**: si algo difiere, manda el
> archivo generado y se corrige acá.

**Los identificadores están en inglés; los nombres del contrato, en español.**
`contracts/cases.json` nombra los errores `"Longitud"`, `"DigitoControl"`, `"MismaCuenta"`…
y **ese mapeo no cruza el FFI**: hay que escribir las nueve líneas **en producción**, en la
librería, y el test de contrato **reusa esa misma función** en vez de escribir su copia — así se
verifica contra `cases.json` el mapeo que la UI usa de verdad. En TypeScript la exhaustividad no
la da el compilador sola: se
consigue con un `default` que asigne a `never` (`const _exhaustive: never = e.tag`), para
que una décima variante rompa `tsc` en vez de pasar en verde. Ver
[rust-core/FFI.md](../../rust-core/FFI.md).

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el test de contrato. Si se decide darles pantalla, se agrega **en las cuatro apps a
la vez** — la paridad es la demo.

## Configuración

`ubrn.config.yaml` en la raíz del proyecto:

    rust:
      directory: ../../rust-core
      manifestPath: crates/ffi/Cargo.toml
    bindings:
      cpp: cpp/bindings
      ts: src/generated
    android:
      targets: [arm64-v8a, armeabi-v7a, x86_64]

El WASM se produce con el flavour **`wasm2`**, que compila el crate una sola vez para
`wasm32-unknown-unknown` y lee la metadata de uniffi del propio `.wasm`. No genera crate shim y
su salida es neutral respecto del entorno: el mismo bundle sirve para Node, navegador y React
Native. Requisitos que `ubrn build wasm2` valida por adelantado: que el crate produzca `cdylib`,
que enlace `uniffi-runtime-wasm`, y que declare `uniffi_core` con el feature `single-threaded`.

Scripts en `package.json`:

    "ubrn:android": "ubrn build android --and-generate",
    "ubrn:ios": "ubrn build ios --and-generate && (cd example/ios && pod install)",
    "ubrn:wasm": "ubrn build wasm2 --and-generate",
    "ubrn:clean": "rm -rf cpp/ src/generated src/generated-napi src/generated-wasm"

Dependencias que el código generado necesita, y que no son opcionales:

| Paquete | Para qué |
|---|---|
| `uniffi-bindgen-react-native` | el CLI `ubrn` **y** el runtime C++/JSI contra el que compila el turbo module. Dependencia regular, no de desarrollo |
| `@ubjs/core` | el runtime TypeScript —converters de FFI, `RustBuffer`, polyfills— que importa todo lo generado, en los tres flavours |
| `@ubjs/node` | el addon N-API que carga el `cdylib` para el test de contrato del host |

`src/generated/` es artefacto: nunca lo edites ni lo comitees modificado.

## Estructura

Este proyecto es **una librería con una app de demo adentro**, no una app suelta. `ubrn` genera
archivos de librería —`codegenConfig` en `package.json`, un podspec, un `android/build.gradle`,
un `CMakeLists.txt` y un `index.tsx` que es *el entrypoint de la librería*—, y ésa es además la
frontera que la Fase 5 necesita: Angular consume un paquete instalable, no una app.

    apps/react-native/            el paquete
    ├── src/
    │   ├── generated/            bindings JSI · NO EDITAR
    │   ├── generated-napi/       bindings N-API · NO EDITAR
    │   ├── generated-wasm/       bindings wasm2 + .wasm · NO EDITAR
    │   └── index.tsx             entrypoint: las nueve funciones
    ├── __tests__/                contrato N-API · contrato WASM · guardias
    ├── __benchmarks__/baseline.ts
    └── example/                  LA APP DE LA DEMO
        └── src/
            ├── adapter/ contract/ format/
            ├── ui/components/
            ├── screens/          arithmetic · transfer · card · benchmark
            └── benchmark/        NativeBaseline.ts

**Son tres directorios generados y no uno**, porque son tres flavours del mismo core. Mezclarlos
sería el modo de fallar más caro de esta fase: un test en verde contra bindings que no son los
que la app embarca.

`example/` **nunca importa uniffi**: importa el paquete. Ése es el mismo desacople que la
evaluación técnica de Android pide para `:app` frente a `:core-financiero`, conseguido por
frontera de paquete en vez de módulo Gradle.

## Cómo consumir el core

El adapter de la app vive en `example/src/adapter/core.ts` y consume **el paquete**:

```ts
import {
  add, subtract, calculateItf, validateCci, validateCard,
  encrypt, decrypt, executeTransfer, coreVersion,
} from "@banco/core-financiero";

export const core = {
  add, subtract, calculateItf, validateCci, validateCard,
  encrypt, decrypt, executeTransfer, coreVersion,
};
```

**No importa desde `src/generated/`, y ésa es la frontera entera.** El único archivo que toca lo
generado es `src/index.tsx`, el entrypoint de la librería, que reexporta las nueve funciones. Así
`example/` no sabe que debajo hay uniffi, y el nombre del archivo generado —que lo decide `ubrn`
a partir del crate, y hay que **confirmarlo en la primera generación**— deja de ser asunto de la
app.

El adapter **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
TypeScript es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración de bindings.

Los errores llegan como excepciones tipadas. Captúralas en la pantalla y
mapea a mensaje de usuario ahí, no en el adapter. ubrn genera para el enum una clase
`DomainError` con un companion `DomainError_Tags`. La discriminación va **por la presencia de
`tag`**, no por identidad de clase:

```ts
import { DomainError_Tags } from "@banco/core-financiero";

try {
  const r = core.executeTransfer(accounts, request);
} catch (e) {
  switch ((e as { tag?: unknown }).tag) {
    case DomainError_Tags.InvalidAmount: /* e.inner trae los campos */ break;
    // … las nueve, y un default que asigne a `never`
  }
}
```

**Por qué no `DomainError.instanceOf(e)`, aunque el binding lo ofrezca.** Compara contra la clase
**de su propio módulo**, y eso falla en los dos sitios donde esta fase lo necesita: los tests de
las pantallas lanzan dobles de prueba —objetos planos con `tag`, que no son instancias de nada—,
y el test de contrato por WASM recibe errores del módulo wasm, que **no son instancias de la
clase del módulo JSI**. En los dos casos devuelve `false` y el mapeo se rompe entero. Discriminar
por `tag` funciona en los tres flavours y con dobles. Lo que **no** cambia es el `switch`: sigue
exhaustivo y sigue llevando el `default` que asigna a `never`, que es lo que hace que una décima
variante rompa `tsc` en vez de pasar en verde.

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

## El campo de monto acepta 2 decimales como máximo

Requisito de UI, igual en las cuatro apps. El core ya rechaza un monto con más decimales
—`InvalidAmount`, `"MontoInvalido"` en el contrato, caso `tr-007`—, pero **el usuario no
tiene que llegar hasta ahí**: es una demo y la pantalla tiene que verse bien. El límite se
fuerza en el campo, no en el core.

```tsx
const MONTO = /^\d{0,9}(\.\d{0,2})?$/;

<TextInput
  value={monto}
  onChangeText={(nuevo) => { if (MONTO.test(nuevo)) setMonto(nuevo); }}  // filtro de texto
  keyboardType="decimal-pad"
  placeholder="Monto"
/>
```

Tres cosas que no son opcionales:

1. **Es un filtro de texto, no una regla de negocio.** No parsea, no redondea, no calcula:
   decide si el string que el usuario acaba de teclear se acepta en el campo. Quien valida
   sigue siendo el core, y `tr-007` sigue probándolo en el test de contrato. `MONTO.test(...)` opera
   sobre el string: no hay `Number` de por medio, y no puede haberlo.
2. **El string viaja al core tal como se tecleó:** punto decimal, sin `S/` y sin
   separadores de miles. Verificado contra el core: `"1,50"`, `"1 000.50"` y `"S/ 100.00"`
   devuelven `InvalidAmount`. El `decimal-pad` de un dispositivo con locale es-PE puede
   ofrecer coma: el filtro de arriba la descarta, que es justo lo que hay que hacer.
3. **La pantalla de Aritmética no lleva este límite.** Ahí el contrato acepta escala libre
   en la entrada (`ar-001` es `"0.1"`); los 2 decimales son normativos solo para la
   transferencia.

## Formateo

`Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })` recibe el
string del core. Si Hermes no tiene Intl completo en la versión que uses,
implementa un formateador manual que opere **sobre el string**, insertando
separadores por posición. Nunca conviertas a número para formatear.

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

Jest que lee `contracts/cases.json` y compara con `toBe` sobre strings. Añade
un test explícito que documente el problema: la baseline en TS
(`__benchmarks__/baseline.ts`) falla al menos un caso de `cases.json`. Ese test rojo
intencional es material de la presentación.

## Sobre Re.Pack y Module Federation

**Fuera de alcance para la POC.** No configures Module Federation ni Re.Pack acá, y no
aparecen en ninguna fase: la tesis que se demuestra es que las cuatro apps comparten el
core, no cómo se distribuyen sus bundles.

## Prohibiciones

- No habilites la arquitectura vieja. Sin Turbo Modules esto no funciona.
- No uses `Number`, `parseFloat` ni operadores aritméticos sobre montos.
- No agregues `decimal.js`, `big.js` ni similares. Si los necesitas, es señal
  de que estás calculando en el lugar equivocado.
- No edites `src/generated/`.
