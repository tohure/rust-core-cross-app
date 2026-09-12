import { describe, expect, it } from '@jest/globals';
// `renderHook` de RNTL v14 es asíncrono (Rulings T19-1 y T20-6).
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fakeCore } from '../src/adapter/FakeCore';
import { useBenchmark } from '../src/screens/benchmark/useBenchmark';
import { SIN_MEDIR } from '../src/screens/benchmark/BenchmarkUiState';

const MEDIDA = /^\d+\.\d{2} µs$/;
const coreOk = () => fakeCore({ add: () => '0.30' });

describe('useBenchmark', () => {
  it('cero iteraciones no arranca ni deja el spinner colgado', async () => {
    const { result } = await renderHook(() => useBenchmark(coreOk()));
    await act(async () => result.current.setIterations('0'));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.running).toBe(false));
    // La trampa que Android ya pagó (commit ad45cac): con n = 0 el índice del percentil se
    // iba fuera de rango, la corrutina moría DESPUÉS de prender el spinner y la pantalla
    // quedaba cargando para siempre.
    expect(result.current.state.error).not.toBe('');
    expect(result.current.state.coreP50).toBe(SIN_MEDIR);
  });

  it('la entrada vacía tampoco arranca', async () => {
    const { result } = await renderHook(() => useBenchmark(coreOk()));
    await act(async () => result.current.setIterations(''));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.running).toBe(false));
    expect(result.current.state.error).not.toBe('');
  });

  it('con iteraciones válidas produce las cuatro medidas y suelta el spinner', async () => {
    const { result } = await renderHook(() => useBenchmark(coreOk()));
    await act(async () => result.current.setIterations('10'));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.running).toBe(false));
    // No alcanza con "distinto de vacío": el estado arranca en `—`, así que eso pasaría sin
    // haber medido nada. Se exige la forma real de una medida.
    expect(result.current.state.coreP50).toMatch(MEDIDA);
    expect(result.current.state.coreP95).toMatch(MEDIDA);
    expect(result.current.state.nativeP50).toMatch(MEDIDA);
    expect(result.current.state.nativeP95).toMatch(MEDIDA);
    expect(result.current.state.error).toBe('');
  });

  it('llama al core una vez por iteración, no una sola vez', async () => {
    let llamadas = 0;
    const core = fakeCore({
      add: () => {
        llamadas += 1;
        return '0.30';
      },
    });
    const { result } = await renderHook(() => useBenchmark(core));
    await act(async () => result.current.setIterations('25'));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.running).toBe(false));
    expect(llamadas).toBe(25);
  });

  it('un error del core se muestra, no se traga', async () => {
    const core = fakeCore({
      add: () => {
        throw { tag: 'InvalidAmount', inner: { detail: 'x' } };
      },
    });
    const { result } = await renderHook(() => useBenchmark(core));
    await act(async () => result.current.setIterations('5'));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.running).toBe(false));
    // El benchmark de Android se tragaba los errores del core; acá se muestran.
    expect(result.current.state.error).not.toBe('');
  });

  it('una corrida que falla borra las medidas de la anterior', async () => {
    let falla = false;
    const core = fakeCore({
      add: () => {
        if (falla) throw { tag: 'InvalidAmount', inner: { detail: 'x' } };
        return '0.30';
      },
    });
    const { result } = await renderHook(() => useBenchmark(core));
    await act(async () => result.current.setIterations('5'));
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.coreP50).toMatch(MEDIDA));

    // Dejar los números de la corrida anterior debajo del error los hace parecer de ésta.
    falla = true;
    await act(async () => result.current.run());
    await waitFor(() => expect(result.current.state.error).not.toBe(''));
    expect(result.current.state.coreP50).toBe(SIN_MEDIR);
    expect(result.current.state.nativeP95).toBe(SIN_MEDIR);
  });

  it('el filtro de iteraciones topa en 6 dígitos', async () => {
    const { result } = await renderHook(() => useBenchmark(coreOk()));
    await act(async () => result.current.setIterations('999999'));
    expect(result.current.state.iterations).toBe('999999');
    // Sin el tope, teclear 10000000 dispara 2 × 10^7 llamadas al core sin forma de
    // cancelarlas. Android e iOS topan igual.
    await act(async () => result.current.setIterations('1000000'));
    expect(result.current.state.iterations).toBe('999999');
    await act(async () => result.current.setIterations('12a'));
    expect(result.current.state.iterations).toBe('999999');
  });
});
