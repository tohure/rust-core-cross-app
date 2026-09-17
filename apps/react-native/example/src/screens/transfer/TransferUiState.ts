import type { Account } from '@banco/core-financiero';
import { initialAccounts } from '../../contract/sources';

/**
 * `readonly` **no es estilo: es la guardia contra mutar un `Record` de uniffi en el lugar.**
 *
 * Los `Record` generados son objetos mutables, y en JavaScript son tipos de *referencia*. Si
 * alguien hiciera `state.accounts[0].balance = "…"` y guardara el mismo array, React compara con
 * `Object.is`, ve la misma referencia y **no vuelve a renderizar**: la pantalla queda mostrando
 * el saldo viejo. Es un riesgo de corrección, no de rendimiento.
 *
 * Android tiene que cazarlo con un test (`UniffiRecordsAreNotMutatedTest`) porque Kotlin no puede
 * expresarlo en el tipo. **Acá sí se puede, y por eso no hace falta portar aquel test**: con
 * `readonly` el intento de mutar es un error de compilación, que es una guardia más fuerte y más
 * barata. iOS no necesita ninguna de las dos: sus `Record` son `struct`, o sea tipos de valor.
 * Ver docs/cross-app-pending.md.
 */
/**
 * Todos los montos son `String`. El estado es el último lugar donde alguien se tienta con un
 * número, y el estado **no calcula**: guarda lo que devolvió el core, tal cual.
 *
 * `simulatedLatencyMs` no se guarda: se consume al recibirlo y no se pinta.
 */
export type TransferUiState = {
  origin: string;
  destination: string;
  amount: string;
  loading: boolean;
  readonly accounts: readonly Readonly<Account>[];
  itfFee: string;
  totalDebited: string;
  receipt: string;
  error: string;
};

/**
 * Es una función y no una constante porque `initialAccounts()` lee el contrato.
 *
 * **Los dos CCI salen de las cuentas del contrato, no de literales acá.** Hardcodearlos los
 * haría divergir de las otras tres apps en cuanto alguien edite `cases.json` — que es
 * exactamente lo que `initialAccounts()` existe para impedir. Android e iOS los derivan igual.
 *
 * El monto arranca **vacío**: lo tipea quien hace la demo (`docs/demo-runbook.md`, acto 2),
 * igual que en las otras dos apps.
 */
export function initialTransferState(): TransferUiState {
  const accounts = initialAccounts();
  return {
    origin: accounts[0]?.id ?? '',
    destination: accounts[1]?.id ?? '',
    amount: '',
    loading: false,
    accounts,
    itfFee: '',
    totalDebited: '',
    receipt: '',
    error: '',
  };
}
