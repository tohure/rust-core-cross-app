export type Operation = 'add' | 'subtract';

/** Todos los montos son string. El estado **no calcula**: guarda lo que devolvió el core. */
export type ArithmeticUiState = {
  a: string;
  b: string;
  operation: Operation;
  nativeResult: string;
  coreResult: string;
  error: string;
};

// Arranca con los operandos de `ar-001`, que es el caso que mejor se ve en demo: `0.1 + 0.2`.
export const initialArithmeticState: ArithmeticUiState = {
  a: '0.1',
  b: '0.2',
  operation: 'add',
  nativeResult: '',
  coreResult: '',
  error: '',
};
