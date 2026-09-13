import { TestBed } from '@angular/core/testing';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { BenchmarkScreen } from './benchmark-screen';

// Fix round 1 (review de la Tarea 13): esta suite NO mockea `performance.now()` ni el módulo
// `./baseline` (`nativeFloat`). Se intentó primero un reloj determinístico con `vi.mock('./
// baseline', ...)`, pero el runner de Angular lo bloquea explícitamente para imports relativos
// ("Please use Angular TestBed for mocking dependencies") — y `nativeFloat` no es inyectable a
// propósito: es una función pura sin estado, se importa directo (ver su propio comentario en
// `baseline.ts`). La suite corre entonces con el reloj REAL de Node/jsdom, que a diferencia de
// un tab de Chrome no está cuantizado por la mitigación anti-Spectre: la calibración converge en
// milisegundos (de decenas a pocos cientos de miles de llamadas, nunca cerca del tope
// `MAX_BATCH_SIZE`), así que alcanza con aserciones de formato/cantidad — no de valor exacto.
//
// **Trampa real que se pisó escribiendo esto, y por eso queda anotada:** `vi.useFakeTimers()`
// SIN argumentos también fakea `performance.now()` (es parte de la lista por defecto de
// `@sinonjs/fake-timers`), así que los tests que necesitan medir de verdad piden explícitamente
// `{ toFake: ['setTimeout', 'clearTimeout'] }` — de lo contrario `elapsedMs` da siempre 0, la
// calibración nunca converge, y cada test tarda ~8 s corriendo al tope de `MAX_BATCH_SIZE` en
// vez de los milisegundos que le tomaría con el reloj real.
const MEDIDA = /^\d+\.\d{2} µs$/;
const SIN_MEDIR = '—';

// Espejo de las constantes privadas de `benchmark-screen.ts` (`WARMUP_BATCHES` y
// `SAMPLE_COUNT`): documentadas acá para poder afirmar una COTA INFERIOR de cuántas veces se
// llama a `f`, sin depender del tiempo real que tarde cada llamada. Si cambian allá, este
// número hay que actualizarlo acá.
const WARMUP_BATCHES = 5;
const SAMPLE_COUNT = 30;
const MIN_BATCHES_PER_MEASURE = 1 /* el lote de calibración que sí llega a durar 1 ms */ + WARMUP_BATCHES + SAMPLE_COUNT;

