import { describe, expect, it, jest } from '@jest/globals';
// `renderHook` y `render` de RNTL v14 son **asíncronos**, a diferencia de la v13 que asumía el
// plan. Ver Rulings T19-1 y T20-6.
import { act, renderHook } from '@testing-library/react-native';

// La clave y el nonce se sustituyen por valores RECONOCIBLES. Comparar contra los del contrato
// real no probaría nada: un literal hardcodeado con el valor de hoy pasaría igual. Con
// `jest.mock` —y NO `isolateModules`, que carga una segunda copia de React y mata el `useState`
// (Ruling T20-1)— el módulo se reemplaza sin tocar el registro del resto.
jest.mock('../src/contract/sources', () => ({
  ...jest.requireActual<typeof import('../src/contract/sources')>(
    '../src/contract/sources'
  ),
  demoKey: () => 'CLAVE-DE-PRUEBA',
  demoNonce: () => 'NONCE-DE-PRUEBA',
}));

import { fakeCore } from '../src/adapter/FakeCore';
import { useCard } from '../src/screens/card/useCard';

const VISA = '4111111111111111';
const HEX = 'bdca3931';

function coreQueCifra(overrides = {}) {
  return fakeCore({
    validateCard: () => ({ brand: 'Visa', masked: '4111 **** **** 1111' }),
    encrypt: () => HEX,
    decrypt: (hex: string) => {
      if (hex === HEX) return VISA;
      throw { tag: 'Encryption', inner: { detail: 'x' } };
    },
    ...overrides,
  });
}

describe('useCard', () => {
  it('cifra y descifra en el mismo gesto: la vuelta completa', async () => {
    // El fake devuelve un centinela DISTINTO del número tecleado, y no `VISA`. Con `VISA` el
    // test no distingue «lo descifró el core» de «la pantalla repitió lo que tecleaste»:
    // verificado por mutación, reemplazar la llamada a `decrypt` por `state.number` lo dejaba
    // en verde. Y eso es justo lo que esta pantalla existe para demostrar.
    const DEL_CORE = 'NUMERO-DEVUELTO-POR-EL-CORE';
    const descifrados: string[] = [];
    const core = coreQueCifra({
      decrypt: (hex: string) => {
        descifrados.push(hex);
        return DEL_CORE;
      },
    });
    const { result } = await renderHook(() => useCard(core));
    await act(async () => result.current.setNumber(VISA));
    await act(async () => result.current.validateAndEncrypt());
    expect(result.current.state.brand).toBe('Visa');
    expect(result.current.state.masked).toBe('4111 **** **** 1111');
    expect(result.current.state.cipherHex).toBe(HEX);
    // Sin esta vuelta el hex es indistinguible de un hash para quien mira la demo.
    expect(result.current.state.decrypted).toBe(DEL_CORE);
    // Y descifra EL HEX QUE ACABA DE PRODUCIR, no otra cosa.
    expect(descifrados).toEqual([HEX]);
  });

  it('la clave y el nonce salen del contrato, no de literales del código', async () => {
    const recibidos: string[][] = [];
    const core = coreQueCifra({
      encrypt: (texto: string, clave: string, nonce: string) => {
        recibidos.push([texto, clave, nonce]);
        return HEX;
      },
    });
    const { result } = await renderHook(() => useCard(core));
    await act(async () => result.current.setNumber(VISA));
    await act(async () => result.current.validateAndEncrypt());
    expect(recibidos).toEqual([[VISA, 'CLAVE-DE-PRUEBA', 'NONCE-DE-PRUEBA']]);
  });

  it('un fallo al descifrar un hex pegado NO borra el resultado de cifrar', async () => {
    const { result } = await renderHook(() => useCard(coreQueCifra()));
    await act(async () => result.current.setNumber(VISA));
    await act(async () => result.current.validateAndEncrypt());
    await act(async () => result.current.setPastedHex('deadbeef'));
    await act(async () => result.current.decryptPasted());
    expect(result.current.state.pasteError).not.toBe('');
    // Los dos bloques están en pantalla a la vez durante la demo.
    expect(result.current.state.cipherHex).toBe(HEX);
    expect(result.current.state.decrypted).toBe(VISA);
    expect(result.current.state.error).toBe('');
  });

  it('un número que el core rechaza limpia el resultado anterior y apaga sólo su bloque', async () => {
    let rechaza = false;
    const core = coreQueCifra({
      validateCard: () => {
        if (rechaza) throw { tag: 'CheckDigit', inner: {} };
        return { brand: 'Visa', masked: '4111 **** **** 1111' };
      },
    });
    const { result } = await renderHook(() => useCard(core));
    await act(async () => result.current.setNumber(VISA));
    await act(async () => result.current.validateAndEncrypt());
    await act(async () => result.current.setPastedHex(HEX));
    await act(async () => result.current.decryptPasted());
    expect(result.current.state.recovered).toBe(VISA);

    rechaza = true;
    await act(async () => result.current.validateAndEncrypt());
    expect(result.current.state.error).not.toBe('');
    expect(result.current.state.cipherHex).toBe('');
    expect(result.current.state.decrypted).toBe('');
    // El bloque de abajo no se toca.
    expect(result.current.state.recovered).toBe(VISA);
  });

  it('los filtros de texto descartan lo que no corresponde', async () => {
    const { result } = await renderHook(() => useCard(fakeCore()));
    await act(async () => result.current.setNumber('4111-1111'));
    expect(result.current.state.number).toBe(''); // sólo dígitos
    await act(async () => result.current.setPastedHex('DEADBEEF'));
    expect(result.current.state.pastedHex).toBe(''); // sólo [0-9a-f], minúscula
    await act(async () => result.current.setPastedHex('deadbeef'));
    expect(result.current.state.pastedHex).toBe('deadbeef');
  });

  it('editar un campo consume el error de SU bloque, no el del otro', async () => {
    const core = coreQueCifra({
      validateCard: () => {
        throw { tag: 'CheckDigit', inner: {} };
      },
    });
    const { result } = await renderHook(() => useCard(core));
    await act(async () => result.current.validateAndEncrypt());
    await act(async () => result.current.setPastedHex('ff'));
    await act(async () => result.current.decryptPasted());
    expect(result.current.state.error).not.toBe('');
    expect(result.current.state.pasteError).not.toBe('');

    await act(async () => result.current.setNumber('4'));
    expect(result.current.state.error).toBe('');
    expect(result.current.state.pasteError).not.toBe(''); // el otro bloque sigue intacto

    await act(async () => result.current.setPastedHex('ffa'));
    expect(result.current.state.pasteError).toBe('');
  });
});
