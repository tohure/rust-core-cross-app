import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { CoreFinancieroService } from './core/core-financiero.service';

// El string es arbitrario: esta suite prueba la ARQUITECTURA del shell (navegación, pie que
// recibe el string en vez de buscarlo, estado de pantalla que sobrevive al cambio de pestaña),
// no el valor real de `coreVersion()` -- eso ya lo cubre `core-financiero.service.spec.ts`
// contra el WASM real. Por eso se reemplaza el servicio por un doble que no lo toca: si `App`
// llamara a `coreVersion()` de más, o en el momento equivocado, estos tests lo notarían igual,
// porque el doble no depende de que el WASM esté cargado.
const FAKE_VERSION = 'core 9.9.9 · testsha1';
const TAB_KEYS = ['arithmetic', 'transfer', 'card', 'benchmark'] as const;

function fakeCoreFinanciero(): CoreFinancieroService {
  return { coreVersion: () => FAKE_VERSION } as unknown as CoreFinancieroService;
}

function clickTab(root: HTMLElement, key: string): void {
  (root.querySelector(`[data-testid="tab-${key}"]`) as HTMLButtonElement).click();
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: CoreFinancieroService, useValue: fakeCoreFinanciero() }],
    }).compileComponents();
  });

  it('se crea', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('las cuatro pestañas llevan el label COMPLETO de docs/ui-spec.md, no la abreviatura del wireframe', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const labels = TAB_KEYS.map((key) =>
      (
        fixture.nativeElement.querySelector(`[data-testid="tab-${key}"]`) as HTMLElement
      ).textContent?.trim(),
    );
    // `Transf.` y `Bm` son del wireframe ASCII, que abrevia por ancho de columna; el texto
    // normativo, dos párrafos más arriba en ese mismo archivo, los nombra enteros.
    expect(labels).toEqual(['Aritmética', 'Transferencia', 'Tarjeta', 'Benchmark']);
  });

  it('el pie muestra el coreVersion() recibido como INPUT, en las cuatro pestañas', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    for (const key of TAB_KEYS) {
      clickTab(fixture.nativeElement, key);
      await fixture.whenStable();

      const footer = fixture.nativeElement.querySelector(
        '[data-testid="core-version"]',
      ) as HTMLElement;
      expect(footer.textContent).toBe(FAKE_VERSION);
    }
  });

  it('cambiar de pestaña oculta las otras tres con [hidden]: las cuatro secciones siguen en el DOM', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    for (const active of TAB_KEYS) {
      clickTab(fixture.nativeElement, active);
      await fixture.whenStable();

      for (const key of TAB_KEYS) {
        const section = fixture.nativeElement.querySelector(
          `[data-testid="screen-${key}"]`,
        ) as HTMLElement | null;
        // Las CUATRO secciones existen SIEMPRE: si alguna faltara, algo la desmontó (@if)
        // en vez de ocultarla (hidden).
        expect(section).not.toBeNull();
        expect(section!.hidden).toBe(key !== active);

        // La propiedad IDL `.hidden` sólo dice si el ATRIBUTO está puesto: vale true/false
        // igual esté o no la pantalla oculta de verdad en pantalla. Lo que de verdad la
        // esconde es que ninguna regla de autor le gane a la hoja de estilos del navegador
        // (`[hidden] { display: none }`, que es UA y pierde contra cualquier regla de autor
        // con igual especificidad) -- pasó de verdad con `.app-shell__screen { display: flex }`
        // hasta que se agregó `.app-shell__screen[hidden] { display: none }` en app.css. Se
        // encontró con una captura de pantalla real (Chrome vía CDP), no con esta aserción; se
        // agrega acá para que la regresión quede atrapada por el gate automático, no sólo por
        // una inspección visual manual.
        const display = getComputedStyle(section!).display;
        expect(display).toBe(key === active ? 'flex' : 'none');
      }
    }
  });

  it('el texto tecleado en una pestaña sobrevive a cambiar de pestaña y volver', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const arithmeticInput = fixture.nativeElement.querySelector(
      '[data-testid="screen-arithmetic"] input',
    ) as HTMLInputElement;
    arithmeticInput.value = '0.1';
    arithmeticInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(arithmeticInput.value).toBe('0.1');

    clickTab(fixture.nativeElement, 'transfer');
    await fixture.whenStable();
    clickTab(fixture.nativeElement, 'arithmetic');
    await fixture.whenStable();

    const arithmeticInputAfter = fixture.nativeElement.querySelector(
      '[data-testid="screen-arithmetic"] input',
    ) as HTMLInputElement;
    // Si `[hidden]` se hubiera reemplazado por `@if`/`*ngIf`, este input se habría recreado al
    // volver y el valor tecleado se habría perdido -- exactamente el defecto que reintrodujo la
    // Fase 4 (React Native) y que Android ya había resuelto. El mismo nodo del DOM es la prueba
    // de que nunca se desmontó.
    expect(arithmeticInputAfter).toBe(arithmeticInput);
    expect(arithmeticInputAfter.value).toBe('0.1');
  });

  it('el estado de una pestaña no se mezcla con el de otra', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const inputFor = (key: string) =>
      fixture.nativeElement.querySelector(
        `[data-testid="screen-${key}"] input`,
      ) as HTMLInputElement;

    inputFor('arithmetic').value = 'valor-aritmetica';
    inputFor('arithmetic').dispatchEvent(new Event('input'));
    await fixture.whenStable();

    clickTab(fixture.nativeElement, 'transfer');
    await fixture.whenStable();
    inputFor('transfer').value = 'valor-transferencia';
    inputFor('transfer').dispatchEvent(new Event('input'));
    await fixture.whenStable();

    clickTab(fixture.nativeElement, 'arithmetic');
    await fixture.whenStable();
    expect(inputFor('arithmetic').value).toBe('valor-aritmetica');

    clickTab(fixture.nativeElement, 'transfer');
    await fixture.whenStable();
    expect(inputFor('transfer').value).toBe('valor-transferencia');
  });
});
