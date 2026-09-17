# Pendientes transversales

**Lo que no es de ninguna app.** Cada `apps/*/PENDING.md` conserva sólo lo suyo y apunta acá para
lo demás: un tema, un dueño. Antes de este archivo, el mismo pendiente estaba escrito con distintas
palabras en tres lugares, y corregirlo en uno dejaba mintiendo a los otros dos.

Estado al cerrar la **Fase 6, bloque 1** (Android).

---

## 1. El benchmark falta repetirlo en aparato físico — bloquea a iOS y a React Native

Las cifras que hoy se citan no son comparables entre sí, y cada app lo dice por separado:

| App | Qué hay | Qué falta |
|---|---|---|
| Android | 444 µs de estado estacionario, medidos en un **Pixel 6 físico**, APK de debug | los percentiles con APK de **release** — ver [apps/android/TESTING.md](../apps/android/TESTING.md) |
| iOS | 0,33 µs, medidos en un **iPad M1** | repetirlo en un iPhone con iOS 17+ — ver [apps/ios/PENDING.md](../apps/ios/PENDING.md) |
| React Native | medido, pero **no comparable** todavía | ver [apps/react-native/PENDING.md](../apps/react-native/PENDING.md) |
| Angular | ~1,5 µs, con el reloj del navegador cuantizado a ~100 µs | no comparable centavo a centavo, y no lo va a ser — ver [apps/web-angular/PENDING.md](../apps/web-angular/PENDING.md) |

La conclusión cualitativa **sí** se sostiene —iOS enlaza estáticamente y Android paga JNA, y la
brecha es de dos órdenes de magnitud—, pero el cuadro comparativo de cuatro columnas todavía no
existe. Hasta que exista, citar los números uno al lado del otro es sacar conclusiones de
mediciones tomadas con relojes distintos en aparatos distintos.

## 2. No hay CI, en ninguna de las cinco bases de código

Todo se corre a mano. Está anotado en el PENDING de React Native y en el de Angular, y vale igual
para `rust-core`, Android e iOS. Consecuencia concreta, no teórica: **nada obliga a que los cuatro
artefactos salgan del mismo `HEAD`**, que es la precondición del primer paso del
[runbook de demo](demo-runbook.md). Hoy eso lo sostiene una persona acordándose.

El chequeo que habría que automatizar primero está escrito y verificado:
[rust-core/README.md § Comprobar los cuatro artefactos de una vez](../rust-core/README.md#comprobar-los-cuatro-artefactos-de-una-vez).

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
iOS, en la sobrecarga de `ContractMessages`, porque allá los métodos del protocolo son `throws` y
cada ViewModel tiene su propio `catch`; en React Native y Angular, en `userMessage`, con
`console.error`.

> **La duplicación que este arreglo dejó a la vista quedó cerrada.** `userMessage` estaba escrita
> **dos veces**, casi idéntica, en React Native y en Angular, aunque las dos ya compartían
> `packages/contract`; el arreglo hubo que aplicarlo en los dos lugares, que es exactamente el
> modo de fallo de una copia duplicada. Ahora vive en `packages/contract/src/userMessage.ts`, con
> un solo test, y las dos apps la importan del barrel. Android e iOS mantienen su propia versión
> porque son otro lenguaje — lo que comparten es el **texto**, normativo en `docs/ui-spec.md`.

## 4. Divergencias de paridad todavía abiertas

`docs/ui-spec.md` es normativo para las cuatro apps y cambiar un texto obliga a cambiarlo en las
cuatro. Estas quedan abiertas después del bloque 1:

1. **El subtítulo de la pantalla de Tarjeta se autolista.** `docs/ui-spec.md:195` está escrito
   desde la perspectiva de Android, así que en iOS el texto dice «el hex que produjo la app de
   iOS, React Native o Angular» **estando en iOS**.
2. ~~**Con cero iteraciones, iOS sigue mudo.**~~ **Cerrada.** Las cuatro apps explican ahora por
   qué no pasó nada, con el mismo texto —`Ingresa un número de iteraciones mayor que cero.`—, que
   `docs/ui-spec.md` volvió normativo.
3. **Un fallo al descifrar muestra «No se pudo cifrar…».** Esto ya **no** vale desde la v2.4.0 del
   contrato, que separó `Descifrado` de `Cifrado` con mensaje propio. Queda listado para que nadie
   lo reabra: está cerrado.

Cerradas por el bloque 1: el campo `Hex cifrado` de Android, que aceptaba mayúsculas contra su
propia spec; y el silencio de Android con cero iteraciones.

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
- **React Native y Angular** quedan por evaluar con el mismo criterio antes de portar nada.
