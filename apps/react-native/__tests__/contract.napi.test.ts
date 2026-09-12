import { describe, expect, it } from '@jest/globals';
import { group, loadCases, loadMessages } from './contractFixtures';
import { contractName } from '../src/contractName';

describe('guardias del contrato', () => {
  it('1 — la versión y la moneda son las esperadas', () => {
    const c = loadCases();
    expect(c.version).toBe('2.3.0');
    expect(c.moneda).toBe('PEN');
  });

  // **El motivo de esta guardia es distinto del que tiene en Rust y en Swift, y está
  // verificado, no supuesto.** Allá un grupo vaciado a `[]` genera cero casos y el test
  // **reporta éxito**: la guardia de conteo es la única red. Jest no: `it.each([])` falla
  // ruidosamente con ``Error: `.each` called with an empty Array of table data.``
  // Así que acá esta guardia no protege contra un grupo **vacío** —de eso ya se encarga Jest—
  // sino contra uno **incompleto**: cinco casos donde debería haber seis pasarían en verde sin
  // que nada avise.
  it('2 — cada grupo tiene el número de casos esperado', () => {
    expect(group('aritmetica')).toHaveLength(6);
    expect(group('cci')).toHaveLength(4);
    expect(group('itf')).toHaveLength(5);
    expect(group('tarjeta')).toHaveLength(6);
    expect(group('transferencia')).toHaveLength(7);
    expect(group('cuentas_iniciales')).toHaveLength(2);
  });

  it('3 — las claves de primer nivel son exactamente las esperadas', () => {
    const esperadas = [
      '_alicuota_itf',
      '_clave_demo_hex',
      '_nonce_demo_hex',
      '_nota',
      'aritmetica',
      'cci',
      'cuentas_iniciales',
      'itf',
      'moneda',
      'tarjeta',
      'transferencia',
      'version',
    ];
    // En los dos sentidos: una clave nueva y una clave faltante fallan igual.
    expect(Object.keys(loadCases()).sort()).toEqual(esperadas);
  });

  it('5 — messages.es.json cubre las nueve variantes del core', () => {
    const nombres = [
      'Longitud',
      'DigitoControl',
      'BancoDesconocido',
      'MontoInvalido',
      'CuentaNoEncontrada',
      'MismaCuenta',
      'SaldoInsuficiente',
      'Cifrado',
      'FueraDeRango',
    ];
    expect(Object.keys(loadMessages().mensajes).sort()).toEqual(
      [...nombres].sort()
    );
    // Y que `contractName` produzca exactamente esos nombres, no otros parecidos.
    expect(contractName({ tag: 'SameAccount' })).toBe('MismaCuenta');
  });
});
