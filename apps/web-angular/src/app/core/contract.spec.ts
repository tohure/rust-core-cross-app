// Puerto de `apps/react-native/__tests__/contract.wasm.test.ts` a Angular: la quinta base de
// código que corre `contracts/cases.json`. A diferencia de aquel archivo, éste consume
// `CoreFinancieroService` — inyectado con `TestBed` — en vez de importar `@banco/core-financiero-wasm`
// directo: es el mismo borde que van a usar las pantallas, así que este spec prueba ese borde real,
// no un acceso paralelo al WASM.
//
// Las cinco guardias del contrato viven en dos lugares distintos a propósito: la guardia 4 es de
// COMPILE-TIME y vive en `packages/core-financiero-wasm/src/guard.ts` (la sostiene `tsc`, no un
// `it`). Las guardias 1, 2, 3 y 5 son en runtime y están acá abajo, como en el archivo de origen.
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { contractName } from '@banco/contract';
import { loadCases, loadMessages, type ContractCase } from '@banco/contract/testing';
import { initCore } from '@banco/core-financiero-wasm';
import { CoreFinancieroService } from './core-financiero.service';

const CASES = loadCases();
const KEY = CASES['_clave_demo_hex'] as string;
const NONCE = CASES['_nonce_demo_hex'] as string;

function group(name: string): ContractCase[] {
  const g = loadCases()[name];
  if (!Array.isArray(g)) {
    throw new Error(`el grupo "${name}" no existe o no es un array en cases.json`);
  }
  return g;
}

// Mismo arnés que `core-financiero.service.spec.ts`: bajo el `unit-test` builder de Angular
// (Vitest + jsdom) el `Buffer` de `readFileSync` no pasa `instanceof Uint8Array` en ese realm, y
// `UniffiNativeModule.open` lo rechaza. Envolverlo en un `Uint8Array` del realm local lo resuelve.
beforeAll(async () => {
  const bytes = readFileSync('../../packages/core-financiero-wasm/generated/core_financiero.wasm');
  await initCore(new Uint8Array(bytes));
});

describe('guardias del contrato', () => {
  it('1 — la versión y la moneda son las esperadas', () => {
    const c = loadCases();
    expect(c['version']).toBe('2.3.0');
    expect(c['moneda']).toBe('PEN');
  });

  // **El motivo de esta guardia es distinto del que tiene en Rust y en Swift, y está
  // verificado, no supuesto.** Allá un grupo vaciado a `[]` genera cero casos y el test
  // **reporta éxito**: la guardia de conteo es la única red. Vitest no: `it.each([])` falla
  // ruidosamente. Así que acá esta guardia no protege contra un grupo **vacío** —de eso ya se
  // encarga Vitest— sino contra uno **incompleto**: cinco casos donde debería haber seis
  // pasarían en verde sin que nada avise.
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
    expect(Object.keys(loadMessages().mensajes).sort()).toEqual([...nombres].sort());
    // Y que `contractName` produzca exactamente esos nombres, no otros parecidos.
    expect(contractName({ tag: 'SameAccount' })).toBe('MismaCuenta');
  });
});

// Los 28 vectores de `contracts/cases.json`. Las comparaciones son **igualdad exacta de strings**
// con `toBe`, nunca numéricas con tolerancia: que eso pase en las cinco bases de código *es* la
// demostración de la POC. Si un caso falla, el sospechoso es el código, no el contrato.
//
// Cada grupo va con `it.each` para que un fallo diga **cuál** caso falló sin leer el log.

describe('aritmetica', () => {
  // Los seis divergen bajo IEEE-754: `0.1 + 0.2` es `0.30000000000000004` en JavaScript y
  // `"0.30"` en el core. Ésa es toda la demostración.
  it.each(group('aritmetica'))('$id: $a $op $b = $esperado', (c) => {
    const core = TestBed.inject(CoreFinancieroService);
    const r = c['op'] === 'sumar' ? core.add(c['a'], c['b']) : core.subtract(c['a'], c['b']);
    expect(r).toBe(c['esperado']);
  });
});

