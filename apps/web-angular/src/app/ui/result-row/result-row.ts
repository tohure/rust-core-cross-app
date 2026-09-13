import { Component, input } from '@angular/core';

/**
 * Fila `etiqueta ......... valor` del bloque de resultado (`ResultRow(label, value)` en
 * `docs/ui-spec.md`). La usan Transferencia, Tarjeta y Benchmark para las filas de sus bloques
 * `SectionDivider`.
 *
 * `monospace` es para el hex cifrado de Tarjeta: tiene que poder compararse a simple vista
 * contra las otras tres apps, y con tipografía proporcional eso no se puede.
 */
@Component({
  selector: 'app-result-row',
  template: `
    <div class="result-row">
      <span class="result-row__label">{{ label() }}</span>
      <span class="result-row__value" [class.result-row__value--mono]="monospace()">{{
        value()
      }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .result-row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }

    .result-row__label {
      color: var(--color-muted);
      font-size: 0.875rem;
    }

    .result-row__value {
      color: var(--color-text);
      font-size: 0.875rem;
      text-align: right;
      word-break: break-all;
    }

    .result-row__value--mono {
      font-family: var(--font-mono);
    }
  `,
})
export class ResultRow {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly monospace = input<boolean>(false);
}
