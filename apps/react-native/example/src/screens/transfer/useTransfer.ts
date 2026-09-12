import { useState } from 'react';
import type { Core } from '../../adapter/core';
import { userMessage } from '../../adapter/ContractMessages';
import { initialTransferState, type TransferUiState } from './TransferUiState';

/**
 * Filtro de TEXTO, no regla de negocio: decide si el string que el usuario acaba de teclear se
 * acepta en el campo. No parsea, no redondea, no calcula. Quien valida sigue siendo el core, y
 * `tr-007` lo prueba en el test de contrato.
 *
 * Es el mismo patrón, carácter por carácter, que `TransferViewModel.kt` y
 * `TransferViewModel.swift`. Si cambia, cambia en las tres.
 */
const AMOUNT = /^\d{0,9}(\.\d{0,2})?$/;

/**
 * El hook **no calcula nada**: llama al core y guarda lo que devuelve, tal cual.
 *
 * Los errores se convierten a texto de usuario **acá**, no en el adapter: el adapter propaga el
 * error del core sin tocarlo y la traducción ocurre en el borde de UI.
 */
export function useTransfer(core: Core) {
  const [state, setState] = useState<TransferUiState>(initialTransferState);

  const set = (patch: Partial<TransferUiState>) =>
    setState((s) => ({ ...s, ...patch }));

  function transfer() {
    set({ loading: true, error: '' });
    try {
      const r = core.executeTransfer(state.accounts, {
        origin: state.origin,
        destination: state.destination,
        // El string viaja al core **tal como se tecleó**: punto decimal, sin `S/` y sin
        // separadores de miles.
        amount: state.amount,
      });
      // Se espera la latencia simulada para que parezca una llamada de red. NO HAY RED: el
      // número lo devuelve el core.
      setTimeout(() => {
        set({
          loading: false,
          accounts: r.accounts,
          itfFee: r.itfFee,
          totalDebited: r.totalDebited,
          receipt: r.receipt,
        });
      }, r.simulatedLatencyMs);
    } catch (e) {
      // Un fallo limpia el resultado anterior: dejar el comprobante viejo debajo del error
      // hace parecer que la transferencia surtió efecto parcial. Y apaga el spinner — el bug
      // clásico es olvidarlo en el catch y dejar la pantalla cargando para siempre.
      set({
        loading: false,
        itfFee: '',
        totalDebited: '',
        receipt: '',
        error: userMessage(e),
      });
    }
  }

  // Editar cualquier campo CONSUME el error anterior: si no, el mensaje queda en pantalla
  // contradiciendo lo que el usuario acaba de corregir. Android e iOS hacen lo mismo.
  return {
    state,
    setOrigin: (origin: string) => set({ origin, error: '' }),
    setDestination: (destination: string) => set({ destination, error: '' }),
    setAmount: (amount: string) => {
      if (AMOUNT.test(amount)) set({ amount, error: '' });
    },
    transfer,
  };
}
