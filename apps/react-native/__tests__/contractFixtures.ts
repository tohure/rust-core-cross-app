// Carga los archivos de contrato desde `contracts/`, que es la copia única que leen las cinco
// bases de código. No se copian acá ni se transforman: las comparaciones son igualdad exacta de
// strings contra este JSON.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACTS = join(__dirname, '..', '..', '..', 'contracts');

export type ContractFile = Record<string, unknown>;
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

export function group(name: string): Record<string, string>[] {
  const g = loadCases()[name];
  if (!Array.isArray(g)) {
    throw new Error(
      `el grupo "${name}" no existe o no es un array en cases.json`
    );
  }
  return g;
}
