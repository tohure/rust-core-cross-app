import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoreVersionFooter } from '../components';
import { theme } from '../theme';
import { ArithmeticScreen } from '../../screens/arithmetic/ArithmeticScreen';
import { TransferScreen } from '../../screens/transfer/TransferScreen';
import { CardScreen } from '../../screens/card/CardScreen';
import { BenchmarkScreen } from '../../screens/benchmark/BenchmarkScreen';

// `SafeAreaView` viene de `react-native-safe-area-context` y **no** del core de React Native, que
// lo deprecó en 0.87. No es cosmético: el warning de deprecación levanta el banner de LogBox, que
// en builds de desarrollo **tapa el pie de `coreVersion()` e intercepta los taps de esta misma
// barra de pestañas** — verificado en el emulador. Además el del core no aplica inset inferior en
// Android, así que la barra quedaba pegada a la zona de gestos del sistema.
//
// Estado local en vez de una librería de navegación: son cuatro pestañas sin rutas ni parámetros,
// y una dependencia más sería ceremonia.
//
// Los labels son los de `docs/ui-spec.md`, textuales. Cambiar uno obliga a cambiarlo en las cuatro
// apps y en ese archivo, en el mismo cambio.
const TABS = [
  { key: 'arithmetic', label: 'Aritmética', Screen: ArithmeticScreen },
  { key: 'transfer', label: 'Transf.', Screen: TransferScreen },
  { key: 'card', label: 'Tarjeta', Screen: CardScreen },
  { key: 'benchmark', label: 'Bm', Screen: BenchmarkScreen },
] as const;

export function BancoApp() {
  const [active, setActive] =
    useState<(typeof TABS)[number]['key']>('arithmetic');
  const Screen = TABS.find((t) => t.key === active)!.Screen;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.white }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Screen />
      </ScrollView>
      <CoreVersionFooter style={{ paddingVertical: 8 }} />
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: theme.surface,
        }}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setActive(t.key)}
            style={{ flex: 1, padding: 12 }}
            testID={`tab-${t.key}`}
          >
            <Text
              style={{
                textAlign: 'center',
                color: active === t.key ? theme.orange : theme.muted,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
