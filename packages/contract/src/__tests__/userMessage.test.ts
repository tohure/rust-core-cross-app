// No hay `@types/jest`: sin este import explícito, `tsc --noEmit` falla con TS2593.
import { describe, expect, it } from '@jest/globals';
import { FALLBACK, userMessage } from '../userMessage';

// Los objetos de prueba son PLANOS, con `tag`/`inner`, y no instancias del `DomainError` de un
// flavour: `contractName` discrimina por la PRESENCIA de `tag` y no con `instanceOf`, justamente
// para aceptar errores de orígenes distintos —un objeto de test, el módulo JSI, el módulo WASM—.
// Ruling P1 de la Fase 4. Por eso este test puede vivir en el paquete, que no conoce ningún
// flavour, en vez de duplicado en las dos apps que lo consumen.

describe('userMessage', () => {
  it('interpola los placeholders CRUDOS, sin formatear el monto', () => {
    const e = {
      tag: 'InsufficientFunds',
      inner: { available: '1200.50', required: '10000.01' },
    };
    expect(userMessage(e)).toBe(
      'Saldo insuficiente: tienes 1200.50 y se necesitan 10000.01.'
    );
  });

  it('devuelve el texto tal cual cuando la variante no tiene campos', () => {
    const e = { tag: 'SameAccount', inner: {} };
    expect(userMessage(e)).toBe(
      'La cuenta de origen y la de destino son la misma.'
    );
  });

  it('un error que NO es del dominio no escapa del catch: cae a texto genérico', () => {
    // `userMessage` se llama SIEMPRE dentro de un `catch`. Si lanza, la excepción sale del
    // handler y llega al borde de la UI: en React Native, al `onPress` —caja roja en desarrollo,
    // botón muerto en release—; en Angular, pantalla rota en vez de un mensaje.
    // Pasa con cualquier cosa que no sea un DomainError — un TypeError de la capa JSI, un trap
    // de WebAssembly, un error del bundler.
    expect(() => userMessage(new TypeError('algo del runtime'))).not.toThrow();
    expect(() => userMessage(null)).not.toThrow();
    expect(() => userMessage(undefined)).not.toThrow();
    expect(() => userMessage({ tag: 'NoExisteEstaVariante' })).not.toThrow();
    // Y devuelve algo que se pueda leer, no vacío.
    expect(userMessage(new TypeError('algo del runtime'))).not.toBe('');
  });

  it('el texto de diagnóstico NO llega a la pantalla', () => {
    // Antes volvía `Ocurrió un error inesperado: ${String(e)}`, citando que Android hacía lo
    // mismo — y Android lo hacía mal: su test rojo mostraba `java.lang.UnsatisfiedLinkError:
    // dlopen failed: …` al usuario. El texto es normativo en `docs/ui-spec.md` y es el mismo
    // en las cuatro apps.
    const shown = userMessage(new TypeError('dlopen failed: library not found'));
    expect(shown).toBe(FALLBACK);
    expect(shown).toBe('No se pudo completar la operación.');
    expect(shown).not.toContain('dlopen');
    expect(shown).not.toContain('TypeError');
  });
});
