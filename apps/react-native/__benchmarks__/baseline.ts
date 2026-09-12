/**
 * LA EXCEPCIÓN, y existe para exhibir la divergencia. Aritmética IEEE-754 sobre montos: lo
 * que el resto del proyecto prohíbe. Aislada aquí y con este comentario para que quede claro
 * que no es un descuido. NO copiar este patrón.
 */
export function baselineAdd(a: string, b: string): string {
  return String(parseFloat(a) + parseFloat(b));
}

export function baselineSubtract(a: string, b: string): string {
  return String(parseFloat(a) - parseFloat(b));
}
