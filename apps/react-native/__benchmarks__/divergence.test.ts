import { describe, expect, it } from '@jest/globals';
import { group } from '../__tests__/contractFixtures';
import { baselineAdd, baselineSubtract } from './baseline';

/**
 * Este test documenta el problema en vez de esconderlo: la baseline de TypeScript FALLA
 * contra cases.json. Es material de presentación.
 *
 * Se escribe en positivo —"al menos un caso diverge"— para que quede en VERDE mientras la
 * divergencia exista. Si algún día pasara a rojo significaría que TypeScript dejó de
 * divergir, y entonces esos casos ya no sirven para la demo y hay que reemplazarlos.
 */
describe('la baseline de TypeScript diverge del contrato', () => {
  it('al menos un caso de aritmetica da un string distinto al esperado', () => {
    const divergentes = group('aritmetica').filter((c) => {
      const r =
        c.op === 'sumar' ? baselineAdd(c.a, c.b) : baselineSubtract(c.a, c.b);
      return r !== c.esperado;
    });
    expect(divergentes.length).toBeGreaterThan(0);
  });

  it('ar-001 es el caso canónico: 0.1 + 0.2 no da "0.30"', () => {
    expect(baselineAdd('0.1', '0.2')).toBe('0.30000000000000004');
  });
});
