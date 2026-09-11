# Runbook de la demo

El guion para poner las apps lado a lado y mostrar la tesis de la POC: **la lógica de negocio
se comparte, la UI varía por plataforma.**

La evidencia no es que las apps "funcionen". Es que producen **los mismos strings, carácter por
carácter**, sobre el mismo set de casos — y que ninguna de ellas contiene una sola línea de esa
lógica.

**Estado:** hoy existen **dos** apps, Android e iOS. Cuando existan React Native y Angular, este
archivo se extiende; la estructura ya contempla cuatro columnas.

---

## Lo que se está demostrando, en una frase

> Un núcleo de dominio escrito una sola vez en Rust, consumido por apps nativas que no lo
> reescriben. Si los cuatro números coinciden hasta el último centavo, es porque **son el mismo
> cálculo**, no cuatro implementaciones que se pusieron de acuerdo.

Vale la pena decirlo antes de tocar nada, porque si no la audiencia ve cuatro calculadoras.

---

## Antes de empezar: el chequeo que hay que hacer sí o sí

**Las cuatro apps tienen que correr el mismo build del núcleo.** No es automático: cada
artefacto congela el SHA del commit con el que se construyó. Si alguien regeneró una sola app
después de tocar `rust-core`, los pies no coinciden y la comparación deja de valer.

1. Abrir cada app.
2. Mirar **el pie de cualquier pantalla** — está en las cuatro, no en una pantalla "Acerca de".
3. Verificar que el string sea **idéntico**, por ejemplo `1.0.0+57d8fa4`. Va sin prefijo
   ni reformateo: es lo que devuelve `core_version()` y nada más.

Si no coinciden, regenerar todos los artefactos desde el mismo HEAD antes de seguir. El
procedimiento por plataforma está en [`../rust-core/BUILD.md`](../rust-core/BUILD.md) y en el
`BUILD.md` de cada app.

> **Esto es también un punto de la demo, no solo una precaución.** Ese string sale de
> `core_version()`, una función de Rust, cruzando el FFI hasta un widget de texto nativo en cada
> plataforma. Que se vea el mismo SHA en pantallas distintas es la prueba más simple de que
> abajo hay un solo binario.

### Cómo levantar cada app

| App | Comando | Detalle |
|---|---|---|
| Android | `./gradlew :app:installDebug` desde `apps/android/` | [apps/android/README.md](../apps/android/README.md) |
| iOS | `open ios-rust-test.xcodeproj` desde `apps/ios/` y ⌘R | [apps/ios/README.md](../apps/ios/README.md) |

En iOS, sobre un aparato físico la cuenta de desarrollador es gratuita y **los perfiles vencen
a los 7 días**: si hace más de una semana que no se corre ahí, hay que rehacer el
aprovisionamiento antes de la demo, no durante. El procedimiento está en
[apps/ios/TESTING.md](../apps/ios/TESTING.md).

---

## Acto 1 — Aritmética: el float rompe el dinero

**Es el mejor primer acto porque no necesita explicación.** Todo el mundo ha visto un total
terminar en `.999999`.

| | |
|---|---|
| **Pestaña** | Aritmética |
| **Se tipea** | Operando A `0.1`, Operando B `0.2`, radio `Sumar`, botón `Calcular` |

Lo que sale en **las dos apps**:

| Fila | Valor |
|---|---|
| `Core (Rust · Decimal)` | **`0.30`** |
| `Punto flotante nativo` | **`0.30000000000000004`** |

**Qué decir.** La segunda fila no es un bug de la app: es lo que devuelve `Double` en Kotlin, en
Swift, en JavaScript y en cualquier lenguaje que use IEEE-754. La primera es `rust_decimal`
cruzando el FFI como `String`. **La app no calculó nada** — pidió y mostró.

**El remate está en la escala.** El core no devuelve `0.3`: devuelve `0.30`, con los dos
decimales del contrato. Esa diferencia es la que hace que un saldo sea comparable entre
plataformas sin normalizar nada.

Si hay tiempo, `ar-005` es el caso que más incomoda: `100.00 − 99.99` debe dar **`0.01`** exacto.

---

## Acto 2 — Transferencia: el dinero se conserva

| | |
|---|---|
| **Pestaña** | Transferencia |
| **Se tipea** | Origen `00219100123456789047`, Destino `01122000987654321065`, Monto `100.00` |

Las dos cuentas arrancan en `S/ 5,000.00` (Ana Quispe) y `S/ 1,200.50` (Luis Ramos). Después de
tocar `Transferir`, en **las dos apps**:

| Fila | Valor |
|---|---|
| `Comisión ITF` | `S/ 0.01` |
| `Total debitado` | `S/ 100.01` |
| `Comprobante` | `TRF-9047-1065-10000` |
| Saldo Ana Quispe | `S/ 4,899.99` |
| Saldo Luis Ramos | `S/ 1,300.50` |

