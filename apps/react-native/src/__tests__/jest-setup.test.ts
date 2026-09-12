// Prueba la **infraestructura** de Jest, no el dominio. Existe porque las dos piezas que verifica
// estuvieron rotas desde que se creó el paquete y la suite no corría en absoluto: cualquier test
// de contrato escrito encima habría fallado por razones que no tienen nada que ver con el core.
//
// Los vectores de `contracts/cases.json` no se tocan acá — eso es trabajo de `__tests__/`.
import { describe, expect, it } from '@jest/globals';
import { Platform } from 'react-native';

describe('el preset de React Native se transpila bajo pnpm', () => {
  // `@react-native/jest-preset/jest/setup.js` corre como `setupFiles`, antes que cualquier test,
  // y está escrito en ESM. pnpm lo guarda en `node_modules/.pnpm/…/node_modules/@react-native/…`,
  // y el `transformIgnorePatterns` del preset —pensado para un `node_modules` aplanado— matcheaba
  // ese primer `node_modules/.pnpm/` y lo dejaba sin transpilar. Síntoma: `SyntaxError: Cannot use
  // import statement outside a module`, y la suite entera muerta al cargar.
  it('carga módulos de react-native, que vienen en ESM', () => {
    expect(Platform.OS).toBe('ios'); // `defaultPlatform` del preset
  });
});

describe('el paquete se carga desde su fuente, no desde lib/', () => {
  // Lo que gobierna esto es la clave `banco-core-financiero-source` del `exports` de
  // `package.json`: sin ella, Jest resuelve por `default` y los tests corren contra el último
  // `bob build` en vez de contra el código que se está editando — un build viejo pasando por
  // bueno, sin ningún aviso. Verificado por mutación: al borrar esa clave, este test falla y la
  // resolución cae en `lib/module/index.js`.
  //
  // **No** lo gobierna `customExportConditions`, aunque lo parezca. Ese arreglo se hizo en el
  // mismo cambio —el andamio de bob había dejado `"<%- project.sourceCondition -%>"` literal, sin
  // renderizar— pero romperlo a propósito **no cambia la resolución**, también verificado por
  // mutación. Se corrigió porque un placeholder de plantilla en un archivo de configuración está
  // mal de todos modos y porque nombra la condición correcta si algún día el resolver la honra,
  // no porque hoy arregle nada observable.
  it('resuelve el paquete por su fuente y no por lib/', () => {
    const resuelto = require.resolve('@banco/core-financiero');
    expect(resuelto).toMatch(/[\\/]src[\\/]index\.tsx$/);
    expect(resuelto).not.toMatch(/[\\/]lib[\\/]/);
  });
});
