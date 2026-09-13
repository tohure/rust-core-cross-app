import { CONTRACT_NAMES, type ContractTag } from './tags';

/**
 * Se discrimina por la PRESENCIA de `tag`, no con `DomainError.instanceOf(e)`: `instanceOf`
 * compara contra la clase de **su propio módulo**, y acá llegan errores de tres orígenes
 * distintos —objetos planos de los tests, el módulo JSI y el módulo WASM—. Ruling P1.
 *
 * **Lanza con un tag desconocido a propósito.** El test de contrato depende de ese ruido. El
 * fallback para no romper la UI va en `userMessage`, que es el borde de presentación.
 */
export function contractName(e: unknown): string {
  const tag = (e as { tag?: string }).tag;
  // `Object.hasOwn`, no un índice directo: `CONTRACT_NAMES[tag]` también "encuentra" cualquier
  // propiedad heredada de `Object.prototype` (`toString`, `constructor`, `hasOwnProperty`, ...),
  // y la firma de esta función dice `: string` — un `toString` heredado devolvería una función.
  // Hallazgo I3 del review de la Task 2.
  if (tag === undefined || !Object.hasOwn(CONTRACT_NAMES, tag)) {
    throw new Error(`variante de DomainError sin nombre de contrato: ${String(tag)}`);
  }
  return CONTRACT_NAMES[tag as ContractTag];
}
