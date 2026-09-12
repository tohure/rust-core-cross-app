# Fase 5 — `apps/web-angular`: plan de implementación

> **Para quien ejecute esto:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> checkbox (`- [ ]`) para seguimiento.

**Goal:** Angular consume el mismo núcleo de Rust por WebAssembly, sin una sola regla de negocio
en TypeScript, cerrando la POC con las cuatro apps mostrando el mismo `coreVersion()`.

**Architecture:** Tres paquetes nuevos en el workspace pnpm — `@banco/contract` (el mapeo del
contrato, que ahora necesitan tres consumidores), `@banco/core-financiero-wasm` (destino de
generación de `ubrn build wasm2`, con fachada tipada) y `apps/web-angular`. El `.wasm` se carga
por **bytes** en un `APP_INITIALIZER`, lo que evita la dependencia del MIME.

**Tech Stack:** Angular standalone + signals, TypeScript, `uniffi-bindgen-react-native` 0.31.0-5
(`ubrn build wasm2`), pnpm workspaces, Vitest o Karma según lo que traiga el scaffold.

**Spec:** [`docs/superpowers/specs/2026-09-12-phase-5-app-web-angular-design.md`](../specs/2026-09-12-phase-5-app-web-angular-design.md)

## Global Constraints

- **Ningún monto pasa por `number`.** Ni `parseFloat`, ni `Number()`, ni `+`, ni `type="number"`
  en un input. Strings desde el WASM hasta el template. Única excepción: `features/benchmark/baseline.ts`,
  que existe para exhibir el fallo y **debe llevar el comentario que lo diga**.
- **Cero reglas de negocio en TypeScript.** Ni Luhn, ni validación de CCI, ni alícuota de ITF.
- **Ninguna librería de decimales** (`decimal.js`, `big.js`).
- **Nada de `Intl.NumberFormat` sobre montos**: separa con U+00A0 y las otras tres apps usan
  U+0020. Tampoco `CurrencyPipe` de Angular, que espera `number`.
- **Sin red, sin persistencia, sin I/O, sin SSR.**
- **Los generados no se editan a mano.** Si algo generado está mal, se corrige en `rust-core` y
  se regenera.
- **Identificadores en inglés; documentación, comentarios, labels de UI y commits en español.**
  Commits en Conventional Commits con scope de subproyecto.
- Labels exactos y orden de campos: [`docs/ui-spec.md`](../../ui-spec.md), **contrastados contra
  el texto normativo, nunca contra el wireframe ASCII** — que abrevia por ancho de columna.
