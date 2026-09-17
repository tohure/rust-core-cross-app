// Prueba la **infraestructura** de Jest, no el dominio. Existe porque las dos piezas que verifica
// estuvieron rotas desde que se creó el paquete y la suite no corría en absoluto: cualquier test
// de contrato escrito encima habría fallado por razones que no tienen nada que ver con el core.
//
// Los vectores de `contracts/cases.json` no se tocan acá — eso es trabajo de `__tests__/`.
import { describe, expect, it } from '@jest/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

describe('los paquetes del workspace que Metro transpila declaran su runtime de Babel', () => {
  // **La guardia que faltaba cuando la app arrancó en pantalla roja.** Al cerrar la Fase 5, con
  // los 120 tests en verde, la app moría al arrancar en el emulador con:
  //
  //     Unable to resolve module @babel/runtime/helpers/interopRequireDefault
  //     from packages/contract/src/messageFor.ts
  //
  // Metro transpila con Babel el TypeScript de los paquetes del workspace que se consumen POR
  // FUENTE, Babel inyecta helpers como `interopRequireDefault`, y los resuelve **relativo al
  // archivo que transpila** — o sea desde `packages/contract/`, no desde el `example/`. Bajo el
  // `node_modules` estricto de pnpm, un paquete sólo ve lo que declara: no alcanza con que el
  // consumidor tenga `@babel/runtime`.
  //
  // Jest resuelve distinto que Metro, así que ningún test lo agarraba: la app estuvo rota
  // semanas y la suite entera en verde. Esta guardia no reproduce el resolver de Metro —no puede—
  // pero sí comprueba la condición que lo hacía fallar, que es lo que un test puede hacer.
  const raiz = ['../../package.json', '../../example/package.json'];
  const paquetes = [
    ...new Set(
      raiz.flatMap((p) => {
        const json = require(p) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        return Object.keys({ ...json.dependencies, ...json.devDependencies });
      })
    ),
  ].filter((n) => n.startsWith('@banco/'));

  // Sólo los que se consumen por FUENTE: si el entrypoint es `.js` ya viene transpilado y Babel
  // no le inyecta nada. `@banco/core-financiero-wasm` está en este caso —su `main` es el bundle
  // de esbuild, `dist/index.js`— y por eso NO declara `@babel/runtime` ni le hace falta. Si
  // alguna vez pasara a consumirse por fuente, esta guardia empezaría a exigírselo sola.
  const porFuente = paquetes.filter((nombre) => {
    const pkg = require.resolve(`${nombre}/package.json`);
    const { main } = require(pkg) as { main?: string };
    return main !== undefined && /\.tsx?$/.test(main);
  });

  it('hay al menos un paquete consumido por fuente, o esta guardia no mira nada', () => {
    // Sin esto, un refactor que dejara la lista vacía volvería la guardia vacua y verde.
    expect(porFuente.length).toBeGreaterThan(0);
  });

  // **Se comprueba el filesystem, no el resolver, y eso NO es pereza.** Dentro de Jest no hay
  // forma de preguntar «¿esto resolvería bajo pnpm?»: Jest parchea `Module._resolveFilename`
  // globalmente, así que su `require.resolve` ignora el `paths` que se le pase y hasta un
  // `createRequire` de `node:module` termina pasando por su resolver. Las dos vías se probaron y
  // las dos daban VERDE para `@banco/core-financiero-wasm`, que no declara `@babel/runtime` —una
  // guardia vacua, que es justo lo que no puede ser—. Fuera de Jest, Node sí falla ahí.
  //
  // Bajo el `node_modules` estricto de pnpm, un paquete tiene el symlink
  // `<paquete>/node_modules/@babel/runtime` **si y sólo si lo declara**. Eso es exactamente la
  // condición que Metro necesita, y mirarlo en el disco no depende de ningún resolver.
  it.each(porFuente)('%s declara @babel/runtime y pnpm se lo enlazó', (nombre) => {
    const dir = require.resolve(`${nombre}/package.json`).replace(/[\\/]package\.json$/, '');
    expect(existsSync(join(dir, 'node_modules', '@babel', 'runtime'))).toBe(true);
  });
});
