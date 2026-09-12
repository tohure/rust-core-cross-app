import type { Account } from '@banco/core-financiero';
// Cinco niveles: contract -> src -> example -> react-native -> apps -> raíz del repo.
import cases from '../../../../../contracts/cases.json';

/**
 * Las dos cuentas salen del contrato y no de constantes en TypeScript: hardcodearlas las haría
 * divergir de las otras tres apps, que es justo lo que `cases.json` existe para impedir.
 */
export function initialAccounts(): Account[] {
  return cases.cuentas_iniciales.map((a) => ({
    id: a.id,
    holder: a.titular,
    balance: a.saldo,
  }));
}

/** La clave y el nonce de la demo salen del contrato, igual que las cuentas. */
export function demoKey(): string {
  return cases._clave_demo_hex;
}

export function demoNonce(): string {
  return cases._nonce_demo_hex;
}

// `messageFor` ya no se reimplementa acá: era una copia exacta de la de `@banco/contract`, que
// importa `messages.es.json` de forma estática (segura para el bundle de Metro y de Vite) por el
// mismo motivo que este archivo lo hacía a mano. Se reexporta para no romper a quien ya la
// importaba de `./sources`.
export { messageFor } from '@banco/contract';
