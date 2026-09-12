import { Injectable } from '@angular/core';
import {
  add, calculateItf, coreVersion, decrypt, encrypt, executeTransfer,
  initCore, subtract, validateCard, validateCci,
  type Account, type TransferRequest,
} from '@banco/core-financiero-wasm';

/**
 * El único punto de contacto con el WASM.
 *
 * **No traduce nombres ni tipos: reexporta.** Una segunda nomenclatura en TypeScript hay que
 * mantenerla a mano y se desincroniza en la primera regeneración del paquete.
 *
 * Tampoco traduce errores: los propaga tal cual. La conversión a texto de usuario ocurre en el
 * componente, que es el borde de presentación.
 */
@Injectable({ providedIn: 'root' })
export class CoreFinancieroService {
  add = add;
  subtract = subtract;
  calculateItf = calculateItf;
  validateCci = validateCci;
  validateCard = validateCard;
  encrypt = encrypt;
  decrypt = decrypt;
  executeTransfer = (accounts: Account[], request: TransferRequest) =>
    executeTransfer(accounts, request);
  coreVersion = coreVersion;
}

/**
 * Carga el módulo UNA vez, al arrancar, para que ninguna pantalla espere en la primera
 * interacción.
 *
 * **Se pasan BYTES y no la `Response`.** Con bytes, `@ubjs/wasm` usa `WebAssembly.compile`, que
 * **no mira el Content-Type**; sólo `compileStreaming` exige `application/wasm`. Por eso este
 * proyecto no depende de que el builder sirva el MIME correcto, que es el punto donde el
 * CONTEXT advertía que más tiempo se pierde. Se pierde la compilación en streaming: para
 * 180 KB es irrelevante.
 */
export async function cargarCore(): Promise<void> {
  const respuesta = await fetch('core_financiero.wasm');
  await initCore(await respuesta.arrayBuffer());
}
