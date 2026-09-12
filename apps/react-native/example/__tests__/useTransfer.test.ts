import { describe, expect, it, jest } from '@jest/globals';
// `renderHook` de @testing-library/react-native v14 es **asíncrono** —devuelve una Promise— a
// diferencia de v13, que es la que el plan asumía. Sin el `await`, `result` viene `undefined`; y
// sin `await act(...)` el re-render no llega a ocurrir antes del `expect` y el estado se lee
// viejo. Ver Ruling T19-1.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fakeCore } from '../src/adapter/FakeCore';
import { useTransfer } from '../src/screens/transfer/useTransfer';
import { initialTransferState } from '../src/screens/transfer/TransferUiState';

const resultado = {
  accounts: [
    { id: '00219100123456789047', holder: 'Ana Quispe', balance: '4899.99' },
    { id: '01122000987654321065', holder: 'Luis Ramos', balance: '1300.50' },
  ],
  itfFee: '0.01',
  totalDebited: '100.01',
  receipt: 'TRF-9047-1065-10000',
  simulatedLatencyMs: 10,
};

describe('useTransfer', () => {
  it('el monto arranca vacío y las cuentas del contrato llegan al estado del hook', async () => {
    const { result } = await renderHook(() => useTransfer(fakeCore()));
    expect(result.current.state).toEqual(initialTransferState());
    // Lo tipea quien hace la demo (`docs/demo-runbook.md`, acto 2), igual que en Android y iOS.
    expect(result.current.state.amount).toBe('');
  });

  it('guarda los strings del core tal cual, sin tocarlos', async () => {
    const core = fakeCore({ executeTransfer: () => resultado });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.transfer());
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(result.current.state.itfFee).toBe('0.01');
    expect(result.current.state.totalDebited).toBe('100.01');
    expect(result.current.state.receipt).toBe('TRF-9047-1065-10000');
    // Los saldos que se pintan son los que devolvió el core, no los de partida.
    expect(result.current.state.accounts[0]!.balance).toBe('4899.99');
  });

  it('espera simulatedLatencyMs antes de soltar el estado de carga', async () => {
    const core = fakeCore({
      executeTransfer: () => ({ ...resultado, simulatedLatencyMs: 50 }),
    });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.transfer());
    expect(result.current.state.loading).toBe(true);
    expect(result.current.state.receipt).toBe('');
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(result.current.state.receipt).toBe('TRF-9047-1065-10000');
  });

  it('el filtro de monto acepta hasta 2 decimales y rechaza el resto', async () => {
    const { result } = await renderHook(() => useTransfer(fakeCore()));
    await act(async () => result.current.setAmount('100.00'));
    expect(result.current.state.amount).toBe('100.00');
    // Rechazado: el estado no cambia. Filtro de TEXTO, no regla de negocio — quien valida
    // sigue siendo el core, y `tr-007` lo prueba en el test de contrato.
    await act(async () => result.current.setAmount('100.001'));
    expect(result.current.state.amount).toBe('100.00');
    // La coma que un `decimal-pad` con locale es-PE puede ofrecer se descarta.
    await act(async () => result.current.setAmount('1,50'));
    expect(result.current.state.amount).toBe('100.00');
  });

  it('el monto viaja al core tal como se tecleó, sin normalizar', async () => {
    // La regla es del CONTEXT: punto decimal, sin `S/` y sin separadores de miles, y **sin
    // que la app lo toque**. Un `replace(',', '.')` bienintencionado acá sería la app
    // arreglando la entrada en vez del core rechazándola, que es lo contrario de la tesis.
    const recibidos: string[] = [];
    const core = fakeCore({
      executeTransfer: (_accounts, request) => {
        recibidos.push(request.amount);
        return resultado;
      },
    });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.setAmount('100.5'));
    await act(async () => result.current.transfer());
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(recibidos).toEqual(['100.5']);
  });

  it('un error del core se guarda como texto de usuario y apaga el spinner', async () => {
    const core = fakeCore({
      executeTransfer: () => {
        throw {
          tag: 'InsufficientFunds',
          inner: { available: '50.00', required: '100.01' },
        };
      },
    });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.transfer());
    await waitFor(() =>
      expect(result.current.state.error).toBe(
        'Saldo insuficiente: tienes 50.00 y se necesitan 100.01.'
      )
    );
    // El bug clásico: el catch se olvida de apagar el spinner y la pantalla queda cargando
    // para siempre.
    expect(result.current.state.loading).toBe(false);
  });

  it('una transferencia fallida limpia el resultado anterior', async () => {
    let falla = false;
    const core = fakeCore({
      executeTransfer: () => {
        if (falla) throw { tag: 'SameAccount', inner: {} };
        return resultado;
      },
    });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.transfer());
    await waitFor(() => expect(result.current.state.receipt).not.toBe(''));

    // Un fallo no puede dejar el comprobante anterior en pantalla debajo del error: parece
    // que la segunda transferencia surtió efecto parcial.
    falla = true;
    await act(async () => result.current.transfer());
    await waitFor(() => expect(result.current.state.error).not.toBe(''));
    expect(result.current.state.receipt).toBe('');
    expect(result.current.state.itfFee).toBe('');
    expect(result.current.state.totalDebited).toBe('');
  });

  it('editar un campo consume el error anterior', async () => {
    const core = fakeCore({
      executeTransfer: () => {
        throw { tag: 'SameAccount', inner: {} };
      },
    });
    const { result } = await renderHook(() => useTransfer(core));
    await act(async () => result.current.transfer());
    await waitFor(() => expect(result.current.state.error).not.toBe(''));
    await act(async () => result.current.setOrigin('0021'));
    expect(result.current.state.error).toBe('');
  });
});

describe('initialTransferState', () => {
  it('deriva los dos CCI de las cuentas del contrato, no de constantes del código', () => {
    // El contrato se sustituye por otro con ids DISTINTOS a propósito. Comparar contra el
    // `cases.json` real no probaría nada: un `origin` escrito como literal con el CCI de hoy
    // pasaría igual, y el test recién fallaría el día que alguien edite el contrato — que es
    // justamente el día en que tiene que avisar. Verificado por mutación.
    //
    // Se aísla ESTE módulo y no el hook porque `TransferUiState.ts` no importa React:
    // `isolateModules` sobre el hook carga una segunda copia de React, cuyo dispatcher es
    // `null`, y el test muere en `useState` por una razón que no tiene que ver con lo que mide.
    const cuentasDeOtroContrato = [
      { id: 'CCI-ORIGEN-DE-PRUEBA', holder: 'Ana Quispe', balance: '5000.00' },
      { id: 'CCI-DESTINO-DE-PRUEBA', holder: 'Luis Ramos', balance: '1200.50' },
    ];
    let aislado!: typeof initialTransferState;
    jest.isolateModules(() => {
      jest.doMock('../src/contract/sources', () => ({
        ...jest.requireActual<typeof import('../src/contract/sources')>(
          '../src/contract/sources'
        ),
        initialAccounts: () => cuentasDeOtroContrato,
      }));
      aislado =
        require('../src/screens/transfer/TransferUiState').initialTransferState;
    });

    const estado = aislado();
    expect(estado.accounts).toEqual(cuentasDeOtroContrato);
    expect(estado.origin).toBe('CCI-ORIGEN-DE-PRUEBA');
    expect(estado.destination).toBe('CCI-DESTINO-DE-PRUEBA');
  });
});
