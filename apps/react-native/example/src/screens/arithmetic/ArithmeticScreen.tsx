import { Pressable, Text, View } from 'react-native';
import { core } from '../../adapter/core';
import { LabeledField, PrimaryButton, ScreenHeader } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useArithmetic } from './useArithmetic';

export function ArithmeticScreen() {
  const { state, setA, setB, setOperation, calculate } = useArithmetic(core);

  return (
    <View style={{ gap: 12 }}>
      <ScreenHeader title="Aritmética" subtitle="El float rompe el dinero" />

      {/* Escala libre a propósito: el contrato acepta "0.1" (ar-001). Sin límite de 2 decimales. */}
      <LabeledField label="Operando A" value={state.a} onChangeText={setA} />
      <LabeledField label="Operando B" value={state.b} onChangeText={setB} />

      <View style={{ flexDirection: 'row', gap: 16 }}>
        {(['add', 'subtract'] as const).map((op) => (
          <Pressable
            key={op}
            onPress={() => setOperation(op)}
            testID={`op-${op}`}
          >
            <Text
              style={{
                color: state.operation === op ? theme.orange : theme.muted,
              }}
            >
              {op === 'add' ? 'Sumar' : 'Restar'}
            </Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton title="Calcular" onPress={calculate} />

      {state.error !== '' && (
        <Text style={{ color: theme.danger }}>{state.error}</Text>
      )}

      <View
        style={{
          borderWidth: 1,
          borderColor: theme.danger,
          borderRadius: 8,
          padding: 12,
        }}
      >
        <Text style={{ color: theme.danger }}>Punto flotante nativo</Text>
        <Text testID="native-result" style={{ color: theme.text }}>
          {state.nativeResult}
        </Text>
      </View>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.ok,
          borderRadius: 8,
          padding: 12,
        }}
      >
        <Text style={{ color: theme.ok }}>Core (Rust · Decimal)</Text>
        <Text testID="core-result" style={{ color: theme.text }}>
          {state.coreResult}
        </Text>
      </View>
    </View>
  );
}