**Qué decir.** Sumar los dos saldos finales da exactamente los `S/ 6,200.50` iniciales menos el
ITF. **El dinero se conserva**, y se conserva igual en las dos plataformas porque la resta la
hizo el mismo código.

El comprobante importa más de lo que parece: es un string **derivado** de los datos de entrada.
Que coincida carácter por carácter descarta que cada app lo esté armando por su cuenta.

> **El botón se queda en carga un instante y no hay red.** Esa espera es
> `latencia_simulada_ms` —350 ms—, un campo que devuelve el core. Se hizo así para que la
> pantalla se vea como una app real sin meter un cliente HTTP en una POC de dominio.

### El contraste que conviene provocar

Los dos casos de error salen del contrato, así que los valores son verificables. **Ojo: asumen
la app recién abierta**, sin la transferencia anterior hecha — los saldos se reinician al
cerrarla, no hay persistencia.

**`tr-003`, saldo insuficiente.** Origen `01122000987654321065` (Luis Ramos, `S/ 1,200.50`),
Destino `00219100123456789047`, Monto `10000.00`:

> `Saldo insuficiente: tienes 1200.50 y se necesitan 10000.50.`

**`tr-005`, misma cuenta.** Origen y Destino `00219100123456789047`, Monto `50.00`:

> `La cuenta de origen y la de destino son la misma.`

**Los montos del mensaje van crudos**, sin `S/` ni separadores. No es un descuido: los
formateadores de Android, iOS y el navegador no coinciden entre sí, y una diferencia ahí
rompería la comparación. El texto sale de
[`contracts/messages.es.json`](../contracts/messages.es.json), no de la app.

Y el `10000.50` del primer mensaje tiene su propia gracia: son los `10000.00` más el ITF de
`0.50`. **El error también sabe de comisiones**, porque lo calculó el mismo core.

### El caso que demuestra quién valida

Tipear `0.001` en Monto. **El campo no deja escribir el tercer decimal.**

Eso es un filtro de **texto**, no una validación — la app no parsea ni redondea nada. Quien
rechaza el monto sigue siendo el core, y el caso `tr-007` del contrato lo prueba en las dos
suites de test. El filtro solo existe para que la pantalla se vea bien en la demo.

---

## Acto 3 — Tarjeta: el acto fuerte

**Si solo hay tiempo para un acto, es este.** Es el único donde la audiencia ve la evidencia
directamente, sin intermediarios.

| | |
|---|---|
| **Pestaña** | Tarjeta |
| **Se tipea** | Número `4111111111111111` (el caso `tj-001`), botón `Validar y cifrar` |

En **las dos apps**:

| Fila | Valor |
|---|---|
| `Marca` | `Visa` |
| `Enmascarado` | `4111 **** **** 1111` |
| `Cifrado (hex)` | `bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd` |
| `Descifrado` | `4111111111111111` |

**Qué decir, en este orden.** Primero: los 64 caracteres del hex son idénticos en las dos
pantallas. Segundo: la fila `Descifrado` muestra el número original de vuelta, o sea que **es
cifrado reversible, no un hash** — sin esa fila, un hex no demuestra nada.

### El momento que cierra la demostración

**Copiar el hex de una app y pegarlo en la otra**, en el bloque de abajo (`Descifrar un hex de
otra plataforma`). Sale el número original.

Eso es la tesis en vivo: las dos apps comparten clave, nonce y algoritmo **porque comparten el
core**, no porque alguien copió una implementación. Para hacerlo sin tipear 64 caracteres, el
hex de `tj-002` (Mastercard) es:

```
bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036
```

Pegarlo debe devolver `5555555555554444`.

> **Si alguien pregunta por el nonce fijo, contestar de frente.** Sí, es fijo, y en producción
> eso sería catastrófico: reusar un nonce con ChaCha20-Poly1305 rompe la confidencialidad. Acá
> es deliberado y es la única forma de que las cuatro plataformas produzcan el mismo hex
> comparable. Está documentado en [`contracts/README.md`](../contracts/README.md). **Es mejor
> decirlo antes de que lo pregunten**: demuestra que la decisión fue tomada, no pasada por alto.

### La validación también vive en el core

Tipear `41111` —el caso `tj-006`—. Las dos apps:

> `El número ingresado no tiene la cantidad de dígitos correcta.`

Y `4111111111111112`, que es un número con el último dígito cambiado (`tj-004`):

> `El número ingresado no es válido: no pasa el dígito de control.`

**El campo acepta cualquier dígito.** Quien rechaza es Luhn, en Rust. Por eso la pantalla lleva
el texto de ayuda debajo del campo: sin él, quien hace la demo tiene que adivinar qué tipear
frente a la audiencia, y un rechazo parece un fallo del producto en vez de parte de lo que se
está mostrando.

---

