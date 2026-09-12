import { contractName } from '@banco/core-financiero';
import { messageFor } from '../contract/sources';

/**
 * Convierte un error del core en el texto que ve el usuario.
 *
 * Reusa `contractName` del paquete en vez de escribir su propio mapeo: una segunda copia se
 * desincroniza, y además el test de contrato verifica esa misma función. `contractName` y
 * `messageFor` viven las dos en `@banco/contract` —la primera reexportada desde
 * `@banco/core-financiero`, la segunda desde `../contract/sources`— así que no hay ninguna
 * lógica de mapeo propia de esta app entre el error y el string que ve el usuario.
 *
 * El `message` del binding **no se usa**: uniffi no propaga los `#[error("...")]` en español del
 * core, arma el mensaje con los campos de la variante y lo deja vacío para las que no tienen. Es
 * diagnóstico, nunca texto de usuario.
 *
 * **Los montos se interpolan crudos.** Nada de `Intl.NumberFormat` acá: los formateadores de
 * Android, iOS y el navegador no coinciden entre sí, y una diferencia rompe la comparación
 * carácter por carácter que es toda la tesis de la POC. El formateo va en el borde de
 * presentación, no acá.
 */
export function userMessage(e: unknown): string {
  let plantilla: string;
  try {
    plantilla = messageFor(contractName(e));
  } catch {
    // **`userMessage` se llama siempre dentro de un `catch`, así que no puede lanzar.** Si lo
    // hiciera, la excepción saldría del handler del hook y llegaría al `onPress` de React: caja
    // roja en desarrollo, botón muerto en release. Y llega acá cualquier cosa que no sea un
    // `DomainError` — un `TypeError` de la capa JSI, un trap de WebAssembly, un error del
    // bundler—, porque `contractName` lanza a propósito con un tag que no reconoce (es la
    // guardia del Ruling P1, y el test de contrato **depende** de que lance: por eso el fallback
    // va acá, en el borde de UI, y no ahí).
    //
    // Android hace exactamente lo mismo:
    // `(e as? DomainException)?.let(messages::userMessage) ?: e.toString()`.
    return `Ocurrió un error inesperado: ${String(e)}`;
  }
  const campos = (e as { inner?: Record<string, string> }).inner ?? {};
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave) =>
    clave in campos ? campos[clave]! : coincidencia
  );
}
