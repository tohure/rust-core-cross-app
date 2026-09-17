import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { core } from '../adapter/core';
import { nativeFloat } from './NativeBaseline';

/**
 * SONDA DE MEDICIÓN — apagada, y no es un test.
 *
 * Mide el costo del cruce JSI. Existe porque **esta app es la única de las cuatro sin forma de
 * medirse sola**: Android nativo se maneja con `uiautomator dump` + `input tap`, iOS nativo mide
 * con `FfiCostProbe.swift` dentro del bundle de tests que corre sobre el aparato, y acá no hay
 * ninguno de los dos —Jest mockea los nativos, así que ninguna suite cruza JSI, y en un iPhone
 * físico no hay driver de UI—. Sin esto, el número de React Native sobre iOS había que leerlo
 * de la pantalla a ojo.
 *
 * **Se prende cambiando `PROBE_ON` a `true`, se compila, se lee el resultado, y se vuelve a
 * `false`.** En un iPhone el resultado se lee de una **captura de pantalla**
 * (`xcrun devicectl device capture screenshot`), porque la sonda lo pinta además de loguearlo;
 * en Android alcanza con `adb logcat`. El procedimiento completo, con los comandos, está en BUILD.md. Es más
 * tosco que el `-e probe true` de Android o el `PROBE=1` de iOS, y la razón es concreta: el
 * preset de Babel de React Native **no inlinea `process.env`**, así que no hay forma de que una
 * variable de entorno del build llegue al bundle sin agregar un plugin.
 *
 * Mide con `performance.now()` y percentiles sobre el array ordenado, **igual que
 * `useBenchmark`**: si midiera distinto, su número no sería comparable con el de la pantalla.
 */
export const PROBE_ON = false;

const WARMUP = 2_000;
const RUNS = 20_000;

/**
 * **`console.log` no sirve acá, y ese es el detalle que cuesta una tarde.** En un build de
 * release React Native no instala el puente de la consola —eso vive en `setUpDeveloperTools`,
 * que sólo corre con `__DEV__`—, así que un `console.log` de la sonda no aparece en ningún lado:
 * ni en `devicectl --console`, ni en el log unificado del sistema.
 *
 * `nativeLoggingHook` es la función que ese puente usa por debajo, la expone Hermes, y está
 * disponible en release. Termina en `NSLog`, que sí sale por la consola del proceso — se
 * comprobó viendo que las líneas propias de React Native (`_setUpFeatureFlags…`) llegaban y las
 * de la sonda no.
 *
 * **Y el nivel tiene que ser `error`, no `info`.** En release React Native deja el umbral de log
 * en error, así que un `info` se descarta **igual de silenciosamente** que el `console.log`. La
 * sonda no está reportando un fallo; usa ese nivel porque es el único que sobrevive.
 */
function emit(message: string): void {
  const hook = (globalThis as unknown as Record<string, unknown>)
    .nativeLoggingHook;
  if (typeof hook === 'function') {
    (hook as (m: string, level: number) => void)(message, 3);
  } else {
    console.log(message);
  }
}

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

const lines: string[] = [];

function say(message: string): void {
  lines.push(message);
  emit(`[FfiCostProbe] ${message}`);
}

function report(label: string, body: () => void): void {
  for (let i = 0; i < WARMUP; i++) body();
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    body();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const us = (p: number) => `${(percentile(samples, p) * 1000).toFixed(2)} µs`;
  say(`${label}  p50=${us(50)}  p95=${us(95)}`);
}

/**
 * Por lotes: divide el tiempo de K llamadas entre K. Es el recurso contra un reloj grueso —el
 * mismo que usan la app Angular y la sonda de iOS—, y acá hace falta porque **el
 * `performance.now()` de Hermes no promete resolución de nanosegundos**. Si la media por lote y
 * el p50 por llamada coinciden, el reloj alcanzaba; si no, el bueno es el de lotes.
 */
function batched(label: string, batch: number, body: () => void): void {
  for (let i = 0; i < WARMUP; i++) body();
  const perCall: number[] = [];
  for (let i = 0; i < RUNS / batch; i++) {
    const t0 = performance.now();
    for (let k = 0; k < batch; k++) body();
    perCall.push((performance.now() - t0) / batch);
  }
  perCall.sort((a, b) => a - b);
  const media = perCall[Math.floor(perCall.length / 2)] ?? 0;
  say(`${label}  media=${(media * 1000).toFixed(3)} µs  (lotes de ${batch})`);
}

function runFfiCostProbe(): void {
  lines.length = 0;
  // Una llamada de prueba FUERA del bucle. Sin esto, un puente roto se mediría como el tiempo
  // de lanzar la excepción y saldría un número rápido y plausible en vez de un error.
  const sanity = core.add('0.1', '0.2');
  say(
    `artefacto ${core.coreVersion()} · add=${sanity} · warmup=${WARMUP} runs=${RUNS}`
  );

  report('(reloj, cuerpo vacío)', () => {});
  report('coreVersion()', () => {
    core.coreVersion();
  });
  report('validateCard("41111")', () => {
    try {
      core.validateCard('41111');
    } catch {
      /* el camino de error es lo que se está midiendo */
    }
  });
  report('add("0.1","0.2")', () => {
    core.add('0.1', '0.2');
  });
  report('NativeBaseline.add', () => {
    nativeFloat('0.1', '0.2', 'add');
  });

  batched('coreVersion() x1000', 1000, () => {
    core.coreVersion();
  });
  batched('add x1000', 1000, () => {
    core.add('0.1', '0.2');
  });
}

/**
 * Pinta el resultado, porque en un iPhone físico **no hay forma de leerlo de otro modo**: el log
 * no sale del aparato con las herramientas de Xcode —`NSLog` va al log unificado, que `devicectl`
 * no expone, y `log stream` ya no soporta aparatos iOS—, pero **la pantalla sí se puede
 * capturar**. Se tapa la app entera a propósito: esta sonda no convive con la demo, se prende,
 * se mide y se apaga.
 */
export function FfiCostProbeOverlay() {
  const [result, setResult] = useState<string[] | null>(null);

  useEffect(() => {
    // Igual que `useBenchmark`: ceder un turno para que se pinte "midiendo" antes de bloquear
    // el único hilo de JS que hay.
    const t = setTimeout(() => {
      try {
        runFfiCostProbe();
        setResult([...lines]);
      } catch (e) {
        setResult([`la sonda falló: ${String(e)}`]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>FfiCostProbe</Text>
      {(result ?? ['midiendo…']).map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingTop: 80,
    paddingHorizontal: 12,
    zIndex: 9999,
  },
  title: { fontWeight: '700', marginBottom: 8 },
  line: { fontFamily: 'Menlo', fontSize: 11, marginBottom: 4 },
});
