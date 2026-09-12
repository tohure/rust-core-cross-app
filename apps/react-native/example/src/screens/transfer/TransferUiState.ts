import type { Account } from '@banco/core-financiero';
import { initialAccounts } from '../../contract/sources';

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
  accounts: Account[];
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
