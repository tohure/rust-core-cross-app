import { TestBed } from '@angular/core/testing';
import type { Account, TransferRequest, TransferResult } from '@banco/core-financiero-wasm';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { INITIAL_ACCOUNTS } from '../../contract/sources';
import { TransferScreen } from './transfer-screen';

// Contrato de PRUEBA con ids DISTINTOS a los reales de `contracts/cases.json`. Comparar contra
// el contrato real pasaría igual con literales hardcodeados que hoy coinciden con él por
// casualidad: sustituirlo por éste es lo único que prueba que la pantalla DERIVA origen/destino
// de lo inyectado, en vez de tener el CCI de hoy escrito a mano.
const FAKE_ACCOUNTS: Account[] = [
  { id: 'CCI-ORIGEN-DE-PRUEBA', holder: 'Ana Quispe', balance: '5000.00' },
  { id: 'CCI-DESTINO-DE-PRUEBA', holder: 'Luis Ramos', balance: '1200.50' },
];

const RESULT: TransferResult = {
  accounts: [
    { id: 'CCI-ORIGEN-DE-PRUEBA', holder: 'Ana Quispe', balance: '4899.99' },
    { id: 'CCI-DESTINO-DE-PRUEBA', holder: 'Luis Ramos', balance: '1300.50' },
  ],
  itfFee: '0.01',
  totalDebited: '100.01',
  receipt: 'TRF-9047-1065-10000',
  simulatedLatencyMs: 10,
};

function fakeCore(overrides: Partial<CoreFinancieroService> = {}): CoreFinancieroService {
  return { executeTransfer: () => RESULT, ...overrides } as unknown as CoreFinancieroService;
}

async function setup(core: CoreFinancieroService, accounts: Account[] = FAKE_ACCOUNTS) {
  await TestBed.configureTestingModule({
    imports: [TransferScreen],
    providers: [
      { provide: CoreFinancieroService, useValue: core },
      { provide: INITIAL_ACCOUNTS, useValue: accounts },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TransferScreen);
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

// `app-result-row` renderiza label y value como spans hermanos dentro del mismo host: leer
// `textContent` del host entero concatena los dos ("ComprobanteTRF-..."). Esto lee sólo el span
// del valor.
function resultValue(root: HTMLElement, testId: string): string | null | undefined {
  return root.querySelector(`[data-testid="${testId}"] .result-row__value`)?.textContent?.trim();
}

describe('TransferScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deriva Origen y Destino de las cuentas INYECTADAS del contrato, no de un literal', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    expect(fieldInput(root, 'origin').value).toBe('CCI-ORIGEN-DE-PRUEBA');
    expect(fieldInput(root, 'destination').value).toBe('CCI-DESTINO-DE-PRUEBA');
  });

  it('el monto arranca vacío', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;
    expect(fieldInput(root, 'amount').value).toBe('');
  });

  it('el filtro de Monto acepta hasta 2 decimales y rechaza el resto', async () => {
    const fixture = await setup(fakeCore());
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'amount', '100.00');
    expect(fieldInput(root, 'amount').value).toBe('100.00');

    // Rechazado: el campo vuelve al valor previo (filtro de TEXTO, no regla de negocio — quien
    // valida sigue siendo el core, y `tr-007` lo prueba en el test de contrato).
    type(root, 'amount', '100.001');
    await fixture.whenStable();
    expect(fieldInput(root, 'amount').value).toBe('100.00');

    // La coma que un teclado con locale es-PE puede ofrecer se descarta igual.
    type(root, 'amount', '1,50');
    await fixture.whenStable();
    expect(fieldInput(root, 'amount').value).toBe('100.00');
  });

  it('el monto viaja al core TAL COMO SE TECLEÓ, sin normalizar', async () => {
    const recibidos: string[] = [];
    const core = fakeCore({
      executeTransfer: (_accounts: Account[], request: TransferRequest) => {
        recibidos.push(request.amount);
        return RESULT;
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'amount', '100.5');
    clickButton(root, 'transfer');

    expect(recibidos).toEqual(['100.5']);
  });

  // `vi.useFakeTimers()` también mockea los timers que usa internamente el scheduler
  // zoneless de Angular para programar su propio tick asíncrono, así que `whenStable()` —que
  // depende de esos timers para resolver— se cuelga acá. `fixture.detectChanges()` fuerza un
  // ciclo de detección de cambios SÍNCRONO sobre este fixture, sin pasar por el scheduler.
  it('espera simulatedLatencyMs antes de pintar el resultado, y el botón queda en carga', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [TransferScreen],
      providers: [
        { provide: CoreFinancieroService, useValue: fakeCore() },
        { provide: INITIAL_ACCOUNTS, useValue: FAKE_ACCOUNTS },
      ],
    });
    const fixture = TestBed.createComponent(TransferScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'amount', '100.00');
    clickButton(root, 'transfer');
    fixture.detectChanges();

    expect(resultValue(root, 'receipt')).toBeFalsy();
    expect(
      (root.querySelector('[data-testid="transfer"] button') as HTMLButtonElement).disabled,
    ).toBe(true);

    vi.advanceTimersByTime(10);
    fixture.detectChanges();

    expect(resultValue(root, 'receipt')).toBe('TRF-9047-1065-10000');
  });

  it('una transferencia fallida limpia el resultado anterior', () => {
    vi.useFakeTimers();
    let falla = false;
    const core = fakeCore({
      executeTransfer: () => {
        if (falla) throw { tag: 'SameAccount', inner: {} };
        return RESULT;
      },
    });
    TestBed.configureTestingModule({
      imports: [TransferScreen],
      providers: [
        { provide: CoreFinancieroService, useValue: core },
        { provide: INITIAL_ACCOUNTS, useValue: FAKE_ACCOUNTS },
      ],
    });
    const fixture = TestBed.createComponent(TransferScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    type(root, 'amount', '100.00');
    clickButton(root, 'transfer');
    vi.advanceTimersByTime(10);
    fixture.detectChanges();
    expect(resultValue(root, 'receipt')).toBe('TRF-9047-1065-10000');

    falla = true;
    clickButton(root, 'transfer');
    fixture.detectChanges();

    expect(text(root, 'transfer-error')).toBe('La cuenta de origen y la de destino son la misma.');
    // El comprobante viejo no puede quedar debajo del error: parecería una transferencia
    // parcialmente exitosa.
    expect(root.querySelector('[data-testid="receipt"]')).toBeNull();
  });

  it('editar un campo consume el error', async () => {
    const core = fakeCore({
      executeTransfer: () => {
        throw { tag: 'SameAccount', inner: {} };
      },
    });
    const fixture = await setup(core);
    const root = fixture.nativeElement as HTMLElement;

    clickButton(root, 'transfer');
    await fixture.whenStable();
    expect(text(root, 'transfer-error')).not.toBe('');

    type(root, 'origin', 'otra-cuenta');
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="transfer-error"]')).toBeNull();
  });
});
