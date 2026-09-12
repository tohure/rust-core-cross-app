// La superficie pública del paquete. `bindings.tsx` lo genera ubrn —incluida la llamada que
// registra el crate con Hermes y la inicialización de los checksums— y por eso no se toca:
// este archivo sólo lo reexporta y le suma lo que la librería aporta por su cuenta.
//
// Generar acá y editar a mano no era opción: `ubrn build android|ios|wasm2 --and-generate`
// reescribe el entrypoint entero en cada corrida, así que cualquier línea nuestra se perdería
// en la primera regeneración. `turboModule.entrypoint` de `ubrn.config.yaml` lo manda a
// `bindings.tsx` y deja este nombre libre.
export * from './bindings';
export { default } from './bindings';