- Gates por tarea: `pnpm test`, `tsc --noEmit` y lint, los tres en cero, antes de commitear.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/contract/src/tags.ts` | La unión `ContractTag` y la tabla `CONTRACT_NAMES` |
| `packages/contract/src/contractName.ts` | `contractName(e)` — discrimina por `tag` |
| `packages/contract/src/sources.ts` | Lectores de `cases.json` y `messages.es.json` |
| `packages/core-financiero-wasm/generated/` | Salida de `ubrn build wasm2`. **No se edita** |
| `packages/core-financiero-wasm/src/index.ts` | Fachada tipada: `initCore` + nueve funciones |
| `packages/core-financiero-wasm/src/guard.ts` | La guardia 4 contra el `DomainError` generado |
| `apps/react-native/src/guard.ts` | La misma guardia, contra el flavour JSI |
| `apps/web-angular/src/app/core/core-financiero.service.ts` | Único punto de contacto con el WASM |
| `apps/web-angular/src/app/core/user-message.ts` | Error del core → texto de usuario |
| `apps/web-angular/src/app/format/money.pipe.ts` | `S/` y separadores **sobre el string** |
| `apps/web-angular/src/app/features/*/` | Las cuatro pantallas |

---

## Bloque 0 — El spike

### Task 1: Spike — ¿puede `ubrn` generar fuera de `apps/react-native`?

**Files:**
- Modify (temporal, se revierte): `apps/react-native/ubrn.wasm.yaml`

**Interfaces:**
- Consumes: nada.
- Produces: una **respuesta escrita**, no código. Si la respuesta es "no", el D1 de la spec
  cambia y hay que corregirla antes de seguir.

**Contexto.** Dos supuestos sostienen todo el layout de paquetes y ninguno está verificado. La
Fase 4 ya se quemó con las opiniones de `ubrn` sobre rutas. **La salida de esta tarea es un
párrafo en el ledger, y cualquier cosa que se construya queda etiquetada como descartable.**

- [ ] **Step 1: Crear el directorio destino y apuntar el config ahí**

```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app
mkdir -p packages/core-financiero-wasm/generated
```

En `apps/react-native/ubrn.wasm.yaml`, cambiar sólo esa línea:

```yaml
bindings:
  cpp: cpp/bindings
  ts: ../../packages/core-financiero-wasm/generated
```

- [ ] **Step 2: Generar y ver qué pasa**

```bash
cd apps/react-native
pnpm exec ubrn build wasm2 --release --and-generate --config ubrn.wasm.yaml
```

Anotar textualmente: ¿falló? ¿escribió donde se le pidió? ¿escribió **además** en
`src/generated-wasm`? ¿los imports internos del generado quedaron con rutas relativas correctas?

```bash
ls -la ../../packages/core-financiero-wasm/generated/
ls -la src/generated-wasm/ 2>/dev/null || echo "(ya no existe)"
grep -nE "^import|from '" ../../packages/core-financiero-wasm/generated/index.ts | head
```

- [ ] **Step 3: Probar que se puede importar como paquete del workspace**

Crear el `package.json` mínimo y engancharlo al workspace:

```bash
cat > ../../packages/core-financiero-wasm/package.json <<'JSON'
{
  "name": "@banco/core-financiero-wasm",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./generated/index.ts",
  "types": "./generated/index.ts"
}
JSON
```

Agregar `"packages/*"` a `pnpm-workspace.yaml` y correr `pnpm install`. Después, una sonda
descartable que cargue el módulo y llame a una función:

```bash
cd ../../packages/core-financiero-wasm
cat > /tmp/sonda.mjs <<'JS'
import { readFileSync } from 'node:fs';
const m = await import('./generated/index.js');
await m.uniffiInitAsync(readFileSync('./generated/core_financiero.wasm'));
console.log('coreVersion:', m.coreVersion());
console.log('add 0.1+0.2:', m.add('0.1', '0.2'));
JS
node /tmp/sonda.mjs
```

Esperado si todo va bien: un string `1.0.0+<sha>` y `0.30`. **Si el import falla por la extensión
(`.ts` contra `.js`) o por las condiciones de `exports`, eso ES el hallazgo** — anotarlo con el
error textual.

- [ ] **Step 4: Revertir y reportar**

```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app
git checkout -- apps/react-native/ubrn.wasm.yaml pnpm-workspace.yaml
rm -rf packages/ /tmp/sonda.mjs
pnpm install
cd apps/react-native && pnpm test   # 113, para confirmar que no quedó nada roto
```

Escribir en el ledger: si los dos supuestos se cumplen, el D1 sigue en pie y se continúa por la
Task 2. **Si alguno falla, parar y corregir la spec antes de seguir** — no improvisar un layout
nuevo sobre la marcha.

---

## Bloque 1 — Los paquetes

### Task 2: `@banco/contract` con la tabla y el mapeo

**Files:**
- Create: `packages/contract/package.json`, `packages/contract/tsconfig.json`
- Create: `packages/contract/src/tags.ts`, `src/contractName.ts`, `src/sources.ts`, `src/index.ts`
- Create: `packages/contract/src/__tests__/contractName.test.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: nada.
- Produces: `ContractTag` (unión de 9 literales), `CONTRACT_NAMES: Record<ContractTag, string>`,
  `contractName(e: unknown): string`, `loadCases()`, `loadMessages()`, `messageFor(name: string): string`.

**Contexto.** El mapeo variante→nombre del contrato lo necesitan tres consumidores. **Una sola
tabla**: dos copias es lo que el proyecto prohíbe.

**El detalle que hace falta entender antes de escribir nada:** hoy la tabla vive en
`apps/react-native/src/contractName.ts` y está atada al tipo **generado** con
`satisfies Record<DomainError['tag'], string>`. Eso es la guardia 4, y es lo que hace que una
décima variante del core rompa `tsc` en vez de pasar en verde. Un paquete neutral **no puede
importar `DomainError`** sin depender de un flavour, así que la guardia se parte en dos: la tabla
se declara acá contra su propia unión, y **cada flavour aserta la equivalencia** (Tasks 3 y 4).

- [ ] **Step 1: Escribir el test que falla**

`packages/contract/src/__tests__/contractName.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contractName, CONTRACT_NAMES } from '../index';

describe('contractName', () => {
  it('traduce las nueve variantes al nombre del contrato', () => {
    expect(contractName({ tag: 'SameAccount' })).toBe('MismaCuenta');
    expect(contractName({ tag: 'CheckDigit' })).toBe('DigitoControl');
    expect(contractName({ tag: 'Length' })).toBe('Longitud');
    expect(Object.keys(CONTRACT_NAMES)).toHaveLength(9);
  });

  it('lanza con un tag que no reconoce, y eso es la guardia', () => {
    // El test de contrato DEPENDE de que lance: un tag desconocido tiene que ser ruidoso.
    // El fallback para la UI va en `userMessage`, no acá.
    expect(() => contractName({ tag: 'NoExiste' })).toThrow(/sin nombre de contrato/);
  });

  it('discrimina por `tag`, no por identidad de clase', () => {
    // `instanceOf` compara contra la clase de SU módulo y falla entre flavours: los tests
    // lanzan objetos planos y el WASM lanza errores de otro módulo. Ruling P1 de la Fase 4.
    class OtroModulo extends Error { tag = 'SameAccount'; }
    expect(contractName(new OtroModulo())).toBe('MismaCuenta');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd packages/contract && pnpm vitest run
```

Esperado: **FAIL**, no resuelve `../index`.

- [ ] **Step 3: Escribir la tabla y el mapeo**

`packages/contract/src/tags.ts`:

```ts
/**
 * Las nueve variantes de `DomainError` y su nombre en el contrato.
 *
 * `contracts/cases.json` y `messages.es.json` están indexados por el nombre **en español**, y
 * ese mapeo **no cruza el FFI**: uniffi no propaga los `#[error("...")]` del core. Sin esta
 * tabla, ni el test de contrato ni la UI encuentran nada.
 *
 * Vive en un paquete neutral porque lo necesitan tres consumidores —el test de contrato de
 * React Native, la app de React Native y Angular— y dos copias se desincronizan.
 */
