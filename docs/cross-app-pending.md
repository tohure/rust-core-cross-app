# Pendientes transversales

**Lo que no es de ninguna app.** Cada `apps/*/PENDING.md` conserva sólo lo suyo y apunta aquí para
lo demás: un tema, un dueño. Antes de este archivo, el mismo pendiente estaba escrito con distintas
palabras en tres lugares, y corregirlo en uno dejaba mintiendo a los otros dos.

Estado al cerrar la **Fase 6, bloque 1** (Android).

---

## 1. El cuadro comparativo de los cuatro puentes — **CERRADO**

Los cuatro consumidores están medidos **con la misma sonda, en release, sobre aparatos físicos y
contra el mismo artefacto `1.0.0+959025f`**. Sonda: 2.000 iteraciones de calentamiento, 20.000
medidas, p50.

| Puente | Aparato | piso `coreVersion()` | `add("0.1","0.2")` | `validateCard` (lanza) | baseline nativa | piso del reloj |
|---|---|---|---|---|---|---|
| Kotlin → **JNA** | Pixel 6 | 47,10 µs | 145,9 µs | 113,1 µs | 2,12 µs | — |
| JS → **JSI** → C++ | Pixel 6 | 4,23 µs | 9,44 µs | 14,89 µs | 1,18 µs | 0,12 µs |
| JS → **JSI** → C++ | iPhone 12 | 2,29 µs | 4,71 µs | 7,58 µs | 0,67 µs | 0,04 µs |
| Swift → **`.a` estático** | iPhone 12 | **0,062 µs** | **0,42 µs** | 3,58 µs | 0,15 µs | 0,04 µs |

Angular queda fuera de la tabla a propósito: corre en una Mac y no en un teléfono, y su reloj está
cuantizado a ~100 µs. Ubica el orden de magnitud —`add` ~1,5 µs— y nada más.

**Las cuatro filas son de la misma campaña de medición, la de la Fase 7, y no se editan de a una.**
Cambiar una sola fila con una corrida posterior rompería lo único que hace comparable la tabla: que
todas salieron de la misma sonda, en los mismos aparatos, en la misma tarde. Las re-mediciones se
anotan debajo.

**Re-medición del 2026-09-17 — la fila de iOS, después de partir la app en dos targets.** Partir
`apps/ios` en `CoreFinancieroKit` + `ios-rust-test` ponía en riesgo el piso de 0,062 µs: con un
framework **dinámico**, cada llamada al core pagaría indirección de `dyld`. Se eligió estático por
eso y se volvió a medir en el mismo iPhone 12, en Release, con la misma sonda:

| | Fase 7 | 2026-09-17 | |
|---|---|---|---|
| piso `coreVersion()` | 0,062 µs | **0,062 µs** | idéntico |
| `add` x1000 | 0,416 µs | 0,410 µs | −1,4 % |
| baseline nativa x1000 | 0,148 µs | 0,146 µs | −1,4 % |
| `validateCard` p50 | 3,58 µs | 3,42 µs | −4,5 % |

**La fila que hace concluyente esto es la baseline, no el piso.** No cruza el FFI —es aritmética de
`Double` en Swift—, así que el split no puede haberla afectado por ningún mecanismo, y se movió
exactamente lo mismo que `add`. Eso identifica la variación como ruido entre corridas y no como
señal: si el framework hubiera agregado indirección, `add` se habría movido y la baseline no. La
fila de la tabla de arriba **sigue valiendo**. Salida completa en
[apps/ios/README.md](../apps/ios/README.md).

### Lo que la tabla dice, y es más interesante que «iOS gana»

**1. El orden se da vuelta según la plataforma.** En Android, React Native es **15× más barato**
que la app nativa (9,44 contra 145,9 µs en `add`). En iOS es al revés: la app nativa es **11× más
barata** que React Native (0,42 contra 4,71). *No hay un ganador; hay un perdedor, y es JNA.*

**2. La comparación limpia es a aparato fijo.** Las dos filas del Pixel 6 son el mismo teléfono,
el mismo sistema y el mismo núcleo: lo único que cambia es el puente. Lo mismo las dos del
iPhone. Esas dos comparaciones no necesitan ninguna salvedad.

