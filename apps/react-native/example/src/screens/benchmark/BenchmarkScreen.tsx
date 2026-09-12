import { Text } from 'react-native';
import { theme } from '../../ui/theme';

// PLACEHOLDER — lo reemplaza entera la tarea de esta pantalla. Existe para que la navegación de
// la Task 18 compile y se pueda ver en el aparato: sin esto `tsc` quedaría en rojo hasta la
// Task 22, y el pie de `coreVersion()` en las cuatro pestañas —que es un criterio de la demo—
// no se podría verificar.
export function BenchmarkScreen() {
  return <Text style={{ color: theme.muted }}>Benchmark — pendiente</Text>;
}
