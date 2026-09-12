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
import { useCard } from './useCard';

export function CardScreen() {
  const { state, setNumber, setPastedHex, validateAndEncrypt, decryptPasted } =
    useCard(core);

  return (
    <View style={{ gap: 12 }}>
      <ScreenHeader
        title="Tarjeta"
        subtitle="Luhn y cifrado ChaCha20-Poly1305"
      />

      <LabeledField
        label="Número"
        value={state.number}
        onChangeText={setNumber}
        keyboardType="number-pad"
      />
      {/* Texto de ayuda OBLIGATORIO, con estas dos líneas exactas (docs/ui-spec.md). Sin él la
          pantalla no dice qué espera: el campo acepta cualquier dígito pero el core exige un
          número que pase Luhn, y quien hace la demo tiene que adivinarlo frente a la
          audiencia. Con él, el rechazo deja de parecer un fallo del producto y pasa a ser
          parte de lo que se demuestra. */}
      <Text style={{ color: theme.muted, fontSize: 12 }}>
        Puedes probar 4111111111111111 (Visa) o 5555555555554444 (Mastercard).
      </Text>
      <Text style={{ color: theme.muted, fontSize: 12 }}>
        Un número inválido lo rechaza el core, no esta pantalla.
      </Text>

      <PrimaryButton title="Validar y cifrar" onPress={validateAndEncrypt} />
      {state.error !== '' && (
        <Text style={{ color: theme.danger }}>{state.error}</Text>
      )}

      {state.cipherHex !== '' && (
        <>
          <SectionDivider title="Resultado" />
          <ResultRow label="Marca" value={state.brand} />
          <ResultRow label="Enmascarado" value={state.masked} monospace />

          <Text style={{ color: theme.muted }}>Cifrado (hex)</Text>
          {/* En caja y con corte de línea: en la demo los 64 caracteres se comparan a simple
              vista contra las otras tres pantallas. */}
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text
              selectable
              style={{
                fontFamily: theme.mono,
                fontSize: 12,
                color: theme.text,
              }}
            >
              {state.cipherHex}
            </Text>
          </View>

          {/* La vuelta completa. Sin esta fila el hex de arriba es indistinguible de un hash:
              esto es lo que muestra que el core CIFRA y no resume. */}
          <ResultRow label="Descifrado" value={state.decrypted} monospace />
          <Text style={{ color: theme.ok, fontSize: 12 }}>
            El mismo número salió de vuelta: es cifrado reversible, no un hash.
          </Text>
        </>
      )}

      <SectionDivider title="Descifrar un hex de otra plataforma" />
      <Text style={{ color: theme.muted, fontSize: 12 }}>
        Pega aquí el hex que produjo la app de Android, iOS o Angular. Sale el
        mismo número, porque las cuatro usan el mismo core.
      </Text>
      <LabeledField
        label="Hex cifrado"
        value={state.pastedHex}
        onChangeText={setPastedHex}
      />
      <PrimaryButton title="Descifrar" onPress={decryptPasted} />
      {state.pasteError !== '' && (
        <Text style={{ color: theme.danger }}>{state.pasteError}</Text>
      )}
      {state.recovered !== '' && (
        <ResultRow
          label="Número recuperado"
          value={state.recovered}
          monospace
        />
      )}
    </View>
  );
}
