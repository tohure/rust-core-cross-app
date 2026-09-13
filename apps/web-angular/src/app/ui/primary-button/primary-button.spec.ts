import { TestBed } from '@angular/core/testing';
import { PrimaryButton } from './primary-button';

describe('PrimaryButton', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryButton],
    }).compileComponents();
  });

  it('muestra el label con su capitalización exacta', async () => {
    const fixture = TestBed.createComponent(PrimaryButton);
    fixture.componentRef.setInput('label', 'Calcular');
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Calcular');
  });

  it('emite `pressed` al hacer click', async () => {
    const fixture = TestBed.createComponent(PrimaryButton);
    fixture.componentRef.setInput('label', 'Transferir');
    await fixture.whenStable();

    let presses = 0;
    fixture.componentInstance.pressed.subscribe(() => presses++);

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(presses).toBe(1);
  });

  it('con `disabled=true`, el botón queda deshabilitado y no emite `pressed`', async () => {
    const fixture = TestBed.createComponent(PrimaryButton);
    fixture.componentRef.setInput('label', 'Transferir');
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();

    let presses = 0;
    fixture.componentInstance.pressed.subscribe(() => presses++);

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(presses).toBe(0);
  });

  it('con `loading=true`, el botón queda deshabilitado, no muestra el label y no emite `pressed`', async () => {
    const fixture = TestBed.createComponent(PrimaryButton);
    fixture.componentRef.setInput('label', 'Validar y cifrar');
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    let presses = 0;
    fixture.componentInstance.pressed.subscribe(() => presses++);

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).not.toContain('Validar y cifrar');
    button.click();
    expect(presses).toBe(0);
  });
});
