import { Component, input, output } from '@angular/core';

/**
 * El botón primario de las cuatro pantallas: `Calcular`, `Transferir`, `Validar y cifrar`,
 * `Descifrar`, `Ejecutar`.
 *
 * **Nunca `<button type="submit">` dentro de un `<form>` implícito ni el look nativo del
 * `<button>` sin estilo**: los labels van con la capitalización exacta de `docs/ui-spec.md`
 * (`Calcular`, no `CALCULAR`), igual que Android evita el `Button` de Material (que
 * mayusculiza) y React Native evita el suyo por la misma razón.
 *
 * `loading` pinta un indicador **dentro** del botón y lo deshabilita junto con `disabled`, que
 * es lo que hacen `CircularProgressIndicator` en el `Button` de Compose y `ProgressView` en el
 * de SwiftUI: remplazar el botón entero por un spinner suelto movería el layout de la pantalla
 * mientras las cuatro se miran lado a lado.
 */
@Component({
  selector: 'app-primary-button',
  template: `
    <button type="button" class="primary-button" [disabled]="isInert()" (click)="onClick()">
      @if (loading()) {
        <span class="primary-button__spinner" aria-hidden="true"></span>
      } @else {
        {{ label() }}
      }
    </button>
  `,
  styles: `
    :host {
      display: block;
    }

    .primary-button {
      width: 100%;
      padding: 0.75rem;
      border: none;
      border-radius: 6px;
      background: var(--color-orange);
      color: var(--color-white);
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
    }

    .primary-button:disabled {
      background: var(--color-muted);
      cursor: default;
    }

    .primary-button__spinner {
      display: inline-block;
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: var(--color-white);
      border-radius: 50%;
      animation: primary-button-spin 0.6s linear infinite;
    }

    @keyframes primary-button-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class PrimaryButton {
  readonly label = input.required<string>();
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly pressed = output<void>();

  isInert(): boolean {
    return this.disabled() || this.loading();
  }

  onClick(): void {
    if (!this.isInert()) {
      this.pressed.emit();
    }
  }
}
