// El entrypoint por defecto de `@banco/contract`. **Nada acá toca `node:fs`, ni transitivamente**
// — `loadCases`/`loadMessages`, que sí lo usan, viven detrás del subpath `@banco/contract/testing`
// a propósito, para que un bundler de producción en el navegador (Angular, esbuild) pueda
// empaquetar `contractName`/`messageFor` sin toparse con un módulo de Node. Hallazgo C1 del
// review de la Task 2: reexportar `fs` desde acá rompía `esbuild --bundle --platform=browser`
// aun importando sólo `contractName`.
export { CONTRACT_NAMES, type ContractTag } from './tags';
export { contractName } from './contractName';
export { messageFor } from './messageFor';
