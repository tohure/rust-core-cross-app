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
├── screens/       Simulador, ValidadorCci, Benchmark
└── format/        money.ts

## Cómo consumir el core

```ts
import { generarCronograma, validarCci, versionCore } from "../generated";

export const core = {
  cronograma: (monto: string, tea: string, cuotas: number, seguro: string) =>
    generarCronograma(monto, tea, cuotas, seguro),
  validarCci,
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

Las mismas cuatro que Android e iOS, con los mismos labels y el mismo orden.
La comparación lado a lado en la demo depende de esto.

En la pantalla de benchmark, compara el core contra una implementación
TypeScript equivalente que vive en `__benchmarks__/baseline.ts`. Esa es la
única parte del repo donde se permite escribir lógica de negocio en TS, y
existe únicamente para demostrar la divergencia de centavos. Márcala con un
comentario que lo diga.

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