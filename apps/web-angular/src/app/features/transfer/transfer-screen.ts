import { Component, OnDestroy, inject, signal, viewChild } from '@angular/core';
import type { Account } from '@banco/core-financiero-wasm';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { userMessage } from '../../core/user-message';
import { INITIAL_ACCOUNTS } from '../../contract/sources';
import { MoneyPipe } from '../../format/money.pipe';
import { LabeledField } from '../../ui/labeled-field/labeled-field';
import { PrimaryButton } from '../../ui/primary-button/primary-button';
import { ResultRow } from '../../ui/result-row/result-row';
import { ScreenHeader } from '../../ui/screen-header/screen-header';
import { SectionDivider } from '../../ui/section-divider/section-divider';

/**
 * Filtro de TEXTO, no regla de negocio: decide si el string que el usuario acaba de teclear se
 * acepta en el campo. No parsea, no redondea, no calcula. Quien valida sigue siendo el core, y
 * `tr-007` lo prueba en el test de contrato. Mismo patrón, carácter por carácter, que
 * `TransferViewModel.kt`, `TransferViewModel.swift` y `useTransfer.ts` de React Native.
 */
const AMOUNT_FILTER = /^\d{0,9}(\.\d{0,2})?$/;

/**
 * Pantalla de Transferencia: dos cuentas en memoria, sin red y sin persistencia
 * (`docs/ui-spec.md`, sección 2).
 *
 * **No calcula nada**: llama a `executeTransfer` y guarda lo que devuelve, tal cual. La única
 * espera es `simulatedLatencyMs`, con un `setTimeout` local — no hay ninguna llamada de red
 * detrás.
 *
 * Las cuentas iniciales llegan por el token `INITIAL_ACCOUNTS` (`../../contract/sources.ts`),
 * no por un literal en este archivo: eso es lo que permite que el spec sustituya el contrato por
 * uno de prueba y así probar que el origen/destino realmente se DERIVAN de él.
 */
@Component({
  selector: 'app-transfer-screen',
  imports: [LabeledField, MoneyPipe, PrimaryButton, ResultRow, ScreenHeader, SectionDivider],
  template: `
    <app-screen-header title="Transferencia" subtitle="Dos cuentas en memoria" />

    <!-- Orden de campos fijado por docs/ui-spec.md: origen, destino, monto. No se altera. -->
    <app-labeled-field
      label="Origen"
      data-testid="origin"
      [value]="origin()"
      (valueChange)="setOrigin($event)"
    />
    <app-labeled-field
      label="Destino"
      data-testid="destination"
      [value]="destination()"
      (valueChange)="setDestination($event)"
    />
    <!-- Sin placeholder, igual que Android, iOS y React Native: el campo arranca vacío. -->
    <app-labeled-field
      #amountField
      label="Monto"
      data-testid="amount"
      [value]="amount()"
      (valueChange)="setAmount($event)"
      inputMode="decimal"
    />

    <app-primary-button
      label="Transferir"
      data-testid="transfer"
      [loading]="loading()"
      (pressed)="transfer()"
    />

    @if (error()) {
      <p class="transfer-screen__error" data-testid="transfer-error">{{ error() }}</p>
    }

    @if (receipt()) {
      <app-section-divider title="Resultado" />
      <app-result-row label="Comisión ITF" [value]="itfFee() | money" />
      <app-result-row label="Total debitado" [value]="totalDebited() | money" />
      <!-- Monoespaciado, como en Android (mono = true) e iOS (monospaced: true). -->
      <app-result-row
        label="Comprobante"
        data-testid="receipt"
        [value]="receipt()"
        [monospace]="true"
      />
    }

    <app-section-divider title="Saldos" />
    @for (account of accounts(); track account.id) {
      <app-result-row
        [label]="account.id + '  ' + account.holder"
        [value]="account.balance | money"
      />
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .transfer-screen__error {
      margin: 0;
      color: var(--color-danger);
      font-size: 0.875rem;
    }
  `,
})
export class TransferScreen implements OnDestroy {
  private readonly core = inject(CoreFinancieroService);
  private readonly initialAccountsList = inject(INITIAL_ACCOUNTS);

