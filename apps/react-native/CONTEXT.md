# app-react-native

App React Native que consume `rust-core` vía Turbo Module generado por
`uniffi-bindgen-react-native` (CLI `ubrn`). Este proyecto también produce el
paquete WASM que consume la app Angular.

Stack: React Native con nueva arquitectura obligatoria, TypeScript, ubrn.

## Regla central

**Cero reglas de negocio en TypeScript.** Ni una validación de CCI con regex,
ni un cálculo de cuota, ni una multiplicación sobre un monto. Este punto es
más importante aquí que en las otras apps: en JS los montos se calculan con
`double` IEEE-754 y eso es exactamente el problema que la POC ataca.

**Nunca conviertas un monto a `Number`.** Ni con `parseFloat`, ni con `+`, ni
con `Number()`. Los montos son strings desde el core hasta el `<Text>`.

## Configuración

`ubrn.config.yaml` en la raíz del proyecto:

```yaml
rust:
  directory: ../../rust-core
  manifestPath: crates/ffi/Cargo.toml
bindings:
  cpp: cpp/bindings
  ts: src/generated
android:
  targets: [arm64-v8a, armeabi-v7a, x86_64]
web:
  wasmCrateName: core_financiero    # requerido por `ubrn build web`
```

`ubrn build web` delega en `wasm-bindgen`/`wasm-pack` — es el mismo pipeline que muestra
el diagrama de arquitectura, no uno alterno.

Scripts en `package.json`:

```json
"ubrn:android": "ubrn build android --and-generate",
"ubrn:ios": "ubrn build ios --and-generate && (cd ios && pod install)",
"ubrn:web": "ubrn build web --and-generate",
"ubrn:clean": "rm -rf cpp/ src/generated/ android/src/main/java"
```

`src/generated/` es artefacto: nunca lo edites ni lo comitees modificado.

## Estructura

src/
├── generated/     bindings TS + JSI generados, NO EDITAR
├── adapter/       core.ts, único punto de contacto con el core
├── screens/       Aritmetica, Transferencia, Tarjeta, Benchmark
└── format/        money.ts

## Cómo consumir el core

```ts
import {
  sumar, restar, ejecutarTransferencia, validarCci,
  validarTarjeta, cifrar, descifrar, versionCore,
} from "../generated";

export const core = {
  sumar, restar,
  transferir: (cuentas: Cuenta[], s: SolicitudTransferencia) =>
    ejecutarTransferencia(cuentas, s),
  validarCci, validarTarjeta, cifrar, descifrar,
  version: versionCore,
};
```

Los errores llegan como excepciones tipadas. Captúralas en la pantalla y
mapea a mensaje de usuario ahí, no en el adapter.

## Formateo

`Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })` recibe el
string del core. Si Hermes no tiene Intl completo en la versión que uses,
implementa un formateador manual que opere **sobre el string**, insertando
separadores por posición. Nunca conviertas a número para formatear.

## Pantallas

Las mismas cinco que Android e iOS, con los mismos labels y el mismo orden.

1. **Aritmética.** Dos inputs y una operación. Muestra lado a lado el resultado con el
   tipo de punto flotante nativo de la plataforma y el del core. Los seis casos del
   contrato divergen: `0.1 + 0.2` da `0.30000000000000004` con double y `0.30` con el core.
   Es la única pantalla donde se permite usar el tipo flotante nativo, y existe justamente
   para exhibir el fallo.
2. **Transferencia.** Dos cuentas fake en memoria. Monto, origen, destino. Muestra la
   comisión ITF, el total debitado, el comprobante y los saldos nuevos. La app espera
   `latencia_simulada_ms` antes de pintar, para que parezca una llamada HTTP: **no hay red**.
   Las cuentas se reinician al cerrar la app; sin BD, sin cache.
3. **Tarjeta.** Un número de tarjeta fake. Valida por Luhn, muestra marca y enmascarado, y
   cifra con ChaCha20-Poly1305. El hex resultante debe ser idéntico al de las otras tres
   plataformas — y lo que cifra una descifra cualquier otra.
4. **Benchmark.** Ejecuta el core N veces y reporta p50/p95 contra una implementación
   equivalente nativa que vive solo en el código de test.
5. **Pie de pantalla:** `version_core()` visible en todas. En la demo se compara con las
   otras tres apps: mismo string = mismo build.

En la pantalla de aritmética, el lado "double" se calcula con `Number` a propósito. Es la
única parte del repo donde se permite, y debe llevar un comentario que lo diga.

## Pruebas

Jest que lee `contracts/cases.json` y compara con `toBe` sobre strings. Añade
un test explícito que documente el problema: la baseline en TS falla al menos
un caso de `cases.json`. Ese test rojo intencional es material de la
presentación.

## Sobre Re.Pack

Fuera de alcance para la POC. El core Rust vive como dependencia nativa de la
shell y todas las mini apps lo consumen sin duplicar el binario, pero eso se
demuestra en fase 2. No configures Module Federation aquí.

## Prohibiciones

- No habilites la arquitectura vieja. Sin Turbo Modules esto no funciona.
- No uses `Number`, `parseFloat` ni operadores aritméticos sobre montos.
- No agregues `decimal.js`, `big.js` ni similares. Si los necesitas, es señal
  de que estás calculando en el lugar equivocado.
- No edites `src/generated/`.