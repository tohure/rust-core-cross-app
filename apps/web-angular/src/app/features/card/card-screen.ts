import { Component, inject, signal, viewChild } from '@angular/core';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { userMessage } from '../../core/user-message';
import { demoKey, demoNonce } from '../../contract/sources';
import { LabeledField } from '../../ui/labeled-field/labeled-field';
import { PrimaryButton } from '../../ui/primary-button/primary-button';
import { ResultRow } from '../../ui/result-row/result-row';
import { ScreenHeader } from '../../ui/screen-header/screen-header';
import { SectionDivider } from '../../ui/section-divider/section-divider';

// Filtros de TEXTO, no validaciones. Quien decide si el número pasa Luhn o si el hex es
// descifrable es el core: `tj-006` (número inválido) lo prueba en el test de contrato. El hex
// se acepta sólo en minúscula, que es lo que fija `docs/ui-spec.md` y lo que emite el propio
// core, así que pegar el hex de otra app siempre entra.
const DIGITS_FILTER = /^\d*$/;
const HEX_FILTER = /^[0-9a-f]*$/;

/**
 * Pantalla de Tarjeta: valida por Luhn, cifra, y **descifra** (`docs/ui-spec.md`, sección 3).
 *
 * Dos bloques independientes, cada uno con su propio error: un fallo al descifrar un hex pegado
 * no puede borrar el resultado de cifrar de arriba, porque en la demo los dos están en pantalla
 * a la vez.
 *
 * **No hay ni un dígito de Luhn ni un byte de cifrado acá.** El componente llama al core y
 * guarda lo que devuelve, tal cual. La clave y el nonce de la demo salen del contrato
 * (`../../contract/sources.ts`), fijos a propósito para que las cuatro apps produzcan el mismo
 * hex.
 */
@Component({
  selector: 'app-card-screen',
  imports: [LabeledField, PrimaryButton, ResultRow, ScreenHeader, SectionDivider],
  template: `
    <app-screen-header title="Tarjeta" subtitle="Luhn y cifrado ChaCha20-Poly1305" />

    <app-labeled-field
      #numberField
      label="Número"
      data-testid="number"
      [value]="number()"
      (valueChange)="setNumber($event)"
      inputMode="numeric"
    />
    <!-- Texto de ayuda OBLIGATORIO, con estas dos líneas exactas (docs/ui-spec.md): sin él la
         pantalla no dice qué espera, y quien hace la demo tiene que adivinarlo. -->
    <p class="card-screen__hint">
      Puedes probar 4111111111111111 (Visa) o 5555555555554444 (Mastercard).
    </p>
    <p class="card-screen__hint">Un número inválido lo rechaza el core, no esta pantalla.</p>

    <app-primary-button
      label="Validar y cifrar"
      data-testid="validate-and-encrypt"
      (pressed)="validateAndEncrypt()"
    />

    @if (error()) {
      <p class="card-screen__error" data-testid="card-error">{{ error() }}</p>
    }

    @if (cipherHex()) {
      <app-section-divider title="Resultado" />
      <app-result-row label="Marca" data-testid="brand" [value]="brand()" />
      <app-result-row
        label="Enmascarado"
        data-testid="masked"
        [value]="masked()"
        [monospace]="true"
      />

      <p class="card-screen__hex-label">Cifrado (hex)</p>
      <!-- En caja y con corte de línea: en la demo los 64 caracteres se comparan a simple vista
           contra las otras tres pantallas. -->
      <div class="card-screen__hex-box">
        <code class="card-screen__hex-value" data-testid="cipher-hex">{{ cipherHex() }}</code>
      </div>

      <!-- La vuelta completa. Sin esta fila el hex de arriba es indistinguible de un hash: esto
           es lo que muestra que el core CIFRA y no resume. -->
      <app-result-row
        label="Descifrado"
        data-testid="decrypted"
        [value]="decrypted()"
        [monospace]="true"
      />
      <p class="card-screen__note">
        El mismo número salió de vuelta: es cifrado reversible, no un hash.
      </p>
    }

    <app-section-divider title="Descifrar un hex de otra plataforma" />
    <p class="card-screen__hint">
      Pega aquí el hex que produjo la app de Android, iOS o React Native. Sale el mismo número,
      porque las cuatro usan el mismo core.
    </p>
    <app-labeled-field
      #pastedHexField
      label="Hex cifrado"
      data-testid="pasted-hex"
      [value]="pastedHex()"
      (valueChange)="setPastedHex($event)"
    />
    <app-primary-button label="Descifrar" data-testid="decrypt" (pressed)="decryptPasted()" />
    @if (pasteError()) {
      <p class="card-screen__error" data-testid="paste-error">{{ pasteError() }}</p>
    }
    @if (recovered()) {
      <app-result-row
        label="Número recuperado"
        data-testid="recovered"
        [value]="recovered()"
        [monospace]="true"
      />
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .card-screen__hint {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.8125rem;
    }

    .card-screen__error {
      margin: 0;
      color: var(--color-danger);
      font-size: 0.875rem;
    }

    .card-screen__note {
      margin: 0;
      color: var(--color-ok);
      font-size: 0.8125rem;
    }

    .card-screen__hex-label {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.875rem;
    }

    .card-screen__hex-box {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .card-screen__hex-value {
      display: block;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-text);
      word-break: break-all;
      white-space: pre-wrap;
    }
  `,
})
export class CardScreen {
  private readonly core = inject(CoreFinancieroService);
  // Salen del contrato, igual que las cuentas de Transferencia: son datos compartidos por las
  // cuatro apps. `contract/sources.ts` es el único módulo que conoce la ruta a `contracts/`.
  private readonly key = demoKey();
  private readonly nonce = demoNonce();

