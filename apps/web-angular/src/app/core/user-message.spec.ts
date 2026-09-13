import { userMessage } from './user-message';

// Porteado de `apps/react-native/example/__tests__/ContractMessages.test.ts`. Los objetos de
// prueba son planos, con `tag`/`inner`, en vez de instancias reales del `DomainError` del WASM:
// `contractName` (de `@banco/contract`) discrimina por la PRESENCIA de `tag`, no con
// `instanceOf`, justamente para poder aceptar errores de orígenes distintos — acá, un objeto de
// test; en la app real, la excepción que lanza `@banco/core-financiero-wasm`. Mismo patrón que
// ya usa `src/app/core/contract.spec.ts` de esta app (`contractName({ tag: 'SameAccount' })`).
describe('userMessage', () => {
  it('interpola los placeholders CRUDOS, sin formatear el monto', () => {
    const e = {
      tag: 'InsufficientFunds',
      inner: { available: '1200.50', required: '10000.01' },
    };
    expect(userMessage(e)).toBe('Saldo insuficiente: tienes 1200.50 y se necesitan 10000.01.');
  });

  it('devuelve el texto tal cual cuando la variante no tiene campos', () => {
    const e = { tag: 'SameAccount', inner: {} };
    expect(userMessage(e)).toBe('La cuenta de origen y la de destino son la misma.');
  });

  it('un error que NO es del dominio no escapa del catch: cae a texto genérico', () => {
    // `userMessage` se llama SIEMPRE dentro de un `catch`. Si lanza, la excepción sale del
    // handler y llega al borde de la UI de Angular: pantalla rota en vez de un mensaje. Pasa con
    // cualquier cosa que no sea un `DomainError` reconocido: un `TypeError` del runtime, un trap
    // de WebAssembly (que en esta app no tiene la red del `catch_unwind` de uniffi), un tag que
    // `contractName` no conoce.
    expect(() => userMessage(new TypeError('algo del runtime'))).not.toThrow();
    expect(() => userMessage(null)).not.toThrow();
    expect(() => userMessage(undefined)).not.toThrow();
    expect(() => userMessage({ tag: 'NoExisteEstaVariante' })).not.toThrow();
    // Y devuelve algo legible, no vacío.
    expect(userMessage(new TypeError('algo del runtime'))).not.toBe('');
  });
});
