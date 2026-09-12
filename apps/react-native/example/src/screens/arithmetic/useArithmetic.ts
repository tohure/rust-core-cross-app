import { useState } from 'react';
import type { Core } from '../../adapter/core';
import { userMessage } from '../../adapter/ContractMessages';
import { nativeFloat } from '../../benchmark/NativeBaseline';
import {
  initialArithmeticState,
  type ArithmeticUiState,
  type Operation,
} from './ArithmeticUiState';

/**
 * El hook **no calcula nada**: llama al core y guarda lo que devuelve, tal cual.
 *
 * La única aritmética que ocurre acá es la de `nativeFloat`, que es la baseline rota que la
 * pantalla existe para exhibir.
 *
 * Los errores se convierten a texto de usuario **acá**, no en el adapter: el adapter propaga el
 * error del core sin tocarlo y la traducción ocurre en el borde de UI.
 */
export function useArithmetic(core: Core) {
  const [state, setState] = useState<ArithmeticUiState>(initialArithmeticState);

  const set = (patch: Partial<ArithmeticUiState>) =>
    setState((s) => ({ ...s, ...patch }));

  function calculate() {
    try {
      const coreResult =
        state.operation === 'add'
          ? core.add(state.a, state.b)
          : core.subtract(state.a, state.b);
      set({
        coreResult,
        nativeResult: nativeFloat(state.a, state.b, state.operation),
        error: '',
      });
    } catch (e) {
      set({ coreResult: '', nativeResult: '', error: userMessage(e) });
    }
  }

  return {
    state,
    setA: (a: string) => set({ a }),
    setB: (b: string) => set({ b }),
    setOperation: (operation: Operation) => set({ operation }),
    calculate,
  };
}
