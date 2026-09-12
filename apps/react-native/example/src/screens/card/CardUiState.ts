/**
 * Dos bloques independientes, cada uno con **su propio error**: en la demo los dos están en
 * pantalla a la vez, y un fallo al descifrar un hex pegado no puede borrar el resultado de
 * cifrar — parecería que la operación de arriba se deshizo sola.
 */
export type CardUiState = {
  // Bloque de arriba: validar y cifrar.
  number: string;
  brand: string;
  masked: string;
  cipherHex: string;
  /** La vuelta completa. **No es decoración**: sin esto el hex es indistinguible de un hash. */
  decrypted: string;
  error: string;

  // Bloque de abajo: descifrar un hex de otra plataforma.
  pastedHex: string;
  recovered: string;
  pasteError: string;
};

export const initialCardState: CardUiState = {
  number: '',
  brand: '',
  masked: '',
  cipherHex: '',
  decrypted: '',
  error: '',
  pastedHex: '',
  recovered: '',
  pasteError: '',
};
