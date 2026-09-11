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

**La pantalla que demuestra la capacidad criptográfica del core.** Hace tres cosas, y las tres
importan: valida por Luhn, cifra, y **descifra**.

```
┌─────────────────────────────────────┐
│  Tarjeta                            │
│  Luhn y cifrado ChaCha20-Poly1305   │
├─────────────────────────────────────┤
│  Número       [ 4111111111111111 ]  │
│  Probá 4111111111111111 (Visa) o    │  ← ayuda: sin esto nadie sabe qué tipear
│  5555555555554444 (Mastercard).     │
│  Un número inválido lo rechaza el   │
│  core, no esta pantalla.            │
│                                     │
│           [  Validar y cifrar  ]    │
│                                     │
│  ─── Resultado ──────────────────   │
│  Marca               Visa           │
│  Enmascarado         4111 **** **** 1111 │
│  Cifrado (hex)                      │
│  ┌───────────────────────────────┐  │
│  │ bdca39311826947186b20ec2a92c  │  │  ← monoespaciado, con corte de línea
│  │ 3f521aacff902e37d519bcd2754f  │  │
│  │ c7c7c0dd                      │  │
│  └───────────────────────────────┘  │
│  Descifrado       4111111111111111  │  ← la vuelta completa
│  El mismo número salió de vuelta:   │
│  es cifrado reversible, no un hash. │
│                                     │
│  ─── Descifrar un hex de otra ───   │
│      plataforma                     │
│  Pegá acá el hex que produjo la app │
│  de iOS, React Native o Angular…    │
│  Hex cifrado  [ bcce3d351c2290… ]   │
│           [  Descifrar  ]           │
│  Número recuperado 5555555555554444 │
└─────────────────────────────────────┘
```

- Labels exactos: `Número`, `Validar y cifrar`, `Resultado`, `Marca`, `Enmascarado`,
  `Cifrado (hex)`, `Descifrado`, `Descifrar un hex de otra plataforma`, `Hex cifrado`,
  `Descifrar`, `Número recuperado`.
- **El texto de ayuda bajo `Número` es obligatorio**, con estas dos líneas exactas:
  `Probá 4111111111111111 (Visa) o 5555555555554444 (Mastercard).` y
  `Un número inválido lo rechaza el core, no esta pantalla.`
  Sin él, la pantalla no dice qué espera: el campo acepta cualquier dígito pero el core
  exige un número que pase Luhn, y quien hace la demo tiene que **adivinarlo frente a la
  audiencia**. Con él, el rechazo deja de parecer un fallo del producto y pasa a ser parte
  de lo que se está demostrando: tipear `41111` —que es el caso `tj-006` del contrato—
  exhibe que **la validación también vive en el core**, no solo la criptografía.
- **La fila `Descifrado` no es decorativa.** Sin ella la pantalla muestra un hex que un
  espectador **no puede distinguir de un hash**. Cifrar y volver a descifrar en el mismo gesto
  es lo único que prueba, mirando, que el core hace criptografía reversible.
- **El bloque de abajo es la demostración en vivo de la tesis.** Se copia el hex de una app y
  se pega en otra: sale el mismo número, porque las cuatro comparten clave, nonce y algoritmo
  desde el mismo core de Rust. Hasta ahora eso solo lo probaba el test de contrato, donde nadie
  lo ve durante una demo.
- El hex va en **fuente monoespaciada** y debe poder compararse a simple vista contra las otras
  tres pantallas.
- **Los dos bloques son independientes y tienen su propio error.** Un fallo al descifrar un hex
  pegado no puede borrar el resultado de cifrar: en la demo los dos están en pantalla a la vez.
- Filtros de texto, **no** validaciones: el campo `Número` acepta solo dígitos y `Hex cifrado`
  solo `[0-9a-f]`. Quien decide si el número pasa Luhn o si el hex es descifrable es el core.
- El nonce es fijo a propósito para que las cuatro produzcan el mismo hex. En producción eso
  sería catastrófico; ver `contracts/README.md`.

**Fuera de alcance, y conviene decirlo porque la pantalla invita a pedirlo:** nada de Keychain,
Keystore, biométricos ni almacenamiento seguro. La POC demuestra que **el algoritmo** vive en el
core y da el mismo resultado en las cuatro plataformas; dónde se guardaría una clave en una app
real es otro problema, y no está acá.

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
│  ─── Resultado ──────────────────   │
│  Core · p50            147.25 µs    │
│  Core · p95            557.67 µs    │
│  Nativa · p50            4.08 µs    │
│  Nativa · p95           34.38 µs    │
│                                     │
│  ⚠ La baseline nativa diverge en    │
│    centavos: existe para exhibirlo. │
└─────────────────────────────────────┘
```

- Labels exactos: `Iteraciones`, `Ejecutar`, `Resultado`, `Core · p50`, `Core · p95`,
  `Nativa · p50`, `Nativa · p95`, y la advertencia completa.
- **Cuatro filas etiqueta–valor, no una tabla de dos ejes.** Se fijó así porque es lo que
  produce el componente compartido `ResultRow(label, value)`, y una tabla 2D obligaría a un
  componente nuevo solo para esta pantalla. Los números del wireframe son los medidos en el
  emulador de Android; cada plataforma mostrará los suyos.
- **El core es más lento que la baseline, y está bien**: cruzar el FFI cuesta. Lo que la
  pantalla exhibe es que la baseline, siendo más rápida, **da mal el resultado**.
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
