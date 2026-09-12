import { useState } from 'react';
import type { Core } from '../../adapter/core';
import { userMessage } from '../../adapter/ContractMessages';
import { demoKey, demoNonce } from '../../contract/sources';
import { initialCardState, type CardUiState } from './CardUiState';

// Salen del contrato, igual que las cuentas de Transferencia: son datos compartidos por las
// cuatro apps. `contract/sources` es el único módulo que conoce la ruta a `contracts/`.
const KEY = demoKey();
const NONCE = demoNonce();

// Filtros de TEXTO, no validaciones. Quien decide si el número pasa Luhn o si el hex es
// descifrable es el core: `tj-006` (número inválido) lo prueba en el test de contrato.
//
// El hex se acepta sólo en minúscula, que es lo que fija `docs/ui-spec.md` y lo que hace iOS.
// Es también lo único que el core emite, así que pegar el hex de otra app siempre entra.
const DIGITS = /^\d*$/;
const HEX = /^[0-9a-f]*$/;

/**
 * El hook **no calcula nada**: llama al core y guarda lo que devuelve, tal cual. No hay ni un
 * dígito de Luhn ni un byte de cifrado en TypeScript.
 */
export function useCard(core: Core) {
  const [state, setState] = useState<CardUiState>(initialCardState);

  const set = (patch: Partial<CardUiState>) =>
    setState((s) => ({ ...s, ...patch }));

  /** Valida por Luhn, cifra, **y vuelve a descifrar**. Las tres cosas en un gesto. */
  function validateAndEncrypt() {
    try {
      const card = core.validateCard(state.number);
      const cipherHex = core.encrypt(state.number, KEY, NONCE);
      // La vuelta completa: sin esto el hex no se distingue de un hash.
      const decrypted = core.decrypt(cipherHex, KEY, NONCE);
      set({
        brand: card.brand,
        masked: card.masked,
        cipherHex,
        decrypted,
        error: '',
      });
    } catch (e) {
      // Limpia sólo SU bloque: el de abajo queda como estaba.
      set({
        brand: '',
        masked: '',
        cipherHex: '',
        decrypted: '',
        error: userMessage(e),
      });
    }
  }

  /**
   * Descifra un hex producido por **otra plataforma**. Es la demostración en vivo de la tesis:
   * el hex que cifró Android, iOS o Angular se pega acá y sale el mismo número, porque la
   * clave, el nonce y el algoritmo vienen del mismo core de Rust.
   */
  function decryptPasted() {
    try {
      set({
        recovered: core.decrypt(state.pastedHex, KEY, NONCE),
        pasteError: '',
      });
    } catch (e) {
      set({ recovered: '', pasteError: userMessage(e) });
    }
  }

  // Editar un campo consume el error de SU bloque, como en Android y en iOS. El del otro
  // bloque no se toca: son independientes.
  return {
    state,
    setNumber: (n: string) => {
      if (DIGITS.test(n)) set({ number: n, error: '' });
    },
    setPastedHex: (h: string) => {
      if (HEX.test(h)) set({ pastedHex: h, pasteError: '' });
    },
    validateAndEncrypt,
    decryptPasted,
  };
}
