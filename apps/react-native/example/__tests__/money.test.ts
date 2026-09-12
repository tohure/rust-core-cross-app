import { describe, expect, it } from '@jest/globals';
import { formatPEN } from '../src/format/money';

describe('formatPEN', () => {
  // Los casos salen de valores que el core produce de verdad, tomados de `cases.json`.
  it.each([
    ['0.01', 'S/ 0.01'],
    ['0.30', 'S/ 0.30'],
    ['100.01', 'S/ 100.01'],
    ['1300.50', 'S/ 1,300.50'],
    ['4899.99', 'S/ 4,899.99'],
    ['1000000.30', 'S/ 1,000,000.30'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(formatPEN(entrada)).toBe(esperado);
  });

  it('no redondea ni altera la escala que entregó el core', () => {
    expect(formatPEN('1499.82')).toBe('S/ 1,499.82');
  });

  it('devuelve el string tal cual si no tiene forma de monto', () => {
    // El formateador nunca inventa: si no reconoce la entrada, no la toca.
    expect(formatPEN('no-es-un-monto')).toBe('no-es-un-monto');
  });

  it('separa el signo ANTES de agrupar', () => {
    // Si el signo entra al agrupado se comporta como un dígito más y, cuando la parte entera
    // tiene un múltiplo de 3 dígitos, queda aislado en su propio grupo: `S/ -,123,456.78`.
    // Es un bug real que el formateador de Android ya encontró y dejó documentado.
    expect(formatPEN('-123456.78')).toBe('S/ -123,456.78');
  });

  it('usa espacio NORMAL, no el espacio duro que emite Intl', () => {
    // Intl.NumberFormat produce U+00A0 entre el símbolo y el número, y Android e iOS producen
    // U+0020. La diferencia es invisible en pantalla y rompe la comparación de la POC.
    expect(formatPEN('1.00').codePointAt(2)).toBe(0x20);
  });
});
