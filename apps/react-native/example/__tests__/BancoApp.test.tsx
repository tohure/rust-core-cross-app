import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { BancoApp } from '../src/ui/navigation/BancoApp';
import { CoreVersionFooter } from '../src/ui/components';
import { fakeCore } from '../src/adapter/FakeCore';

describe('BancoApp', () => {
  it('mantiene las cuatro pantallas montadas, no sólo la activa', async () => {
    // Renderizar sólo la pestaña activa desmonta las otras tres y **mata su `useState`**:
    // transferir, cambiar de pestaña y volver borraba el comprobante y los saldos. Android ya
    // pagó este defecto y lo arregló elevando los cuatro ViewModels fuera del `when`
    // (`BancoApp.kt`), e iOS lo evita porque `TabView` mantiene las cuatro vistas vivas.
    // Verificado en el emulador antes y después de este cambio.
    //
    // `includeHiddenElements` no es un atajo para que pase: es exactamente lo que se quiere
    // distinguir. Las tres inactivas se ocultan con `display: 'none'`, que las saca del árbol
    // de accesibilidad —y por eso de las queries por defecto de RNTL—, pero **siguen
    // montadas**, que es lo que conserva su estado. Si alguien volviera a renderizar sólo la
    // activa, las otras tres no estarían ni ocultas: no existirían, y esto se pone rojo.
    await render(<BancoApp />);
    const opciones = { includeHiddenElements: true };
    expect(screen.getByText('El float rompe el dinero', opciones)).toBeTruthy();
    expect(screen.getByText('Dos cuentas en memoria', opciones)).toBeTruthy();
    expect(
      screen.getByText('Luhn y cifrado ChaCha20-Poly1305', opciones)
    ).toBeTruthy();
    expect(
      screen.getByText('Core vs. implementación nativa', opciones)
    ).toBeTruthy();

    // Y sólo una está visible a la vez.
    expect(screen.getByText('El float rompe el dinero')).toBeTruthy();
    expect(screen.queryByText('Dos cuentas en memoria')).toBeNull();
  });

  it('los cuatro labels de pestaña van completos, como en Android y en iOS', async () => {
    // Salieron abreviados (`Transf.`, `Bm`) del wireframe ASCII de ui-spec.md, que abrevia por
    // ancho de columna. El texto normativo los nombra enteros.
    await render(<BancoApp />);
    const esperados: Record<string, string> = {
      arithmetic: 'Aritmética',
      transfer: 'Transferencia',
      card: 'Tarjeta',
      benchmark: 'Benchmark',
    };
    for (const [key, label] of Object.entries(esperados)) {
      const pestana = screen.getByTestId(`tab-${key}`);
      expect(pestana).toHaveTextContent(label);
    }
  });

  it('el pie muestra el string del core tal cual, sin reformatear', async () => {
    // Es el primer paso del runbook y el criterio de que las apps corren el mismo build.
    // Antes no se podía probar: `CoreVersionFooter` importaba `coreVersion` del paquete, así
    // que el `coreVersion` de `FakeCore` era código muerto y nada podía llegar a él.
    await render(<CoreVersionFooter version={fakeCore().coreVersion()} />);
    expect(screen.getByTestId('core-version')).toHaveTextContent(
      '1.0.0+fake123'
    );
  });
});
