import type { Account } from '@banco/core-financiero';
// Cinco niveles: contract -> src -> example -> react-native -> apps -> raíz del repo.
import cases from '../../../../../contracts/cases.json';
import messages from '../../../../../contracts/messages.es.json';

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

export function messageFor(contractName: string): string {
  const m = messages.mensajes[contractName as keyof typeof messages.mensajes];
  // `=== undefined`, no falsy: un mensaje vacío en el contrato existe, y reportarlo como
  // "no hay mensaje" mandaría el throw por un camino que escapa del catch del hook.
  if (m === undefined) {
    throw new Error(`no hay mensaje de usuario para "${contractName}"`);
  }
  return m;
}
