// El generado lleva `@ts-nocheck`: `tsc` no lo chequea, pero sí infiere su forma de la
// implementación (`@ts-nocheck` suprime diagnósticos, no la inferencia), así que este `import`
// no produce un error que un `@ts-expect-error` pueda capturar — se verificó: agregarlo deja
// `tsc` en rojo con TS2578 ("Unused '@ts-expect-error' directive"). Lo que sí hace falta, y es
// lo que sostiene esta fachada, es no reexportar `generado` tal cual: sus tipos inferidos no son
// los contratos reales de `apps/web-angular/CONTEXT.md` y no le dan a `guard.ts` un
// `DomainError` estable para comparar.
import * as generado from '../generated/index';

/**
 * **Fachada tipada sobre el módulo generado, escrita a mano y a propósito.**
 *
 * El entrypoint que produce `ubrn build wasm2` lleva `@ts-nocheck`: no typechequea. Reexportarlo
 * tal cual le daría `any` a todo consumidor en las nueve funciones, y con eso se cae la guardia
 * 4 — el `Equal<DomainError['tag'], ContractTag>` de `guard.ts` no tendría un tipo real contra
 * el que verificar, y una décima variante del core pasaría en verde.
 *
 * Acá el `@ts-nocheck` queda **confinado al archivo generado**. Estas firmas son las de
 * `apps/web-angular/CONTEXT.md`, ya verificadas contra Kotlin y Swift en la Fase 1 y contra el
 * flavour JSI de React Native en la Fase 4.
 */
export type Account = { id: string; holder: string; balance: string };
export type TransferRequest = { origin: string; destination: string; amount: string };
export type TransferResult = {
  accounts: Account[];
  itfFee: string;
  totalDebited: string;
  receipt: string;
  /** El ÚNICO número de toda la superficie. */
  simulatedLatencyMs: number;
};
export type ValidCci = { bankCode: string; bankName: string; branch: string; account: string };
export type ValidCard = { brand: string; masked: string };

/** Abre el módulo. **Recibe BYTES**, no una `Response`: ver `initCore` en el servicio Angular. */
export async function initCore(source: ArrayBuffer | Uint8Array): Promise<void> {
  await generado.uniffiInitAsync(source);
}

export const add = (a: string, b: string): string => generado.add(a, b);
export const subtract = (a: string, b: string): string => generado.subtract(a, b);
export const calculateItf = (amount: string): string => generado.calculateItf(amount);
export const validateCci = (cci: string): ValidCci => generado.validateCci(cci);
export const validateCard = (n: string): ValidCard => generado.validateCard(n);
export const encrypt = (text: string, keyHex: string, nonceHex: string): string =>
  generado.encrypt(text, keyHex, nonceHex);
export const decrypt = (hex: string, keyHex: string, nonceHex: string): string =>
  generado.decrypt(hex, keyHex, nonceHex);
export const executeTransfer = (a: Account[], r: TransferRequest): TransferResult =>
  generado.executeTransfer(a, r);
export const coreVersion = (): string => generado.coreVersion();

// La guardia 4 (`./guard.ts`) NO se importa acá a propósito. `tsconfig.json` la incluye vía
// `"include": ["src"]`, así que `tsc` la typechequea igual sin que nada la importe en runtime —
// verificado: la guardia por mutación sigue rompiendo `tsc` sin este import. Importarla sólo
// sumaba una advertencia de esbuild (`sideEffects: false` descarta un import sin efectos reales:
// el archivo entero se borra al compilar a JS) sin ganar cobertura de tipos.
