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

// ---------------------------------------------------------------------------------------------
// Fix round 1 (review de la Tarea 13, findings I1 e I2): medir UNA llamada a la vez contra
// `performance.now()` no sirve en un navegador. `performance.now()` está cuantizado a ~100 µs
// (mitigación anti-Spectre, sin `crossOriginIsolated`) — se verificó en el navegador real de la
// Tarea 13 que la mayoría de las lecturas individuales daban "0.00 µs". Y subir las iteraciones
// tres órdenes de magnitud (1000 → 999999) hizo que el p95 CAYERA a cero en vez de estabilizarse:
// eso prueba que no se estaba midiendo el costo del cruce, sino cuántas muestras caían bajo el
// piso de cuantización. El segundo riesgo, independiente del reloj, lo encontró el revisor: la
// versión anterior llamaba a `measure(n, () => this.core.add('0.1', '0.2'))` con operandos
// CONSTANTES y descartaba el resultado — entrada constante + función pura + resultado sin usar es
// exactamente la forma que un JIT está habilitado a sacar del bucle (loop-invariant code motion)
// o a eliminar (dead-code elimination). El fix tiene tres piezas, todas necesarias:
//
//   1. Cronometrar LOTES, no llamadas sueltas: `K` llamadas dentro de una única región
//      cronometrada (dos lecturas de reloj, no `K`), dividir por `K`. Cada lote dura al menos
//      `MIN_BATCH_MS` (calibrado subiendo `K` si hace falta) y se juntan `SAMPLE_COUNT` lotes
//      para que el percentil signifique algo.
//   2. Consumir el resultado de cada llamada dentro del bucle (`consume`, más abajo), acumulado
//      en un campo de la instancia (`checksum`) que sigue vivo después de correr — no en una
//      variable local descartable.
//   3. Variar la entrada entre llamadas (`varyingOperand`) para que la función no sea plegable a
//      una constante y no pueda izarse fuera del bucle por invariancia.
//
// **Qué significa `Iteraciones` ahora:** ya NO es "cuántas veces se llama al core en total". Es
// el tamaño MÍNIMO de un lote — cuántas llamadas se agrupan dentro de UNA región cronometrada.
// Si ese lote no llega a durar `MIN_BATCH_MS`, se duplica hasta lograrlo (tope: `MAX_BATCH_SIZE`
// llamadas o `MAX_CALIBRATION_ROUNDS` duplicaciones, para no colgar la pestaña si `f` es
// demasiado rápida como para llegar). El total de llamadas reales es
// `tamañoDeLoteCalibrado × (WARMUP_BATCHES + SAMPLE_COUNT)`, casi siempre mayor al número
// tecleado. Y el SIGNIFICADO de p50/p95 cambia con esto: ya no es la latencia de una llamada
// suelta, es el costo PROMEDIO por operación dentro de un lote.
const MIN_BATCH_MS = 1;
const SAMPLE_COUNT = 30;
const WARMUP_BATCHES = 5;
const MAX_BATCH_SIZE = 2_000_000;
const MAX_CALIBRATION_ROUNDS = 24;

/**
 * `sorted` nunca está vacío cuando se llama desde `measure`: siempre hay `SAMPLE_COUNT` (> 0)
 * muestras. El `?? 0` es sólo para el tipado (acceso por índice como posiblemente `undefined`).
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
 * Combina los code points de `value` en un acumulador de 32 bits (fix I2 del review). Existe
 * SÓLO para que el motor no pueda descartar la llamada que produjo `value` por "resultado sin
 * usar" (dead-code elimination). **No interpreta el string como número en ningún momento** —
 * nunca hay un `parseFloat`/`Number()` acá — así que esto no es aritmética sobre un monto y no
 * roza la regla del invariante de `CLAUDE.md`: es un checksum interno de benchmarking que nunca
 * se muestra, nunca se compara, y no representa ninguna cantidad de dinero.
 */
function consume(sink: number, value: string): number {
  let next = sink;
  for (let i = 0; i < value.length; i++) {
    next = (next + value.charCodeAt(i)) | 0;
  }
  return next;
}

/**
 * Un operando distinto por invocación ("0.00".."0.99"), construido con aritmética ENTERA sobre
 * el índice `i` — nunca sobre un monto — para que `f` no reciba siempre el mismo par de strings
 * (fix I2 del review). Sin esto, una función pura llamada siempre con los mismos argumentos es
 * candidata a que el JIT pruebe que el resultado no cambia entre vueltas del bucle y saque la
 * llamada entera afuera (loop-invariant code motion): eso mediría el costo de un bucle vacío, no
 * el de la llamada real, y es al menos tan plausible como el calentamiento del JIT para explicar
 * por qué el p95 colapsaba a cero al subir las iteraciones.
 */
function varyingOperand(i: number): string {
  const cents = i % 100;
  return cents < 10 ? `0.0${cents}` : `0.${cents}`;
}

/**
 * Corre `f` exactamente `k` veces dentro de UNA región cronometrada (dos lecturas de reloj, no
 * `k`) y devuelve cuánto tardó en total, junto con el acumulador de `consume` ya actualizado.
 */
