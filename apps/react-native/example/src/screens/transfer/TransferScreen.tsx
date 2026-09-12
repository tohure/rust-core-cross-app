import { Text, View } from 'react-native';
import { core } from '../../adapter/core';
import { formatPEN } from '../../format/money';
import {
  LabeledField,
  PrimaryButton,
  ResultRow,
  ScreenHeader,
  SectionDivider,
} from '../../ui/components';
import { theme } from '../../ui/theme';
import { useTransfer } from './useTransfer';

export function TransferScreen() {
  const { state, setOrigin, setDestination, setAmount, transfer } =
    useTransfer(core);

  return (
    <View style={{ gap: 12 }}>
      <ScreenHeader title="Transferencia" subtitle="Dos cuentas en memoria" />

      {/* Orden de campos fijado por docs/ui-spec.md: origen, destino, monto. No se altera. */}
      <LabeledField
        label="Origen"
        value={state.origin}
        onChangeText={setOrigin}
      />
      <LabeledField
        label="Destino"
        value={state.destination}
        onChangeText={setDestination}
      />
      {/* Sin `placeholder`, igual que Android e iOS: el campo arranca vacío y en las tres se
          ve igual. `decimal-pad` con locale es-PE puede ofrecer coma; el filtro la descarta. */}
      <LabeledField
        label="Monto"
        value={state.amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />

      <PrimaryButton
        title="Transferir"
        onPress={transfer}
        loading={state.loading}
      />

      {state.error !== '' && (
        <Text style={{ color: theme.danger }}>{state.error}</Text>
      )}

      {state.receipt !== '' && (
        <>
          <SectionDivider title="Resultado" />
          <ResultRow label="Comisión ITF" value={formatPEN(state.itfFee)} />
          <ResultRow
            label="Total debitado"
            value={formatPEN(state.totalDebited)}
          />
          {/* Monoespaciado como en Android (`mono = true`) e iOS (`monospaced: true`). */}
          <ResultRow label="Comprobante" value={state.receipt} monospace />
        </>
      )}

      <SectionDivider title="Saldos" />
      {state.accounts.map((a) => (
        <ResultRow
          key={a.id}
          label={`${a.id}  ${a.holder}`}
          value={formatPEN(a.balance)}
        />
      ))}
    </View>
  );
}
