# app-web-angular

App Angular que consume `rust-core` compilado a WebAssembly. Demuestra que el
mismo núcleo corre en el web sin reescribirse y sin migrar el front a React.

Stack: Angular standalone components, TypeScript, WASM generado por
`ubrn build web` desde `apps/react-native`.

## Regla central

Idéntica a React Native, y por la misma razón: **nunca conviertas un monto a
`number`**. Los montos son strings desde el WASM hasta el template.

Cero reglas de negocio en TypeScript. Ni validación, ni cálculo, ni tasas.

## Consumir el paquete WASM

El artefacto se genera en `apps/react-native` con `ubrn build web` y se
consume aquí como paquete local del workspace. No lo copies a mano en
`assets/`.

El módulo WASM se carga de forma asíncrona una sola vez, en un servicio con
`providedIn: 'root'`:

```ts
@Injectable({ providedIn: "root" })
export class CoreFinancieroService {
  private core?: typeof import("@banco/core-financiero");

  private async ready() {
    if (!this.core) this.core = await import("@banco/core-financiero");
    return this.core;
  }

  async transferir(cuentas: Cuenta[], s: SolicitudTransferencia) {
    return (await this.ready()).ejecutarTransferencia(cuentas, s);
  }

  async cifrar(numero: string, claveHex: string, nonceHex: string) {
    return (await this.ready()).cifrar(numero, claveHex, nonceHex);
  }
}
```

Usa un `APP_INITIALIZER` para precargar el módulo al arranque, de modo que las
pantallas no tengan que esperar en la primera interacción.

## Errores

Los errores del core llegan como excepciones tipadas; se mapean a mensaje de
usuario en el componente, no en el servicio. **El `message` del binding es
diagnóstico, nunca texto de usuario**: uniffi no usa los `#[error("...")]` en
español del core, arma el mensaje con los campos de la variante y lo deja vacío
para las que no tienen campos (`CheckDigit`, `SameAccount`). Los nueve textos de
usuario, iguales en las cuatro apps, están en la tabla de
[rust-core/README.md](../../rust-core/README.md) — "Los mensajes de error en
español NO cruzan el FFI".

## Configuración del build

El `.wasm` debe servirse con MIME `application/wasm`. Con el builder de
Angular basado en esbuild, decláralo como asset y verifica en la pestaña
Network que no llegue como `text/html`. Este es el punto donde más tiempo se
pierde en este proyecto.

Si el builder de Angular da pelea, **no quemes tiempo de demo ahí**: levanta
la pantalla en un Vite mínimo, deja la integración Angular documentada como
pendiente, y sigue. La POC no se juega en esto.

## Estructura

src/app/
├── core/core-financiero.service.ts    único punto de contacto con el WASM
├── format/money.pipe.ts
└── features/
    ├── aritmetica/
    ├── transferencia/
    ├── tarjeta/
    ├── validador-cci/
    └── benchmark/

## Formateo

Un `MoneyPipe` que envuelve `Intl.NumberFormat("es-PE", { style: "currency",
currency: "PEN" })` y recibe el string del core. No uses `CurrencyPipe` de
Angular directamente: espera un `number` y ahí se pierde la precisión.

## Pantallas

Las mismas cinco que las otras tres apps, con los mismos labels y el mismo orden.

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
5. **Pie de pantalla:** `coreVersion()` visible en todas. En la demo se compara con las
   otras tres apps: mismo string = mismo build.

En la pantalla de aritmética, el lado "number" se calcula con el tipo nativo a propósito,
con un comentario que lo explique.

## Pruebas

Spec que lee `contracts/cases.json` y compara strings exactos. Debe pasar con
los mismos resultados que Android, iOS y RN.

## Prohibiciones

- No uses `number`, `parseFloat` ni aritmética sobre montos.
- No uses `CurrencyPipe` de Angular sobre montos del core.
- No agregues `decimal.js` ni equivalentes.
- No copies el `.wasm` manualmente entre proyectos.