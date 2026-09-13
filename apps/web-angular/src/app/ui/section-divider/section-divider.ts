import { Component, input } from '@angular/core';

/**
 * Separador `─── Resultado ───` que agrupa filas de `ResultRow` (`SectionDivider(title)` en
 * `docs/ui-spec.md`). Benchmark, por ejemplo, se compone únicamente de estos dos componentes
 * compartidos —sin un componente propio— a propósito: ver el CONTEXT de esa pantalla.
 */
@Component({
  selector: 'app-section-divider',
  template: `
    <div class="section-divider" role="separator" [attr.aria-label]="title()">
      <span class="section-divider__line"></span>
      <span class="section-divider__title">{{ title() }}</span>
      <span class="section-divider__line"></span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .section-divider {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-divider__line {
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }

    .section-divider__title {
      color: var(--color-muted);
      font-size: 0.75rem;
      white-space: nowrap;
    }
  `,
})
export class SectionDivider {
  readonly title = input.required<string>();
}
