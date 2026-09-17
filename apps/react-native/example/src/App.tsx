import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FfiCostProbeOverlay, PROBE_ON } from './benchmark/FfiCostProbe';
import { BancoApp } from './ui/navigation/BancoApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <BancoApp />
      {/* La sonda del benchmark, que tapa la app cuando está prendida. `PROBE_ON` es `false`
          en el repositorio, así que esto no renderiza nada. Ver benchmark/FfiCostProbe.tsx. */}
      {PROBE_ON && <FfiCostProbeOverlay />}
    </SafeAreaProvider>
  );
}
