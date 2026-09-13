import { Component, inject, signal } from '@angular/core';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { userMessage } from '../../core/user-message';
import { LabeledField } from '../../ui/labeled-field/labeled-field';
import { PrimaryButton } from '../../ui/primary-button/primary-button';
import { ScreenHeader } from '../../ui/screen-header/screen-header';
import { nativeFloat } from '../benchmark/baseline';

type Operation = 'add' | 'subtract';

/**
 * Pantalla de Aritmética: exhibe, lado a lado, el fallo del punto flotante nativo contra el
 * `Decimal` del core (`docs/ui-spec.md`, sección 1).
 *
 * **Es la única pantalla donde se permite el tipo flotante nativo** (`nativeFloat`, en
 * `../benchmark/baseline.ts`), y existe justamente para eso: el componente en sí no calcula
 * nada, sólo llama al core y a esa única excepción documentada, y guarda lo que cada uno
 * devuelve.
 *
 * **Sin límite de 2 decimales.** A diferencia de Transferencia, el contrato acepta escala libre
 * en la entrada (`ar-001` es `"0.1"`), así que los campos no llevan filtro de texto.
 */
@Component({
  selector: 'app-arithmetic-screen',
  imports: [LabeledField, PrimaryButton, ScreenHeader],
  template: `
    <app-screen-header title="Aritmética" subtitle="El float rompe el dinero" />

    <app-labeled-field
      label="Operando A"
      data-testid="operand-a"
      [(value)]="a"
      inputMode="decimal"
    />
    <app-labeled-field
      label="Operando B"
      data-testid="operand-b"
      [(value)]="b"
      inputMode="decimal"
    />

    <div class="arithmetic-screen__operations" role="radiogroup" aria-label="Operación">
      <label class="arithmetic-screen__operation">
        <input
          type="radio"
          name="arithmetic-operation"
          data-testid="op-add"
          [checked]="operation() === 'add'"
          (change)="setOperation('add')"
        />
        Sumar
      </label>
      <label class="arithmetic-screen__operation">
        <input
          type="radio"
          name="arithmetic-operation"
          data-testid="op-subtract"
          [checked]="operation() === 'subtract'"
          (change)="setOperation('subtract')"
        />
        Restar
      </label>
    </div>

    <app-primary-button label="Calcular" data-testid="calculate" (pressed)="calculate()" />

    @if (error()) {
      <p class="arithmetic-screen__error" data-testid="arithmetic-error">{{ error() }}</p>
    }

    <div class="arithmetic-screen__block arithmetic-screen__block--native">
      <p class="arithmetic-screen__block-title">Punto flotante nativo</p>
      <p class="arithmetic-screen__block-value" data-testid="native-result">
        {{ nativeResult() }}
      </p>
    </div>
    <div class="arithmetic-screen__block arithmetic-screen__block--core">
      <p class="arithmetic-screen__block-title">Core (Rust · Decimal)</p>
      <p class="arithmetic-screen__block-value" data-testid="core-result">{{ coreResult() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .arithmetic-screen__operations {
      display: flex;
      gap: 1rem;
    }

    .arithmetic-screen__operation {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--color-text);
      font-size: 0.9375rem;
    }

    .arithmetic-screen__error {
      margin: 0;
      color: var(--color-danger);
      font-size: 0.875rem;
    }

    .arithmetic-screen__block {
      margin: 0;
      border: 1px solid;
      border-radius: 8px;
      padding: 0.75rem;
    }

    .arithmetic-screen__block--native {
      border-color: var(--color-danger);
    }

    .arithmetic-screen__block--core {
      border-color: var(--color-ok);
    }

    .arithmetic-screen__block-title {
      margin: 0 0 0.25rem;
      font-size: 0.8125rem;
    }

    .arithmetic-screen__block--native .arithmetic-screen__block-title {
      color: var(--color-danger);
    }

    .arithmetic-screen__block--core .arithmetic-screen__block-title {
      color: var(--color-ok);
    }

    .arithmetic-screen__block-value {
      margin: 0;
      color: var(--color-text);
      font-size: 1rem;
      word-break: break-all;
    }
  `,
})
export class ArithmeticScreen {
  private readonly core = inject(CoreFinancieroService);

  // Arranca con los operandos de `ar-001`: "0.1 + 0.2" es el caso que mejor se ve en la demo.
  protected readonly a = signal('0.1');
  protected readonly b = signal('0.2');
  protected readonly operation = signal<Operation>('add');
  protected readonly nativeResult = signal('');
  protected readonly coreResult = signal('');
  protected readonly error = signal('');

  protected setOperation(operation: Operation): void {
    this.operation.set(operation);
  }

  /**
   * No calcula nada: llama al core y a `nativeFloat` (la única excepción permitida) y guarda lo
   * que cada uno devuelve, tal cual. Los errores del core se convierten a texto de usuario
   * ACÁ, no en el servicio: `CoreFinancieroService` propaga el error sin traducirlo a propósito.
   */
  protected calculate(): void {
    try {
      const coreResult =
        this.operation() === 'add'
          ? this.core.add(this.a(), this.b())
          : this.core.subtract(this.a(), this.b());
      this.coreResult.set(coreResult);
      this.nativeResult.set(nativeFloat(this.a(), this.b(), this.operation()));
      this.error.set('');
    } catch (e) {
      this.coreResult.set('');
      this.nativeResult.set('');
      this.error.set(userMessage(e));
    }
  }
}