export const CONTRACT_NAMES = {
  Length: 'Longitud',
  CheckDigit: 'DigitoControl',
  UnknownBank: 'BancoDesconocido',
  InvalidAmount: 'MontoInvalido',
  AccountNotFound: 'CuentaNoEncontrada',
  SameAccount: 'MismaCuenta',
  InsufficientFunds: 'SaldoInsuficiente',
  Encryption: 'Cifrado',
  OutOfRange: 'FueraDeRango',
} as const;

/**
 * La unión de tags que esta tabla cubre. **No se importa de ningún flavour a propósito:** este
 * paquete no puede depender de los bindings generados de uno. La equivalencia contra el
 * `DomainError['tag']` real la aserta cada flavour en su propio `guard.ts`.
 */
export type ContractTag = keyof typeof CONTRACT_NAMES;
```

`packages/contract/src/contractName.ts`:

```ts
import { CONTRACT_NAMES, type ContractTag } from './tags';

/**
 * Se discrimina por la PRESENCIA de `tag`, no con `DomainError.instanceOf(e)`: `instanceOf`
 * compara contra la clase de **su propio módulo**, y acá llegan errores de tres orígenes
 * distintos —objetos planos de los tests, el módulo JSI y el módulo WASM—. Ruling P1.
 *
 * **Lanza con un tag desconocido a propósito.** El test de contrato depende de ese ruido. El
 * fallback para no romper la UI va en `userMessage`, que es el borde de presentación.
 */
export function contractName(e: unknown): string {
  const tag = (e as { tag?: string }).tag;
  const nombre = CONTRACT_NAMES[tag as ContractTag];
  if (nombre === undefined) {
    throw new Error(`variante de DomainError sin nombre de contrato: ${String(tag)}`);
  }
  return nombre;
}
```

`packages/contract/src/sources.ts` — portar `loadCases`, `loadMessages` y `messageFor` desde
`apps/react-native/__tests__/contractFixtures.ts` y `example/src/contract/sources.ts`, con el
chequeo `m === undefined` (no falsy) que la Fase 4 corrigió.

- [ ] **Step 4: Correr y verificar que pasan**

```bash
cd packages/contract && pnpm vitest run
```

Esperado: **PASS, 3 tests**.

- [ ] **Step 5: Commit**

```bash
git add packages/contract pnpm-workspace.yaml
git commit -m "feat(contract): el mapeo del contrato pasa a su propio paquete

Lo necesitan tres consumidores: el test de contrato de React Native, la app
de React Native y Angular. Una sola tabla, porque dos copias se
desincronizan y es lo que el proyecto prohíbe.

La tabla se declara contra su propia unión y no contra el DomainError de un
flavour: un paquete neutral no puede depender de bindings generados. La
equivalencia contra el tipo real la aserta cada flavour."
```

### Task 3: React Native importa el paquete, y la guardia 4 se reconstruye

**Files:**
- Create: `apps/react-native/src/guard.ts`
- Delete: `apps/react-native/src/contractName.ts`
- Modify: `apps/react-native/src/index.tsx`, `apps/react-native/package.json`,
  `apps/react-native/example/src/adapter/ContractMessages.ts`,
  `apps/react-native/example/src/contract/sources.ts`,
  `apps/react-native/__tests__/contractFixtures.ts`

**Interfaces:**
- Consumes: `contractName`, `CONTRACT_NAMES`, `ContractTag` de `@banco/contract`.
- Produces: `apps/react-native` sigue exportando `contractName` desde `src/index.tsx`, ahora
  reexportándolo. Los consumidores existentes no cambian su import.

**Contexto.** Esto toca código ya mergeado. Va en su propio commit para que un fallo sea
atribuible con `git bisect`.

- [ ] **Step 1: Escribir la guardia con su test de tipos**

`apps/react-native/src/guard.ts`:

```ts
import type { DomainError } from './bindings';
import type { ContractTag } from '@banco/contract';

/**
 * **La guardia 4, reconstruida.** Antes la sostenía un `satisfies Record<DomainError['tag'],
 * string>` sobre la tabla; ahora la tabla vive en un paquete que no puede conocer el tipo
 * generado, así que la equivalencia se aserta acá, donde sí se conoce.
 *
 * Es **bidireccional a propósito**: `Equal` exige que cada unión extienda a la otra. Una
 * variante de más en el core deja `CONTRACT_NAMES` incompleta; una de menos la deja con una
 * clave que ya no existe. Las dos rompen `tsc` en vez de pasar en verde.
 *
 * Este archivo no exporta nada en runtime: existe sólo para que el compilador lo mire.
 */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Si esto deja de compilar, el core cambió sus variantes y hay que actualizar
