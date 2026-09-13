import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { CardScreen } from './card-screen';

// Mismo patrón que las otras dos pantallas: se sustituye `CoreFinancieroService` por un doble
// para probar la PANTALLA, no el WASM real (eso ya lo cubren `core-financiero.service.spec.ts` y
// `contract.spec.ts`).
function fakeCore(overrides: Partial<CoreFinancieroService> = {}): CoreFinancieroService {
  return {
    validateCard: () => ({ brand: 'Visa', masked: '4111 **** **** 1111' }),
    encrypt: () => 'hex-cifrado-simulado',
    decrypt: () => 'hex-cifrado-simulado',
    ...overrides,
  } as unknown as CoreFinancieroService;
}

async function setup(core: CoreFinancieroService) {
  await TestBed.configureTestingModule({
    imports: [CardScreen],
    providers: [{ provide: CoreFinancieroService, useValue: core }],
  }).compileComponents();
  const fixture = TestBed.createComponent(CardScreen);
  await fixture.whenStable();
  return fixture;
}

function fieldInput(root: HTMLElement, testId: string): HTMLInputElement {
  return root.querySelector(`[data-testid="${testId}"] input`) as HTMLInputElement;
}

function type(root: HTMLElement, testId: string, value: string): void {
  const input = fieldInput(root, testId);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function clickButton(root: HTMLElement, testId: string): void {
  (root.querySelector(`[data-testid="${testId}"] button`) as HTMLButtonElement).click();
}

function text(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
}

function resultValue(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"] .result-row__value`)?.textContent?.trim();
}

describe('CardScreen', () => {
  // La vuelta completa: el doble devuelve un CENTINELA distinto del número tecleado. Con el
  // MISMO valor, el test no distingue "lo descifró el core" de "la pantalla repitió lo que
  // tecleaste" — que es exactamente la propiedad que esta fila existe para demostrar.
  it('Descifrado muestra lo que devolvió el core, no lo que se tecleó', async () => {
    const SENTINEL = 'CENTINELA-0000000000000000';
    const core = fakeCore({
      validateCard: () => ({ brand: 'Visa', masked: '4111 **** **** 1111' }),
      encrypt: () => 'hex-simulado',
      decrypt: () => SENTINEL,
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '4111111111111111');
    clickButton(root, 'validate-and-encrypt');
    await fixture.whenStable();

    expect(resultValue(root, 'decrypted')).toBe(SENTINEL);
    expect(resultValue(root, 'decrypted')).not.toBe('4111111111111111');
  });

  it('muestra marca, enmascarado y el hex cifrado', async () => {
    const core = fakeCore({
      validateCard: () => ({ brand: 'Mastercard', masked: '5555 **** **** 4444' }),
      encrypt: () => 'bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036',
      decrypt: () => '5555555555554444',
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '5555555555554444');
    clickButton(root, 'validate-and-encrypt');
    await fixture.whenStable();

    expect(resultValue(root, 'brand')).toBe('Mastercard');
    expect(resultValue(root, 'masked')).toBe('5555 **** **** 4444');
    expect(text(root, 'cipher-hex')).toBe(
      'bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036',
    );
  });

  it('un error al validar/cifrar queda como texto de usuario, no sube como excepción', async () => {
    const core = fakeCore({
      validateCard: () => {
        throw { tag: 'Length', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '41111');
    expect(() => clickButton(root, 'validate-and-encrypt')).not.toThrow();
    await fixture.whenStable();

    expect(text(root, 'card-error')).toBe(
      'El número ingresado no tiene la cantidad de dígitos correcta.',
    );
  });

  // Los dos bloques son independientes: un fallo al descifrar un hex pegado no puede borrar el
  // resultado de cifrar de arriba.
  it('un fallo al descifrar un hex pegado no borra el resultado de cifrar', async () => {
    const core = fakeCore({
      validateCard: () => ({ brand: 'Visa', masked: '4111 **** **** 1111' }),
      encrypt: () => 'hex-cifrado-simulado',
      decrypt: (hex: string) => {
        if (hex === 'hex-cifrado-simulado') return 'CENTINELA-DESCIFRADO';
        throw { tag: 'Encryption', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '4111111111111111');
    clickButton(root, 'validate-and-encrypt');
    await fixture.whenStable();
    expect(text(root, 'cipher-hex')).toBe('hex-cifrado-simulado');
    expect(resultValue(root, 'decrypted')).toBe('CENTINELA-DESCIFRADO');

    type(root, 'pasted-hex', 'deadbeef');
    clickButton(root, 'decrypt');
    await fixture.whenStable();

    expect(text(root, 'paste-error')).toBe('No se pudo cifrar los datos de la tarjeta.');
    // El bloque de arriba sigue intacto.
    expect(text(root, 'cipher-hex')).toBe('hex-cifrado-simulado');
    expect(resultValue(root, 'decrypted')).toBe('CENTINELA-DESCIFRADO');
  });

  it('descifrar un hex pegado exitosamente muestra el número recuperado', async () => {
    const core = fakeCore({ decrypt: () => '5555555555554444' });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'pasted-hex', 'bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036');
    clickButton(root, 'decrypt');
    await fixture.whenStable();

    expect(resultValue(root, 'recovered')).toBe('5555555555554444');
  });

  it('el filtro de Número sólo acepta dígitos', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '4111');
    await fixture.whenStable();
    expect(fieldInput(root, 'number').value).toBe('4111');

    type(root, 'number', '41a1');
    await fixture.whenStable();
    // Rechazado: se queda en el último valor válido.
    expect(fieldInput(root, 'number').value).toBe('4111');
  });

  it('el filtro de Hex cifrado sólo acepta [0-9a-f]', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'pasted-hex', 'deadbeef');
    await fixture.whenStable();
    expect(fieldInput(root, 'pasted-hex').value).toBe('deadbeef');

    type(root, 'pasted-hex', 'deadBEEF');
    await fixture.whenStable();
    // Mayúsculas rechazadas: se queda en el último valor válido.
    expect(fieldInput(root, 'pasted-hex').value).toBe('deadbeef');
  });

  it('editar Número consume sólo el error del primer bloque', async () => {
    const core = fakeCore({
      validateCard: () => {
        throw { tag: 'Length', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'number', '41111');
    clickButton(root, 'validate-and-encrypt');
    await fixture.whenStable();
    expect(text(root, 'card-error')).not.toBe('');

    type(root, 'number', '411111');
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="card-error"]')).toBeNull();
  });

  it('editar Hex cifrado consume sólo el error del segundo bloque', async () => {
    const core = fakeCore({
      decrypt: () => {
        throw { tag: 'Encryption', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'pasted-hex', 'deadbeef');
    clickButton(root, 'decrypt');
    await fixture.whenStable();
    expect(text(root, 'paste-error')).not.toBe('');

    type(root, 'pasted-hex', 'deadbeef00');
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="paste-error"]')).toBeNull();
  });
});
