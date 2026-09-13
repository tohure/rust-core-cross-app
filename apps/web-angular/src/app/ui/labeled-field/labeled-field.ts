import { Component, ElementRef, effect, model, input, viewChild } from '@angular/core';

/**
 * Campo de texto con label a la izquierda (`LabeledField(label, value, onChange)` en
 * `docs/ui-spec.md`). `value` es un `model()`: dos vías, como el `value`/`onChangeText` de React
 * Native o el `value`/`onValueChange` de Compose.
 *
 * **Siempre `type="text"`.** Nunca `type="number"`: ese tipo entrega el valor como `number` en
 * el DOM y ahí se pierde la precisión del monto — exactamente lo que la regla del invariante del
 * `CLAUDE.md` prohíbe. `inputMode` es sólo una pista de teclado para el navegador/móvil
 * (`"decimal"` en los campos de monto de Transferencia); no cambia el tipo del valor.
 */
@Component({
  selector: 'app-labeled-field',
  template: `
    <label class="labeled-field">
      <span class="labeled-field__label">{{ label() }}</span>
      <input
        #input
        class="labeled-field__input"
        type="text"
        [attr.inputmode]="inputMode()"
        [placeholder]="placeholder()"
        (input)="onInput($event)"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </label>
  `,
  styles: `
    :host {
      display: block;
    }

    .labeled-field {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .labeled-field__label {
      flex: 0 0 7rem;
      color: var(--color-text);
      font-size: 0.9375rem;
    }

    .labeled-field__input {
      flex: 1;
      min-width: 0;
      padding: 0.5rem 0.625rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 0.9375rem;
      color: var(--color-text);
      background: var(--color-white);
    }

    .labeled-field__input:focus {
      outline: 2px solid var(--color-orange);
      outline-offset: -1px;
    }
  `,
})
export class LabeledField {
  readonly label = input.required<string>();
  readonly value = model<string>('');
  readonly placeholder = input<string>('');
  readonly inputMode = input<'text' | 'decimal' | 'numeric'>('text');

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  constructor() {
    // Escribe `value()` en el DOM A MANO, en vez de un `[value]="value()"` declarativo, porque
    // ese binding tiene un agujero real: Angular salta la escritura al DOM cuando el valor
    // NUEVO coincide con el ÚLTIMO que Angular mismo aplicó — pero el DOM puede haber cambiado
    // por fuera de Angular (el usuario tecleando: el navegador actualiza `input.value` de forma
    // nativa, sin pasar por ningún binding). Eso importa acá porque un consumidor que filtra el
    // valor (Transferencia con el monto, Tarjeta con el número y el hex) revierte al último
    // valor VÁLIDO llamando `value.set(...)` con ese mismo string de antes: si ese string es
    // igual al que Angular ya tenía anotado, el binding declarativo no vuelve a tocar el DOM y
    // la tecla rechazada queda visible en pantalla. Comparando contra el DOM real (`el.value`,
    // no contra la anotación interna de Angular) en cada corrida del efecto, se cierra el hueco
    // sin importar el orden en que lleguen los `set()`. Encontrado en la Tarea 11 escribiendo el
    // spec de Transferencia, no a ojo: `1,50` quedaba visible después de revertir a `100.00`
    // porque el revert coincidía con el último valor aceptado.
    effect(() => {
      const el = this.inputRef().nativeElement;
      const next = this.value();
      if (el.value !== next) el.value = next;
    });
  }

  onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
