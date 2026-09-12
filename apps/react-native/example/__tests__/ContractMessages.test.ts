import { describe, expect, it } from '@jest/globals';
import { DomainError_Tags } from '@banco/core-financiero';
import { userMessage } from '../src/adapter/ContractMessages';

describe('userMessage', () => {
  it('interpola los placeholders CRUDOS, sin formatear el monto', () => {
    const e = {
      tag: DomainError_Tags.InsufficientFunds,
      inner: { available: '1200.50', required: '10000.01' },
    };
    expect(userMessage(e)).toBe(
      'Saldo insuficiente: tienes 1200.50 y se necesitan 10000.01.'
    );
  });

  it('devuelve el texto tal cual cuando la variante no tiene campos', () => {
    const e = { tag: DomainError_Tags.SameAccount, inner: {} };
    expect(userMessage(e)).toBe(
      'La cuenta de origen y la de destino son la misma.'
    );
  });

  it('un error que NO es del dominio no escapa del catch: cae a texto genérico', () => {
    // `userMessage` se llama SIEMPRE dentro de un `catch`. Si lanza, la excepción sale del
    // handler y llega al onPress de React: caja roja en desarrollo, botón muerto en release.
    // Pasa con cualquier cosa que no sea un DomainError — un TypeError de la capa JSI, un trap
    // de WebAssembly, un error del bundler. Android tiene el mismo fallback:
    // `(e as? DomainException)?.let(messages::userMessage) ?: e.toString()`.
    expect(() => userMessage(new TypeError('algo del runtime'))).not.toThrow();
    expect(() => userMessage(null)).not.toThrow();
    expect(() => userMessage(undefined)).not.toThrow();
    expect(() => userMessage({ tag: 'NoExisteEstaVariante' })).not.toThrow();
    // Y devuelve algo que se pueda leer, no vacío.
    expect(userMessage(new TypeError('algo del runtime'))).not.toBe('');
  });
});