// `packages/contract/src/tags.ts`.
const _guardia: Equal<DomainError['tag'], ContractTag> = true;
void _guardia;
```

- [ ] **Step 2: Verificar la guardia POR MUTACIÓN, en los dos sentidos**

No alcanza con que compile. Agregar temporalmente una décima clave a `CONTRACT_NAMES`:

```bash
cd apps/react-native && pnpm exec tsc --noEmit
```

Esperado: **error de tipos**, nombrando `_guardia`. Revertir. Después borrar temporalmente una
clave existente y volver a correr: **también debe fallar**. Revertir. Anotar las dos salidas.

- [ ] **Step 3: Repuntar los imports y borrar el archivo viejo**

```bash
rm apps/react-native/src/contractName.ts
```

En `src/index.tsx`, cambiar la reexportación:

```ts
// `contractName` no viene de `ubrn`: traduce las variantes de `DomainError` a los nombres en
// español del contrato, un mapeo que no cruza el FFI. Vive en `@banco/contract` porque lo
// necesitan también el paquete WASM y Angular; acá se reexporta para no romper a quien ya lo
// importaba de este paquete.
export { contractName } from '@banco/contract';
import './guard';
```

Agregar `"@banco/contract": "workspace:*"` a `dependencies` de `apps/react-native/package.json`.
Repuntar `contractFixtures.ts` y `example/src/contract/sources.ts` a los lectores del paquete.

- [ ] **Step 4: Correr todo**

```bash
cd apps/react-native && pnpm test && pnpm exec tsc --noEmit && pnpm lint
```

Esperado: **113 tests**, `tsc` y lint en cero. El contrato 28/28 por N-API y por WASM.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(react-native): contractName sale del paquete y la guardia 4 se reconstruye

El mapeo se mudó a @banco/contract. src/index.tsx lo reexporta para no
romper a quien lo importaba de acá.

La guardia 4 no se pierde, se parte: la tabla ya no puede llevar el
satisfies contra DomainError porque vive en un paquete que no conoce el
tipo generado, así que guard.ts aserta la equivalencia bidireccional contra
el flavour JSI. Verificado por mutación en los dos sentidos: sobra una
clave y falta una clave, las dos rompen tsc."
```

### Task 4: `@banco/core-financiero-wasm` con fachada tipada

**Files:**
- Create: `packages/core-financiero-wasm/package.json`, `tsconfig.json`
- Create: `packages/core-financiero-wasm/src/index.ts`, `src/guard.ts`
- Modify: `apps/react-native/ubrn.wasm.yaml`, `apps/react-native/package.json` (script)

**Interfaces:**
- Consumes: el generado que produce `ubrn build wasm2`; `ContractTag` de `@banco/contract`.
- Produces: `initCore(source: ArrayBuffer | Uint8Array): Promise<void>` y las **nueve funciones
  tipadas**: `add`, `subtract`, `calculateItf`, `validateCci`, `validateCard`, `encrypt`,
  `decrypt`, `executeTransfer`, `coreVersion`. Más los tipos `Account`, `TransferRequest`,
  `TransferResult`, `ValidCci`, `ValidCard`.

**Contexto.** El entrypoint generado lleva `@ts-nocheck`. **Reexportarlo tal cual le daría `any`
a Angular en las nueve funciones**, y con eso se cae la guardia 4: el `Equal<DomainError['tag'],
ContractTag>` no tendría un tipo real contra el que verificar. La fachada confina el
`@ts-nocheck` al archivo generado.

- [ ] **Step 1: Repuntar la generación al paquete**

En `apps/react-native/ubrn.wasm.yaml`:

```yaml
bindings:
  cpp: cpp/bindings
  ts: ../../packages/core-financiero-wasm/generated
```

Actualizar el script `wasm:generate` de `apps/react-native/package.json` para que el
`@ts-nocheck` se inyecte en la nueva ruta.

- [ ] **Step 2: Escribir el test de la fachada, que falla**

`packages/core-financiero-wasm/src/__tests__/facade.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { add, coreVersion, initCore, validateCard } from '../index';

beforeAll(async () => {
  await initCore(readFileSync(join(__dirname, '..', '..', 'generated', 'core_financiero.wasm')));
});

describe('fachada tipada', () => {
  it('las nueve funciones responden contra el WASM real', () => {
    expect(coreVersion()).toMatch(/^\d+\.\d+\.\d+\+[0-9a-f]+$/);
    expect(add('0.1', '0.2')).toBe('0.30');
    expect(validateCard('4111111111111111').brand).toBe('Visa');
  });

  it('los tipos son reales, no `any`', () => {
    // Si la fachada reexportara el generado con @ts-nocheck, esto compilaría igual y el test
    // no diría nada. Lo que lo hace valer es que `tsc --noEmit` corre sobre este paquete.
    const marca: string = validateCard('4111111111111111').brand;
    expect(typeof marca).toBe('string');
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

```bash
cd packages/core-financiero-wasm && pnpm vitest run
```

Esperado: **FAIL**, no resuelve `../index`.

- [ ] **Step 4: Escribir la fachada**

`packages/core-financiero-wasm/src/index.ts`:

```ts
// @ts-expect-error — el generado lleva `@ts-nocheck` y no exporta tipos utilizables.
import * as generado from '../generated/index';

/**
 * **Fachada tipada sobre el módulo generado, escrita a mano y a propósito.**
 *
 * El entrypoint que produce `ubrn` lleva `@ts-nocheck`: no typechequea. Reexportarlo tal cual
 * le daría `any` a todo consumidor en las nueve funciones, y con eso se cae la guardia 4 — el
 * `Equal<DomainError['tag'], ContractTag>` de `guard.ts` no tendría un tipo real contra el que
 * verificar, y una décima variante del core pasaría en verde.
 *
 * Acá el `@ts-nocheck` queda **confinado al archivo generado**. Estas firmas son las de
 * `apps/web-angular/CONTEXT.md`, ya verificadas contra Kotlin y Swift en la Fase 1.
 */
