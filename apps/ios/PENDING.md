# Pendientes conocidos

Lo que esta app **no** hace, y la razón. Está separado del [README](README.md) a propósito: un
README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de aquí bloquea la demo. Son decisiones tomadas, no olvidos.

## Lo que falta medir

### El benchmark está medido en un iPad, y hay que repetirlo en un iPhone

**Es el pendiente con fecha de vencimiento de esta app.** El número existe y es contundente,
pero se tomó en un aparato que no es comparable con el de Android.

Medido en un **iPad Air (5.ª gen, M1)** con iPadOS 26.6.1, n = 1000, artefacto
`1.0.0+b719da3`. Android está medido en un **Pixel 6**, o sea un teléfono:

| Llamada | iOS (iPad Air 5, M1) | Android (Pixel 6) |
|---|---|---|
| `coreVersion()` — piso del cruce | **0,33 µs** | 172 µs |
| `add("0.1","0.2")` | **1,58 µs** | 444 µs |
| baseline nativa | **0,38 µs** | 3,7 µs |

**Qué hay que hacer:** repetir la medición en un iPhone con **iOS 17 o superior** y reemplazar
la tabla de [TESTING.md](TESTING.md), que hoy está marcada como provisional. El procedimiento
—el test temporal, el comando y el aparato— está ahí documentado.

**Por qué no se hizo ya:** no hay un teléfono disponible que llegue al deployment target. El
iPhone que hay está en **iOS 16.5**, por debajo de 17.0, así que la app ni siquiera instala. Y
bajar el target no es una salida: `@Observable` **es** iOS 17, así que bajarlo significa
reescribir los cuatro ViewModels a `ObservableObject`.

**Qué tan mal está el número mientras tanto.** La brecha del piso del cruce es de **521×**, y
entre un M1 y un Pixel 6 hay 2× o 3×, no 521×. Aunque se castigara al número de iOS
multiplicándolo por diez, seguiría siendo dos órdenes de magnitud más barato. O sea: **la
conclusión no debería moverse; las cifras exactas sí.** Por eso la tabla se publica con la
salvedad escrita al lado en vez de guardarse — pero no se cita como definitiva.

### Correr sobre hardware cuesta dos pasos cada semana

La cuenta de desarrollador es **gratuita**, así que los perfiles de aprovisionamiento **vencen
a los 7 días**. Volver a correr en el aparato después de eso pide:

1. `-allowProvisioningUpdates` en el `xcodebuild test`, que regenera el perfil.
2. Confiar el certificado **en el aparato**: *Ajustes → General → VPN y Gestión de Dispositivos
   → APP DE DESARROLLADOR → Confiar*. Solo hace falta la primera vez por certificado.

Los mensajes de error exactos de los dos, en [TESTING.md](TESTING.md).

## Deuda técnica medible

### El seam de `CoreFinanciero` es más débil que en Android

Aquí **no hay dos suites**. Android separa tests de JVM (con `FakeCoreFinanciero`, sin poder
cargar la `.so`) de tests instrumentados (que sí cruzan el FFI), y esa separación es forzada
por la plataforma. En iOS los tres niveles —unitarios, de contrato y de ViewModel— corren en
el mismo bundle, porque no hay nada que separar: el core está enlazado
estáticamente y disponible siempre.

La consecuencia es que **nada obliga a que el seam exista**. En Android, un test de JVM que
intente tocar el core real falla al cargar la librería; aquí compila y pasa. La disciplina de
inyectar `CoreFinanciero` la sostiene la revisión, no el compilador.

### Dos huecos conocidos de `MoneyFormatter`, verificados contra Kotlin

El formateador reproduce la gramática de `BigDecimal` para las entradas alcanzables, pero hay
dos donde diverge de Android. Ninguna la produce el core:

- `"0e1"` / `"0e5"` / `"00e3"` → devuelve ceros padeados (`"S/ 00"`) donde Kotlin da `"S/ 0"`.
  Java colapsa coeficiente cero con escala negativa; Swift no.
- Un exponente enorme pero parseable como `Int` (`"1e2147483648"`) intenta un
  `String(repeating:count:)` gigante en vez del passthrough que daría Kotlin, cuyo exponente
  es de 32 bits.

Se dejan anotados en vez de corregidos porque el core nunca emite notación científica: entran
solo si alguien teclea eso a mano en un campo. El comentario del código ya está acotado a lo
que de verdad se verificó y nombra los dos huecos.

### El `catch` genérico guarda texto de diagnóstico como mensaje de usuario

Los cuatro ViewModels terminan su `do/catch` con una rama `catch { state.error = "\(error)" }`,
que contradice la regla de que el error se guarda **ya traducido**.