## Acto 4 — Benchmark: la respuesta honesta a la pregunta incómoda

Alguien va a preguntar cuánto cuesta. Esta pantalla contesta con números en vez de opiniones.

| | |
|---|---|
| **Pestaña** | Benchmark |
| **Se tipea** | Iteraciones `1000`, botón `Ejecutar` |

**El core sale más lento que la baseline nativa, y hay que decirlo primero, no esconderlo.**
Cruzar el FFI cuesta. Lo que la pantalla exhibe es que la alternativa rápida **da mal el
resultado** — es la misma aritmética en `Double` del Acto 1.

Medido en un Pixel 6, con el desglose en [apps/android/TESTING.md](../apps/android/TESTING.md):

| | Android (Pixel 6) |
|---|---|
| `coreVersion()` — piso del cruce | 172 µs |
| `add("0.1","0.2")` | 444 µs |
| baseline nativa | 3,7 µs |

**El número que importa es el piso: 172 µs para una función sin argumentos y sin cómputo.** O
sea que el costo es *marshalling*, no Rust. Si cada `String` cuesta ~150 µs, entonces
`172 + 2×150 ≈ 472` contra los 444 medidos: **la aritmética decimal cae dentro del ruido.**

Y 444 µs es el 2,7 % de un frame a 60 Hz, con una o dos llamadas por interacción.

> **iOS todavía no tiene su número**, y conviene decirlo así en vez de improvisar uno. La
> hipótesis es que esté en otro orden de magnitud, porque Android paga JNA —`Structure` con
> reflexión de campos y memoria nativa por llamada, más un cruce extra para liberar el buffer de
> la respuesta— mientras iOS enlaza el `.a` estáticamente y Swift llama la función de C directo.
> **Hipótesis, no resultado.** El estado y la razón por la que falta están en
> [apps/ios/PENDING.md](../apps/ios/PENDING.md).

---

## Las preguntas que van a hacer

| Pregunta | Respuesta corta |
|---|---|
| *¿Por qué no Kotlin Multiplatform?* | KMP comparte también el ViewModel; acá **no hay ViewModel compartido y es deliberado**. Se comparte el dominio y nada más, así cada UI es nativa de su plataforma. La tabla está en [docs/ui-spec.md](ui-spec.md) |
| *¿Y si las apps se copian la lógica y nadie se entera?* | No pueden: `crates/domain` es Rust puro y un `#[uniffi::export]` ahí **no compila**. La frontera la sostiene el compilador, no la disciplina |
| *¿Cómo saben que los valores coinciden de verdad?* | [`contracts/cases.json`](../contracts/cases.json), 28 casos comparados con **igualdad exacta de strings**, nunca con tolerancia numérica. Corre en las dos apps más el propio `rust-core` |
| *¿Los montos son `float` en algún lado?* | En ningún lado, ni en los tests. Van como `String` desde `rust_decimal` hasta el widget de texto; el formateo ocurre solo al pintar. La única excepción es `NativeBaseline`, que existe **para exhibir** el problema |
| *¿Esto sirve para una app real?* | La POC no tiene red, persistencia, ni almacenamiento seguro, y lo dice. Demuestra que **el dominio se comparte**, no que esté lista para producción. Los límites están en el `PENDING.md` de cada app |
| *¿Las tasas son reales?* | No. Tasas, códigos de banco y montos son inventados; los algoritmos sí son internamente consistentes. Ver [contracts/README.md](../contracts/README.md) |

---

## Lo que puede salir mal, y qué hacer

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Los pies muestran SHA distintos | Se regeneró una app y la otra no | **Parar.** La comparación no vale. Regenerar todo desde el mismo HEAD |
| iOS no instala en el aparato | Perfil vencido (cuenta gratuita, 7 días) | `-allowProvisioningUpdates` y confiar el certificado en Ajustes; ver [apps/ios/TESTING.md](../apps/ios/TESTING.md) |
| El hex pegado no descifra | Se pegó con un espacio o en mayúsculas | El campo filtra a `[0-9a-f]`: se descartan en silencio. Volver a copiar |
| Una tecla rechazada queda visible en el campo | Filtro de texto que no invalida la vista | Cosmético, el estado es correcto. Anotado en [apps/ios/PENDING.md](../apps/ios/PENDING.md) |
| El benchmark tarda muchísimo | Se tipearon demasiadas iteraciones | Ambas apps topan en 6 dígitos. Con 999999 la espera es real: usar `1000` |

---

## Orden sugerido, por tiempo disponible

| Tiempo | Actos |
|---|---|
| **2 minutos** | Pies + Acto 3 (Tarjeta, con el copiar-pegar del hex) |
| **5 minutos** | Pies + Acto 1 + Acto 3 |
| **10 minutos** | Los cuatro, en orden |

El Acto 3 nunca se saltea: es el único donde la audiencia verifica con sus propios ojos en vez
de creer en una tabla.