export type Account = { id: string; holder: string; balance: string };
export type TransferRequest = { origin: string; destination: string; amount: string };
export type TransferResult = {
  accounts: Account[];
  itfFee: string;
  totalDebited: string;
  receipt: string;
  /** El ÚNICO número de toda la superficie. */
  simulatedLatencyMs: number;
};
export type ValidCci = { bankCode: string; bankName: string; branch: string; account: string };
export type ValidCard = { brand: string; masked: string };

/** Abre el módulo. **Recibe BYTES**, no una `Response`: ver `initCore` en el servicio Angular. */
export async function initCore(source: ArrayBuffer | Uint8Array): Promise<void> {
  await generado.uniffiInitAsync(source);
}

export const add = (a: string, b: string): string => generado.add(a, b);
export const subtract = (a: string, b: string): string => generado.subtract(a, b);
export const calculateItf = (amount: string): string => generado.calculateItf(amount);
export const validateCci = (cci: string): ValidCci => generado.validateCci(cci);
export const validateCard = (n: string): ValidCard => generado.validateCard(n);
export const encrypt = (text: string, keyHex: string, nonceHex: string): string =>
  generado.encrypt(text, keyHex, nonceHex);
export const decrypt = (hex: string, keyHex: string, nonceHex: string): string =>
  generado.decrypt(hex, keyHex, nonceHex);
export const executeTransfer = (a: Account[], r: TransferRequest): TransferResult =>
  generado.executeTransfer(a, r);
export const coreVersion = (): string => generado.coreVersion();
```

`packages/core-financiero-wasm/src/guard.ts` — la misma guardia bidireccional de la Task 3, pero
contra el `DomainError` del generado de wasm.

- [ ] **Step 5: Correr, y verificar la guardia por mutación**

```bash
cd packages/core-financiero-wasm && pnpm vitest run && pnpm exec tsc --noEmit
```

Esperado: **PASS, 2 tests** y `tsc` en cero. Después mutar `CONTRACT_NAMES` en los dos sentidos y
confirmar que `tsc` de **este** paquete se pone rojo. Anotar las salidas.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wasm): el paquete WASM, con fachada tipada sobre el generado

ubrn build wasm2 pasa a escribir acá: el artefacto vive donde vive su dueño,
y el test de contrato por WASM de React Native pasa a probar exactamente lo
que va a consumir Angular.

La fachada se escribe a mano porque el entrypoint generado lleva @ts-nocheck:
reexportarlo le daría any a Angular en las nueve funciones y se caería la
guardia 4. Así el @ts-nocheck queda confinado al archivo generado."
```

### Task 5: El test de contrato por WASM importa del paquete

**Files:**
- Modify: `apps/react-native/__tests__/contract.wasm.test.ts`
- Modify: `apps/react-native/jest.config.js` si hace falta resolver el workspace

**Interfaces:**
- Consumes: `@banco/core-financiero-wasm`, `@banco/contract`.
- Produces: la confirmación de que el paquete sirve a un consumidor real antes de que Angular
  dependa de él.

- [ ] **Step 1: Repuntar los imports**

```ts
import { contractName } from '@banco/contract';
import {
  add, calculateItf, decrypt, encrypt, executeTransfer,
  initCore, subtract, validateCard, validateCci,
} from '@banco/core-financiero-wasm';
```

Y el `beforeAll` pasa a `await initCore(readFileSync(...))` con la ruta del paquete.

- [ ] **Step 2: Correr la suite entera**

```bash
cd apps/react-native && pnpm test
```

Esperado: **113 tests**, con el contrato 28/28 por WASM importando del paquete.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(react-native): el contrato por WASM importa del paquete

Prueba exactamente lo que va a consumir Angular, no una copia. Es lo que
hace que la Fase 5 arranque sin deuda."
```

---

## Bloque 2 — Angular y el contrato

### Task 6: Scaffold de Angular y el servicio que carga el WASM por bytes

**Files:**
- Create: `apps/web-angular/` (scaffold)
- Create: `apps/web-angular/src/app/core/core-financiero.service.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `@banco/core-financiero-wasm`.
- Produces: `CoreFinancieroService` con las nueve funciones, ya inicializado por
  `provideAppInitializer`.

**Contexto.** El `.wasm` se carga por **bytes** y no por `Response`: verificado en
`@ubjs/wasm/dist/core/src/module.js`, `WebAssembly.compile(bytes)` **no mira el Content-Type**,
sólo `compileStreaming` lo exige. Eso desactiva el riesgo que el CONTEXT llama «el punto donde
más tiempo se pierde en este proyecto».

- [ ] **Step 1: Crear el proyecto y ANOTAR la versión real**

```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app/apps
pnpm dlx @angular/cli@latest new web-angular --standalone --routing=false --style=css --ssr=false --skip-git
cd web-angular && pnpm exec ng version
```

**Anotar la versión que salga** — va al README con el número real, no deducido. Agregar
`"apps/web-angular"` y `"packages/*"` a `pnpm-workspace.yaml` y `@banco/core-financiero-wasm` +
`@banco/contract` como `workspace:*`.

- [ ] **Step 2: Escribir el test que falla**

