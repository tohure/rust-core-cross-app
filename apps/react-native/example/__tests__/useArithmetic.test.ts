import { describe, expect, it } from '@jest/globals';
// `renderHook` de @testing-library/react-native v14 es **asíncrono** —devuelve una Promise— a
// diferencia de v13, que es la que el plan asumía. Sin el `await`, `result` viene `undefined`; y
// sin `await act(...)` el re-render no llega a ocurrir antes del `expect` y el estado se lee viejo.
import { act, renderHook } from '@testing-library/react-native';
import { fakeCore } from '../src/adapter/FakeCore';
import { useArithmetic } from '../src/screens/arithmetic/useArithmetic';

describe('useArithmetic', () => {
  it('guarda el resultado del core tal cual, sin tocarlo', async () => {
    const core = fakeCore({ add: () => '0.30' });
    const { result } = await renderHook(() => useArithmetic(core));
    await act(async () => result.current.calculate());
    expect(result.current.state.coreResult).toBe('0.30');
  });

  it('un error del core se guarda como texto de usuario en el estado, no sube como excepción', async () => {
    const core = fakeCore({
      add: () => {
        throw { tag: 'InvalidAmount', inner: { detail: 'x' } };
      },
    });
    const { result } = await renderHook(() => useArithmetic(core));
    await act(async () => result.current.calculate());
    expect(result.current.state.error).not.toBe('');
    expect(result.current.state.coreResult).toBe('');
  });

  it('restar llama a subtract, no a add', async () => {
    const core = fakeCore({
      add: () => 'NO DEBE LLAMARSE',
      subtract: () => '0.10',
    });
    const { result } = await renderHook(() => useArithmetic(core));
    await act(async () => result.current.setOperation('subtract'));
    await act(async () => result.current.calculate());
    expect(result.current.state.coreResult).toBe('0.10');
  });
});
