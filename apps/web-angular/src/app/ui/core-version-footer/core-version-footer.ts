import { Component, input } from '@angular/core';

/**
 * El pie de `coreVersion()`, visible en las cuatro pantallas (`CoreVersionFooter()` en
 * `docs/ui-spec.md`). Muestra el string tal cual lo devuelve el core, **sin reformatear**:
 * cuatro pantallas con el mismo string es la prueba en pantalla de que las cuatro apps corren
 * el mismo build.
 *
 * **Recibe el string como input; no lo va a buscar.** Importar `CoreFinancieroService` acá
 * atendría este componente —que es puramente de presentación— al binding WASM, y volvería
 * imposible testearlo sin levantar el núcleo real. Es exactamente el defecto que la Fase 4
 * (React Native) tuvo que corregir; Android e iOS ya lo pasan igual, como parámetro. Quien
 * arma el shell (`App`) lo lee una sola vez de `CoreFinancieroService.coreVersion()` y lo pasa
 * para abajo.
 */
@Component({
  selector: 'app-core-version-footer',
  template: ` <p class="core-version-footer" data-testid="core-version">{{ version() }}</p> `,
  styles: `
    :host {
      display: block;
    }

    .core-version-footer {
      margin: 0;
      padding: 0.5rem 0;
      text-align: center;
      font-size: 0.75rem;
      color: var(--color-muted);
    }
  `,
})
export class CoreVersionFooter {
  readonly version = input.required<string>();
}