`apps/web-angular/src/app/core/core-financiero.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from './core-financiero.service';
import { initCore } from '@banco/core-financiero-wasm';
import { readFileSync } from 'node:fs';

describe('CoreFinancieroService', () => {
  beforeAll(async () => {
    await initCore(readFileSync('../../packages/core-financiero-wasm/generated/core_financiero.wasm'));
  });

  it('devuelve el string del core tal cual, sin tocarlo', () => {
    const core = TestBed.inject(CoreFinancieroService);
    expect(core.add('0.1', '0.2')).toBe('0.30');
  });

  it('propaga el error del core sin traducirlo: eso es del componente', () => {
    const core = TestBed.inject(CoreFinancieroService);
    expect(() => core.validateCard('41111')).toThrowError();
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

```bash
cd apps/web-angular && pnpm test
```

Esperado: **FAIL**, no existe el servicio.

- [ ] **Step 4: Escribir el servicio y el inicializador**

```ts
import { Injectable } from '@angular/core';
import {
  add, calculateItf, coreVersion, decrypt, encrypt, executeTransfer,
  initCore, subtract, validateCard, validateCci,
  type Account, type TransferRequest,
} from '@banco/core-financiero-wasm';

/**
 * El único punto de contacto con el WASM.
 *
 * **No traduce nombres ni tipos: reexporta.** Una segunda nomenclatura en TypeScript hay que
 * mantenerla a mano y se desincroniza en la primera regeneración del paquete.
 *
 * Tampoco traduce errores: los propaga tal cual. La conversión a texto de usuario ocurre en el
 * componente, que es el borde de presentación.
 */
@Injectable({ providedIn: 'root' })
export class CoreFinancieroService {
  add = add;
  subtract = subtract;
  calculateItf = calculateItf;
  validateCci = validateCci;
  validateCard = validateCard;
  encrypt = encrypt;
  decrypt = decrypt;
  executeTransfer = (accounts: Account[], request: TransferRequest) =>
    executeTransfer(accounts, request);
  coreVersion = coreVersion;
}

/**
 * Carga el módulo UNA vez, al arrancar, para que ninguna pantalla espere en la primera
 * interacción.
 *
 * **Se pasan BYTES y no la `Response`.** Con bytes, `@ubjs/wasm` usa `WebAssembly.compile`, que
 * **no mira el Content-Type**; sólo `compileStreaming` exige `application/wasm`. Por eso este
 * proyecto no depende de que el builder sirva el MIME correcto, que es el punto donde el
 * CONTEXT advertía que más tiempo se pierde. Se pierde la compilación en streaming: para
 * 180 KB es irrelevante.
 */
export async function cargarCore(): Promise<void> {
  const respuesta = await fetch('core_financiero.wasm');
  await initCore(await respuesta.arrayBuffer());
}
```

En `app.config.ts`, registrar `provideAppInitializer(() => cargarCore())`. Declarar el `.wasm`
como asset en `angular.json`.

- [ ] **Step 5: Correr, y verificar en el NAVEGADOR**

```bash
cd apps/web-angular && pnpm test && pnpm exec ng serve
```

Abrir, y en la consola comprobar que `coreVersion()` devuelve el string. **Mirar la pestaña
Network:** anotar con qué `Content-Type` llegó el `.wasm`. Si llegó como `text/html` **y la app
funciona igual**, eso confirma el D3 de la spec y hay que dejarlo escrito.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web-angular): el servicio del core, cargando el WASM por bytes

Se pasan bytes y no la Response: WebAssembly.compile no mira el
Content-Type, sólo compileStreaming lo exige. Por eso la app no depende de
que el builder sirva application/wasm, que es donde el CONTEXT advertía que
más tiempo se pierde."
```

### Task 7: El test de contrato desde Angular — 28/28

**Files:**
- Create: `apps/web-angular/src/app/core/contract.spec.ts`

**Interfaces:**
- Consumes: `CoreFinancieroService`, `@banco/contract`.
- Produces: la quinta base de código corriendo `cases.json`.

**Contexto.** Va **antes** que las pantallas. En la Fase 4, que 28/28 pasara antes de escribir UI
fue lo que evitó que las pantallas arrastraran deuda.

Portar la estructura de `apps/react-native/__tests__/contract.wasm.test.ts`, incluidas **las
cinco guardias** y el `expect(() => ...).toThrow()` para los casos que deben fallar — **no** el
`try/throw/catch`, que cae en su propio catch y reporta la causa equivocada (hallazgo del review
de la Fase 4).

- [ ] **Step 1: Escribir el spec completo con las cinco guardias**
- [ ] **Step 2: Correr y ver los 28 en verde**

```bash
cd apps/web-angular && pnpm test
```

Esperado: **28 casos + 5 guardias**, todos verdes, con igualdad exacta de strings.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(web-angular): el contrato pasa 28/28 desde Angular

