/**
 * Las cuatro medidas arrancan en `—` y **las filas se pintan siempre**, igual que en Android
 * (`BenchmarkUiState.kt`) e iOS (`BenchmarkUiState.swift`). No es sólo paridad: pintarlas
 * condicionalmente insertaría un bloque encima de filas ya montadas, que es el patrón que
 * dispara el defecto de aplanado de Fabric (Rulings T20-7 y T21-6).
 */
export const SIN_MEDIR = '—';

export type BenchmarkUiState = {
  /** String, porque es lo que teclea el usuario. Acá no hay montos: es tiempo. */
  iterations: string;
  running: boolean;
  coreP50: string;
  coreP95: string;
  nativeP50: string;
  nativeP95: string;
  error: string;
};

export const initialBenchmarkState: BenchmarkUiState = {
  iterations: '1000',
  running: false,
  coreP50: SIN_MEDIR,
  coreP95: SIN_MEDIR,
  nativeP50: SIN_MEDIR,
  nativeP95: SIN_MEDIR,
  error: '',
};
