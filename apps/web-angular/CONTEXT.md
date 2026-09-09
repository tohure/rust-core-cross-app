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

  async cronograma(monto: string, tea: string, cuotas: number, seguro: string) {
    return (await this.ready()).generarCronograma(monto, tea, cuotas, seguro);
  }
}
```

Usa un `APP_INITIALIZER` para precargar el módulo al arranque, de modo que las
pantallas no tengan que esperar en la primera interacción.

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
    ├── simulador/
    ├── validador-cci/
    └── benchmark/

## Formateo

Un `MoneyPipe` que envuelve `Intl.NumberFormat("es-PE", { style: "currency",
currency: "PEN" })` y recibe el string del core. No uses `CurrencyPipe` de
Angular directamente: espera un `number` y ahí se pierde la precisión.

## Pantallas

Las mismas que las otras tres apps, con los mismos labels y el mismo orden.
`versionCore()` visible en el pie.

En benchmark, compara contra una baseline en TS ubicada en
`features/benchmark/baseline.ts`, con el mismo comentario explicativo que en
React Native.

## Pruebas

Spec que lee `contratos/casos.json` y compara strings exactos. Debe pasar con
los mismos resultados que Android, iOS y RN.

## Prohibiciones

- No uses `number`, `parseFloat` ni aritmética sobre montos.
- No uses `CurrencyPipe` de Angular sobre montos del core.
- No agregues `decimal.js` ni equivalentes.
- No copies el `.wasm` manualmente entre proyectos.