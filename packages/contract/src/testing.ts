import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sólo para Node, y sólo detrás del subpath `@banco/contract/testing`: usa `fs` para leer
 * `contracts/` directo del disco, en la copia única que leen las cinco bases de código. No se
 * copian acá ni se transforman: las comparaciones son igualdad exacta de strings contra este
 * JSON.
 *
 * Este módulo **no** se reexporta desde el entrypoint por defecto (`.`) del paquete: un bundler
 * de producción en el navegador (Angular, esbuild) no puede resolver `node:fs`, y no hace falta
 * que lo intente — `messageFor`, que sí es código de producción para las cuatro apps, importa el
 * JSON de forma estática en `messageFor.ts` y nunca llega hasta acá. Hallazgo C1 del review de la
 * Task 2: importar sólo `contractName` desde el barrel fallaba con
 * `Could not resolve "node:fs"` porque `index.ts` reexportaba este archivo.
 */
const CONTRACTS = join(__dirname, '..', '..', '..', 'contracts');

export type ContractFile = Record<string, unknown>;

/**
 * Un caso del contrato. Se tipa laxo a propósito: los grupos tienen formas distintas entre sí
 * —`esperado` es un string en `aritmetica` y un objeto en `cci`— y la comparación real la hace
 * `toBe` contra el JSON, no el tipo. Tiparlo fino acá sería una segunda copia del contrato.
 */
export type ContractCase = Record<string, any>;

export type MessagesFile = {
  version: string;
  mensajes: Record<string, string>;
};

export function loadCases(): ContractFile {
  return JSON.parse(readFileSync(join(CONTRACTS, 'cases.json'), 'utf8'));
}

export function loadMessages(): MessagesFile {
  return JSON.parse(readFileSync(join(CONTRACTS, 'messages.es.json'), 'utf8'));
}
