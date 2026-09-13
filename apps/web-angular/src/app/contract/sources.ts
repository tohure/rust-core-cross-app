import { InjectionToken } from '@angular/core';
import type { Account } from '@banco/core-financiero-wasm';
// Cinco niveles: contract -> app -> src -> web-angular -> apps -> raíz del repo. Mismo patrón
// que `apps/react-native/example/src/contract/sources.ts` y `packages/contract/src/messageFor.ts`:
// se importa el JSON de forma ESTÁTICA, sin `node:fs`, para que un bundler de navegador
// (esbuild, que es lo que usa el builder de Angular) lo empaquete sin tropezar con un módulo de
// Node. `resolveJsonModule` está prendido en `tsconfig.json` para que `tsc` tipe este import.
import cases from '../../../../../contracts/cases.json';

/**
 * Las dos cuentas de Transferencia salen del contrato y no de constantes en TypeScript:
 * hardcodearlas las haría divergir de las otras tres apps en cuanto alguien edite
 * `cases.json` — que es justo lo que este módulo existe para impedir. Android, iOS y React
 * Native las derivan igual (`initialAccounts()` en sus respectivos adapters).
 */
export function initialAccounts(): Account[] {
  return cases.cuentas_iniciales.map((a) => ({ id: a.id, holder: a.titular, balance: a.saldo }));
}

/** La clave fija de la demo de Tarjeta, también del contrato: nunca un literal en la pantalla. */
export function demoKey(): string {
  return cases._clave_demo_hex;
}

/** El nonce fijo de la demo de Tarjeta. Fijo a propósito, para que las cuatro app produzcan el
 * mismo hex — ver `contracts/README.md`. */
export function demoNonce(): string {
  return cases._nonce_demo_hex;
}

/**
 * Token de DI para las cuentas iniciales de Transferencia.
 *
 * Existe para que el spec de esa pantalla pueda sustituir el contrato por uno con ids
 * DISTINTOS —vía `TestBed` provider override— y así probar que `TransferScreen` deriva
 * `origin`/`destination`/`accounts` de lo inyectado, no de un literal escrito a mano en el
 * componente: comparar contra el `cases.json` real pasaría igual con literales hardcodeados
 * que hoy coinciden con él por casualidad.
 */
export const INITIAL_ACCOUNTS = new InjectionToken<Account[]>('INITIAL_ACCOUNTS', {
  factory: initialAccounts,
});
