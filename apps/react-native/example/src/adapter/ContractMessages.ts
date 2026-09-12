import { contractName } from '@banco/core-financiero';
import { messageFor } from '../contract/sources';

/**
 * Convierte un error del core en el texto que ve el usuario.
 *
 * Reusa `contractName` del paquete en vez de escribir su propio mapeo: una segunda copia se
 * desincroniza, y además el test de contrato verifica esa misma función.
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
  const plantilla = messageFor(contractName(e));
  const campos = (e as { inner?: Record<string, string> }).inner ?? {};
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave) =>
    clave in campos ? campos[clave]! : coincidencia
  );
}
