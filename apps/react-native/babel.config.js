// `import.meta` sólo existe en módulos ESM. Los bindings N-API que genera `ubrn` lo usan para
// resolver dónde está el `.dylib` hermano (`callerUrl: import.meta.url`), y lo emiten siempre —
// también con `--lib-absolute`, que agrega un `override` pero no saca la línea—. Jest corre sus
// módulos como CommonJS, así que ahí explota con `Cannot use 'import.meta' outside a module`.
//
// El plugin traduce `import.meta` al equivalente CJS del módulo que se está ejecutando, que es
// exactamente lo que el modo colocado necesita: la URL del archivo, para encontrar el `.dylib`
// al lado.
//
// Va bajo `env.test` a propósito. Jest define `NODE_ENV=test`; Metro y `bob build` no, así que
// el bundle de la app y la salida de `lib/` quedan intactos. Reescribir `import.meta` en el
// bundle de React Native sería meterse con Hermes por una razón que sólo existe en los tests.
const importMetaToCjs = () => ({
  name: 'import-meta-to-cjs',
  visitor: {
    MetaProperty(path) {
      path.replaceWithSourceString(
        "({ url: require('node:url').pathToFileURL(__filename).href })"
      );
    },
  },
});

module.exports = {
  overrides: [
    {
      exclude: /\/node_modules\//,
      presets: ['module:react-native-builder-bob/babel-preset'],
    },
    {
      include: /\/node_modules\//,
      presets: ['module:@react-native/babel-preset'],
    },
  ],
  env: {
    test: {
      plugins: [importMetaToCjs],
    },
  },
};
