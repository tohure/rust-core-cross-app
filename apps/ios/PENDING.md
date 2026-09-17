# Pendientes conocidos

Lo que esta app **no** hace, y la razón. Está separado del [README](README.md) a propósito: un
README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de aquí bloquea la demo. Son decisiones tomadas, no olvidos.

> **Lo transversal no está acá.** El cuadro comparativo de los cuatro benchmarks, la ausencia
> de CI en las cinco bases de código, el `catch` genérico que muestra texto de diagnóstico como
> mensaje de usuario, las divergencias de paridad abiertas y la regla de que un `Record` de uniffi
> se reemplaza y no se muta viven en
> **[docs/cross-app-pending.md](../../docs/cross-app-pending.md)**. Un tema, un dueño: antes estaban escritos con distintas
> palabras en tres archivos, y corregirlo en uno dejaba mintiendo a los otros dos.


## Correr sobre hardware cuesta dos pasos cada semana

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

### La app es un solo target, y el argumento para partirla vale igual que en Android

Una evaluación técnica de Android marcó como prioridad **Alta** extraer la capa FFI a su propio
módulo, para que la capa de presentación no conozca ni el binario nativo ni los bindings
generados. Aquí la situación es la misma —`ios-rust-test` es un único target que contiene el
`Generated/`, el XCFramework, el adapter y las cuatro pantallas— y los tres beneficios se
trasladan sin cambios: aislamiento, caché de compilación, y que un futuro `androidMain`/`iosMain`
de KMP tenga dónde encajar sin tocar la UI.

Aquí además cerraría el hueco ya anotado en "El seam de `CoreFinanciero` es más débil que en
Android": si `Generated/` y el XCFramework vivieran en otro target, un test de presentación que
intentara llamar al core real **no compilaría**, y la disciplina dejaría de depender de la
revisión.

**Sigue abierto, y ahora es la única de las cuatro apps que no lo resolvió.** `apps/android` lo
hizo en la Fase 6 —nació el módulo Gradle `:core-financiero` con todo el borde FFI, y `:app` dejó
de declarar JNA—, y `apps/react-native` nace con la separación hecha por frontera de paquete.
Las dos sirven de referencia de a qué se parece el resultado.

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

### ~~Dos textos de UI que se corrigen en las cuatro apps a la vez~~ — CERRADOS

Los dos se cerraron, cada uno por su lado:

- **El subtítulo del bloque de pegado se autolistaba.** Cerrado en la Fase 6: el texto normativo
  dejó de enumerar plataformas —`Pega aquí el hex que produjo cualquiera de las otras apps.`—
  porque la lista hay que mantenerla cada vez que se agrega una y el defecto reaparece.
- **Un fallo al descifrar mostraba «No se pudo cifrar los datos de la tarjeta».** Dejó de valer
  con el **contrato v2.4.0**, que separó la variante `Descifrado` de `Cifrado` y le dio mensaje
  propio. Ya no hay un solo texto usado en las dos direcciones.

### ~~El texto rechazado por un filtro puede quedar visible en el campo~~ — ARREGLADO

Los cuatro filtros —monto, número de tarjeta, hex pegado, iteraciones— hacían `return` sin
escribir el estado cuando el regex no matcheaba. Eso convertía el `set` del `Binding` en un
no-op: `@Observable` no invalidaba nada y **SwiftUI no tenía por qué revertir el texto que el
`TextField` ya había pintado**.

Ahora los cuatro **escriben siempre**, reasignando el valor actual cuando rechazan. La mutación
observada se dispara igual y la vista vuelve a leer el valor bueno. La semántica no cambió: se
sigue rechazando la entrada entera, como en las otras tres apps.

**Honestidad sobre la verificación:** esto sigue sin cubrirlo ningún test —los tests de ViewModel
no pasan por un `TextField`— así que lo que se arregló es **el mecanismo que lo causaba**, no una
reproducción observada. Verificarlo pide un dedo sobre la pantalla.

### ~~El benchmark se traga los errores del core~~ — ARREGLADO

`measure()` medía `_ = try? core.add(...)`: con el puente roto habría cronometrado el tiempo de
lanzar la excepción y la pantalla habría mostrado **números rápidos y plausibles** en vez de un
error. En la pantalla cuyos números se citan, eso es exactamente lo que no conviene.

Ahora hay una llamada de prueba **fuera del bucle**, la única que no usa `try?`. Si falla, el
estado vuelve a `—` y muestra el mensaje de usuario, sin medir nada.

**Era una divergencia de las cuatro apps, no un defecto de iOS**: React Native y Angular ya
mostraban el error; Android se lo tragaba igual que ésta, y se arregló en el mismo cambio. El
test que lo fija es `aBrokenBridgeShowsTheErrorAndNotANumber`, en las dos.

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
