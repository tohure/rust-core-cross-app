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
});
