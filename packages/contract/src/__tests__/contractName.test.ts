// No hay `@types/jest`: sin este import explícito, `tsc --noEmit` falla con TS2593 porque
// `describe`/`expect`/`it` no existen como globals sin los tipos ambiente.
import { describe, expect, it } from '@jest/globals';
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
    class OtroModulo extends Error {
      tag = 'SameAccount';
    }
    expect(contractName(new OtroModulo())).toBe('MismaCuenta');
  });

  it('no cae en Object.prototype: un tag como "toString" no es una variante real', () => {
    // Hallazgo I3 del review de la Task 2: indexar la tabla sin `Object.hasOwn` deja pasar
    // cualquier propiedad heredada de `Object.prototype` (`toString`, `constructor`,
    // `hasOwnProperty`, ...) como si fuera un nombre de contrato válido, y la firma de
    // `contractName` dice `: string` — un `toString` heredado (una función) rompería esa
    // invariante en silencio.
    expect(() => contractName({ tag: 'toString' })).toThrow(/sin nombre de contrato/);
    expect(() => contractName({ tag: 'constructor' })).toThrow(/sin nombre de contrato/);
  });
});
