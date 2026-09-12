import {
  ActivityIndicator,
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
// `collapsable={false}` EN LOS CUATRO CONTENEDORES — NO ES COSMÉTICO, NO SE QUITA.
// ---------------------------------------------------------------------------------
// Un `View` que sólo aporta layout es "aplanado" por Fabric en Android: no se crea vista
// nativa y sus hijos se cuelgan del padre. Cuando encima de una lista de estas filas se
// INSERTA otro bloque de filas aplanadas —en Transferencia, el bloque `Resultado` al llegar
// el comprobante—, la contabilidad de índices nativos se corre y las filas de abajo quedan
// con su `<Text>` de label **pegado a la vista equivocada**: se pinta encima de otra fila y
// su valor queda huérfano. Se ve en pantalla, no en los tests: RNTL renderiza un árbol JSON
// y no tiene layout nativo, así que ningún test de Jest puede cazarlo.
// Reproducido y acotado por bisección en el emulador (Pixel 9 Pro API 36, RN 0.87, Fabric):
// sin los tres `LabeledField` el bug desaparece; con tres `<Text>` o tres `<TextInput>`
// pelados en su lugar, tampoco aparece. Lo que lo dispara es tener varios contenedores de
// fila APLANADOS. `collapsable={false}` obliga a crear la vista nativa y la estructura
// nativa vuelve a coincidir con el árbol de React.
// Ver el Ruling T20-7 del ledger de la fase. En iOS la prop se ignora, así que no cambia nada.
//
// Ponerlo en UNO SOLO no alcanza: con la prop sólo en `ResultRow` el defecto no desaparece,
// se MUEVE de la primera fila a la segunda. Y con TRES tampoco: `ScreenHeader` —un `View`
// pelado, sin una sola propiedad visual, o sea el más aplanable de todos— quedó sin proteger
// y la pantalla de Tarjeta salía con el bloque «Descifrar un hex de otra plataforma» pintado
// encima de «Resultado». Tienen que ser los cuatro: la regla es que **ningún contenedor
// compartido quede aplanado**, no que se parchee el que falla hoy. Ver Ruling T21-6.
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
    <View collapsable={false} style={style}>
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
    <View
      collapsable={false}
      style={[{ flexDirection: 'row', alignItems: 'center' }, style]}
    >
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
      collapsable={false}
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
      collapsable={false}
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
 *
 * `loading` pinta el spinner **dentro** del botón y lo deshabilita, que es lo que hacen
 * `CircularProgressIndicator` en el `Button` de Compose y `ProgressView` en el de SwiftUI.
 * Reemplazar el botón entero por un spinner suelto correría el layout hacia arriba justo
 * cuando las tres pantallas se están mirando lado a lado.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inerte = disabled === true || loading === true;
  return (
    <Pressable
      onPress={onPress}
      disabled={inerte}
      accessibilityRole="button"
      style={[
        {
          backgroundColor: inerte ? theme.muted : theme.orange,
          borderRadius: 6,
          paddingVertical: 12,
          alignItems: 'center',
        },
        style,
      ]}
    >
      {loading === true ? (
        <ActivityIndicator color={theme.white} />
      ) : (
        <Text style={{ color: theme.white, fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}
