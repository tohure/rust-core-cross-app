import { Component, inject, signal } from '@angular/core';
import { CoreFinancieroService } from './core/core-financiero.service';
import { ArithmeticScreen } from './features/arithmetic/arithmetic-screen';
import { TransferScreen } from './features/transfer/transfer-screen';
import { CardScreen } from './features/card/card-screen';
import { BenchmarkScreen } from './features/benchmark/benchmark-screen';
import { CoreVersionFooter } from './ui/core-version-footer/core-version-footer';

/** Una de las cuatro pestañas de navegación. Sin librería de router: son cuatro pestañas fijas,
 * sin rutas ni parámetros, y una dependencia de routing sería ceremonia — mismo criterio que
 * Android (`sealed interface Tab` en `BancoApp.kt`) y React Native (`TABS` en `BancoApp.tsx`). */
type TabKey = 'arithmetic' | 'transfer' | 'card' | 'benchmark';

interface TabDef {
  readonly key: TabKey;
  readonly label: string;
}

/**
 * El shell de las cuatro pantallas: navegación por pestañas + el pie de `coreVersion()`.
 *
 * **Los labels van COMPLETOS** —`Aritmética`, `Transferencia`, `Tarjeta`, `Benchmark`—,
 * contrastados contra el texto normativo de `docs/ui-spec.md`, no contra su wireframe ASCII
 * (que abrevia `Transf.`/`Bm` sólo por ancho de columna). Igual que Android (`BancoApp.kt`) y
 * React Native (`BancoApp.tsx`). Cambiar un label obliga a cambiarlo en las cuatro apps y en
 * ese archivo, en el mismo cambio.
 *
 * **Las cuatro pantallas quedan SIEMPRE montadas.** `@if`/`*ngIf` desmontan el componente de la
 * rama que no se cumple y con él se pierden sus signals — cambiar de pestaña y volver borraría
 * lo que el usuario tecleó. Se usa `[hidden]` en las cuatro secciones de `app.html`: oculta con
 * `display: none` sin desmontar. Es el defecto que la Fase 4 (React Native) reintrodujo y que
 * Android ya había resuelto (ahí, elevando los cuatro ViewModels fuera del `when` de
 * composición). Ver el Ruling correspondiente y `app.spec.ts`, que lo prueba explícitamente.
 *
 * Las Tareas 10-13 reemplazan el contenido de marcador de cada `<section>` por la pantalla real
 * (`ArithmeticScreen`, etc.); lo que no cambia es que sigan siendo hijas siempre-montadas de
 * este shell, ocultas con `[hidden]`. Las cuatro pantallas ya están reemplazadas: Aritmética,
 * Transferencia y Tarjeta en las Tareas 10-12, Benchmark en la Tarea 13.
 */
@Component({
  selector: 'app-root',
  imports: [ArithmeticScreen, TransferScreen, CardScreen, BenchmarkScreen, CoreVersionFooter],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly core = inject(CoreFinancieroService);

  protected readonly tabs: readonly TabDef[] = [
    { key: 'arithmetic', label: 'Aritmética' },
    { key: 'transfer', label: 'Transferencia' },
    { key: 'card', label: 'Tarjeta' },
    { key: 'benchmark', label: 'Benchmark' },
  ];

  protected readonly activeTab = signal<TabKey>('arithmetic');

  // El pie recibe este string como INPUT (`[version]="version"` en app.html); `App` es quien
  // llama a `coreVersion()`, una sola vez, no `CoreVersionFooter`. Se lee como campo simple y
  // no como signal porque el string no cambia durante la vida de la app: coreVersion() es
  // constante para un mismo build.
  protected readonly version: string = this.core.coreVersion();

  selectTab(key: TabKey): void {
    this.activeTab.set(key);
  }
}