**3. El aparato explica ~1,8×, y está medido, no supuesto.** React Native usa **el mismo puente**
en los dos teléfonos, así que sus dos filas son un control del hardware: 4,23 contra 2,29 µs en el
piso (**1,8×**) y 1,18 contra 0,67 µs en la baseline de JS (**1,76×**). Dos medidas independientes
que coinciden.

Por eso el 760× que sale de dividir las dos puntas de la tabla (47,10 / 0,062) **no se explica
por el teléfono**: de ese factor, ~1,8 es el aparato. El resto es el puente y el runtime.

> **La versión corta para la demo:** «en el mismo teléfono, con el mismo núcleo, cambiar JNA por
> JSI cuesta 15 veces menos; y enlazar estáticamente, otras 11». Es defendible sin asteriscos.

### Por qué JNA es el caro

`Structure` con reflexión de campos y memoria nativa asignada **por llamada**, más un cruce extra
para liberar el `RustBuffer` de la respuesta. JSI llama a C++ directo; Swift llama a la función de
C directo. Todo eso vive en código generado, que no se edita.

### Las tres cosas que esta medición enseñó, y valen para cualquier número futuro

1. **La configuración del build es la variable que más mueve la aguja.** Un APK de debug castiga
   el cruce entre 3 y 4 veces; iOS en Debug lo castiga 6×. Ninguna cifra vale sin decir en qué
   configuración se tomó, y por eso las tres sondas **imprimen esa bandera** —o la configuración—
   en su primera línea. La tabla vieja de 172 / 327 / 444 µs era de debug y se citaba como si no.
2. **El emulador y el simulador mienten, y para el lado optimista.** React Native daba 3,96 µs en
   emulador y da 9,44 en el Pixel 6 físico.
3. **Los números de un instrumento no se citan al lado de los de otro.** La pantalla de Benchmark
   y la sonda no miden lo mismo: la sonda calienta 2.000 iteraciones y la pantalla no, así que la
   pantalla sale más alta y más ruidosa. Comparar sólo dentro de la misma tabla.

## 2. ~~No hay CI~~ — **CERRADO: se decidió no hacerlo**

No es un hueco pendiente: es alcance que se evaluó y se descartó. Queda escrito con el
razonamiento para que nadie lo reabra sin argumentos nuevos.

