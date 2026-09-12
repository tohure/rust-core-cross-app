import type { DomainError } from './bindings';

/**
 * Traduce una variante de `DomainError` al nombre en español que usa el contrato.
 *
 * Este mapeo NO cruza el FFI: uniffi no usa los `#[error("...")]` en español del core.
 * `contracts/cases.json` y `contracts/messages.es.json` están indexados por estos nombres, así
 * que sin esta función ni el test de contrato ni la UI pueden encontrar nada.
 */

/**
 * La tabla, y **la guardia 4**: el `satisfies` obliga a que las claves sean exactamente las
 * variantes de `DomainError`. Una décima variante en el core rompe `tsc` nombrando la que falta,
 * en vez de caer en un "Desconocido" que pasaría en verde. Y a diferencia de un `switch` con
 * `default: never`, esto además caza la clave **de más** — un nombre mal escrito no compila.
 */
const NOMBRES = {
  Length: 'Longitud',
  CheckDigit: 'DigitoControl',
  UnknownBank: 'BancoDesconocido',
  InvalidAmount: 'MontoInvalido',
  AccountNotFound: 'CuentaNoEncontrada',
  SameAccount: 'MismaCuenta',
  InsufficientFunds: 'SaldoInsuficiente',
  Encryption: 'Cifrado',
  OutOfRange: 'FueraDeRango',
} as const satisfies Record<DomainError['tag'], string>;

export function contractName(e: unknown): string {
  // Se discrimina por la PRESENCIA de `tag`, no con `DomainError.instanceOf(e)`. `instanceOf`
  // compara contra la clase de **su propio módulo**, y esta fase lo rompe en dos sitios: los
  // tests de los hooks lanzan dobles de prueba —objetos planos con `tag`, que no son instancias
  // de nada— y el test de contrato por WASM recibe errores del módulo wasm, que no son
  // instancias de la clase del módulo JSI. Discriminar por `tag` funciona en los tres flavours.
  const { tag } = e as DomainError;
  const nombre = NOMBRES[tag];
  if (nombre === undefined) {
    throw new Error(
      `variante de DomainError sin nombre de contrato: ${String(tag)}`
    );
  }
  return nombre;
}
