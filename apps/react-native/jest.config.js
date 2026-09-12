// Dos mundos de Jest, no uno, y la separación no es cosmética.
//
// El plan original de esta fase pedía un `jest.config.js` con `preset: 'ts-jest'` y un solo
// `testMatch`. Eso rompía tres cosas a la vez: un `jest.config.js` tiene precedencia sobre la
// clave `jest` de `package.json`, así que se llevaba puesto el preset de React Native y los dos
// arreglos que lo hacen funcionar bajo pnpm; dejaba fuera del `testMatch` al test que ya existía;
// y sumaba `ts-jest` como segunda pila de transformación al lado de babel-jest, que ya transpila
// TypeScript vía `babel.config.js`.
//
// Los dos entornos son incompatibles entre sí y los dos hacen falta:
//
//   napi          → Node puro. Carga un `.dylib` nativo por la puerta de addons de Node. El
//                   entorno de React Native **mockea los módulos nativos**, así que acá cruzaría
//                   a un fake y el test de contrato no probaría nada.
//   react-native  → El preset de RN, que las pruebas de hooks del Bloque 4 necesitan
//                   (`@testing-library/react-native`, `renderHook`).
module.exports = {
  projects: [
    {
      displayName: 'napi',
      rootDir: __dirname,
      testEnvironment: 'node',
      // `packages/*` vive fuera de `apps/react-native` (dos niveles arriba), pero sus tests
      // corren acá: mismo Node puro, misma pila de transformación, sin sumar un segundo runner
      // por paquetes chicos y neutrales que ni siquiera dependen de React Native. `roots` hace
      // falta además de `testMatch`: Jest sólo rastrea archivos dentro de esos directorios, y sin
      // él un `testMatch` que apunta fuera de `rootDir` no encuentra nada — y no avisa.
      roots: ['<rootDir>', '<rootDir>/../../packages'],
      // `__benchmarks__` vive acá y no en el proyecto `react-native`: lee `contracts/cases.json`
      // con `fs` directo desde Node y no toca nada mockeado por el preset de RN.
      testMatch: [
        '<rootDir>/__tests__/**/*.test.ts',
        '<rootDir>/__benchmarks__/**/*.test.ts',
        '<rootDir>/../../packages/*/src/**/*.test.ts',
      ],
      modulePathIgnorePatterns: [
        '<rootDir>/example/',
        '<rootDir>/lib/',
        '<rootDir>/../../packages/.*/node_modules/',
      ],
      // `@ubjs/wasm` y `@ubjs/core` se publican **sólo en ESM**, y este proyecto corre CommonJS.
      // Mismo patrón de dos lookaheads que el proyecto de React Native: el primero evita que el
      // `node_modules/.pnpm/` del store dispare el ignore, el segundo deja pasar el paquete.
      transformIgnorePatterns: ['node_modules/(?!\\.pnpm/)(?!@ubjs/)'],
    },
    {
      displayName: 'react-native',
      rootDir: __dirname,
      preset: '@react-native/jest-preset',
      testMatch: [
        '<rootDir>/src/__tests__/**/*.test.ts?(x)',
        '<rootDir>/example/__tests__/**/*.test.ts?(x)',
      ],
      // Bajo test, el entrypoint generado por ubrn se sirve con los bindings **N-API** del mismo
      // core. Sin esto, importar `@banco/core-financiero` en cualquier test muere en
      // `TurboModuleRegistry.getEnforcing('CoreFinanciero')`: el turbo module es C++ atado a
      // Hermes y en Jest no existe.
      //
      // Es deliberadamente más real que un stub — las nueve funciones responden de verdad, contra
      // el mismo Rust—, pero **no prueba el cruce de JSI**, que no se puede probar acá. Eso lo
      // prueba el smoke manual de BUILD.md.
      moduleNameMapper: {
        '^\\./bindings$': '<rootDir>/src/generated-napi/core_financiero',
      },
      testEnvironmentOptions: {
        customExportConditions: [
          'require',
          'react-native',
          'banco-core-financiero-source',
        ],
      },
      // pnpm guarda el paquete real en `node_modules/.pnpm/…/node_modules/@react-native/…`, o sea
      // con **dos** `node_modules/`. El patrón del preset —pensado para un árbol aplanado—
      // matchea en el primero, porque lo sigue `.pnpm/`, y deja `jest/setup.js` sin transpilar
      // aunque esté en ESM. El lookahead extra hace que la decisión la tome el segundo.
      transformIgnorePatterns: [
        'node_modules/(?!\\.pnpm/)(?!((jest-)?react-native|@react-native(-community)?)/)',
      ],
      modulePathIgnorePatterns: [
        '<rootDir>/example/node_modules',
        '<rootDir>/lib/',
      ],
    },
  ],
};