**El riesgo que el CI iba a cubrir ya está cubierto, y más barato.** Este punto existía porque
«nada obliga a que los cuatro artefactos salgan del mismo `HEAD`», que es la precondición del
primer paso del [runbook de demo](demo-runbook.md). Pero para eso ya están, escritos y
ejecutados, el pie con `core_version()` en las cuatro pantallas y
[el bucle sobre los seis artefactos](../rust-core/README.md#comprobar-los-cuatro-artefactos-de-una-vez).
Son diez segundos antes de la demo. Un CI no agrega nada ahí.

**Y lo que el CI sí agregaría cuesta caro y cubre poco:**

- **Lo que más vale probar es justo lo que un runner no puede correr.** Los tests que cruzan el
  FFI de verdad necesitan aparato: los 21 instrumentados de Android piden emulador —lento— y los
  53 de iOS corren sobre un iPhone, cosa que ningún runner hace. Quedaría un CI que verifica todo
  menos lo que la POC existe para demostrar.
- **Sería el pipeline más caro del proyecto**: runners macOS para Xcode, NDK para Android, Rust
  con cinco targets, Node y pnpm, más `napi:generate` y `wasm:generate` antes de cualquier test
  porque sus salidas están gitignoradas.
- **El CI protege contra regresiones a lo largo del tiempo**, y las ocho fases están cerradas. Si
  el repositorio no se mueve todos los días, no hay contra qué protegerse.

**Un argumento que parecía bueno y no lo es.** Al cerrar la Fase 7 se descubrió que la rama de la
Fase 6 tenía 41 commits que **nunca se habían pusheado**, con todo en verde y sin que nadie se
enterara. Eso se citó como evidencia a favor del CI. No lo es: **el CI corre cuando hay push**, y
una rama que no se pushea es invisible para él. Lo que hacía falta ahí era pushear.

### Si algún día el repositorio vuelve a moverse

El pedazo con buena relación costo/beneficio es **uno solo**: un job de Linux con las cuatro
suites que **no** necesitan aparato —`rust-core` 71, Android JVM 35, React Native 129, Angular
102: 337 tests en un par de minutos— sin macOS ni emuladores. Cazaría un cambio que rompe el
contrato, que es el único tipo de regresión que importa aquí.

Lo que ese job tendría que hacer, como mínimo: instalar Rust con los targets, instalar pnpm,
correr `napi:generate` y `wasm:generate` **antes** de `pnpm test`, y correr `cargo test
--workspace`. Los detalles de por qué el scaffold que venía con `create-react-native-library` no
podía funcionar están en
[apps/react-native/PENDING.md](../apps/react-native/PENDING.md#no-hay-ci-y-el-scaffold-que-simulaba-tenerla-se-borró).

**Lo que no cambiaría ni con ese job: nada de eso cruza JSI**, así que el smoke manual de React
Native seguiría siendo obligatorio antes de una demo.

## 3. ~~El `catch` genérico guarda texto de diagnóstico como mensaje de usuario~~ — CERRADO

**Cerrado en la Fase 6, en las cuatro apps.** Vale dejar escrito cómo estaba, porque durante tres
fases se lo dio por inofensivo con un argumento equivocado.

El PENDING de iOS lo declaraba **inalcanzable**, «porque el adapter sólo propaga `DomainError`
desde el core». Es falso: `runCatching` de Kotlin atrapa **todo `Throwable`**, así que un fallo al
cargar `libcore_financiero.so` o cualquier excepción de JNA vuelve como `Result.failure` por el
mismo camino que un error de negocio. El test rojo que lo demostró mostraba esto, literal, en la
pantalla de Aritmética:

```
java.lang.UnsatisfiedLinkError: dlopen failed: library not found
```

El fallback es ahora `No se pudo completar la operación.`, normativo en
[docs/ui-spec.md](ui-spec.md) e igual en las cuatro. **No dice «vuelve a intentarlo»**: si la
librería nativa no cargó —o si en Angular lo que llegó fue un trap de WebAssembly, que deja la
instancia del módulo inutilizable— reintentar no arregla nada.

El diagnóstico no se tira: se loguea donde cada plataforma tiene **un solo dueño** para hacerlo.
En Android, en `UniffiCoreFinanciero`, porque `runCatching` es el único punto donde se atrapa; en
iOS, en la sobrecarga de `ContractMessages`, porque allí los métodos del protocolo son `throws` y
cada ViewModel tiene su propio `catch`; en React Native y Angular, en `userMessage`, con
`console.error`.

> **La duplicación que este arreglo dejó a la vista quedó cerrada.** `userMessage` estaba escrita
> **dos veces**, casi idéntica, en React Native y en Angular, aunque las dos ya compartían
> `packages/contract`; el arreglo hubo que aplicarlo en los dos lugares, que es exactamente el
> modo de fallo de una copia duplicada. Ahora vive en `packages/contract/src/userMessage.ts`, con
> un solo test, y las dos apps la importan del barrel. Android e iOS mantienen su propia versión
> porque son otro lenguaje — lo que comparten es el **texto**, normativo en `docs/ui-spec.md`.

## 4. ~~Divergencias de paridad~~ — CERRADAS

`docs/ui-spec.md` es normativo para las cuatro apps y cambiar un texto obliga a cambiarlo en las
cuatro. No queda ninguna abierta.

1. **El subtítulo del bloque de pegado.** Cerrado, y el diagnóstico original se quedaba corto.
   Decía que el texto «se autolista en iOS» porque el wireframe estaba escrito desde la
   perspectiva de Android. El primer arreglo hizo que **cada app listara a las otras tres desde su
   propio punto de vista**, lo cual es correcto app por app y **peor en conjunto**: las cuatro
   mostraban cuatro strings distintos en la pantalla que existe justamente para ponerlas lado a
   lado. Ahora las cuatro dicen lo mismo y no nombran plataformas:

   `Pega aquí el hex que produjo cualquiera de las otras apps. Sale el mismo número, porque las cuatro usan el mismo core.`

   De paso iOS recupera la segunda frase, que había perdido en el arreglo anterior.
2. ~~**Con cero iteraciones, iOS sigue mudo.**~~ Cerrada: las cuatro explican por qué no pasó
   nada, con el mismo texto.
3. ~~**Un fallo al descifrar muestra «No se pudo cifrar…».**~~ Cerrada desde la v2.4.0 del
   contrato, que separó `Descifrado` de `Cifrado` con mensaje propio.
4. **El benchmark se tragaba los errores del core.** Aparecida al cerrar las anteriores: React
   Native y Angular mostraban el error, iOS y Android lo descartaban y habrían mostrado números
   rápidos y plausibles con el puente roto. Las cuatro se comportan igual ahora, con un test en
   cada una de las dos que faltaban.

Cerradas antes: el campo `Hex cifrado` de Android, que aceptaba mayúsculas contra su propia spec;
y el silencio de Android con cero iteraciones.

## 5. Un `Record` de uniffi se REEMPLAZA, nunca se muta

Los `Record` que genera uniffi son estructuras con campos mutables en las cuatro plataformas
(`var` en Kotlin, `var` en Swift). Los `UiState` que los contienen se declaran inmutables
—`@Immutable` en Compose— y esa promesa **anula la inferencia del compilador**: si alguien muta un
`Account` en el lugar, el framework no se entera y la pantalla queda mostrando el valor viejo. Es
un riesgo de **corrección**, no de rendimiento.

Las dos salidas obvias están descartadas y no hay que reabrirlas: los tipos son generados y no se
editan, y envolverlos en tipos propios duplicaría el contrato en cuatro lenguajes — que es
exactamente lo que esta POC argumenta que no hay que hacer.

**El riesgo no es igual en las cuatro, y conviene decirlo para no portar una guardia donde no hace
falta:**

- **Android es donde muerde.** Los `Record` son `data class` con `var`, o sea tipos de
  *referencia*: mutar uno en el lugar no cambia la identidad del objeto y Compose no se entera.
  Tiene la guardia desde la Fase 6 —`UniffiRecordsAreNotMutatedTest`, que deriva los campos del
  propio binding y falla nombrando archivo y línea—.
- **iOS no.** Verificado en el generado: `public struct Account: Equatable, Hashable` con campos
  `var`. Son tipos de **valor**, así que mutar una propiedad produce una copia y la asignación al
  estado sí se observa. La regla igual vale como estilo, pero **no hace falta portar la guardia**.
- **React Native y Angular: evaluadas, y el riesgo es real.** Los `Record` generados son objetos
  planos de TypeScript, sin `readonly`, y en JavaScript son tipos de *referencia* igual que en
  Kotlin: mutar `accounts[0].balance` y volver a guardar el mismo array no dispara nada, porque
  React y los signals de Angular comparan con `Object.is`, ven la misma referencia y no vuelven a
  renderizar.

  **Pero no se portó el test de Android, porque en TypeScript hay algo mejor: el tipo.** El estado
  declara las cuentas como `readonly Readonly<Account>[]` —un solo lugar en cada app— y con eso
  **el intento de mutar no compila**. Es una guardia más fuerte que un test y no cuesta nada en
  tiempo de ejecución. Verificado por mutación en las dos: `TS2540: Cannot assign to 'balance'
  because it is a read-only property`.

  La firma generada de `executeTransfer` pide un array mutable, así que las dos apps le pasan una
  copia (`[...accounts]`) en la frontera. No es ceremonia: el core recibe la suya y el estado no
  queda expuesto.

**Resumen, para no volver a preguntarlo:**

| App | Qué sostiene la regla |
|---|---|
| Android | Un test: `UniffiRecordsAreNotMutatedTest`, que deriva los campos del binding y falla nombrando archivo y línea. Kotlin no puede expresarlo en el tipo |
| iOS | Nada, y no hace falta: los `Record` son `struct`, o sea tipos de **valor**. Mutar produce una copia y la asignación al estado sí se observa |
| React Native | **El compilador**, vía `readonly` en el estado |
| Angular | **El compilador**, vía `readonly` en el signal |
