import {
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { coreVersion } from '@banco/core-financiero';
import { theme } from '../theme';

// Los cinco componentes de `docs/ui-spec.md`, con la **misma descomposición** que Android e iOS:
// es lo que hace que las pantallas sean comparables el día de la demo.
//
// Convención de firma, tomada de la práctica de Compose y aplicable a las cuatro plataformas: el
// componente aporta tipografía y espaciado **internos**, y el padding **posicional** lo pone quien
// lo usa (`style`). Así el mismo componente sirve dentro de una lista y dentro de una tarjeta sin
// necesitar variantes.

export function ScreenHeader({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text }}>
        {title}
      </Text>
      <Text style={{ fontSize: 14, color: theme.muted }}>{subtitle}</Text>
    </View>
  );
}

export function LabeledField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>
      <Text style={{ width: 110, color: theme.text }}>{label}</Text>
      <TextInput
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: theme.muted,
          borderRadius: 6,
          padding: 8,
          color: theme.text,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function ResultRow({
  label,
  value,
  monospace,
  style,
}: {
  label: string;
  value: string;
  monospace?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: 'row', justifyContent: 'space-between' }, style]}
    >
      <Text style={{ color: theme.muted }}>{label}</Text>
      <Text
        style={{
          color: theme.text,
          flexShrink: 1,
          textAlign: 'right',
          fontFamily: monospace ? theme.mono : undefined,
        }}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function SectionDivider({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: theme.muted }} />
      <Text style={{ color: theme.muted, fontSize: 12 }}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.muted }} />
    </View>
  );
}

/**
 * El pie va en las **cuatro** pantallas, no en un "Acerca de": cuatro strings idénticos en pantalla
 * son la prueba de que las cuatro apps corren el mismo build. Se muestra tal cual lo devuelve el
 * core, **sin reformatear**.
 */
export function CoreVersionFooter({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text
        testID="core-version"
        style={{ textAlign: 'center', color: theme.muted, fontSize: 12 }}
      >
        {coreVersion()}
      </Text>
    </View>
  );
}

/**
 * El botón primario de las cuatro pantallas.
 *
 * **No se usa el `Button` de React Native**, y no es preferencia: en Android renderiza el estilo
 * Material, que **pone el texto en mayúsculas**. El label saldría `CALCULAR` mientras Android
 * Compose e iOS muestran `Calcular`, y `docs/ui-spec.md` fija los labels **exactos** porque la
 * demo pone las cuatro pantallas lado a lado. Un `Pressable` no transforma el texto.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        {
          backgroundColor: disabled ? theme.muted : theme.orange,
          borderRadius: 6,
          paddingVertical: 12,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: theme.white, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
