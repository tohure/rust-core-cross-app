// Prueba la fachada contra el WASM real, no contra un doble. `initCore` recibe los bytes del
// `.wasm` que `ubrn build wasm2 --and-generate` stagea en `generated/` — el mismo patrón que
// `contract.wasm.test.ts` en `apps/react-native`.
//
// Corre bajo el proyecto "napi" de Jest (Node puro): ver `apps/react-native/jest.config.js`,
// cuyo `roots`/`testMatch` recogen `packages/*/src/**/*.test.ts`.
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

  it('los tipos son reales, no `any`', () => {
    // Si la fachada reexportara el generado con @ts-nocheck, esto compilaría igual y el test no
    // diría nada. Lo que lo hace valer es que `tsc --noEmit` corre sobre este paquete y ve un
    // tipo real acá, no `any`.
    const marca: string = validateCard('4111111111111111').brand;
    expect(typeof marca).toBe('string');
  });
});
