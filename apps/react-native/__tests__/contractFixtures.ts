// Los lectores de `contracts/` (`loadCases`/`loadMessages`, basados en `fs`) ya no viven acá:
// se mudaron a `@banco/contract/testing` para que el test de contrato de React Native y el
// futuro de Angular lean la misma copia. Esto sólo corre en Node (proyecto "napi" de Jest), así
// que el subpath con `fs` es seguro acá — nunca lo bundlea Metro.
import {
  loadCases,
  loadMessages,
  type ContractCase,
} from '@banco/contract/testing';

export { loadCases, loadMessages };
export type {
  ContractFile,
  ContractCase,
  MessagesFile,
} from '@banco/contract/testing';

export function group(name: string): ContractCase[] {
  const g = loadCases()[name];
  if (!Array.isArray(g)) {
    throw new Error(
      `el grupo "${name}" no existe o no es un array en cases.json`
    );
  }
  return g;
}
