// El generado lleva `@ts-nocheck`: `tsc` no lo chequea, pero sí infiere su forma de la
// implementación (`@ts-nocheck` suprime diagnósticos, no la inferencia), así que este `import`
// no produce un error que un `@ts-expect-error` pueda capturar — se verificó: agregarlo deja
// `tsc` en rojo con TS2578 ("Unused '@ts-expect-error' directive"). El porqué real de envolver
// `generado` a mano, en vez de reexportarlo, está en el docblock de abajo — no es que reexportar
// diera `any` (no lo hace: sus tipos se infieren igual de la implementación).
import * as generado from '../generated/index';

/**
 * **Fachada tipada sobre el módulo generado, escrita a mano y a propósito.**
 *
 * El entrypoint que produce `ubrn build wasm2` lleva `@ts-nocheck` **porque lo necesita**: sin
 * esa directiva, `tsc` rompe sobre ese archivo — verificado quitándosela, `TS2345` en la línea
 * que registra las definiciones del player contra `@ubjs/wasm` (un choque entre las tuplas
 * `readonly` que emite el generador y el `FfiTypeDesc[]` mutable que espera `ModuleDefinitions`).
 * Es una directiva *load-bearing*, no cosmética, y el logro real de esta fachada es confinarla a
 * un archivo que nadie edita a mano: todo lo que sí se toca en este paquete (`index.ts`,
 * `guard.ts`) queda bajo chequeo completo de `tsc`.
 *
 * Dos razones más para envolver a mano en vez de reexportar `generado` tal cual:
 * - Una **superficie estable** frente al churn del generador: si `ubrn` reordena o renombra algo
 *   internamente entre corridas, el contrato hacia afuera no se mueve.
 * - `initCore` **angosta el tipo**. El `WasmSource` del generado admite seis formas
 *   (`WebAssembly.Module | ArrayBuffer | Uint8Array | Response | URL | string`); esta fachada
 *   acepta sólo bytes. Eso vuelve la independencia del MIME del `.wasm` una propiedad del tipo,
 *   no una convención que alguien puede romper sin que nada avise.
 *
 * Estas firmas son las de `apps/web-angular/CONTEXT.md`, ya verificadas contra Kotlin y Swift en
 * la Fase 1 y contra el flavour JSI de React Native en la Fase 4.
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
