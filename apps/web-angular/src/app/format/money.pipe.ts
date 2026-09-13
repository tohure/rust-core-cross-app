import { Pipe, type PipeTransform } from '@angular/core';

/**
 * Inserta `S/` y los separadores de miles **por posición, sobre el string**.
 *
 * Nunca convierte a `number`: eso es exactamente el fallo que la POC exhibe. Y nunca redondea —
 * el core ya entregó el valor con la escala correcta (2 decimales para PEN); el formateo ocurre
 * sólo en el borde de presentación.
 *
 * **Por qué a mano y no con `Intl.NumberFormat` (ni con `CurrencyPipe`, que además exige un
 * `number`).** `Intl` separa el símbolo con **U+00A0, espacio duro**; los formateadores de
 * Android, iOS y React Native —los tres escritos a mano sobre el string— usan **U+0020**. Esa
 * diferencia de un byte es invisible en pantalla y rompe la comparación carácter por carácter
 * que es toda la tesis de la POC. Medido en la Fase 4 y verificado de nuevo acá por code point,
 * no a ojo.
 *
 * Porteado de `apps/react-native/example/src/format/money.ts`. No se usa en los mensajes de
 * error: ahí los montos van crudos, por la misma razón (ver `user-message.ts`).
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

/** Envoltorio de una línea sobre `formatPEN`, que es la función que lleva los tests. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform = formatPEN;
}
