import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from './core-financiero.service';
import { initCore } from '@banco/core-financiero-wasm';
import { readFileSync } from 'node:fs';

describe('CoreFinancieroService', () => {
  beforeAll(async () => {
    // El test corre bajo el entorno jsdom del `unit-test` builder de Angular (Vitest), que
    // construye su propio realm: el `Buffer` de `readFileSync` no pasa `instanceof Uint8Array`
    // ahí, así que `UniffiNativeModule.open` lo rechaza ("URL/string sources must be resolved
    // by the env-specific entry"). Envolverlo en un `Uint8Array` del realm local lo resuelve —
    // el constructor de TypedArray copia por internal slots, no por `instanceof`. Esto es sólo
    // del arnés de test: en el navegador real hay un único realm y `fetch().arrayBuffer()` no
    // lo sufre.
    const bytes = readFileSync('../../packages/core-financiero-wasm/generated/core_financiero.wasm');
    await initCore(new Uint8Array(bytes));
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
