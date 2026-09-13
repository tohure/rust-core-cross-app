import { Component, input } from '@angular/core';

/**
 * Cabecera de las cuatro pantallas: título + subtítulo (`ScreenHeader(title, subtitle)` en
 * `docs/ui-spec.md`). Misma descomposición que las otras tres apps —Android
 * (`ScreenHeader.kt`), iOS y React Native (`ui/components/index.tsx`)—: es lo que hace que las
 * pantallas sean comparables en la demo.
 *
 * Convención de firma tomada de Compose y aplicable a las cuatro plataformas: el componente
 * aporta tipografía y espaciado internos; el padding posicional lo pone quien lo usa.
 */
@Component({
  selector: 'app-screen-header',
  template: `
    <h1 class="screen-header__title">{{ title() }}</h1>
    <p class="screen-header__subtitle">{{ subtitle() }}</p>
  `,
  styles: `
    :host {
      display: block;
    }

    .screen-header__title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .screen-header__subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: var(--color-muted);
    }
  `,
})
export class ScreenHeader {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
}
