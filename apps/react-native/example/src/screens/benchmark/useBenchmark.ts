import { useState } from 'react';
import type { Core } from '../../adapter/core';
import { nativeFloat } from '../../benchmark/NativeBaseline';
import {
  initialBenchmarkState,
  SIN_MEDIR,
  type BenchmarkUiState,
} from './BenchmarkUiState';

// Hasta 6 dígitos, igual que Android (`BenchmarkViewModel.kt`) e iOS. Es un filtro de TEXTO:
// sin el tope, teclear 10000000 dispara 2 × 10^7 llamadas al core sin forma de cancelarlas, y
// las dos apps dejan de comportarse igual en la pantalla que existe para compararlas.
const ITERATIONS = /^\d{0,6}$/;

/**
 * `sorted` nunca está vacío: `run()` corta antes si `n <= 0`. El `?? 0` está para
 * `noUncheckedIndexedAccess`, que tipa todo acceso por índice como posiblemente `undefined`.
 */
function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

/**
 * Microsegundos con dos decimales. **Esto es tiempo, no dinero:** acá `number` es correcto y
 * la regla del invariante no aplica — habla de montos, que van como string de punta a punta.
 */
const us = (ms: number) => `${(ms * 1000).toFixed(2)} µs`;

export function useBenchmark(core: Core) {
  const [state, setState] = useState<BenchmarkUiState>(initialBenchmarkState);

  const set = (patch: Partial<BenchmarkUiState>) =>
    setState((s) => ({ ...s, ...patch }));

  function run() {
    const n = Number.parseInt(state.iterations, 10);
    // Android dejó el spinner colgado con cero iteraciones (commit ad45cac): el índice del
    // percentil se iba fuera de rango y la corrutina moría DESPUÉS de prender el spinner. Se
    // corta antes de arrancar. A diferencia de Android e iOS, que vuelven en silencio, acá se
    // dice por qué: un botón que no hace nada parece roto.
    if (!Number.isFinite(n) || n <= 0) {
      set({
        running: false,
        error: 'Ingresa un número de iteraciones mayor que cero.',
      });
      return;
    }
    set({ running: true, error: '' });

    // `setTimeout(0)` **no** saca la medición del hilo principal: en React Native el JS corre
    // en un solo hilo y no hay worker acá. Lo único que hace es ceder el turno para que el
    // spinner alcance a pintarse antes de que el bucle lo bloquee. Android (`withContext`) e
    // iOS (`Task.detached`) sí van a otro hilo de verdad; esta es una diferencia de
    // plataforma, no una decisión — ver el ruling de la tarea.
    setTimeout(() => {
      const medir = (f: () => void) => {
        const muestras: number[] = [];
        for (let i = 0; i < n; i++) {
          const t0 = performance.now();
          f();
          muestras.push(performance.now() - t0);
        }
        muestras.sort((a, b) => a - b);
        return { p50: percentile(muestras, 50), p95: percentile(muestras, 95) };
      };

      try {
        const c = medir(() => {
          core.add('0.1', '0.2');
        });
        const nat = medir(() => {
          nativeFloat('0.1', '0.2', 'add');
        });
        set({
          running: false,
          coreP50: us(c.p50),
          coreP95: us(c.p95),
          nativeP50: us(nat.p50),
          nativeP95: us(nat.p95),
        });
      } catch (e) {
        // El benchmark de Android se tragaba los errores del core; acá se muestran. Las
        // medidas vuelven a `—`: dejar las de una corrida anterior debajo de un error haría
        // parecer que el número de pantalla corresponde a esta corrida.
        set({
          running: false,
          coreP50: SIN_MEDIR,
          coreP95: SIN_MEDIR,
          nativeP50: SIN_MEDIR,
          nativeP95: SIN_MEDIR,
          error: String(e),
        });
      }
    }, 0);
  }

  return {
    state,
    setIterations: (v: string) => {
      if (ITERATIONS.test(v)) set({ iterations: v });
    },
    run,
  };
}