Se dejó a propósito, y la razón es de paridad, no de pereza: **Android hace exactamente lo
mismo** —`apps/android/.../ui/arithmetic/ArithmeticViewModel.kt:74` es
`(e as? DomainException)?.let(messages::userMessage) ?: e.toString()`— y la rama es
**inalcanzable**, porque el adapter solo propaga `DomainError` desde el core. Cambiar iOS solo
introduciría una asimetría con el consumidor ya mergeado sin ningún beneficio alcanzable;
cambiar los dos es una decisión de cuatro apps que no le toca a la Fase 3.

### Dos textos de UI que se corrigen en las cuatro apps a la vez, no aquí

Un label se cambia en [`docs/ui-spec.md`](../../docs/ui-spec.md) y en las cuatro apps, **en el
mismo cambio**. Estos dos están mal y se corrigen cuando exista la tercera app:

- El subtítulo del bloque de pegado de la pantalla de Tarjeta dice *"Pega aquí el hex que
  produjo la app de iOS, React Native o Angular…"* — estando parado en la propia app de iOS.
  `docs/ui-spec.md:195` lo escribió desde la perspectiva de Android.
- Un fallo al **descifrar** muestra *"No se pudo cifrar los datos de la tarjeta."* El core
  tiene un solo mensaje para la variante `Cifrado` y lo usa en las dos direcciones, así que
  el texto viene de `contracts/messages.es.json` y es normativo tal cual. Corregirlo es tocar
  el contrato, o sea las cinco bases de código.

### El texto rechazado por un filtro puede quedar visible en el campo

Los cuatro filtros de texto —monto, número de tarjeta, hex pegado, iteraciones— hacen `return`
sin escribir el estado cuando el regex no matchea. Eso convierte el `set` del `Binding` en un
no-op, `@Observable` no dispara invalidación, y **SwiftUI no tiene por qué revertir el texto
que el `TextField` ya pintó**: la tecla rechazada puede quedar a la vista hasta que otro cambio
fuerce a releer el binding.

El estado es correcto en todos los casos —lo que viaja al core es el string filtrado—, así que
es cosmético. Pero no lo cubre ningún test: los tests de ViewModel no pasan por un `TextField`.
**Se verifica con un dedo, no con la suite**, y es lo primero que conviene tocar antes de una
demo.

### El benchmark se traga los errores del core

`measure()` mide `_ = try? core.add(a: "0.1", b: "0.2")`. Si el puente estuviera roto, la
pantalla mostraría números rápidos y plausibles —el tiempo que tarda en lanzar la excepción—
en vez de un error. En la pantalla cuyos números se citan, eso es exactamente lo que no
conviene. Se cierra con una llamada de prueba fuera del bucle antes de medir.

### Detalles menores

- El `guard n > 0` de `BenchmarkViewModel.run()` **es load-bearing** y la dependencia está
  documentada en [CONTEXT.md](CONTEXT.md), no impuesta por el tipo: `measure()` calcula el
  índice como `min(max(Int(Double(n) * p), 0), n - 1)`, que con `n == 0` da −1. Lo correcto
  sería que `measure` no pudiera recibir un `n` inválido.
- Ningún test aserta que `isLoading` / `isRunning` llegue a ser `true` **durante** la
  operación; solo que vuelve a `false` al terminar. Un ViewModel que nunca lo prendiera
  pasaría igual.
- El estado no sobrevive a que el sistema descarte la escena: cada `View` crea su
  `@Observable` con `@State` y no hay `SceneStorage`. No afecta la demo.

## Fuera de alcance por diseño

Esto **no** son pendientes: son cosas que la POC decidió no hacer.

- Persistencia, red, runtime async, animaciones e i18n más allá del español.
- **Keychain, biométricos y almacenamiento seguro.** La pantalla de Tarjeta invita a pedirlo,
  así que conviene ser explícito: la POC demuestra que **el algoritmo de cifrado** vive en el
  core y produce el mismo resultado en las cuatro plataformas. Dónde guardarías una clave en
  una app real es otro problema, y no está aquí. El nonce fijo de la demo sería catastrófico
  en producción; ver [`contracts/README.md`](../../contracts/README.md).
- **Layout específico de iPad.** La app corre ahí, pero no está diseñada para esa pantalla.
- **Librería de navegación.** Cuatro pestañas sin back stack, argumentos ni deep links: un
  `TabView` con `.tabItem` alcanza.
- **Swift Package Manager para el core.** El XCFramework se referencia directo desde el
  proyecto; empaquetarlo agregaría una capa que nadie consume.
- **Tests de UI (XCUITest).** No hay driver de automatización en este entorno y la cobertura
  de las pantallas vive en los 22 tests de ViewModel. Lo que eso deja sin cubrir está dicho
  arriba, en el filtro de texto.
