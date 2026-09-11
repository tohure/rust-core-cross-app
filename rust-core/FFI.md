# Qué cruza el FFI y qué no

**Este archivo es de lectura obligatoria antes de escribir una app consumidora.** Los
CONTEXT de las cuatro apps apuntan acá.

uniffi hace cruzar las nueve funciones, los cinco `Record` y las nueve variantes de
`DomainError`. Hay **dos cosas que no cruzan**, y las dos hay que reimplementarlas en cada
app: el mapeo de variante a nombre del contrato, y los mensajes de error en español.

Que no crucen no es un descuido de uniffi: son un método de Rust y unos atributos de
`thiserror`, y ninguna de las dos cosas es parte del modelo de datos que uniffi serializa.

## Cada app necesita su propio mapeo variante → nombre del contrato

`DomainError::contract_name()` es un método de Rust y **no cruza el FFI**. En Kotlin y en
Swift el enum generado trae solo los nombres en inglés (`SameAccount`, `CheckDigit`,
`InsufficientFunds`), mientras `contracts/cases.json` compara contra los nombres en español
(`"MismaCuenta"`, `"DigitoControl"`, `"SaldoInsuficiente"`). Verificado sobre los bindings
generados: los nueve nombres del contrato aparecen **0 veces** en el `.kt` y 0 veces en el
`.swift`, y `contract_name` tampoco cruza.

```bash
for n in Longitud DigitoControl BancoDesconocido MontoInvalido CuentaNoEncontrada \
         MismaCuenta SaldoInsuficiente Cifrado FueraDeRango; do
  k=$(grep -c "$n" target/bindings-smoke/kotlin/uniffi/core_financiero/core_financiero.kt)
  s=$(grep -c "$n" target/bindings-smoke/swift/core_financiero.swift)
  printf "%-20s kotlin:%s swift:%s\n" "$n" "$k" "$s"
done
```

Qué se debe ver — `kotlin:0 swift:0` en las nueve líneas.

Consecuencia práctica, y es lo primero que va a chocar en la Fase 2: **cada app va a
escribir esas nueve líneas de mapeo variante → nombre del contrato.** Y van en código de
producción, no solo en el test: `contracts/messages.es.json` indexa los mensajes de usuario
por el nombre del contrato, así que la pantalla de error necesita ese mapeo tanto como el
test de contrato.

Se escribe **una vez** y el test de contrato reusa ese mismo, en vez de tener el suyo. Compartirlo es
más fuerte que duplicarlo: así el test de contrato verifica contra `cases.json` el mapeo que la UI usa
de verdad, y no una copia que puede divergir de ella en silencio. Esa es exactamente la
garantía que el contrato compartido existe para dar.

**Ese mapeo va exhaustivo y sin rama por defecto.** El `when` de Kotlin sobre la
`sealed class DomainException` y el `switch` de Swift sobre el `enum DomainError` cubren las
nueve variantes **una por una, sin `else` y sin `default`** — y en Kotlin el `when` tiene que
ser una *expresión* (asignada o devuelta), porque solo así el compilador exige exhaustividad.
La razón es lo que pasa cuando el core crece: agregar una décima variante tiene que **romper
la compilación de las cuatro apps**, que es un fallo ruidoso y ubicado, en vez de caer en
un `"Desconocido"` que compila, pasa en verde y solo se descubre el día de la demo, cuando
una app muestra un error que las otras tres no. En TypeScript no hay exhaustividad del
compilador de por sí: se consigue con un `default` que asigne a `never`
(`const _exhaustive: never = variante`), que es la forma de que `tsc` falle igual.

## Los mensajes de error en español NO cruzan el FFI

Es el segundo agujero de la misma familia que el anterior, y es peor porque no se ve. Los
nueve `#[error("...")]` de `crates/ffi/src/lib.rs` están en español y **no llegan a ninguna
app**: uniffi no usa el `Display` de `thiserror`, arma el mensaje él mismo a partir de los
campos de la variante. Verificado sobre los bindings generados:

```bash
for m in "longitud inválida" "dígito de control inválido" "banco no reconocido" \
         "monto inválido" "cuenta no encontrada" "origen y destino" \
         "saldo insuficiente" "error de cifrado" "parámetro fuera de rango"; do
  printf "%-32s %s\n" "$m" \
    "$(grep -c "$m" target/bindings-smoke/kotlin/uniffi/core_financiero/core_financiero.kt)"
done
```

Qué se debe ver — **`0` en las nueve líneas**. Lo que el binding Kotlin genera en su lugar
se lee con
`sed -n '/sealed class DomainException/,/^}/p' target/bindings-smoke/kotlin/uniffi/core_financiero/core_financiero.kt`,
y es esto (mismo texto, con los saltos de línea de uniffi colapsados):

```kotlin
class Length(val `field`: kotlin.String, val `expected`: kotlin.UInt, val `received`: kotlin.UInt) : DomainException() {
    override val message get() = "field=${ `field` }, expected=${ `expected` }, received=${ `received` }"
}
class CheckDigit() : DomainException() {
    override val message get() = ""
}
```

