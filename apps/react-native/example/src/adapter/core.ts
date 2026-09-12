import {
  add,
  calculateItf,
  coreVersion,
  decrypt,
  encrypt,
  executeTransfer,
  subtract,
  validateCard,
  validateCci,
} from '@banco/core-financiero';

/**
 * El adapter **no traduce nombres ni tipos: reexporta.** Una segunda nomenclatura en TypeScript
 * hay que mantenerla a mano y se desincroniza en la primera regeneración de bindings.
 *
 * Tampoco traduce errores: los propaga tal cual. La cadena es
 * `core → catch en el hook → userMessage → campo del estado`, y la conversión ocurre en el hook.
 */
export const core = {
  add,
  subtract,
  calculateItf,
  validateCci,
  validateCard,
  encrypt,
  decrypt,
  executeTransfer,
  coreVersion,
};

export type Core = typeof core;
