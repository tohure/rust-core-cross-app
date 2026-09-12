import { describe, expect, it, jest } from '@jest/globals';
// Igual que `renderHook`, el `render` de RNTL v14 es **asíncrono**: sin el `await`, `screen`
// queda sin montar y el error —«`render` function has not been called»— no dice por qué.
// Es la misma raíz del Ruling T19-1, que sólo había mordido en `renderHook`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  LabeledField,
  PrimaryButton,
  ResultRow,
  SectionDivider,
} from '../src/ui/components';

describe('PrimaryButton', () => {
  it('mientras carga muestra el spinner en lugar del label y no dispara la acción', async () => {
    // Android (`CircularProgressIndicator` dentro del `Button`) e iOS (`ProgressView` dentro
    // del suyo) mantienen el botón en su sitio y lo deshabilitan. Si acá el botón se
    // reemplazara por un spinner suelto, el layout saltaría y las tres pantallas dejarían de
    // verse iguales al ponerlas lado a lado, que es lo único que la demo compara.
    const onPress = jest.fn();
    await render(
      <PrimaryButton title="Transferir" loading={true} onPress={onPress} />
    );
    expect(screen.queryByText('Transferir')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('sin cargar muestra el label exacto, sin transformarlo', async () => {
    // El `Button` de React Native lo renderizaría como `TRANSFERIR` en Android. Ver Ruling T19-2.
    await render(<PrimaryButton title="Transferir" onPress={() => {}} />);
    expect(screen.getByText('Transferir')).toBeTruthy();
  });
});

describe('contenedores de fila', () => {
  it('LabeledField, ResultRow y SectionDivider no se dejan aplanar', async () => {
    // Guarda de regresión de un defecto que **sólo se ve en el aparato**: sin
    // `collapsable={false}`, Fabric aplana estos contenedores y, al insertarse el bloque
    // `Resultado` encima de la lista de saldos, el label de una fila termina pintado sobre
    // otra. RNTL no tiene layout nativo, así que no puede reproducirlo; lo único que este
    // test puede hacer —y hace— es impedir que alguien quite la prop sin leer por qué está.
    // Ver el comentario largo en `ui/components/index.tsx` y el Ruling T20-7.
    await render(
      <>
        <LabeledField label="Origen" value="1" onChangeText={() => {}} />
        <ResultRow label="Comisión ITF" value="S/ 0.01" />
        <SectionDivider title="Saldos" />
      </>
    );
    const contar = (n: unknown): number => {
      if (n === null || typeof n !== 'object') return 0;
      const nodo = n as {
        props?: Record<string, unknown>;
        children?: unknown[];
      };
      const propio = nodo.props?.collapsable === false ? 1 : 0;
      const hijos = Array.isArray(nodo.children) ? nodo.children : [];
      return propio + hijos.reduce<number>((acc, h) => acc + contar(h), 0);
    };
    const arbol = screen.toJSON();
    const nodos = Array.isArray(arbol) ? arbol : [arbol];
    expect(nodos.reduce<number>((acc, n) => acc + contar(n), 0)).toBe(3);
  });
});
