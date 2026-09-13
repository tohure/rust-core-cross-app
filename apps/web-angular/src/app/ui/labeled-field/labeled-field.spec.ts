import { TestBed } from '@angular/core/testing';
import { LabeledField } from './labeled-field';

describe('LabeledField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabeledField],
    }).compileComponents();
  });

  it('muestra el label y el valor recibidos', async () => {
    const fixture = TestBed.createComponent(LabeledField);
    fixture.componentRef.setInput('label', 'Operando A');
    fixture.componentRef.setInput('value', '0.1');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.labeled-field__label')?.textContent).toBe('Operando A');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('0.1');
  });

  // Regla del invariante (CLAUDE.md): ningún tipo de punto flotante toca un monto. Un
  // `type="number"` entrega el valor ya convertido a `number` en el DOM, así que el campo tiene
  // que ser SIEMPRE de texto, sin excepción por pantalla.
  it('el input nunca es type="number"', async () => {
    const fixture = TestBed.createComponent(LabeledField);
    fixture.componentRef.setInput('label', 'Monto');
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('escribir en el input actualiza el signal `value` (two-way)', async () => {
    const fixture = TestBed.createComponent(LabeledField);
    fixture.componentRef.setInput('label', 'Monto');
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '100.00';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('100.00');
  });

  it('propaga el inputmode recibido (p.ej. "decimal" en los campos de monto)', async () => {
    const fixture = TestBed.createComponent(LabeledField);
    fixture.componentRef.setInput('label', 'Monto');
    fixture.componentRef.setInput('inputMode', 'decimal');
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });
});
