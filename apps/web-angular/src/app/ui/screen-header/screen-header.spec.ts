import { TestBed } from '@angular/core/testing';
import { ScreenHeader } from './screen-header';

describe('ScreenHeader', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScreenHeader],
    }).compileComponents();
  });

  it('renderiza el título y el subtítulo recibidos, sin agregar ni recortar nada', async () => {
    const fixture = TestBed.createComponent(ScreenHeader);
    fixture.componentRef.setInput('title', 'Aritmética');
    fixture.componentRef.setInput('subtitle', 'El float rompe el dinero');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Aritmética');
    expect(el.querySelector('p')?.textContent).toBe('El float rompe el dinero');
  });
});
