/**
 * Las nueve variantes de `DomainError` y su nombre en el contrato.
 *
 * `contracts/cases.json` y `messages.es.json` están indexados por el nombre **en español**, y
 * ese mapeo **no cruza el FFI**: uniffi no propaga los `#[error("...")]` del core. Sin esta
 * tabla, ni el test de contrato ni la UI encuentran nada.
 *
 * Vive en un paquete neutral porque lo necesitan tres consumidores —el test de contrato de
 * React Native, la app de React Native y Angular— y dos copias se desincronizan.
 */
export const CONTRACT_NAMES = {
  Length: 'Longitud',
  CheckDigit: 'DigitoControl',
  UnknownBank: 'BancoDesconocido',
  InvalidAmount: 'MontoInvalido',
  AccountNotFound: 'CuentaNoEncontrada',
  SameAccount: 'MismaCuenta',
  InsufficientFunds: 'SaldoInsuficiente',
  Encryption: 'Cifrado',
  OutOfRange: 'FueraDeRango',
} as const;

/**
 * La unión de tags que esta tabla cubre. **No se importa de ningún flavour a propósito:** este
 * paquete no puede depender de los bindings generados de uno. La equivalencia contra el
 * `DomainError['tag']` real la aserta cada flavour en su propio `guard.ts`.
 */
export type ContractTag = keyof typeof CONTRACT_NAMES;
