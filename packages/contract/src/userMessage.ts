import { contractName } from './contractName';
import { messageFor } from './messageFor';

/**
 * Lo que ve el usuario cuando falla algo que **no** es un error de dominio. Normativo en
 * `docs/ui-spec.md`, igual en las cuatro apps.
 *
 * **No dice «vuelve a intentarlo» a propósito.** Si el módulo nativo no cargó —o si en Angular lo
 * que llegó fue un trap de WebAssembly, que deja la instancia del módulo inutilizable hasta
 * recargar la página— reintentar no arregla nada, y prometer una salida que no existe es peor que
 * no decir nada.
 */
export const FALLBACK = 'No se pudo completar la operación.';

/**
 * Traduce un error del core al texto que ve el usuario.
 *
 * **Vive acá y no en cada app.** Estuvo escrita dos veces, casi idéntica, en React Native y en
 * Angular; el arreglo de la Fase 6 —que el diagnóstico dejara de llegar a la pantalla— hubo que
 * aplicarlo en los dos lugares, que es exactamente el modo de fallo de una copia duplicada.
 * Android e iOS tienen su propia versión porque son otro lenguaje, pero el TEXTO es el mismo en
 * las cuatro y lo norma `docs/ui-spec.md`.
 *
 * Reusa `contractName` y `messageFor` de este mismo paquete, así que no hay ninguna lógica de
 * mapeo propia de una app entre el error y el string que ve el usuario. Y se queda en el
 * entrypoint por defecto —nada acá toca `node:fs`, ni transitivamente—, que es lo que permite
 * empaquetarla para el navegador.
 *
 * **Los montos se interpolan CRUDOS.** Nada de `Intl.NumberFormat` ni de `formatPEN` acá: los
 * formateadores de Android, iOS y el navegador no coinciden entre sí, y una diferencia rompe la
 * comparación carácter por carácter que es toda la tesis de la POC. El formateo vive en el borde
 * de presentación de las pantallas de montos, no en los mensajes de error.
 *
 * **El `message` del binding no se usa**: uniffi no propaga los `#[error("...")]` en español del
 * core, arma el mensaje con los campos de la variante y lo deja vacío para las que no tienen. Es
 * diagnóstico, nunca texto de usuario.
 */
export function userMessage(e: unknown): string {
  let plantilla: string;
  try {
    plantilla = messageFor(contractName(e));
  } catch {
    // **`userMessage` se llama siempre dentro de un `catch`, así que no puede lanzar.** Si lo
    // hiciera, la excepción saldría del handler y llegaría al borde de la UI: en React Native, al
    // `onPress` —caja roja en desarrollo, botón muerto en release—; en Angular, pantalla rota en
    // vez de un mensaje. Y llega acá cualquier cosa que no sea un `DomainError` reconocido: un
    // `TypeError` del runtime, un trap de WebAssembly, un tag que `contractName` no conoce —
    // porque `contractName` lanza a propósito con un tag desconocido (es la guardia del Ruling
    // P1, y el test de contrato **depende** de que lance: por eso el fallback va acá, en el borde
    // de UI, y no ahí).
    //
    // **El texto de diagnóstico NO va a la pantalla.** Antes acá volvía
    // `Ocurrió un error inesperado: ${String(e)}`; la Fase 6 lo corrigió en las cuatro apps
    // después de comprobar, con un test rojo en Android, que ese camino ponía
    // `java.lang.UnsatisfiedLinkError: dlopen failed: …` en la cara del usuario.
    //
    // El diagnóstico no se pierde: va a la consola. En Angular eso importa más que en las otras
    // tres — si lo que llegó es un trap de WebAssembly, **todas** las operaciones siguientes van
    // a fallar igual hasta recargar, y sin la consola eso se ve como una app que dejó de
    // responder sin decir por qué.
    console.error('error no-dominio en el borde de UI:', e);
    return FALLBACK;
  }
  const campos = (e as { inner?: Record<string, string> }).inner ?? {};
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave) =>
    clave in campos ? campos[clave]! : coincidencia
  );
}