O sea: `e.message` es un volcado de campos en inglés, y para las dos variantes **sin campos**
—`CheckDigit` y `SameAccount`— es **el string vacío**. `CheckDigit` es el error más frecuente
de las pantallas de validación de CCI y de tarjeta: una app que muestre `e.message` va a
mostrar un cuadro de error en blanco.

Y no es que Swift arregle nada: ahí el binding define
`errorDescription = String(reflecting: self)`, o sea la representación de **debug** del enum,
que además es distinta de la de Kotlin. Se comprueba recortando el enum generado y
ejecutándolo tal cual, sin Xcode ni FFI de por medio:

```bash
{ echo 'import Foundation'
  sed -n '/^enum DomainError/,/^}$/p' target/bindings-smoke/swift/core_financiero.swift
  echo 'print("CheckDigit ->", (DomainError.CheckDigit as Error).localizedDescription)'
  echo 'print("Length     ->", (DomainError.Length(field: "cci", expected: 20, received: 18) as Error).localizedDescription)'
} > /tmp/DomainErrorProbe.swift
swift /tmp/DomainErrorProbe.swift
```

Qué se debe ver — el nombre del tipo, no una frase; el prefijo es el nombre del módulo
Swift, que en la app va a ser el suyo:

```
CheckDigit -> DomainErrorProbe.DomainError.CheckDigit
Length     -> DomainErrorProbe.DomainError.Length(field: "cci", expected: 20, received: 18)
```

Nótese que Kotlin y Swift no coinciden **ni siquiera en el diagnóstico**: para `Length`,
Kotlin da `field=cci, expected=20, received=18` y Swift da el volcado del enum. Dos apps que
muestren `message` van a mostrar dos cosas distintas.

**Regla, entonces: `e.message` / `errorDescription` es diagnóstico —para el log y el
stacktrace—, nunca texto de usuario.** Si cada app redacta su propio texto, las cuatro
pantallas de error no van a coincidir puestas lado a lado, y las pantallas de error son la
única parte del sistema donde la paridad no la garantiza `cases.json`: el contrato comparte
los **nombres** de las variantes, no sus **mensajes**.

### La tabla que las cuatro apps copian

Estos nueve strings son normativos igual que los labels de las pantallas: si se cambia uno,
se cambia en las cuatro apps. Están derivados de los `#[error(...)]` del core, pero
reescritos como texto de usuario — el `#[error]` es un diagnóstico para quien lee un log.

**Y ya no se copian a mano: viven en [`contracts/messages.es.json`](../contracts/messages.es.json)**,
que las cuatro apps leen igual que `cases.json`, indexados por el nombre del contrato
(`Longitud`, `DigitoControl`, …) en vez de por el de la variante. Los dos textos son el
mismo y no pueden divergir: si se cambia uno, se cambia el otro. La guardia está en el
test de contrato —`the_messages_file_covers_the_nine_error_variants`— y el porqué del archivo, en
[contracts/README.md](../contracts/README.md).

| Variante | Mensaje de usuario |
|---|---|
| `Length` | `El número ingresado no tiene la cantidad de dígitos correcta.` |
| `CheckDigit` | `El número ingresado no es válido: no pasa el dígito de control.` |
| `UnknownBank` | `No reconocemos el banco del código {code}.` |
| `InvalidAmount` | `El monto ingresado no es válido.` |
| `AccountNotFound` | `No encontramos la cuenta {id}.` |
| `SameAccount` | `La cuenta de origen y la de destino son la misma.` |
| `InsufficientFunds` | `Saldo insuficiente: tenés {available} y se necesitan {required}.` |
| `Encryption` | `No se pudo cifrar los datos de la tarjeta.` |
| `OutOfRange` | `El valor de {field} está fuera del rango permitido.` |

Cuatro detalles que hacen la diferencia entre que esto funcione y que no:

1. **Los cuatro placeholders se interpolan crudos, tal como los devuelve el core.** Los
   montos de `InsufficientFunds` **no** pasan por `NumberFormat` / `Intl.NumberFormat` acá:
   los formateadores de moneda de Android, iOS y el navegador no coinciden entre sí (`S/`,
   `S/.`, `PEN`, separador de miles), y una diferencia ahí rompe la comparación carácter por
   carácter que es toda la tesis. El formateo de moneda se queda en las pantallas de montos,
   no en los mensajes de error.
2. **`Length` no nombra un número a propósito.** El campo `expected` vale
   `TYPICAL_LENGTH = 16` para `tarjeta`, pero el rango real que el core acepta es 13-19 (una
   Amex válida tiene 15). Decir "se esperaban 16 dígitos" sería mentir en el caso de Amex, así
   que el mensaje de usuario no promete ninguna cantidad. `expected` y `received` siguen
   estando en el objeto de error, para el log.
3. **`Encryption` y `OutOfRange` no tienen caso en `cases.json`**, así que ningún test de contrato los
   compara: para estos dos, esta tabla es la única fuente de verdad que existe.
4. **`{field}` de `OutOfRange` llega en español desde el core** (`"marca"`, `"monto"`), igual
   que `{code}` e `{id}`. No hay que traducirlo.
