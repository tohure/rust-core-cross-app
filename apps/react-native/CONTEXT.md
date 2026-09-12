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

> **Estos nombres se derivaron primero y se contrastaron después, y la predicción acertó.**
> Los de Kotlin y Swift se leyeron de bindings reales en la Fase 1; los de acá se dedujeron de la
> misma regla de uniffi ya verificada en esas dos plataformas —`snake_case` de Rust a
> lowerCamelCase, campos de Record camelCase— antes de que existiera `ubrn` en el proyecto.
> Al primer `ubrn build android --and-generate` se contrastó contra `src/generated/core_financiero.ts`:
> **las nueve funciones y los cinco Records coinciden campo por campo, tipo por tipo y en orden.**
> Lo único que la deducción erró fue la forma de `DomainError` —es un `enum` de tags más una unión
> discriminada, no una clase—, corregido más abajo en este mismo archivo.
> (El adapter de la app no entra en esto: consume el paquete, no lo generado.)

**Los identificadores están en inglés; los nombres del contrato, en español.**
`contracts/cases.json` nombra los errores `"Longitud"`, `"DigitoControl"`, `"MismaCuenta"`…
y **ese mapeo no cruza el FFI**: hay que escribir las nueve líneas **en producción**, en la
librería, y el test de contrato **reusa esa misma función** en vez de escribir su copia — así se
verifica contra `cases.json` el mapeo que la UI usa de verdad. En TypeScript la exhaustividad no
la da el compilador sola: se
consigue con un `default` que asigne a `never` (`const _exhaustive: never = e.tag`), para
que una décima variante rompa `tsc` en vez de pasar en verde.

**El cast va al tipo `DomainError` —la unión de las nueve variantes— y no a `unknown`.** Con el
discriminante tipado `unknown`, TypeScript no puede angostar por exclusión de casos hasta `never`
—esa operación sólo existe sobre una unión finita—, así que la asignación del `default` fallaría
**siempre**, con las nueve variantes cubiertas o sin ellas. Una guardia que falla siempre no
distingue "está completo" de "falta una variante", que es justo lo único que tiene que hacer. Ver
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

    "ubrn:android": "ubrn build android --release --and-generate",
    "ubrn:ios": "ubrn build ios --release --and-generate && (cd example/ios && pod install)",
    "wasm:generate": "ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml && … && pnpm --filter @banco/core-financiero-wasm run build",
    "ubrn:clean": "rm -rf cpp/ src/generated src/generated-napi src/bindings.tsx ../../packages/core-financiero-wasm/generated ../../packages/core-financiero-wasm/dist"

El de WASM **necesita su propio `--config`**: sin él, `ubrn` escribe los bindings de wasm2
dentro de `src/generated/` y pisa los del turbo module JSI. Antes se llamaba `ubrn:wasm` y no
lo llevaba; se eliminó por destructivo. Ver `BUILD.md` y `PENDING.md`.

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
    │   ├── bindings.tsx          entrypoint de ubrn · NO EDITAR
    │   └── index.tsx             superficie pública: reexporta bindings.tsx
    ├── __tests__/                contrato N-API · contrato WASM · guardias
    ├── __benchmarks__/baseline.ts
    └── example/                  LA APP DE LA DEMO
        └── src/
            ├── adapter/ contract/ format/
            ├── ui/components/
            ├── screens/          arithmetic · transfer · card · benchmark
            └── benchmark/        NativeBaseline.ts

    packages/core-financiero-wasm/  el paquete WASM (Fase 5, Task 4), dueño del tercer flavour
    ├── generated/                bindings wasm2 + .wasm · NO EDITAR
    ├── dist/                     bundle de esbuild — lo consume Angular y este test de contrato
    └── src/index.ts, guard.ts    fachada tipada + guardia 4, a mano

**Son tres flavours generados del mismo core, no uno**, y desde la Task 4 ya no viven los tres
bajo esta app: JSI y N-API sí, wasm2 vive en `packages/core-financiero-wasm/`, que es su dueño
porque también lo consume Angular. Mezclarlos sería el modo de fallar más caro de esta fase: un
test en verde contra bindings que no son los que la app embarca.

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
generado es `src/index.tsx`, la superficie pública de la librería. Así `example/` no sabe que
debajo hay uniffi, y el nombre del archivo generado —`src/generated/core_financiero.ts`, que
`ubrn` deriva del crate— deja de ser asunto de la app.

