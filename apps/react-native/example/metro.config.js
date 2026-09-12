const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
  // `withMetroConfig` lee por defecto el campo `workspaces` del package.json de `root`, que es
  // como declaran sus workspaces yarn y npm. Este repo usa **pnpm**, que los declara en
  // `pnpm-workspace.yaml` y no escribe nada en ningún package.json, así que sin esta opción la
  // función tira `No 'workspaces' field found` y Metro ni arranca. Las dos entradas son las
  // mismas de `pnpm-workspace.yaml`, relativas a `root` (= `apps/react-native`): la librería y
  // el example. `apps/web-angular` queda fuera a propósito: no es un paquete de React Native y
  // cuelga de otra rama del árbol.
  workspaces: ['.', 'example'],
  conditions: ['banco-core-financiero-source'],
});

// pnpm no aplana `node_modules`: cada dependencia es un symlink al store de la **raíz del
// repositorio** (`node_modules/.pnpm/<paquete>@<versión>/…`). Metro resuelve por realpath y se
// niega a servir archivos fuera de sus raíces vigiladas, así que sin esta línea el bundle muere
// con `Unable to resolve module @babel/runtime/helpers/…` aunque el archivo exista y Node lo
// resuelva sin problema.
//
// La raíz del repo no puede pasarse como `root` del helper de arriba: esa función lee su
// `package.json` sin condicional y acá no hay ninguno —el workspace lo define
// `pnpm-workspace.yaml`—, así que se agrega al config ya construido. Cubre también `root`, que
// cuelga de ella.
config.watchFolders = [...new Set([...config.watchFolders, repoRoot])];

module.exports = config;
