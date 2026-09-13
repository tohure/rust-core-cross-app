import { TestBed } from '@angular/core/testing';
import { CoreVersionFooter } from './core-version-footer';

describe('CoreVersionFooter', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoreVersionFooter],
    }).compileComponents();
  });

  it('muestra el string recibido tal cual, sin reformatear', async () => {
    const fixture = TestBed.createComponent(CoreVersionFooter);
    fixture.componentRef.setInput('version', 'core 1.0.0 · a0a40a5');
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('[data-testid="core-version"]') as HTMLElement;
    expect(el.textContent).toBe('core 1.0.0 · a0a40a5');
  });

  // Prueba de arquitectura, no de contenido: si este componente alguna vez llamara a
  // `coreVersion()` por sí mismo, crear el fixture SIN levantar el WASM (nada de
  // `CoreFinancieroService` ni `initCore` en este spec) fallaría. Que funcione así es la
  // prueba de que "recibe el string, no lo busca" — el defecto que corrigió la Fase 4.
  it('se crea y renderiza sin CoreFinancieroService ni el WASM inicializado', async () => {
    const fixture = TestBed.createComponent(CoreVersionFooter);
    fixture.componentRef.setInput('version', 'lo que sea');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="core-version"]')).not.toBeNull();
  });
});
