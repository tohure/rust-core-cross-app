// Prueba la fachada contra el WASM real, no contra un doble. `initCore` recibe los bytes del
// `.wasm` que `ubrn build wasm2 --and-generate` stagea en `generated/` — el mismo patrón que
// `contract.wasm.test.ts` en `apps/react-native`.
//
// Corre bajo el proyecto "napi" de Jest (Node puro): ver `apps/react-native/jest.config.js`,
// cuyo `roots`/`testMatch` recogen `packages/*/src/**/*.test.ts`.
//
// **La cobertura de tipos no vive acá.** TypeScript se borra en runtime: ningún `expect` puede
// distinguir un `string` real de un `any` que resultó ser un string en este caso concreto — se
// intentó (`export const boom: number = coreVersion()` dentro de un test) y ni el `tsc` de este
// paquete ni el de `apps/react-native` lo vieron, porque `tsconfig.json` excluye
// `src/__tests__` y `apps/react-native` no compila este paquete. La garantía de que las nueve
// funciones tienen tipos reales la da `src/index.ts` — sus firmas escritas a mano — y la
// verifica `tsc --noEmit` sobre ese archivo, no un test de este archivo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { add, coreVersion, initCore, validateCard } from '../index';

beforeAll(async () => {
  await initCore(
    readFileSync(join(__dirname, '..', '..', 'generated', 'core_financiero.wasm'))
  );
});

describe('fachada tipada', () => {
  it('las nueve funciones responden contra el WASM real', () => {
    expect(coreVersion()).toMatch(/^\d+\.\d+\.\d+\+[0-9a-f]+$/);
    expect(add('0.1', '0.2')).toBe('0.30');
    expect(validateCard('4111111111111111').brand).toBe('Visa');
  });

  // Cubre un campo distinto del test anterior (`masked`, no `brand`) contra el mismo caso
  // `tj-001` de `contracts/cases.json`: no es el mismo assert repetido con otro nombre, y si el
  // formateo de la máscara se rompe en el flavour WASM, éste es el que avisa.
  it('validateCard enmascara el número, no sólo detecta la marca', () => {
    expect(validateCard('4111111111111111').masked).toBe('4111 **** **** 1111');
  });
});
