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

## 3. El `catch` genérico guarda texto de diagnóstico como mensaje de usuario

En las cuatro apps, el camino de error tiene un fallback que, ante un `Throwable` que no es del
dominio, termina mostrando el texto de la excepción en pantalla.

**En Android el fallback `?: e.toString()` NO se dispara para un `DomainException`:**
`ContractMessages` cubre las diez variantes con un `when` exhaustivo, así que ese camino es para
cualquier *otro* `Throwable` — en la práctica, una excepción de JNA. O sea que el riesgo no es
«un error de negocio se ve feo», es «un fallo de carga de la librería se muestra como si fuera un
mensaje para el usuario».

Ver [apps/ios/PENDING.md](../apps/ios/PENDING.md) para la versión de iOS, que es la misma forma.

## 4. Divergencias de paridad todavía abiertas

`docs/ui-spec.md` es normativo para las cuatro apps y cambiar un texto obliga a cambiarlo en las
cuatro. Estas quedan abiertas después del bloque 1:

1. **El subtítulo de la pantalla de Tarjeta se autolista.** `docs/ui-spec.md:195` está escrito
   desde la perspectiva de Android, así que en iOS el texto dice «el hex que produjo la app de
   iOS, React Native o Angular» **estando en iOS**.
2. **Con cero iteraciones, iOS sigue mudo.** `BenchmarkViewModel.swift` hace
   `guard let n = Int(state.iterations), n > 0 else { return }`. Android tenía el mismo defecto y
   lo cerró en la Fase 6; React Native y Angular ya explicaban. **iOS es la única de las cuatro
   que no dice nada**, y el texto normativo es `Ingresa un número de iteraciones mayor que cero.`
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

**Android ya tiene la guardia** (`UniffiRecordsAreNotMutatedTest`): deriva los campos del propio
binding generado y falla nombrando archivo y línea. **Las otras tres no.** Portarla es trabajo de
sus fases.