// Fix round 2 (finding N1): espejo de la derivación de `MAX_BATCH_SIZE` en `benchmark-screen.ts`
// — ya no es una constante fija, se deriva de un presupuesto de operaciones TOTALES por
// `measure()`. Repetido acá, con la misma cuenta, para poder predecir EXACTO cuántas llamadas
// hace una corrida que pide más de lo que el presupuesto permite (ver el test de "se recorta").
const TOTAL_OPERATIONS_BUDGET = 2_000_000;
const CALIBRATION_BUDGET_BATCHES = 2;
const BATCHES_PER_MEASURE = CALIBRATION_BUDGET_BATCHES + WARMUP_BATCHES + SAMPLE_COUNT;
const MAX_BATCH_SIZE = Math.floor(TOTAL_OPERATIONS_BUDGET / BATCHES_PER_MEASURE);

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
    // `toFake` explícito SIN 'performance': el default de @sinonjs/fake-timers SÍ lo
    // fakea, y congelar `performance.now()` habría dejado todo `elapsedMs` en 0, forzando
    // el tope de MAX_BATCH_SIZE en cada corrida (~140 millones de llamadas) — así se
    // encontró este bug: los tests tardaban ~8 s cada uno en vez de milisegundos.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [{ provide: CoreFinancieroService, useValue: fakeCore() }],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // Chico a propósito: sólo hace falta que la calibración tenga margen para duplicar hasta
    // pasar el piso de 1 ms de lote — el valor exacto no importa, el reloj es real (Node/jsdom,
    // sin la cuantización de un tab de Chrome real).
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

  it('llama al core muchas veces por lote, no una sola vez total', async () => {
    let llamadas = 0;
    const n = 10;
    // `toFake` explícito SIN 'performance': el default de @sinonjs/fake-timers SÍ lo
    // fakea, y congelar `performance.now()` habría dejado todo `elapsedMs` en 0, forzando
    // el tope de MAX_BATCH_SIZE en cada corrida (~140 millones de llamadas) — así se
    // encontró este bug: los tests tardaban ~8 s cada uno en vez de milisegundos.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

    type(root, 'iterations', String(n));
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    // No se puede predecir el número EXACTO sin fijar el reloj (bloqueado por el runner de
    // Angular, ver el comentario de arriba). Tampoco se puede exigir que el total sea un
    // múltiplo limpio de `n` (fix round 1 lo hacía, porque `k` sólo se obtenía duplicando `n`
    // sin tope real) — desde el fix round 2, `k` puede recortarse a `MAX_BATCH_SIZE` a mitad de
    // la duplicación si el presupuesto de operaciones totales se alcanza antes que el piso de
    // 1 ms, y `MAX_BATCH_SIZE` no tiene por qué ser múltiplo de `n`. Lo que SÍ es una cota
    // válida siempre, con o sin recorte: el total es al menos `n * (1 + WARMUP_BATCHES +
    // SAMPLE_COUNT)`, porque `k >= n` en cualquier camino (nunca se recorta por DEBAJO de lo
    // tecleado, sólo por arriba del presupuesto).
    expect(llamadas).toBeGreaterThanOrEqual(n * MIN_BATCHES_PER_MEASURE);
    // Y la prueba directa de lo que este guard existe para atrapar: no es 1 (cachear el
    // resultado de una sola llamada y reusarlo) ni es igual a `n` (el significado viejo,
    // pre-fix, de "una llamada por iteración total").
    expect(llamadas).not.toBe(1);
    expect(llamadas).not.toBe(n);
  });

  it('si Iteraciones supera el presupuesto, se recorta y la pantalla lo dice', async () => {
    let llamadas = 0;
    // 999999 (el tope de 6 dígitos del campo) es mayor que MAX_BATCH_SIZE: antes del fix round
    // 2, esto disparaba ~36 millones de llamadas reales y ~66 s de hilo principal bloqueado sin
    // ninguna forma de cancelarlo. `toFake` explícito sin 'performance' — ver el comentario del
    // encabezado del archivo.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

    type(root, 'iterations', '999999');
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    // El aviso dice las DOS cifras: cuánto se pidió y cuánto se corrió de verdad — "en la UI o
    // en el resultado", como pide el fix, para que la pantalla nunca acepte un número y se
    // cuelgue en silencio.
    expect(text(root, 'benchmark-clamp-note')).toContain(String(MAX_BATCH_SIZE));
    expect(text(root, 'benchmark-clamp-note')).toContain('999999');
    // Y la medida sigue siendo una medida real, no un efecto secundario del recorte.
    expect(resultValue(root, 'core-p50')).toMatch(MEDIDA);

    // Con 999999 > MAX_BATCH_SIZE, `k` se recorta a MAX_BATCH_SIZE DESDE EL PRIMER intento de
    // calibración (ni siquiera duplica): la calibración consume un lote de MAX_BATCH_SIZE, más
    // WARMUP_BATCHES + SAMPLE_COUNT lotes del mismo tamaño. Total exacto y predecible, la prueba
    // de que el presupuesto —no el número tecleado— es quien manda.
    expect(llamadas).toBe(MAX_BATCH_SIZE * (1 + WARMUP_BATCHES + SAMPLE_COUNT));
  });

  it('con iteraciones dentro del presupuesto, no aparece aviso de recorte', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({
      imports: [BenchmarkScreen],
      providers: [{ provide: CoreFinancieroService, useValue: fakeCore() }],
    });
    const fixture = TestBed.createComponent(BenchmarkScreen);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // El default (1000) está muy por debajo de MAX_BATCH_SIZE: no hace falta tocar el campo.
    clickRun(root);
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="benchmark-clamp-note"]')).toBeNull();
    expect(resultValue(root, 'core-p50')).toMatch(MEDIDA);
  });

  it('un error del core se muestra con userMessage, no como [object Object]', async () => {
    // `toFake` explícito SIN 'performance': el default de @sinonjs/fake-timers SÍ lo
    // fakea, y congelar `performance.now()` habría dejado todo `elapsedMs` en 0, forzando
    // el tope de MAX_BATCH_SIZE en cada corrida (~140 millones de llamadas) — así se
    // encontró este bug: los tests tardaban ~8 s cada uno en vez de milisegundos.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
    // `toFake` explícito SIN 'performance': el default de @sinonjs/fake-timers SÍ lo
    // fakea, y congelar `performance.now()` habría dejado todo `elapsedMs` en 0, forzando
    // el tope de MAX_BATCH_SIZE en cada corrida (~140 millones de llamadas) — así se
    // encontró este bug: los tests tardaban ~8 s cada uno en vez de milisegundos.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

    type(root, 'iterations', '10');
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
