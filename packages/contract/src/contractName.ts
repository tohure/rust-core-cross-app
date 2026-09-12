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
  const nombre = CONTRACT_NAMES[tag as ContractTag];
  if (nombre === undefined) {
    throw new Error(`variante de DomainError sin nombre de contrato: ${String(tag)}`);
  }
  return nombre;
}
