import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { BenchmarkScreen } from './benchmark-screen';

// Una medida real: dos o más dígitos con exactamente dos decimales y el sufijo ` µs`. El estado
// arranca en «—», así que «distinto de vacío» pasaría sin haber medido nada — hay que exigir la
// FORMA real de una medida.
const MEDIDA = /^\d+\.\d{2} µs$/;
const SIN_MEDIR = '—';

// Mismo patrón que las otras tres pantallas: se sustituye `CoreFinancieroService` por un doble
// para probar la PANTALLA (qué llama, cuántas veces, qué guarda), no el WASM real — eso ya lo
// cubren `core-financiero.service.spec.ts` y `contract.spec.ts`.
function fakeCore(overrides: Partial<CoreFinancieroService> = {}): CoreFinancieroService {
  return { add: () => '0.30', ...overrides } as unknown as CoreFinancieroService;
}

async function setup(core: CoreFinancieroService) {
  await TestBed.configureTestingModule({
    imports: [BenchmarkScreen],
    providers: [{ provide: CoreFinancieroService, useValue: core }],
  }).compileComponents();
  const fixture = TestBed.createComponent(BenchmarkScreen);
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

function runButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector('[data-testid="run"] button') as HTMLButtonElement;
}

function clickRun(root: HTMLElement): void {
  runButton(root).click();
}

function text(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
}

// `app-result-row` renderiza label y value como spans hermanos dentro del mismo host: leer
// `textContent` del host entero concatena los dos. Esto lee sólo el span del valor, igual que
// `transfer-screen.spec.ts`.
function resultValue(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"] .result-row__value`)?.textContent?.trim();
}

describe('BenchmarkScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('las cuatro filas se pintan siempre, con «—» hasta que haya medición', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    expect(resultValue(root, 'core-p50')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'core-p95')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'native-p50')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'native-p95')).toBe(SIN_MEDIR);
  });

  it('cero iteraciones no arranca ni deja el spinner colgado', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '0');
    clickRun(root);
    await fixture.whenStable();

    // Nunca debió encender el spinner: si lo hiciera y no lo apagara, `disabled` quedaría en
    // `true` para siempre. Es la trampa de Android en el commit `ad45cac`.
    expect(runButton(root).disabled).toBe(false);
    expect(text(root, 'benchmark-error')).not.toBe('');
    expect(resultValue(root, 'core-p50')).toBe(SIN_MEDIR);
  });

  it('la entrada vacía tampoco arranca ni deja el spinner colgado', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '');
    clickRun(root);
    await fixture.whenStable();

    expect(runButton(root).disabled).toBe(false);
    expect(text(root, 'benchmark-error')).not.toBe('');
  });

  it('con iteraciones válidas, las cuatro medidas matchean el formato real de una medida', async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [{ provide: CoreFinancieroService, useValue: fakeCore() }],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '10');
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(resultValue(root, 'core-p50')).toMatch(MEDIDA);
    expect(resultValue(root, 'core-p95')).toMatch(MEDIDA);
    expect(resultValue(root, 'native-p50')).toMatch(MEDIDA);
    expect(resultValue(root, 'native-p95')).toMatch(MEDIDA);
    expect(runButton(root).disabled).toBe(false);
  });

  it('llama al core una vez por iteración, no una sola vez', async () => {
    let llamadas = 0;
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [
        {
          provide: CoreFinancieroService,
          useValue: fakeCore({
            add: () => {
              llamadas += 1;
              return '0.30';
            },
          }),
        },
      ],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '25');
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(llamadas).toBe(25);
  });

  it('un error del core se muestra con userMessage, no como [object Object]', async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [
        {
          provide: CoreFinancieroService,
          useValue: fakeCore({
            add: () => {
              throw { tag: 'InvalidAmount', inner: {} };
            },
          }),
        },
      ],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '5');
    expect(() => clickRun(root)).not.toThrow();
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(text(root, 'benchmark-error')).toBe('El monto ingresado no es válido.');
    expect(runButton(root).disabled).toBe(false);
  });

  it('una corrida que falla borra las medidas de la anterior', async () => {
    let falla = false;
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [
        {
          provide: CoreFinancieroService,
          useValue: fakeCore({
            add: () => {
              if (falla) throw { tag: 'InvalidAmount', inner: {} };
              return '0.30';
            },
          }),
        },
      ],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '5');
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();
    expect(resultValue(root, 'core-p50')).toMatch(MEDIDA);

    falla = true;
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(text(root, 'benchmark-error')).not.toBe('');
    // Dejar los números de la corrida anterior debajo del error los hace parecer de ésta.
    expect(resultValue(root, 'core-p50')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'core-p95')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'native-p50')).toBe(SIN_MEDIR);
    expect(resultValue(root, 'native-p95')).toBe(SIN_MEDIR);
  });

  it('el filtro de Iteraciones topa en 6 dígitos', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'iterations', '999999');
    expect(fieldInput(root, 'iterations').value).toBe('999999');

    // Rechazado: sin el tope, teclear 10000000 dispara 2 × 10^7 llamadas al core sin forma de
    // cancelarlas. El campo vuelve al último valor válido (filtro de TEXTO, no regla de negocio).
    type(root, 'iterations', '1000000');
    await fixture.whenStable();
    expect(fieldInput(root, 'iterations').value).toBe('999999');
  });

  it('los dos párrafos de explicación son el texto normativo completo', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain(
      'El core es más lento porque cada llamada cruza la frontera al código Rust.',
    );
    expect(root.textContent).toContain(
      'El punto flotante nativo es más rápido y da mal el resultado: existe para exhibirlo.',
    );
  });
});
