import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { ArithmeticScreen } from './arithmetic-screen';

// Mismo patrón que `app.spec.ts`: se sustituye `CoreFinancieroService` por un doble para que
// estos tests prueben la PANTALLA (qué llama, qué guarda, qué muestra), no el WASM real —eso ya
// lo cubre `core-financiero.service.spec.ts` y `contract.spec.ts`. Se maneja por el DOM, no
// tocando signals internos, porque `a`/`b`/`operation`/etc. son `protected`: la pantalla se
// prueba por su superficie pública (labels, botones, `data-testid`), igual que `app.spec.ts`.
function fakeCore(overrides: Partial<CoreFinancieroService> = {}): CoreFinancieroService {
  return { add: () => '', subtract: () => '', ...overrides } as unknown as CoreFinancieroService;
}

async function setup(core: CoreFinancieroService) {
  await TestBed.configureTestingModule({
    imports: [ArithmeticScreen],
    providers: [{ provide: CoreFinancieroService, useValue: core }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ArithmeticScreen);
  await fixture.whenStable();
  return fixture;
}

function type(root: HTMLElement, testId: string, value: string): void {
  const input = root.querySelector(`[data-testid="${testId}"] input`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function clickRadio(root: HTMLElement, testId: string): void {
  (root.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement).click();
}

function clickButton(root: HTMLElement, testId: string): void {
  (root.querySelector(`[data-testid="${testId}"] button`) as HTMLButtonElement).click();
}

function text(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
}

describe('ArithmeticScreen', () => {
  it('con 0.1 y 0.2, coreResult es "0.30" y nativeResult es "0.30000000000000004"', async () => {
    const core = fakeCore({ add: (a, b) => (a === '0.1' && b === '0.2' ? '0.30' : 'MAL') });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    // Los operandos por defecto ya son los de `ar-001` ("0.1" y "0.2"): no hace falta tipear.
    clickButton(root, 'calculate');
    await fixture.whenStable();

    expect(text(root, 'core-result')).toBe('0.30');
    expect(text(root, 'native-result')).toBe('0.30000000000000004');
  });

  // La guardia real de esta pantalla: un componente que SIEMPRE suma pasaría las otras
  // aserciones igual, porque nunca se prueba con `operation() === 'subtract'` de por medio. El
  // doble hace explícito el fallo devolviendo un string reconocible en `add` —nunca lanzando: si
  // lanzara, un componente que llama a `add` por error caería en su propio catch y el test
  // fallaría igual, pero nombrando la causa equivocada ("hay un error" en vez de "llamó a add").
  it('Restar llama a subtract, no a add', async () => {
    const core = fakeCore({
      add: () => 'NO DEBE LLAMARSE',
      subtract: (a, b) => (a === '1.00' && b === '0.90' ? '0.10' : 'MAL'),
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'operand-a', '1.00');
    type(root, 'operand-b', '0.90');
    clickRadio(root, 'op-subtract');
    clickButton(root, 'calculate');
    await fixture.whenStable();

    expect(text(root, 'core-result')).toBe('0.10');
    expect(text(root, 'core-result')).not.toBe('NO DEBE LLAMARSE');
  });

  it('un error del core queda en el estado como texto de usuario, no sube como excepción', async () => {
    const core = fakeCore({
      add: () => {
        throw { tag: 'InvalidAmount', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    expect(() => clickButton(root, 'calculate')).not.toThrow();
    await fixture.whenStable();

    expect(text(root, 'arithmetic-error')).toBe('El monto ingresado no es válido.');
    // Un fallo no deja resultados a medio pintar.
    expect(text(root, 'core-result')).toBe('');
    expect(text(root, 'native-result')).toBe('');
  });
});