function timedBatch(
  k: number,
  f: (i: number) => string,
  sink: number,
): { elapsedMs: number; sink: number } {
  let acc = sink;
  const t0 = performance.now();
  for (let i = 0; i < k; i++) {
    acc = consume(acc, f(i));
  }
  return { elapsedMs: performance.now() - t0, sink: acc };
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

  // Acumulador de `consume` (fix I2 del review): nunca se lee para nada útil, pero por eso mismo
  // importa que viva en un CAMPO DE LA INSTANCIA y no en una variable local de `measure` — un
  // campo de un objeto que sigue vivo después de correr no es candidato a que el motor pruebe
  // que es descartable. Ver el comentario de `consume`, arriba.
  private checksum = 0;

  // Ahora es el tamaño MÍNIMO de un lote cronometrado, no el total de llamadas — ver el bloque
  // de comentarios sobre el fix del review, más arriba. 1000 sigue siendo un default razonable:
  // ya alcanza para que la mayoría de los cruces al core no necesiten duplicarse en la
  // calibración, y se verificó en el navegador que da el mismo orden de magnitud que 100 y que
  // el tope de 999999 (~1.4-1.8 µs de p50, estable). **Ese tope, medido, cuesta caro**: al ser
  // ahora un tamaño de LOTE (no un total), 999999 dispara del orden de 36× esa cifra en
  // llamadas reales al core (calibración + `WARMUP_BATCHES` + `SAMPLE_COUNT`), y en el
  // navegador tardó ~66 s de hilo principal bloqueado. El campo conserva el tope de 6 dígitos
  // que pide el brief; usar un valor cercano al máximo ya no es gratis como antes del fix, y
  // queda anotado acá y en el reporte de la tarea en vez de resolverse en silencio.
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
   * No calcula nada de negocio: mide `add` del core y `nativeFloat` sobre operandos que varían
   * por invocación (`varyingOperand`) y guarda los percentiles, tal cual. Los errores se
   * convierten a texto de usuario ACÁ, no en el servicio.
   *
   * **Cero iteraciones no arranca ni deja el spinner colgado (trampa de Android, commit
   * `ad45cac`):** la validación de `n` corre PRIMERO, y `running` sólo se prende si de verdad va
   * a haber una medición que lo apague.
   *
   * **Sobre el hilo principal:** JavaScript en el navegador es de un solo hilo por pestaña — a
   * diferencia de Android (`withContext(Dispatchers.Default)`) o iOS (`Task.detached`), acá no
   * hay un adaptador de concurrencia liviano que mueva este bucle a otro hilo sin antes pasarle
   * el módulo WASM a un Web Worker, que es infraestructura nueva fuera del alcance de esta
   * tarea. El `setTimeout(0)` de abajo NO saca el bucle del hilo principal: sólo cede un tick
   * para que Angular pinte el spinner ANTES de que el bucle, síncrono, lo bloquee.
   */
  protected run(): void {
    if (this.running()) return;
    const iterationsPerBatch = Number.parseInt(this.iterations(), 10);
    if (!Number.isFinite(iterationsPerBatch) || iterationsPerBatch <= 0) {
      this.error.set('Ingresa un número de iteraciones mayor que cero.');
      return;
    }
    this.running.set(true);
    this.error.set('');
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        const coreStats = this.measure(iterationsPerBatch, (i) =>
          this.core.add(varyingOperand(i), '0.20'),
        );
        const nativeStats = this.measure(iterationsPerBatch, (i) =>
          nativeFloat(varyingOperand(i), '0.20', 'add'),
        );
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

  /**
   * Calibra el tamaño de lote, corre `WARMUP_BATCHES` lotes de descarte (para que el JIT ya esté
   * caliente cuando arranca la medición real) y junta `SAMPLE_COUNT` lotes cronometrados de
   * verdad. Cada muestra guardada es el costo PROMEDIO por operación DENTRO de ese lote
   * (`elapsedMs / k`), no la latencia de una llamada suelta — ese es el cambio de significado
   * que exige medir por lotes en vez de por llamada individual.
   */
  private measure(iterationsPerBatch: number, f: (i: number) => string): { p50: number; p95: number } {
    const k = this.calibrateBatchSize(iterationsPerBatch, f);
    for (let w = 0; w < WARMUP_BATCHES; w++) {
      const { sink } = timedBatch(k, f, this.checksum);
      this.checksum = sink;
    }
    const samples: number[] = [];
    for (let s = 0; s < SAMPLE_COUNT; s++) {
      const { elapsedMs, sink } = timedBatch(k, f, this.checksum);
      this.checksum = sink;
      samples.push(elapsedMs / k);
    }
    samples.sort((a, b) => a - b);
    return { p50: percentile(samples, 50), p95: percentile(samples, 95) };
  }

  /**
   * Duplica el tamaño de lote hasta que un lote dure al menos `MIN_BATCH_MS` — un orden de
   * magnitud sobre el piso de cuantización de `performance.now()` medido en la Tarea 13
   * (~100 µs). Tope duro en `MAX_BATCH_SIZE`/`MAX_CALIBRATION_ROUNDS`: si `f` es tan rápida que
   * ni duplicando muchas veces se llega al piso, es mejor conformarse con un lote corto —y
   * dejar que el número salga bajo, honestamente— que colgar la pestaña buscando un piso que la
   * operación no alcanza.
   */
  private calibrateBatchSize(initialK: number, f: (i: number) => string): number {
    let k = Math.min(initialK, MAX_BATCH_SIZE);
    for (let round = 0; round < MAX_CALIBRATION_ROUNDS && k < MAX_BATCH_SIZE; round++) {
      const { elapsedMs, sink } = timedBatch(k, f, this.checksum);
      this.checksum = sink;
      if (elapsedMs >= MIN_BATCH_MS) return k;
      k = Math.min(k * 2, MAX_BATCH_SIZE);
    }
    return k;
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }
}
