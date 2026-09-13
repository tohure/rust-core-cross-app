/**
 * **LA ÚNICA EXCEPCIÓN PERMITIDA** a la regla de cero lógica de negocio fuera de `rust-core`, y
 * existe para EXHIBIR el fallo del punto flotante en las pantallas de Aritmética y Benchmark, no
 * para calcular nada de verdad.
 *
 * Esto es aritmética IEEE-754 sobre montos: exactamente lo que el resto del proyecto prohíbe
 * (ver la regla del invariante en `CLAUDE.md`). Está aislada en este archivo y con este
 * comentario para que quede claro que no es un descuido. `nativeFloat('0.1', '0.2', 'add')` da
 * acá `'0.30000000000000004'`; el core da `'0.30'`. **NO copiar este patrón a ningún otro
 * archivo.**
 *
 * Portado de `apps/react-native/example/src/benchmark/NativeBaseline.ts`, la misma excepción
 * documentada en las otras tres apps.
 */
export function nativeFloat(a: string, b: string, op: 'add' | 'subtract'): string {
  const x = parseFloat(a);
  const y = parseFloat(b);
  return String(op === 'add' ? x + y : x - y);
}
