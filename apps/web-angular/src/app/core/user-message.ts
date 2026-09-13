import { contractName, messageFor } from '@banco/contract';

/**
 * Convierte un error del core en el texto que ve el usuario.
 *
 * Reusa `contractName` y `messageFor` de `@banco/contract` en vez de escribir su propio mapeo:
 * una segunda copia se desincroniza, y además el test de contrato verifica esa misma función.
 * Se importa del barrel (`@banco/contract`, no `@banco/contract/testing`): ese entrypoint no
 * toca `node:fs` ni transitivamente, así que este módulo —código de producción que corre en el
 * navegador— se puede empaquetar sin que el bundler tropiece con un módulo de Node.
 *
 * **Los montos se interpolan crudos.** Nada de `formatPEN` acá: los mensajes de error muestran
 * el valor tal cual lo entrega el core, sin agrupar ni anteponer `S/`. El formateo de montos
 * vive en el borde de presentación de las pantallas de montos, no en los mensajes de error.
 *
 * `CoreFinancieroService` propaga los errores del core sin traducirlos, a propósito: esta
 * función es el borde de presentación donde un `DomainError` se convierte en texto humano, y es
 * trabajo de la capa de UI, no del adapter.
 */
export function userMessage(e: unknown): string {
  let plantilla: string;
  try {
    plantilla = messageFor(contractName(e));
  } catch {
    // **`userMessage` se llama siempre dentro de un `catch`, así que no puede lanzar.** Si lo
    // hiciera, la excepción saldría del handler y escaparía al borde de la UI: pantalla rota en
    // vez de un mensaje. Y llega acá cualquier cosa que no sea un `DomainError` reconocido — un
    // `TypeError` del runtime, un trap de WebAssembly (que en esta app no tiene la red del
    // `catch_unwind` de uniffi que sí tienen Android e iOS), un tag que `contractName` no
    // conoce —, porque `contractName` lanza a propósito con un tag desconocido (es la guardia
    // del Ruling P1, y el test de contrato **depende** de que lance: por eso el fallback va acá,
    // en el borde de UI, y no ahí). Fase 4 (React Native) tuvo que agregar el mismo fallback:
    // `apps/react-native/example/src/adapter/ContractMessages.ts`.
    return `Ocurrió un error inesperado: ${String(e)}`;
  }
  const campos = (e as { inner?: Record<string, string> }).inner ?? {};
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave) =>
    clave in campos ? campos[clave]! : coincidencia,
  );
}
