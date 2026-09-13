import { TestBed } from '@angular/core/testing';
import { SectionDivider } from './section-divider';

describe('SectionDivider', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionDivider],
    }).compileComponents();
  });

  it('renderiza el título del separador', async () => {
    const fixture = TestBed.createComponent(SectionDivider);
    fixture.componentRef.setInput('title', 'Resultado');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.section-divider__title')?.textContent).toBe('Resultado');
  });
});
