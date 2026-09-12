import { Text, View } from 'react-native';
import { core } from '../../adapter/core';
import {
  LabeledField,
  PrimaryButton,
  ResultRow,
  ScreenHeader,
  SectionDivider,
} from '../../ui/components';
import { theme } from '../../ui/theme';
import { useBenchmark } from './useBenchmark';

export function BenchmarkScreen() {
  const { state, setIterations, run } = useBenchmark(core);

  return (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title="Benchmark"
        subtitle="Core vs. implementación nativa"
      />

      <LabeledField
        label="Iteraciones"
        value={state.iterations}
        onChangeText={setIterations}
        keyboardType="number-pad"
      />

      <PrimaryButton title="Ejecutar" onPress={run} loading={state.running} />

      {state.error !== '' && (
        <Text style={{ color: theme.danger }}>{state.error}</Text>
      )}

      {/* Las filas se pintan SIEMPRE, con `—` hasta que haya medición, igual que Android e
          iOS. Los nombres de las dos implementaciones son LOS MISMOS que usa la pantalla de
          Aritmética: antes acá decían `Core` y `Nativa`, y quien miraba la demo veía cuatro
          conceptos donde hay dos. Labels normativos: ver docs/ui-spec.md. */}
      <SectionDivider title="Core (Rust · Decimal)" />
      <ResultRow label="Tiempo típico (p50)" value={state.coreP50} monospace />
      <ResultRow label="Peor caso (p95)" value={state.coreP95} monospace />

      <SectionDivider title="Punto flotante nativo" />
      <ResultRow
        label="Tiempo típico (p50)"
        value={state.nativeP50}
        monospace
      />
      <ResultRow label="Peor caso (p95)" value={state.nativeP95} monospace />

      {/* Los dos párrafos son OBLIGATORIOS. Sin el primero, un número más grande parece un
          defecto en vez del argumento que es. */}
      <Text style={{ color: theme.muted, fontSize: 12 }}>
        El core es más lento porque cada llamada cruza la frontera al código
        Rust.
      </Text>
      <Text style={{ color: theme.danger, fontSize: 12 }}>
        ⚠ El punto flotante nativo es más rápido y da mal el resultado: existe
        para exhibirlo.
      </Text>
    </View>
  );
}
