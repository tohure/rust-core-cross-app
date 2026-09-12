import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { core } from '../../adapter/core';
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
// Los labels son los de `docs/ui-spec.md`, textuales: `Aritmética`, `Transferencia`, `Tarjeta`,
// `Benchmark`. Cambiar uno obliga a cambiarlo en las cuatro apps y en ese archivo, en el mismo
// cambio.
//
// **Van completos, no abreviados.** Antes decían `Transf.` y `Bm`, copiados del wireframe ASCII
// de `ui-spec.md` — que abrevia por ancho de columna, no porque el label sea ése. El texto
// normativo, dos líneas más arriba en ese mismo archivo, los nombra enteros, y así los tienen
// Android (`BancoApp.kt`) e iOS (`BancoApp.swift`). La demo pone las tres barras lado a lado.
const TABS = [
  { key: 'arithmetic', label: 'Aritmética', Screen: ArithmeticScreen },
  { key: 'transfer', label: 'Transferencia', Screen: TransferScreen },
  { key: 'card', label: 'Tarjeta', Screen: CardScreen },
  { key: 'benchmark', label: 'Benchmark', Screen: BenchmarkScreen },
] as const;

export function BancoApp() {
  const [active, setActive] =
    useState<(typeof TABS)[number]['key']>('arithmetic');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.white }}>
      {/* Las CUATRO pantallas quedan montadas y se ocultan las inactivas con `display`.
          Renderizar sólo la activa desmontaba las otras tres y **mataba su `useState`**:
          transferir, cambiar de pestaña y volver borraba el comprobante y los saldos, el hex
          cifrado de Tarjeta y los números del Benchmark. Android ya pagó este defecto y lo
          arregló elevando los cuatro ViewModels fuera del `when` (ver el comentario en
          `BancoApp.kt`), e iOS no lo tiene porque `TabView` mantiene las cuatro vistas vivas.
          Cada una lleva su propio `ScrollView` para conservar su posición de scroll.
          `collapsable={false}` por la misma razón que en los componentes compartidos: estos
          contenedores sólo aportan layout y Fabric los aplanaría. Ver PENDING.md. */}
      {TABS.map(({ key, Screen }) => (
        <View
          key={key}
          collapsable={false}
          style={{ flex: 1, display: active === key ? 'flex' : 'none' }}
        >
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Screen />
          </ScrollView>
        </View>
      ))}
      <CoreVersionFooter
        version={core.coreVersion()}
        style={{ paddingVertical: 8 }}
      />
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
            style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 12 }}
            testID={`tab-${t.key}`}
          >
            {/* `numberOfLines={1}` y cuerpo 12: con el label completo y el cuerpo por defecto,
                `Transferencia` partía en dos líneas —«Transferenci» / «a»— y descuadraba la
                barra. Es exactamente por eso que el wireframe de `ui-spec.md` abrevia, pero el
                label normativo es el entero: lo que hay que ajustar es la tipografía, no el
                texto. Verificado en el emulador. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                textAlign: 'center',
                fontSize: 12,
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
