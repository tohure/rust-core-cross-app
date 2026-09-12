/**
 * **LA ÚNICA EXCEPCIÓN PERMITIDA** a «cero reglas de negocio fuera de `rust-core`», y existe para
 * **exhibir el fallo**, no para calcular nada de verdad.
 *
 * Esto es aritmética IEEE-754 sobre montos: es exactamente lo que el resto del proyecto prohíbe.
 * Está aislada en este archivo y con este comentario para que quede claro que no es un descuido.
 * `0.1 + 0.2` da acá `0.30000000000000004`, y el core da `"0.30"`.
 *
 * **NO copiar este patrón a ningún otro archivo.**
 */
export function nativeFloat(
  a: string,
  b: string,
  op: 'add' | 'subtract'
): string {
  const x = parseFloat(a);
  const y = parseFloat(b);
  return String(op === 'add' ? x + y : x - y);
}
