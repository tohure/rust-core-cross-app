// Mismo test que `contract.napi.test.ts`, con otro import, y la duplicación es deliberada: los dos
// runtimes tienen que poder fallar por separado. Si sólo rompe uno, el problema está en ese flavour
// y no en el core — y eso se quiere leer de un vistazo, no deducirlo de un log. Factorizarlo en una
// función parametrizada por runtime ahorraría líneas y costaría justo esa lectura.
//
// Éste es el artefacto que consume Angular desde la Fase 5 (Task 4: `@banco/core-financiero-wasm`).
// Probarlo acá, contra el paquete y no contra un generado local de esta app, es lo que hace que esa
// fase arranque sin deuda: el mismo import que usa Angular es el que prueba este archivo.
import { beforeAll, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { group, loadCases, loadMessages } from './contractFixtures';
// `contractName` se importa directo de `@banco/contract`, no de `../src` (el entrypoint de la
// librería): este archivo también corre bajo el proyecto "napi" de Jest, Node puro, y
// `../src/index.tsx` arrastra `bindings.tsx` — que registra el turbo module vía Hermes y muere
// fuera de React Native.
import { contractName } from '@banco/contract';
import {
  add,
  calculateItf,
  decrypt,
  encrypt,
  executeTransfer,
  initCore,
  subtract,
  validateCard,
  validateCci,
} from '@banco/core-financiero-wasm';

const CASES = loadCases();
const KEY = CASES._clave_demo_hex as string;
const NONCE = CASES._nonce_demo_hex as string;

// A diferencia de N-API, el módulo WASM se abre de forma asíncrona y el host tiene que decirle
// dónde está el `.wasm`: no hay default, porque el nombre del asset sólo lo sabe el entorno — un
// bundler reescribe la URL al copiarlo. Acá se leen los bytes del archivo stageado por
// `ubrn build wasm2 --and-generate` en el paquete, no los que deja `cargo` crudos.
beforeAll(async () => {
  await initCore(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'packages',
        'core-financiero-wasm',
        'generated',
        'core_financiero.wasm'
      )
    )
  );
});

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

// Los 28 vectores de `contracts/cases.json`. Las comparaciones son **igualdad exacta de strings**
// con `toBe`, nunca numéricas con tolerancia: que eso pase en las cuatro plataformas *es* la
// demostración de la POC. Si un caso falla, el sospechoso es el código, no el contrato.
//
// Cada grupo va con `it.each` para que un fallo diga **cuál** caso falló sin leer el log.

describe('aritmetica', () => {
  // Los seis divergen bajo IEEE-754: `0.1 + 0.2` es `0.30000000000000004` en JavaScript y
  // `"0.30"` en el core. Ésa es toda la demostración.
  it.each(group('aritmetica'))('$id: $a $op $b = $esperado', (c) => {
    const r = c.op === 'sumar' ? add(c.a, c.b) : subtract(c.a, c.b);
    expect(r).toBe(c.esperado);
  });
});

describe('cci', () => {
  it.each(group('cci'))('$id: $entrada', (c) => {
    if (c.valido) {
      const r = validateCci(c.entrada);
      expect(r.bankCode).toBe(c.esperado.codigo_banco);
      expect(r.bankName).toBe(c.esperado.nombre_banco);
      expect(r.branch).toBe(c.esperado.oficina);
      expect(r.account).toBe(c.esperado.cuenta);
    } else {
      expect(() => validateCci(c.entrada)).toThrow();
      try {
        validateCci(c.entrada);
      } catch (e) {
        expect(contractName(e)).toBe(c.error);
      }
    }
  });
});

describe('itf', () => {
  // `itf-005` ("2500.00" -> "0.13") es el único que distingue `MidpointAwayFromZero` de banker's
  // rounding. Si falla sólo ése, el redondeo está mal; los otros cuatro no lo distinguen.
  it.each(group('itf'))('$id: $entrada -> $esperado', (c) => {
    expect(calculateItf(c.entrada)).toBe(c.esperado);
  });
});

describe('tarjeta', () => {
  // El nonce es fijo **a propósito**, para que las cuatro plataformas produzcan el mismo hex. En
  // producción eso sería catastrófico; está documentado en `contracts/README.md`.
  it.each(group('tarjeta'))('$id: $entrada', (c) => {
    if (c.valido) {
      const r = validateCard(c.entrada);
      expect(r.brand).toBe(c.esperado.marca);
      expect(r.masked).toBe(c.esperado.enmascarado);
      expect(encrypt(c.entrada, KEY, NONCE)).toBe(c.esperado.cifrado_hex);
      // La vuelta completa: es cifrado reversible, no un hash.
      expect(decrypt(c.esperado.cifrado_hex, KEY, NONCE)).toBe(c.entrada);
    } else {
      // `expect(...).toThrow()` y NO un `try/throw/catch`: con el centinela, si el core
      // aceptara la tarjeta, el `Error` que se lanza cae en su propio `catch` y `contractName`
      // se queja de una variante desconocida — el test falla, pero nombrando la causa
      // equivocada. Así el fallo dice «no lanzó».
      expect(() => validateCard(c.entrada)).toThrow();
      try {
        validateCard(c.entrada);
      } catch (e) {
        expect(contractName(e)).toBe(c.error);
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
      id: a.id,
      holder: a.titular,
      balance: a.saldo,
    }));

  // `tr-007` ("0.001" -> MontoInvalido) es la guardia de escala: sin esa puerta el redondeo al
  // formatear movía la suma de saldos y el invariante de conservación del dinero dejaba de valer.
  it.each(group('transferencia'))('$id: $entrada.monto', (c) => {
    const req = {
      origin: c.entrada.origen,
      destination: c.entrada.destino,
      amount: c.entrada.monto,
    };
    if (c.valido) {
      const r = executeTransfer(cuentas(), req);
      expect(r.itfFee).toBe(c.esperado.comision_itf);
      expect(r.totalDebited).toBe(c.esperado.total_debitado);
      expect(r.receipt).toBe(c.esperado.comprobante);
      // El **único** campo de toda la superficie que se compara como número, porque es
      // milisegundos y no dinero.
      expect(r.simulatedLatencyMs).toBe(c.esperado.latencia_simulada_ms);
      expect(r.accounts.map((a) => a.balance)).toEqual(
        c.esperado.cuentas.map((a: { saldo: string }) => a.saldo)
      );
    } else {
      // Mismo motivo que en `tarjeta`: el centinela caía en su propio `catch` y el fallo
      // nombraba la causa equivocada.
      expect(() => executeTransfer(cuentas(), req)).toThrow();
      try {
        executeTransfer(cuentas(), req);
      } catch (e) {
        expect(contractName(e)).toBe(c.error);
      }
    }
  });
});
