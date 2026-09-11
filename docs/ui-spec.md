# Spec de UI — normativa para las cuatro apps

Las cuatro apps —Android, iOS, React Native, Angular— tienen **las mismas cinco pantallas,
con los mismos labels y el mismo orden de campos**. Este archivo es la fuente de verdad de
eso. No es una sugerencia de diseño: es el contrato visual.

**Por qué existe.** La demo consiste en poner las cuatro pantallas lado a lado y comparar.
`contracts/cases.json` garantiza que los **valores** coincidan carácter por carácter, pero
no dice nada de los **labels, el orden ni la disposición**. Si cada app inventa su pantalla,
la comparación no se puede hacer aunque los strings sean idénticos. Este archivo tapa ese
hueco, igual que `contracts/messages.es.json` tapa el de los mensajes de error.

**Regla de cambio: tocar un label acá obliga a tocarlo en las cuatro apps, en el mismo
cambio.** Igual que el contrato.

---

## Lo que NO se comparte, y es deliberado

Vale la pena decirlo antes de los wireframes, porque es la decisión de arquitectura que más
confunde a quien llega:

```
        TanayenAI (KMP)                   Esta POC (Rust core)
        ──────────────                    ────────────────────
  UI          por plataforma         UI          por plataforma
  ViewModel   COMPARTIDO (KMP)       ViewModel   POR PLATAFORMA  ← duplicado a propósito
  Domain      compartido (KMP)       Domain      COMPARTIDO (Rust/uniffi)
  Data        compartido (KMP)       Data        compartido (Rust)
```

En esta POC **no hay un ViewModel compartido y no lo va a haber**: el núcleo compartido es
Rust y cruza por uniffi como funciones puras. Cada app escribe su propio ViewModel, en su
propio lenguaje. Eso **no** es duplicación accidental — es lo que la POC demuestra: que la
capa de presentación puede ser nativa de cada plataforma mientras el dominio es uno solo.

Lo que impide que esos cuatro ViewModels diverjan son tres artefactos, no un módulo:

| Artefacto | Qué fija |
|---|---|
| `contracts/cases.json` | los valores, carácter por carácter |
| `contracts/messages.es.json` | los mensajes de error |
| **este archivo** | los labels, el orden y la disposición |

---

## Convención de estado, igual en las cuatro

Una clase de estado **por pantalla**, inmutable, con valores por defecto, expuesta como un
stream observable. La UI la consume y no calcula nada.

| Plataforma | Estado | Se observa con |
|---|---|---|
| Android | `@Immutable data class XxxUiState` → `StateFlow` | `collectAsStateWithLifecycle()` |
| iOS | `@Observable final class XxxViewModel` (o `ObservableObject` + `@Published`) | binding de SwiftUI |
| React Native | objeto de estado en un hook `useXxx()` | `useState` / `useReducer` |
| Angular | `signal()` por campo, o un `signal<XxxState>()` | template |

Reglas que valen en las cuatro:

1. **Todos los montos del estado son `String`.** El estado es el último lugar donde alguien
   se tienta con un número. Ver la regla del invariante en `CLAUDE.md`.
2. **El estado no calcula.** Recibe lo que devolvió el core y lo guarda. Si estás escribiendo
   aritmética en el ViewModel, estás escribiendo lógica de negocio fuera de `rust-core`.
3. **Un error del core es un campo del estado**, no una excepción que sube a la vista. Se
   guarda ya resuelto a texto de usuario, leído de `contracts/messages.es.json`.
4. **Las listas del estado van inmutables** donde la plataforma lo permita
   (`ImmutableList`/`persistentListOf` en Kotlin), para que el motor de UI pueda saltarse
   recomposiciones.

---

## Las cinco pantallas

Navegación: cuatro pestañas (Aritmética, Transferencia, Tarjeta, Benchmark) y el pie de
`coreVersion()` **visible en las cuatro**, no en una pantalla aparte.

```
┌─────────────────────────────────────┐
│  ← título de la pantalla            │  cabecera: título + subtítulo
│    subtítulo                        │
├─────────────────────────────────────┤
│                                     │
│         contenido                   │
│                                     │
├─────────────────────────────────────┤
│  core 1.0.0 · a0a40a5               │  pie: coreVersion(), SIEMPRE visible
├─────────────────────────────────────┤
│  [Aritmética][Transf.][Tarjeta][Bm] │  navegación
└─────────────────────────────────────┘
```

El pie es la prueba en pantalla de que las cuatro corren el mismo build. Por eso va en todas
y no escondido en un "Acerca de".

### 1. Aritmética

Exhibe el fallo del punto flotante. **Es la única pantalla donde se permite usar el tipo
flotante nativo**, y existe justamente para eso.