  // Referencias a los dos campos filtrados, para poder revertirlos cuando `setNumber` /
  // `setPastedHex` rechazan la última tecla (ver esos métodos, más abajo, y el mismo patrón en
  // `TransferScreen.setAmount`).
  private readonly numberField = viewChild.required<LabeledField>('numberField');
  private readonly pastedHexField = viewChild.required<LabeledField>('pastedHexField');

  // Bloque de arriba: validar y cifrar.
  protected readonly number = signal('');
  protected readonly brand = signal('');
  protected readonly masked = signal('');
  protected readonly cipherHex = signal('');
  // La vuelta completa. NO es decoración: sin esto el hex es indistinguible de un hash.
  protected readonly decrypted = signal('');
  protected readonly error = signal('');

  // Bloque de abajo: descifrar un hex de otra plataforma. Independiente del de arriba.
  protected readonly pastedHex = signal('');
  protected readonly recovered = signal('');
  protected readonly pasteError = signal('');

  protected setNumber(value: string): void {
    if (DIGITS_FILTER.test(value)) {
      this.number.set(value);
      this.error.set('');
    } else {
      // Filtro de TEXTO: se descarta la última tecla, revirtiendo el campo al último valor
      // válido. Mismo patrón que `TransferScreen.setAmount`.
      this.numberField().value.set(this.number());
    }
  }

  protected setPastedHex(value: string): void {
    if (HEX_FILTER.test(value)) {
      this.pastedHex.set(value);
      this.pasteError.set('');
    } else {
      this.pastedHexField().value.set(this.pastedHex());
    }
  }

  /** Valida por Luhn, cifra, y vuelve a descifrar. Las tres cosas en un gesto. */
  protected validateAndEncrypt(): void {
    try {
      const card = this.core.validateCard(this.number());
      const cipherHex = this.core.encrypt(this.number(), this.key, this.nonce);
      // La vuelta completa: sin esto el hex no se distingue de un hash.
      const decrypted = this.core.decrypt(cipherHex, this.key, this.nonce);
      this.brand.set(card.brand);
      this.masked.set(card.masked);
      this.cipherHex.set(cipherHex);
      this.decrypted.set(decrypted);
      this.error.set('');
    } catch (e) {
      // Limpia sólo SU bloque: el de abajo queda como estaba.
      this.brand.set('');
      this.masked.set('');
      this.cipherHex.set('');
      this.decrypted.set('');
      this.error.set(userMessage(e));
    }
  }

  /**
   * Descifra un hex producido por OTRA plataforma. Es la demostración en vivo de la tesis: el
   * hex que cifró Android, iOS o React Native se pega acá y sale el mismo número, porque la
   * clave, el nonce y el algoritmo vienen del mismo core de Rust.
   */
  protected decryptPasted(): void {
    try {
      const recovered = this.core.decrypt(this.pastedHex(), this.key, this.nonce);
      this.recovered.set(recovered);
      this.pasteError.set('');
    } catch (e) {
      // Limpia sólo SU bloque: el de arriba (cifrar) queda como estaba.
      this.recovered.set('');
      this.pasteError.set(userMessage(e));
    }
  }
}
