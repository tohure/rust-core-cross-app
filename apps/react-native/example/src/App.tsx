// El smoke de JSI: lo mínimo que prueba que el turbo module se registró y que los símbolos
// del core resuelven. Nada de UI todavía — las cuatro pantallas vienen después, y no tienen
// sentido si este string no aparece.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { coreVersion } from '@banco/core-financiero';

export default function App() {
  const [version, setVersion] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    try {
      setVersion(coreVersion());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text testID="core-version" style={styles.version}>
        {version}
      </Text>
      <Text testID="core-error" style={styles.error}>
        {error}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  version: {
    fontSize: 20,
  },
  error: {
    color: 'red',
  },
});