**`src/index.tsx` es nuestro; `src/bindings.tsx` lo genera `ubrn`.** El entrypoint que genera
`ubrn` no es un reexport inocente: contiene `installer.installRustCrate()`, que es lo que
registra el crate con Hermes, y la inicialización de los checksums. Sin esa llamada el Turbo
Module nunca se instala y JSI no resuelve nada — y el síntoma no aparece al compilar sino al
abrir la app. Por eso no se edita a mano ni se congela: `turboModule.entrypoint: src/bindings.tsx`
en `ubrn.config.yaml` manda el generado a ese nombre, y `index.tsx` queda libre para ser nuestro
y reexportarlo, sumándole lo que la librería aporta por su cuenta (`contractName`).

Generar en `index.tsx` y editarlo a mano no era opción: `ubrn build … --and-generate` lo reescribe
entero en cada corrida. Congelarlo con `noOverwrite` tampoco: congelaría justo el archivo que
lleva el registro de Hermes, y quedaríamos con una versión vieja del *glue* la próxima vez que
`ubrn` lo cambie.

El adapter **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
TypeScript es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración de bindings.

Los errores llegan como excepciones tipadas. Captúralas en la pantalla y
mapea a mensaje de usuario ahí, no en el adapter.

**Lo que ubrn genera de verdad, leído del binding y no deducido:**

```ts
export enum DomainError_Tags { Length = 'Length', CheckDigit = 'CheckDigit', … }

export const DomainError = (() => { … })();   // objeto congelado, nueve clases internas
export type DomainError = InstanceType<…>;    // la unión de esas nueve
```

No hay una `class DomainError`: hay un **objeto** con ese nombre —cada variante adentro, con su
propio `instanceOf`— y **por separado un tipo** con el mismo nombre, que es la unión. Y cada
variante declara su `tag` como el **miembro concreto** del enum, no como el enum entero:

```ts
type Length__interface = { tag: DomainError_Tags.Length; inner: Readonly<{ … }> };
```

Eso hace de `DomainError` una **unión discriminada de verdad**, y por lo tanto el `switch`
angosta solo:

```ts
import { DomainError_Tags, type DomainError } from "@banco/core-financiero";

try {
  const r = core.executeTransfer(accounts, request);
} catch (e) {
  const { tag, inner } = e as DomainError;
  switch (tag) {
    case DomainError_Tags.InvalidAmount: /* `inner` trae los campos */ break;
    // … las nueve, y un default que asigne a `never`
  }
}
```

**El cast va al tipo `DomainError`, la unión.** Con eso el `default` angosta a `never` y la
guardia funciona. Con `unknown` **no**: TypeScript sólo angosta por exclusión de casos sobre una
unión finita, así que la asignación a `never` fallaría siempre —con las nueve cubiertas o sin
ellas—, y una guardia que falla siempre no distingue "está completo" de "falta una variante".

**Por qué no `DomainError.instanceOf(e)`, aunque el binding lo ofrezca.** No hace un `instanceof`
de JavaScript —no podría, porque no hay una única clase—: compara una **marca de tipo** que el
binding pone en el objeto, `obj[uniffiTypeNameSymbol] === 'DomainError'`, contra el símbolo
importado de `@ubjs/core`. Lo que sí está **verificado**, y alcanza de sobra para la decisión:
**los dobles de prueba de los tests de pantalla son objetos planos con `tag`, sin esa marca** —
`obj[uniffiTypeNameSymbol]` da `undefined` en ellos, así que `instanceOf` devuelve `false` y
cualquier mapeo que dependiera de él se rompería ahí, con o sin WASM de por medio.

`uniffiTypeNameSymbol` se declara como `Symbol.for('typeName')`, que usa el **registro global**
de símbolos de JavaScript —no un `Symbol()` local por módulo—, así que dentro de un mismo proceso
dos copias distintas del módulo que pidan ese mismo nombre comparten el símbolo. Si eso alcanza
para que `instanceOf` funcione también entre el flavor JSI y el flavor WASM **es, hoy, una
sospecha sin verificar**: esta app todavía no generó ningún binding WASM (`wasm2` es de la Fase
4/5), así que no hay nada real contra lo qué probarlo. La decisión de discriminar por `tag` **no
depende de esa respuesta** — se sostiene sola con el caso de los dobles de prueba, que sí está
probado, y sigue siendo la regla aunque el caso WASM termine confirmando la sospecha o
descartándola.

Discriminar por `tag` funciona en los tres flavours y con dobles, sin apoyarse en ninguna
suposición sobre símbolos compartidos. Lo que **no** cambia es el `switch`: sigue exhaustivo y
sigue llevando el `default` que asigna a `never`, que es lo que hace que una décima variante
rompa `tsc` en vez de pasar en verde.

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