  // Referencia al campo de Monto para poder revertirlo cuando `setAmount` rechaza la última
  // tecla (ver el comentario en `setAmount`, más abajo).
  private readonly amountField = viewChild.required<LabeledField>('amountField');

  // El timer de la latencia simulada se guarda para poder cancelarlo al destruir el componente
  // (cambiar de pestaña no lo destruye, per `[hidden]`, pero sí importa si la app se desmonta
  // entera). Sin esto, una respuesta tardía podría escribir sobre un componente ya destruido.
  private timer: ReturnType<typeof setTimeout> | null = null;

  // Los dos CCI arrancan derivados de las cuentas INYECTADAS, no de un literal escrito acá.
  protected readonly origin = signal(this.initialAccountsList[0]?.id ?? '');
  protected readonly destination = signal(this.initialAccountsList[1]?.id ?? '');
  // El monto arranca vacío: lo tipea quien hace la demo (`docs/demo-runbook.md`, acto 2).
  protected readonly amount = signal('');
  protected readonly loading = signal(false);
  protected readonly accounts = signal<Account[]>(this.initialAccountsList);
  protected readonly itfFee = signal('');
  protected readonly totalDebited = signal('');
  protected readonly receipt = signal('');
  protected readonly error = signal('');

  // Editar cualquier campo CONSUME el error anterior: si no, el mensaje queda en pantalla
  // contradiciendo lo que el usuario acaba de corregir. Android e iOS hacen lo mismo.
  protected setOrigin(value: string): void {
    this.origin.set(value);
    this.error.set('');
  }

  protected setDestination(value: string): void {
    this.destination.set(value);
    this.error.set('');
  }

  protected setAmount(value: string): void {
    if (AMOUNT_FILTER.test(value)) {
      this.amount.set(value);
      this.error.set('');
    } else {
      // Filtro de TEXTO: se descarta la última tecla. `LabeledField` ya actualizó su propio
      // signal `value` con el string rechazado (así refleja lo tecleado mientras el usuario
      // escribe); como `this.amount` nunca cambió, la property binding `[value]="amount()"` no
      // se re-evalúa sola —el binding reactivo sólo corre cuando la señal LEÍDA cambia—, así
      // que hay que forzar el signal del HIJO de vuelta al último valor válido, a mano. Mismo
      // resultado que `input.value = this.monto()` en el CONTEXT de esta app, adaptado a
      // `model()` de Angular.
      this.amountField().value.set(this.amount());
    }
  }

  /**
   * No calcula nada: llama al core y guarda lo que devuelve, tal cual. Los errores se convierten
   * a texto de usuario ACÁ, no en el servicio: `CoreFinancieroService` propaga el error del core
   * sin traducirlo a propósito.
   */
  protected transfer(): void {
    // Una transferencia en vuelo no se pisa con otra: el botón ya queda deshabilitado mientras
    // carga, pero este método no puede depender de que la UI lo respete.
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = this.core.executeTransfer(this.accounts(), {
        origin: this.origin(),
        destination: this.destination(),
        // El string viaja al core TAL COMO SE TECLEÓ: punto decimal, sin `S/` y sin
        // separadores de miles.
        amount: this.amount(),
      });
      // Se espera la latencia simulada para que parezca una llamada de red. NO HAY RED: el
      // número lo devuelve el core.
      this.timer = setTimeout(() => {
        this.timer = null;
        this.loading.set(false);
        this.accounts.set(result.accounts);
        this.itfFee.set(result.itfFee);
        this.totalDebited.set(result.totalDebited);
        this.receipt.set(result.receipt);
      }, result.simulatedLatencyMs);
    } catch (e) {
      // Un fallo limpia el resultado anterior: dejar el comprobante viejo debajo del error hace
      // parecer que la transferencia surtió efecto parcial. Y apaga el spinner: el bug clásico
      // es olvidarlo en el catch y dejar la pantalla cargando para siempre.
      this.loading.set(false);
      this.itfFee.set('');
      this.totalDebited.set('');
      this.receipt.set('');
      this.error.set(userMessage(e));
    }
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
