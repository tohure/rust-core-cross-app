import { TestBed } from '@angular/core/testing';
import { ResultRow } from './result-row';

describe('ResultRow', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResultRow],
    }).compileComponents();
  });

  it('renderiza el label y el value recibidos', async () => {
    const fixture = TestBed.createComponent(ResultRow);
    fixture.componentRef.setInput('label', 'Comisión ITF');
    fixture.componentRef.setInput('value', 'S/ 0.01');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.result-row__label')?.textContent).toBe('Comisión ITF');
    expect(el.querySelector('.result-row__value')?.textContent).toBe('S/ 0.01');
  });

  it('sin `monospace`, no aplica la clase monoespaciada', async () => {
    const fixture = TestBed.createComponent(ResultRow);
    fixture.componentRef.setInput('label', 'Total debitado');
    fixture.componentRef.setInput('value', 'S/ 100.01');
    await fixture.whenStable();

    const value = fixture.nativeElement.querySelector('.result-row__value') as HTMLElement;
    expect(value.classList.contains('result-row__value--mono')).toBe(false);
  });

  // El hex de Tarjeta tiene que poder compararse a simple vista contra las otras tres apps.
  it('con `monospace=true`, el valor usa fuente monoespaciada', async () => {
    const fixture = TestBed.createComponent(ResultRow);
    fixture.componentRef.setInput('label', 'Cifrado (hex)');
    fixture.componentRef.setInput('value', 'bdca3931');
    fixture.componentRef.setInput('monospace', true);
    await fixture.whenStable();

    const value = fixture.nativeElement.querySelector('.result-row__value') as HTMLElement;
    expect(value.classList.contains('result-row__value--mono')).toBe(true);
  });
});