```
┌─────────────────────────────────────┐
│  Aritmética                         │
│  El float rompe el dinero            │
├─────────────────────────────────────┤
│  Operando A   [ 0.1            ]    │  ← escala libre (ar-001 es "0.1")
│  Operando B   [ 0.2            ]    │
│                                     │
│  ( • ) Sumar    (   ) Restar        │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Punto flotante nativo         │  │  ← rojo / destructivo
│  │ 0.30000000000000004           │  │
│  ├───────────────────────────────┤  │
│  │ Core (Rust · Decimal)         │  │  ← verde / correcto
│  │ 0.30                          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

- Labels exactos: `Operando A`, `Operando B`, `Sumar`, `Restar`, `Calcular`,
  `Punto flotante nativo`, `Core (Rust · Decimal)`.
- **Sin límite de 2 decimales acá.** El contrato acepta escala libre en la entrada.
- Los seis casos de `aritmetica` divergen bajo IEEE-754; si alguno deja de diverger, deja de
  servir para la demo.

### 2. Transferencia

```
┌─────────────────────────────────────┐
│  Transferencia                      │
│  Dos cuentas en memoria             │
├─────────────────────────────────────┤
│  Origen       [ 00219100123456789047 ▾ ]│
│  Destino      [ 01122000987654321065 ▾ ]│
│  Monto        [ 100.00         ]    │  ← máx 2 decimales (filtro de texto)
│                                     │
│           [  Transferir  ]          │
│                                     │
│  ─── Resultado ──────────────────   │
│  Comisión ITF        S/ 0.01        │
│  Total debitado      S/ 100.01      │
│  Comprobante         TRF-9047-1065-10000 │
│                                     │
│  ─── Saldos ─────────────────────   │
│  00219100123456789047  Ana Quispe  S/ 4,899.99 │
│  01122000987654321065  Luis Ramos  S/ 1,300.50 │
└─────────────────────────────────────┘
```

- Labels exactos: `Origen`, `Destino`, `Monto`, `Transferir`, `Resultado`,
  `Comisión ITF`, `Total debitado`, `Comprobante`, `Saldos`.
- **Orden de los campos: origen, destino, monto.** No se altera.
- La app **espera `simulatedLatencyMs`** antes de pintar el resultado, para que parezca una
  llamada de red. **No hay red.** El botón queda en estado de carga durante esa espera.
- Las cuentas se reinician al cerrar la app. Sin BD, sin cache.
- El campo de monto acepta **2 decimales como máximo**, con un filtro de texto —no una
  validación de negocio— porque el core ya rechaza el resto (`tr-007`). Detalle y regex por
  plataforma, en el CONTEXT de cada app.

### 3. Tarjeta

```
┌─────────────────────────────────────┐
│  Tarjeta                            │
│  Luhn y cifrado ChaCha20-Poly1305   │
├─────────────────────────────────────┤
│  Número       [ 4111111111111111 ]  │
│                                     │
│           [  Validar y cifrar  ]    │
│                                     │
│  ─── Resultado ──────────────────   │
│  Marca               Visa           │
│  Enmascarado         4111 **** **** 1111 │
│  Cifrado (hex)                      │
│  ┌───────────────────────────────┐  │
│  │ 9a3f...  (monoespaciado,      │  │  ← debe ser idéntico en las 4
│  │           con corte de línea) │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

- Labels exactos: `Número`, `Validar y cifrar`, `Marca`, `Enmascarado`, `Cifrado (hex)`.
- El hex va en **fuente monoespaciada** y debe poder compararse a simple vista contra las
  otras tres pantallas: es el punto de la demo.
- El nonce es fijo a propósito para que las cuatro produzcan el mismo hex. En producción eso
  sería catastrófico; ver `contracts/README.md`.

### 4. Benchmark

```
┌─────────────────────────────────────┐
│  Benchmark                          │
│  Core vs. implementación nativa     │
├─────────────────────────────────────┤
│  Iteraciones  [ 1000           ]    │
│                                     │
│           [  Ejecutar  ]            │
│                                     │
│              p50        p95         │
│  Core        0.8 µs     1.2 µs      │
│  Nativa      0.3 µs     0.5 µs      │
│                                     │
│  ⚠ La baseline nativa diverge en    │
│    centavos: existe para exhibirlo. │
└─────────────────────────────────────┘
```

- Labels exactos: `Iteraciones`, `Ejecutar`, `p50`, `p95`, `Core`, `Nativa`.
- **Es la única pantalla donde las llamadas al core van fuera del hilo principal.** En el
  resto son síncronas y de microsegundos: meterlas en corrutinas/tasks es ruido.
- La implementación "nativa" del benchmark es **la única excepción permitida** a la regla de
  cero lógica de negocio fuera de `rust-core`, y debe llevar un comentario que lo diga.

### 5. Pie: `coreVersion()`

No es una pantalla aparte: es la franja inferior de las otras cuatro. Muestra el string tal
como lo devuelve el core, **sin reformatear**. Cuatro pantallas con el mismo string = mismo
build.

---

## Componentes compartidos por app

Cada app extrae los suyos, con **la misma descomposición** para que las pantallas sean
comparables:

| Componente | Qué hace |
|---|---|
| `ScreenHeader(title, subtitle)` | la cabecera de las cuatro pantallas |
| `LabeledField(label, value, onChange)` | campo de texto con label a la izquierda |
| `ResultRow(label, value)` | fila `etiqueta ......... valor` del bloque de resultado |
| `SectionDivider(title)` | los separadores `─── Resultado ───` |
| `CoreVersionFooter()` | el pie |

Convención de firma, tomada de la práctica de Compose y aplicable a las cuatro: **`modifier`
es el primer parámetro opcional, con los opcionales propios del componente después**.
El componente aporta tipografía y espaciado internos; el padding posicional lo pone quien lo
usa (`modifier` en Compose, el equivalente en cada plataforma). Así el mismo componente
sirve dentro de una lista y dentro de una tarjeta sin variantes.

---

## Formateo: dónde sí y dónde no

El formateo ocurre **solo en el borde de presentación**, nunca antes:

```
core → String → estado → props → widget de texto → [ acá recién: S/, separadores ]
```

- **`S/` y separadores de miles: solo al pintar.** El core ya entregó el valor con la escala
  correcta; el formateador nunca redondea.
- **Los montos de los mensajes de error van CRUDOS**, tal como los devuelve el core. Nada de
  `NumberFormat`/`Intl.NumberFormat` ahí: los formateadores de Android, iOS y el navegador no
  coinciden entre sí y una diferencia rompe la comparación. Ver `contracts/messages.es.json`.
- **El hex del cifrado no se formatea nunca.**
