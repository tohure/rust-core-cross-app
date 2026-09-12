import type { Core } from './core';

/**
 * Determinista y sin tocar el FFI. Los tests de los hooks verifican **transiciones de estado**,
 * no aritmética: la aritmética ya la prueban los dos tests de contrato contra Rust real, 28 casos
 * por N-API y 28 por WASM.
 *
 * El tipo se importa con `import type` a propósito: así `./core` —que importa el paquete y con él
 * todo el glue nativo— no se carga en runtime por el solo hecho de usar el fake.
 */
export function fakeCore(overrides: Partial<Core> = {}): Core {
  const noop = () => {
    throw new Error('el fake no implementa esta función');
  };
  return {
    add: noop,
    subtract: noop,
    calculateItf: noop,
    validateCci: noop,
    validateCard: noop,
    encrypt: noop,
    decrypt: noop,
    executeTransfer: noop,
    coreVersion: () => '1.0.0+fake123',
    ...overrides,
  } as Core;
}
