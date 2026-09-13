import { Component, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { CoreFinancieroService } from '../../core/core-financiero.service';
import { userMessage } from '../../core/user-message';
import { LabeledField } from '../../ui/labeled-field/labeled-field';
import { PrimaryButton } from '../../ui/primary-button/primary-button';
import { ResultRow } from '../../ui/result-row/result-row';
import { ScreenHeader } from '../../ui/screen-header/screen-header';
import { SectionDivider } from '../../ui/section-divider/section-divider';
import { nativeFloat } from './baseline';

// Hasta 6 dígitos, igual que Android (`BenchmarkViewModel.kt`), iOS (`BenchmarkViewModel.swift`)
// y React Native (`useBenchmark.ts`). Filtro de TEXTO: sin el tope, teclear 10000000 dispara
// 2 × 10^7 llamadas al core sin forma de cancelarlas, y las cuatro apps dejan de comportarse
// igual en la pantalla que existe justamente para compararlas lado a lado.
const ITERATIONS_FILTER = /^\d{0,6}$/;

const SIN_MEDIR = '—';

/**
 * `sorted` nunca está vacío cuando se llama desde `measure`: `run()` corta antes si `n <= 0`.
 * El `?? 0` es sólo para el tipado (acceso por índice como posiblemente `undefined`).
 */
function percentile(sorted: readonly number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

/**
 * Microsegundos con dos decimales. **Esto es tiempo, no dinero:** acá `number` es correcto y la
 * regla del invariante de `CLAUDE.md` no aplica — habla de montos, que van como string de punta
 * a punta.
 */
function microseconds(ms: number): string {
  return `${(ms * 1000).toFixed(2)} µs`;
}

/**
 * Pantalla de Benchmark: mide el costo de cruzar al core y lo contrasta con la baseline de punto
 * flotante nativo (`docs/ui-spec.md`, sección 4).
 *
 * **Es la única pantalla donde las llamadas al core podrían salir del hilo principal** — en el
 * resto son síncronas y de microsegundos, y envolverlas sería ruido. Acá NO salen: ver el
 * comentario de `run()`, más abajo, para lo que se hizo de verdad y por qué.
 *
 * No calcula nada de negocio: mide cuánto tarda `add` del core y `nativeFloat` (la única
 * excepción documentada a la regla de cero punto flotante, en `../benchmark/baseline.ts`,
 * reusada tal cual de la pantalla de Aritmética) y guarda los percentiles. `nativeFloat` da mal
 * el resultado a propósito — eso es lo que la pantalla exhibe, no un cálculo de esta pantalla.
 */
@Component({
  selector: 'app-benchmark-screen',
  imports: [LabeledField, PrimaryButton, ResultRow, ScreenHeader, SectionDivider],
  template: `
    <app-screen-header title="Benchmark" subtitle="Core vs. implementación nativa" />

    <app-labeled-field
      #iterationsField
      label="Iteraciones"
      data-testid="iterations"
      [value]="iterations()"
      (valueChange)="setIterations($event)"
      inputMode="numeric"
    />

    <app-primary-button label="Ejecutar" data-testid="run" [loading]="running()" (pressed)="run()" />

    @if (error()) {
      <p class="benchmark-screen__error" data-testid="benchmark-error">{{ error() }}</p>
    }

    <!-- Las cuatro filas se pintan SIEMPRE, con "—" hasta que haya medición: no van detrás de un
         @if. Los nombres de las dos implementaciones son LOS MISMOS que usa Aritmética
         ("Core (Rust · Decimal)" / "Punto flotante nativo"), y eso no es casual: si se renombra
         uno, se renombra en las dos pantallas (docs/ui-spec.md). -->
    <app-section-divider title="Core (Rust · Decimal)" />
    <app-result-row
      label="Tiempo típico (p50)"
      data-testid="core-p50"
      [value]="coreP50()"
      [monospace]="true"
    />
    <app-result-row
      label="Peor caso (p95)"
      data-testid="core-p95"
      [value]="coreP95()"
      [monospace]="true"
    />

    <app-section-divider title="Punto flotante nativo" />
    <app-result-row
      label="Tiempo típico (p50)"
      data-testid="native-p50"
      [value]="nativeP50()"
      [monospace]="true"
    />
    <app-result-row
      label="Peor caso (p95)"
      data-testid="native-p95"
      [value]="nativeP95()"
      [monospace]="true"
    />

    <!-- Los dos párrafos son OBLIGATORIOS y van textuales (docs/ui-spec.md). Sin el primero, un
         número más grande parece un defecto en vez del argumento que es. -->
    <p class="benchmark-screen__note">
      El core es más lento porque cada llamada cruza la frontera al código Rust.
    </p>
    <p class="benchmark-screen__warning">
      ⚠ El punto flotante nativo es más rápido y da mal el resultado: existe para exhibirlo.
    </p>
  `,
  styles: `
    :host {
      display: contents;
    }

    .benchmark-screen__error {
      margin: 0;
      color: var(--color-danger);
      font-size: 0.875rem;
    }

    .benchmark-screen__note {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.8125rem;
    }

    .benchmark-screen__warning {
      margin: 0;
      color: var(--color-danger);
      font-size: 0.8125rem;
    }
  `,
})
export class BenchmarkScreen implements OnDestroy {
  private readonly core = inject(CoreFinancieroService);

  // Referencia al campo de Iteraciones para poder revertirlo cuando `setIterations` rechaza la
  // última tecla. Mismo patrón que `TransferScreen.setAmount` y `CardScreen.setNumber`.
  private readonly iterationsField = viewChild.required<LabeledField>('iterationsField');

  // El timer del yield (ver `run()`) se guarda para poder cancelarlo si el componente se destruye
  // a mitad de una corrida. Mismo patrón que `TransferScreen`.
  private timer: ReturnType<typeof setTimeout> | null = null;

  // 1000 es el valor del wireframe (docs/ui-spec.md): arranca con algo que ya produce números
  // legibles sin que quien hace la demo tenga que teclear nada primero.
  protected readonly iterations = signal('1000');
  protected readonly running = signal(false);
  protected readonly coreP50 = signal(SIN_MEDIR);
  protected readonly coreP95 = signal(SIN_MEDIR);
  protected readonly nativeP50 = signal(SIN_MEDIR);
  protected readonly nativeP95 = signal(SIN_MEDIR);
  protected readonly error = signal('');

  protected setIterations(value: string): void {
    if (ITERATIONS_FILTER.test(value)) {
      this.iterations.set(value);
    } else {
      // Filtro de TEXTO: se descarta la última tecla, revirtiendo el campo al último valor
      // válido — igual que el monto de Transferencia y el número/hex de Tarjeta.
      this.iterationsField().value.set(this.iterations());
    }
  }

  /**
   * No calcula nada de negocio: mide `add` del core y `nativeFloat` sobre el mismo par de
   * operandos ("0.1", "0.2") y guarda los percentiles, tal cual. Los errores se convierten a
   * texto de usuario ACÁ, no en el servicio.
   *
   * **Cero iteraciones no arranca ni deja el spinner colgado (trampa de Android, commit
   * `ad45cac`):** ahí `isRunning` se prendía ANTES de calcular el índice del percentil, y con
   * `n = 0` ese cálculo lanzaba después de prenderlo — la corrutina moría y el spinner quedaba
   * encendido para siempre. Acá la validación de `n` corre PRIMERO, y `running` sólo se prende
   * si de verdad va a haber una medición que lo apague.
   *
   * **Sobre el hilo principal:** JavaScript en el navegador es de un solo hilo por pestaña —a
   * diferencia de Android (`withContext(Dispatchers.Default)`) o iOS (`Task.detached`), acá no
   * hay un adaptador de concurrencia liviano que mueva este bucle a otro hilo sin antes
   * pasarle el módulo WASM a un Web Worker, que es infraestructura nueva fuera del alcance de
   * esta tarea. El `setTimeout(0)` de abajo NO saca el bucle del hilo principal: sólo cede un
   * tick para que Angular pinte el spinner ANTES de que el bucle, síncrono, lo bloquee. Con las
   * miles de iteraciones de la demo (1000) el bloqueo dura milisegundos y no se nota; documentado
   * así, sin fingir paridad con Android/iOS, en el reporte de esta tarea.
   */
  protected run(): void {
    if (this.running()) return;
    const n = Number.parseInt(this.iterations(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      this.error.set('Ingresa un número de iteraciones mayor que cero.');
      return;
    }
    this.running.set(true);
    this.error.set('');
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        const coreStats = this.measure(n, () => this.core.add('0.1', '0.2'));
        const nativeStats = this.measure(n, () => nativeFloat('0.1', '0.2', 'add'));
        this.coreP50.set(microseconds(coreStats.p50));
        this.coreP95.set(microseconds(coreStats.p95));
        this.nativeP50.set(microseconds(nativeStats.p50));
        this.nativeP95.set(microseconds(nativeStats.p95));
        this.running.set(false);
      } catch (e) {
        // Un fallo borra las medidas de la corrida anterior: dejarlas debajo del error las hace
        // parecer de ésta. Y apaga el spinner: el bug clásico es olvidarlo en el catch.
        this.coreP50.set(SIN_MEDIR);
        this.coreP95.set(SIN_MEDIR);
        this.nativeP50.set(SIN_MEDIR);
        this.nativeP95.set(SIN_MEDIR);
        this.running.set(false);
        this.error.set(userMessage(e));
      }
    }, 0);
  }

  /** Llama a `f` una vez POR ITERACIÓN — nunca una sola vez reutilizada — y devuelve p50/p95. */
  private measure(n: number, f: () => void): { p50: number; p95: number } {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      f();
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
