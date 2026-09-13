import messages from '../../../contracts/messages.es.json';

/**
 * Traduce un nombre del contrato (p. ej. `"MismaCuenta"`, salida de `contractName`) al mensaje
 * de usuario en español que define `messages.es.json`.
 *
 * Importa el JSON de forma **estática**, no con `fs`: este módulo es alcanzable desde el
 * entrypoint por defecto de `@banco/contract`, y `messageFor` es código de producción que corre
 * en el navegador (Angular) además de en React Native — un bundler de producción no puede
 * resolver `node:fs` ahí. `loadCases`/`loadMessages`, que sí usan `fs` para los tests en Node,
 * viven aparte en `@banco/contract/testing` y nunca son alcanzables desde acá. Hallazgo C1 del
 * review de la Task 2.
 *
 * `=== undefined`, no falsy: un mensaje vacío en el contrato existe, y tratarlo como ausente
 * mandaría el throw por un camino que escapa del catch del consumidor. Corregido en la Fase 4.
 */
export function messageFor(name: string): string {
  const m = messages.mensajes[name as keyof typeof messages.mensajes];
  if (m === undefined) {
    throw new Error(`no hay mensaje de usuario para "${name}"`);
  }
  return m;
}