Quinta base de código corriendo cases.json con igualdad exacta de strings."
```

### Task 8: `MoneyPipe` y `userMessage`

**Files:**
- Create: `apps/web-angular/src/app/format/money.pipe.ts` + spec
- Create: `apps/web-angular/src/app/core/user-message.ts` + spec

**Interfaces:**
- Consumes: `contractName`, `messageFor` de `@banco/contract`.
- Produces: `formatPEN(amount: string): string` (función pura, es lo que se testea) y
  `MoneyPipe`, un pipe de una línea que la envuelve — `transform = formatPEN`. Más
  `userMessage(e: unknown): string`.

**Contexto.** **Nada de `Intl.NumberFormat`.** La Fase 4 lo midió: separa el símbolo con U+00A0 y
las otras tres apps usan U+0020. Un byte invisible que rompe la comparación carácter por
carácter. Se porta el formateador de `apps/react-native/example/src/format/money.ts`, incluido su
manejo del signo **antes** de agrupar.

`userMessage` **no puede lanzar**: se llama siempre dentro de un `catch` y una excepción ahí
escaparía del handler. Lleva el fallback que la Fase 4 tuvo que agregarle.

- [ ] **Step 1: Escribir los tests que fallan**, incluidos:
  - `formatPEN('4899.99')` → `'S/ 4,899.99'` **con U+0020**, comprobado por code point
  - `formatPEN('-123456.78')` → `'S/ -123,456.78'` (el signo fuera del agrupado)
  - `userMessage(new TypeError('x'))` **no lanza**
- [ ] **Step 2: Correr y verificar que fallan**
- [ ] **Step 3: Portar el formateador y escribir `userMessage`**
- [ ] **Step 4: Correr y verificar que pasan**
- [ ] **Step 5: Commit**

---

## Bloque 3 — Las pantallas

### Task 9: Componentes compartidos, navegación y el pie

**Files:**
- Create: `apps/web-angular/src/app/ui/` — `screen-header`, `labeled-field`, `result-row`,
  `section-divider`, `core-version-footer`, `primary-button`
- Modify: `apps/web-angular/src/app/app.component.ts`

**Contexto.** La **misma descomposición** que las otras tres apps: es lo que hace las pantallas
comparables. Los labels de las pestañas van **completos** —`Aritmética`, `Transferencia`,
`Tarjeta`, `Benchmark`—, contrastados contra el **texto normativo** de `ui-spec.md`, no contra el
wireframe ASCII.

**El pie recibe el string como prop**, no lo va a buscar: es lo que la Fase 4 tuvo que corregir
para poder probarlo.

**Las cuatro pantallas quedan montadas**, no sólo la activa: en Angular eso es natural con
`@if` … **no**, `@if` desmonta. Usar `[hidden]` o `display:none` sobre las cuatro, para que el
estado sobreviva al cambio de pestaña. Es el defecto que la Fase 4 reintrodujo y que Android ya
había arreglado.

- [ ] **Step 1-5:** tests de los componentes, implementación, navegación, y verificación **en el
  navegador** de que el pie aparece en las cuatro y que el estado sobrevive al cambio de pestaña.

### Task 10: Pantalla de Aritmética

**Files:**
- Create: `apps/web-angular/src/app/features/aritmetica/aritmetica.component.ts` + `.spec.ts`
- Create: `apps/web-angular/src/app/features/benchmark/baseline.ts`

**Interfaces:**
- Consumes: `CoreFinancieroService`, `userMessage`, los componentes de la Task 9.
- Produces: `AritmeticaComponent`, y `nativeFloat(a, b, op): string` desde `baseline.ts`.

Labels, contrastados contra el **texto normativo** de `ui-spec.md`: `Operando A`, `Operando B`,
`Sumar`, `Restar`, `Calcular`, `Punto flotante nativo`, `Core (Rust · Decimal)`. Cabecera
`Aritmética` / `El float rompe el dinero`.
**Sin límite de 2 decimales acá:** el contrato acepta escala libre (`ar-001` es `"0.1"`).

- [ ] **Step 1: Escribir el spec que falla**, con tres aserciones:
  - con `0.1` y `0.2`, `coreResult` es `'0.30'` y `nativeResult` es `'0.30000000000000004'`
  - **`Restar` llama a `subtract`, no a `add`** — con un doble que devuelva `'NO DEBE LLAMARSE'`
    en `add`, porque sin eso un componente que siempre sume pasaría los otros dos
  - un error del core queda **en el estado como texto de usuario**, no sube como excepción
- [ ] **Step 2: Correr y verificar que falla**
- [ ] **Step 3: Escribir `baseline.ts`** con el comentario obligatorio de que es la excepción
  permitida y existe para exhibir el fallo, y el componente
- [ ] **Step 4: Correr y verificar que pasa**
- [ ] **Step 5: Verificar EN EL NAVEGADOR** que los dos bloques muestran los dos strings
- [ ] **Step 6: Commit**

### Task 11: Pantalla de Transferencia

Labels: `Origen`, `Destino`, `Monto`, `Transferir`, `Resultado`, `Comisión ITF`,
`Total debitado`, `Comprobante`, `Saldos`. Orden de campos: origen, destino, monto.
**Los dos CCI salen de `cases.json`, no de literales.** El monto arranca **vacío**. Filtro de
texto `/^\d{0,9}(\.\d{0,2})?$/`, nunca `type="number"`. Se espera `simulatedLatencyMs` antes de
pintar; **no hay red**. Editar un campo consume el error.


- [ ] **Step 1: Escribir el spec que falla**, con las guardias que la Fase 4 tuvo que agregar:
  - los dos CCI **derivan de `cases.json`** — se sustituye el contrato por uno con ids distintos,
    porque comparar contra el real pasa igual con literales hardcodeados
  - el monto **viaja al core tal como se tecleó**: se captura el `request.amount` y se compara
  - una transferencia **fallida limpia el resultado anterior**
  - editar un campo **consume el error**
- [ ] **Step 2: Correr y verificar que falla**
- [ ] **Step 3: Implementar el componente**
- [ ] **Step 4: Correr, y verificar cada guardia POR MUTACIÓN**
- [ ] **Step 5: Verificar EN EL NAVEGADOR** con `100.00`: `S/ 0.01`, `S/ 100.01`,
  `TRF-9047-1065-10000`, saldos `S/ 4,899.99` y `S/ 1,300.50`. Y que tipear `0.001` no deja
  entrar el tercer decimal
- [ ] **Step 6: Commit**
### Task 12: Pantalla de Tarjeta

Labels: `Número`, `Validar y cifrar`, `Resultado`, `Marca`, `Enmascarado`, `Cifrado (hex)`,
`Descifrado`, `Descifrar un hex de otra plataforma`, `Hex cifrado`, `Descifrar`,
`Número recuperado`. **El texto de ayuda de dos líneas es obligatorio**, textual.
Dos bloques independientes, **cada uno con su propio error**. Hex monoespaciado y en caja.
La ayuda del segundo bloque nombra a las **otras tres** apps: `Android, iOS o React Native`.


- [ ] **Step 1: Escribir el spec que falla**, con:
  - **la vuelta completa**, con el doble devolviendo un centinela **distinto del número
    tecleado** — con el mismo valor, el test no distingue «lo descifró el core» de «la pantalla
    repitió lo que tecleaste», que es la propiedad que la pantalla existe para demostrar
  - un fallo al descifrar un hex pegado **no borra** el resultado de cifrar
  - los filtros: `Número` sólo dígitos, `Hex cifrado` sólo `[0-9a-f]`
- [ ] **Step 2: Correr y verificar que falla**
- [ ] **Step 3: Implementar el componente**
- [ ] **Step 4: Correr, y verificar por mutación**
- [ ] **Step 5: Verificar EN EL NAVEGADOR:** con `4111111111111111` el hex es
  `bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd`, y pegar el de `tj-002`
  devuelve `5555555555554444`
- [ ] **Step 6: Commit**
### Task 13: Pantalla de Benchmark

Labels: `Iteraciones`, `Ejecutar`, `Core (Rust · Decimal)`, `Punto flotante nativo`,
`Tiempo típico (p50)`, `Peor caso (p95)`, y **los dos párrafos completos**.
Las cuatro filas se pintan **siempre**, con `—` hasta que haya medición.
**Cero iteraciones no arranca ni deja el spinner colgado** (trampa de `ad45cac`), y los errores
del core se muestran con `userMessage`, no con `String(e)`.
Tope de 6 dígitos. Las mediciones salen del hilo principal o no, según lo que permita el
navegador: **documentar lo que efectivamente se hizo**, sin fingir paridad.


- [ ] **Step 1: Escribir el spec que falla**, con:
  - cero iteraciones y entrada vacía **no arrancan ni dejan el spinner colgado**
  - con iteraciones válidas, las cuatro medidas matchean `/^\d+\.\d{2} µs$/` — **no**
    «distinto de vacío», que pasaría con el `—` inicial sin haber medido
  - **llama al core una vez por iteración**, no una sola vez
  - un error del core se muestra **con `userMessage`**, no como `[object Object]`
  - una corrida que falla **borra las medidas de la anterior**
- [ ] **Step 2: Correr y verificar que falla**
- [ ] **Step 3: Implementar el componente**
- [ ] **Step 4: Correr, y verificar por mutación las cinco guardias**
- [ ] **Step 5: Verificar EN EL NAVEGADOR** con 1000 iteraciones, y anotar los números reales
- [ ] **Step 6: Commit**
---

## Bloque 4 — Cierre

### Task 14: README, diagrama, PENDING, y la verificación de las CUATRO apps

**Files:**
- Create: `apps/web-angular/README.md`, `apps/web-angular/PENDING.md`
- Modify: `apps/web-angular/CONTEXT.md` (las cuatro premisas falsadas), `CLAUDE.md`,
  `docs/demo-runbook.md`

- [ ] **Step 1: Verificación completa, con los números reales**

```bash
cd rust-core && cargo test --workspace
cd ../apps/android && ./gradlew :app:testDebugUnitTest --rerun && ./gradlew :app:connectedDebugAndroidTest
cd ../ios && xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
cd ../react-native && pnpm test
cd ../web-angular && pnpm test
```

**El `--rerun` de Android no es opcional:** sin él Gradle contesta `BUILD SUCCESSFUL` en 405 ms
con la tarea `UP-TO-DATE`, sin ejecutar un solo test.

- [ ] **Step 2: El pie en las CUATRO apps, que es el cierre de la POC**

Regenerar los cuatro artefactos desde el mismo HEAD y comprobar en pantalla que las cuatro
muestran el mismo string. Es la primera vez que las cuatro existen a la vez.

- [ ] **Step 3: README con su diagrama Mermaid**, con los comandos **efectivamente ejecutados**.
- [ ] **Step 4: Corregir `CONTEXT.md`** en los cuatro puntos falsados.
- [ ] **Step 5: `CLAUDE.md`** — Fase 5 completada, y la POC cerrada.
- [ ] **Step 6: Runbook** — extender a cuatro apps; el gesto del hex ahora en cadena entre cuatro.
- [ ] **Step 7: Commit final y cierre de rama.**
