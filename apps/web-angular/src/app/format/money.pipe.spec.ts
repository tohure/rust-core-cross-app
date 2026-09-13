import { formatPEN, MoneyPipe } from './money.pipe';

// Porteado de `apps/react-native/example/__tests__/money.test.ts`: mismo formateador, mismos
// casos. Los valores salen de montos que el core produce de verdad (ver `contracts/cases.json`).
describe('formatPEN', () => {
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
    // Si el signo entrara al agrupado se comportaría como un dígito más y, cuando la parte
    // entera tiene un múltiplo de 3 dígitos, quedaría aislado en su propio grupo:
    // `S/ -,123,456.78`. Es el bug real que el formateador de Android ya encontró.
    expect(formatPEN('-123456.78')).toBe('S/ -123,456.78');
  });

  it('usa espacio NORMAL (U+0020), no el espacio duro (U+00A0) que emite Intl.NumberFormat', () => {
    // Comprobado por CODE POINT, no a ojo sobre el literal: un U+00A0 es indistinguible en
    // pantalla de un U+0020, y es exactamente el byte que rompería la comparación carácter por
    // carácter de la POC entre las cuatro apps. 'S'=0, '/'=1, el separador está en el índice 2.
    expect(formatPEN('4899.99').codePointAt(2)).toBe(0x20);
  });
});

describe('MoneyPipe', () => {
  it('es un envoltorio de una línea: transform delega en formatPEN sin tocar el resultado', () => {
    const pipe = new MoneyPipe();
    expect(pipe.transform('4899.99')).toBe(formatPEN('4899.99'));
  });
});
