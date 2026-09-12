import { Platform } from 'react-native';

// Paleta compartida con Android e iOS. Es **dirección visual, no identidad**: el banco es el
// ficticio del contrato ("Banco Demo Uno"), nunca uno real — no se usa el nombre ni el logo de
// ningún banco existente.
export const theme = {
  orange: '#E8600A',
  blue: '#0A4DE8',
  white: '#FFFFFF',
  surface: '#F6F6F8',
  text: '#141418',
  muted: '#6B6B76',
  danger: '#C62828', // el resultado del punto flotante nativo
  ok: '#2E7D32', // el resultado del core
  // `'Courier'` sólo existe en iOS: en Android no es una familia del sistema y React Native
  // cae a la tipografía por defecto, así que el hex NO salía monoespaciado ahí. `ui-spec.md`
  // exige que el hex de la pantalla de Tarjeta "pueda compararse a simple vista contra las
  // otras tres pantallas", y con proporcional no se puede. Android nativo usa
  // `FontFamily.Monospace`, que es el equivalente de `'monospace'`.
  mono: Platform.select({ ios: 'Courier', default: 'monospace' }),
} as const;