describe('cci', () => {
  it.each(group('cci'))('$id: $entrada', (c) => {
    const core = TestBed.inject(CoreFinancieroService);
    if (c['valido']) {
      const r = core.validateCci(c['entrada']);
      expect(r.bankCode).toBe(c['esperado'].codigo_banco);
      expect(r.bankName).toBe(c['esperado'].nombre_banco);
      expect(r.branch).toBe(c['esperado'].oficina);
      expect(r.account).toBe(c['esperado'].cuenta);
    } else {
      expect(() => core.validateCci(c['entrada'])).toThrow();
      try {
        core.validateCci(c['entrada']);
      } catch (e) {
        expect(contractName(e)).toBe(c['error']);
      }
    }
  });
});

describe('itf', () => {
  // `itf-005` ("2500.00" -> "0.13") es el único que distingue `MidpointAwayFromZero` de banker's
  // rounding. Si falla sólo ése, el redondeo está mal; los otros cuatro no lo distinguen.
  it.each(group('itf'))('$id: $entrada -> $esperado', (c) => {
    const core = TestBed.inject(CoreFinancieroService);
    expect(core.calculateItf(c['entrada'])).toBe(c['esperado']);
  });
});

describe('tarjeta', () => {
  // El nonce es fijo **a propósito**, para que las cinco plataformas produzcan el mismo hex. En
  // producción eso sería catastrófico; está documentado en `contracts/README.md`.
  it.each(group('tarjeta'))('$id: $entrada', (c) => {
    const core = TestBed.inject(CoreFinancieroService);
    if (c['valido']) {
      const r = core.validateCard(c['entrada']);
      expect(r.brand).toBe(c['esperado'].marca);
      expect(r.masked).toBe(c['esperado'].enmascarado);
      expect(core.encrypt(c['entrada'], KEY, NONCE)).toBe(c['esperado'].cifrado_hex);
      // La vuelta completa: es cifrado reversible, no un hash.
      expect(core.decrypt(c['esperado'].cifrado_hex, KEY, NONCE)).toBe(c['entrada']);
    } else {
      // `expect(...).toThrow()` y NO un `try/throw/catch`: con el centinela, si el core
      // aceptara la tarjeta, el `Error` que se lanza cae en su propio `catch` y `contractName`
      // se queja de una variante desconocida — el test falla, pero nombrando la causa
      // equivocada. Así el fallo dice «no lanzó».
      expect(() => core.validateCard(c['entrada'])).toThrow();
      try {
        core.validateCard(c['entrada']);
      } catch (e) {
        expect(contractName(e)).toBe(c['error']);
      }
    }
  });
});

describe('transferencia', () => {
  // Se reconstruyen desde el contrato en cada caso: `executeTransfer` es pura y devuelve cuentas
  // nuevas, pero reusar el mismo array entre casos escondería un aliasing si alguna vez dejara
  // de serlo.
  const cuentas = () =>
    group('cuentas_iniciales').map((a) => ({
      id: a['id'],
      holder: a['titular'],
      balance: a['saldo'],
    }));

  // `tr-007` ("0.001" -> MontoInvalido) es la guardia de escala: sin esa puerta el redondeo al
  // formatear movía la suma de saldos y el invariante de conservación del dinero dejaba de valer.
  it.each(group('transferencia'))('$id: $entrada.monto', (c) => {
    const core = TestBed.inject(CoreFinancieroService);
    const req = {
      origin: c['entrada'].origen,
      destination: c['entrada'].destino,
      amount: c['entrada'].monto,
    };
    if (c['valido']) {
      const r = core.executeTransfer(cuentas(), req);
      expect(r.itfFee).toBe(c['esperado'].comision_itf);
      expect(r.totalDebited).toBe(c['esperado'].total_debitado);
      expect(r.receipt).toBe(c['esperado'].comprobante);
      // El **único** campo de toda la superficie que se compara como número, porque es
      // milisegundos y no dinero.
      expect(r.simulatedLatencyMs).toBe(c['esperado'].latencia_simulada_ms);
      expect(r.accounts.map((a) => a.balance)).toEqual(
        c['esperado'].cuentas.map((a: { saldo: string }) => a.saldo),
      );
    } else {
      // Mismo motivo que en `tarjeta`: el centinela caía en su propio `catch` y el fallo
      // nombraba la causa equivocada.
      expect(() => core.executeTransfer(cuentas(), req)).toThrow();
      try {
        core.executeTransfer(cuentas(), req);
      } catch (e) {
        expect(contractName(e)).toBe(c['error']);
      }
    }
  });
});
