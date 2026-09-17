# Pendientes conocidos

Lo que esta app **no** hace, y la razón. Está separado del [README](README.md) a propósito: un
README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de aquí bloquea la demo. Son decisiones tomadas, no olvidos.

> **Qué es este archivo, para no leerlo mal.** Es un registro de **decisiones tomadas y huecos
> conocidos**, no una lista de tareas. Buena parte de lo que hay aquí está cerrado o se decidió
> no hacer, y sigue escrito a propósito: **el valor está en el porqué**, que es lo que evita que
> alguien reabra la discusión dentro de seis meses o "arregle" algo que es deliberado. Que el
> archivo se llame `PENDING.md` no significa que todo lo de adentro esté pendiente.
>
> **Lo que sigue genuinamente abierto, al 2026-09-17:**
>
> - **El seam de `CoreFinanciero` es más débil que en Android** — y **sigue abierto aunque el
>   split en dos targets ya esté hecho**. Ningún split lo cierra; en Android lo cierra el
>   runtime, no el compilador. Es el ítem que más importa de este archivo.
> - **Dos huecos conocidos de `MoneyFormatter`** — divergencias reales con Kotlin, en entradas
>   que el core nunca emite.
> - **Detalles menores** — la lista del final.

> **Lo transversal no está aquí.** El cuadro comparativo de los cuatro benchmarks, la ausencia
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

**Esto sigue valiendo igual después del split de targets**, y conviene decirlo sin rodeos
porque es fácil asumir lo contrario: partir la app en `CoreFinancieroKit` + `ios-rust-test` no
le da a iOS un mecanismo equivalente al de Android. El argumento completo —por qué el split no
lo cierra, y la corrección de la premisa con la que se abrió este pendiente— está en el ítem
cerrado "~~La app es un solo target...~~" más abajo.

### ~~La app es un solo target, y el argumento para partirla vale igual que en Android~~ — CERRADO

Nació el target **`CoreFinancieroKit`** (plan `2026-09-17-ios-target-split`, commit `92b8b3c`):
un framework **estático** (`MACH_O_TYPE = staticlib`) que se lleva `Generated/`, `Adapter/` y
`Contract/`; `ios-rust-test` queda con `UI/`, `Format/`, `AppContainer` y el `App` de SwiftUI, y
consume el kit con `import CoreFinancieroKit`. No hizo falta ningún plan B del enlace: el
XCFramework quedó resuelto para los dos targets a la primera —el kit lo enlaza para ver el
modulemap de `core_financieroFFI`, la app para el enlace final del binario—, verificado en
simulador y **sobre el iPhone 12 físico** (UDID `00008101-001368940EC2001E`): **54 tests en 13
suites**, el mismo conteo que antes del split. El detalle de qué se lleva cada target vive en
[BUILD.md](BUILD.md) → "La estructura de targets".

**Corrección de la premisa con la que se abrió este ítem, que es la parte que no se puede
omitir.** El texto original decía que partir el target cerraría también el hueco de "El seam de
`CoreFinanciero` es más débil que en Android", porque un test de presentación que llamara al
core real "no compilaría" si `Generated/` y el XCFramework vivieran en otro target. **Es falso**,
y la ejecución del split lo mostró: el bundle de tests (`ios-rust-testTests`) hostea **dentro del
target de la app**, la app enlaza `CoreFinancieroKit` igual que antes enlazaba el XCFramework
directo, y los tests de ViewModel —que usan `FakeCoreFinanciero`, no el core real— de todos
modos tienen que hacer `import CoreFinancieroKit`, porque ahí viven `ContractMessages`,
`ValidCci` y `DomainError`: los tipos con los que se arma el doble y se comparan los errores. No
existe ningún test, real o hipotético, para el que `CoreFinancieroKit` no esté disponible — la
app siempre lo enlaza, así que el bundle de tests siempre lo tiene disponible para importar.
En Android el seam lo cierra el **runtime** —la JVM de un test de `:app` no puede cargar la
`.so`, aunque quisiera—, no el compilador; iOS no tiene ese mecanismo porque el core se enlaza
estáticamente, y partir el target no lo introduce. Por eso "El seam de `CoreFinanciero` es más
débil que en Android" (arriba) **sigue abierto** pese a que este ítem ya se cerró: son dos
beneficios distintos, y el split solo entregó el primero —aislamiento del binario nativo y de
los bindings generados frente a la capa de presentación, caché de compilación por target, y un
lugar natural para un futuro `androidMain`/`iosMain` de KMP—, no el segundo.

Con este cierre, iOS deja de ser la única de las cuatro apps sin resolverlo: `apps/android` lo
hizo en la Fase 6 —nació el módulo Gradle `:core-financiero` con todo el borde FFI, y `:app` dejó
de declarar JNA—, y `apps/react-native` nace con la separación hecha por frontera de paquete.

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

- Persistencia, red, runtime async, animaciones e i18n más allí del español.
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
