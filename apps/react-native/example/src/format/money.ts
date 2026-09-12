/**
 * Inserta `S/` y los separadores de miles **por posición, sobre el string**.
 *
 * Nunca convierte a `number`: eso es exactamente el fallo que la POC exhibe. Y nunca redondea —
 * el core ya entregó el valor con la escala correcta (2 decimales para PEN); el formateo ocurre
 * sólo en el borde de presentación.
 *
 * **Por qué a mano y no con `Intl.NumberFormat`.** No es porque Hermes no lo soporte: se comprobó
 * sobre Android, iOS y Node y los tres lo soportan y coinciden entre sí. Es porque `Intl` separa
 * el símbolo con **U+00A0, espacio duro**, y los formateadores de Android y de iOS —los dos
 * escritos a mano sobre el string— usan **U+0020**. Esa diferencia de un byte es invisible en
 * pantalla y rompe la comparación carácter por carácter que es toda la tesis. Los code points
 * medidos están en PENDING.md.
 *
 * No se usa en los mensajes de error: ahí los montos van crudos, por la misma razón.
 *
 * **Diverge del de Swift en entradas exóticas, y no importa.** `MoneyFormatter.swift` normaliza
 * `"007.50"` a `S/ 7.50`, `".5"` a `S/ 0.5` y `"1e3"` a `S/ 1,000`; acá esas entradas no matchean
 * y se devuelven tal cual. En las tres apps el formateador se aplica **sólo a valores que devuelve
 * el core** —`itfFee`, `totalDebited`, `balance`—, que siempre vienen canónicos con dos decimales,
 * nunca a lo que tipea el usuario. Sobre esos valores las tres coinciden carácter por carácter,
 * que es lo único que la demo compara.
 */
export function formatPEN(amount: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!m) return amount;

  const [, signo, entera, decimales] = m;
  // El signo queda fuera del agrupado a propósito: si entrara, se comportaría como un dígito más
  // y, cuando la parte entera tiene un múltiplo de 3 dígitos, quedaría aislado en su propio
  // grupo — `-123456.78` saldría como `S/ -,123,456.78`.
  const conSeparadores = entera!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const parteDecimal = decimales === undefined ? '' : `.${decimales}`;
  return `S/ ${signo}${conSeparadores}${parteDecimal}`;
}
