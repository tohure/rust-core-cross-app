# app-android

App nativa Android que consume `rust-core`. Su único propósito es demostrar
que la lógica de dominio no vive aquí.

Stack: Kotlin, Jetpack Compose, minSdk 26, AGP con NDK r27+.

## Regla central

**Esta app no contiene ni una sola regla de negocio.** No hay validación de CCI, no hay
algoritmo de Luhn, no hay alícuota de ITF ni fórmulas. Todo eso se pide al core. Si te
descubres escribiendo aritmética sobre montos en Kotlin, estás haciendo lo contrario de lo
que la POC quiere demostrar.

Lo único que esta app hace con los montos es **formatearlos para mostrar**.

## La superficie del core: nueve funciones y cinco Records

Esto es **todo** lo que el core expone después de la Fase 1. No hay cronograma de cuotas,
no hay TCEA y no hay validación de RUC: se recortaron del alcance antes de implementar.
Si algo no está en esta lista, no existe.

Los nombres de abajo se leyeron de los **bindings generados** con
`uniffi-bindgen --language kotlin` (uniffi 0.32), no se dedujeron: uniffi convierte el
`snake_case` de Rust a lowerCamelCase y emite funciones de nivel superior en el paquete
`uniffi.core_financiero`.

```kotlin
@Throws(DomainException::class) fun add(a: String, b: String): String
@Throws(DomainException::class) fun subtract(a: String, b: String): String
@Throws(DomainException::class) fun calculateItf(amount: String): String
@Throws(DomainException::class) fun validateCci(cci: String): ValidCci
@Throws(DomainException::class) fun validateCard(number: String): ValidCard
@Throws(DomainException::class) fun encrypt(text: String, keyHex: String, nonceHex: String): String
@Throws(DomainException::class) fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String): String
@Throws(DomainException::class) fun executeTransfer(accounts: List<Account>, request: TransferRequest): TransferResult
fun coreVersion(): String
```

`coreVersion()` es la única que no lanza.

```kotlin
data class Account(var id: String, var holder: String, var balance: String)
data class TransferRequest(var origin: String, var destination: String, var amount: String)
data class TransferResult(
    var accounts: List<Account>,
    var itfFee: String,
    var totalDebited: String,
    var receipt: String,
    var simulatedLatencyMs: UInt,
)
data class ValidCci(var bankCode: String, var bankName: String, var branch: String, var account: String)
data class ValidCard(var brand: String, var masked: String)
```

Dos detalles que ahorran una tarde:

- **`simulatedLatencyMs` es `kotlin.UInt`, y es el único campo que no es `String`** en toda
  la superficie. Para el `delay` de la pantalla de transferencia:
  `delay(resultado.simulatedLatencyMs.toLong())`.
- **Los identificadores están en inglés; los nombres del contrato, en español.** El enum de
  error se llama `DomainException` en Kotlin (en Swift es `DomainError`) y sus nueve
  subclases son `Length`, `CheckDigit`, `UnknownBank`, `InvalidAmount`, `AccountNotFound`,
  `SameAccount`, `InsufficientFunds`, `Encryption` y `OutOfRange`. `contracts/cases.json`
  los nombra en español (`"Longitud"`, `"DigitoControl"`, …) y **ese mapeo no cruza el
  FFI**: hay que escribirlo, nueve líneas, **en el test golden de `androidTest/`, no en
  producción**, con un `when` exhaustivo usado como expresión y **sin rama `else`**, para
  que una décima variante rompa la compilación en vez de pasar en verde. Ver
  [rust-core/README.md](../../rust-core/README.md).

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el test golden. Si se decide darles pantalla, se agrega **en las cuatro apps a
la vez** — la paridad es la demo.

## Estructura

app/src/main/java/
├── uniffi/core_financiero/  bindings Kotlin generados (NO EDITAR, se regeneran)
│                            uniffi-bindgen los emite acá solo: con
│                            `--out-dir app/src/main/java` crea él mismo el árbol del
│                            paquete `uniffi.core_financiero`. No hace falta moverlos.
└── pe/banco/poc/
    ├── adapter/       CoreFinanciero.kt, la única clase que llama al core
    ├── ui/            Compose: AritmeticaScreen, TransferenciaScreen, TarjetaScreen,
    │                  BenchmarkScreen
    └── format/        MoneyFormatter.kt

`jniLibs/` contiene los `.so` por ABI. Ambos son artefactos generados: nunca los edites a
mano, regenéralos con los comandos de `rust-core/CONTEXT.md`.

## Dependencia obligatoria: JNA

Los bindings Kotlin de uniffi corren sobre **JNA, no JNI**. Sin esto la app compila y
revienta en runtime al primer llamado al core:

```kotlin
implementation("net.java.dev.jna:jna:5.14.0@aar")
```

## Cómo consumir el core

```kotlin
import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.encrypt
import uniffi.core_financiero.executeTransfer

object CoreFinanciero {
    fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult> =
        runCatching { executeTransfer(accounts, request) }

    fun encryptCard(number: String, keyHex: String, nonceHex: String): Result<String> =
        runCatching { encrypt(number, keyHex, nonceHex) }
}
```

El adapter **no traduce los nombres del core**: los reexporta. Una segunda nomenclatura en
Kotlin es una capa que hay que mantener sincronizada a mano y que se desincroniza en la
primera regeneración de bindings.

Reglas de la capa adapter:

1. Los montos viajan como `String` de extremo a extremo. **Nunca los conviertas
   a `Double` ni a `Float`**, en ningún punto, ni siquiera temporalmente.
2. Si necesitas comparar u ordenar montos en la UI, usa `BigDecimal`.
3. Los `DomainException` del core (así lo nombra el binding Kotlin) se mapean a
   mensajes de usuario en la capa de
   UI, no en el adapter. El adapter propaga el error tal cual.
   **`e.message` es diagnóstico, nunca texto de usuario**: uniffi no usa los
   `#[error("...")]` en español del core, arma el mensaje con los campos de la
   variante (`"field=cci, expected=20, received=18"`) y devuelve **string
   vacío** para `CheckDigit` y `SameAccount`, que no tienen campos. Los nueve
   textos de usuario, iguales en las cuatro apps, están en la tabla de
   [rust-core/README.md](../../rust-core/README.md) — "Los mensajes de error en
   español NO cruzan el FFI".
4. Las llamadas al core son síncronas y rápidas (microsegundos). No las metas
   en corrutinas ni en `Dispatchers.IO`, excepto en la pantalla de benchmark.

## El campo de monto acepta 2 decimales como máximo

Requisito de UI, igual en las cuatro apps. El core ya rechaza un monto con más decimales
—`InvalidAmount`, `"MontoInvalido"` en el contrato, caso `tr-007`—, pero **el usuario no
tiene que llegar hasta ahí**: es una demo y la pantalla tiene que verse bien. El límite se
fuerza en el campo, no en el core.

```kotlin
private val MONTO = Regex("""^\d{0,9}(\.\d{0,2})?$""")

OutlinedTextField(
    value = monto,
    onValueChange = { nuevo -> if (MONTO.matches(nuevo)) monto = nuevo },  // filtro de texto
    label = { Text("Monto") },
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    singleLine = true,
)
```

Tres cosas que no son opcionales:

1. **Es un filtro de texto, no una regla de negocio.** No parsea, no redondea, no calcula:
   decide si el string que el usuario acaba de teclear se acepta en el campo. Quien valida
   sigue siendo el core, y `tr-007` sigue probándolo en el golden.
2. **El string viaja al core tal como se tecleó:** punto decimal, sin `S/` y sin
   separadores de miles. Verificado contra el core: `"1,50"`, `"1 000.50"` y `"S/ 100.00"`
   devuelven `InvalidAmount`. El teclado `Decimal` en un dispositivo con locale es-PE puede
   ofrecer coma: el filtro de arriba la descarta, que es justo lo que hay que hacer.
   `NumberFormat` es para **mostrar**, nunca para leer el campo.
3. **La pantalla de Aritmética no lleva este límite.** Ahí el contrato acepta escala libre
   en la entrada (`ar-001` es `"0.1"`); los 2 decimales son normativos solo para la
   transferencia.

## Formateo

```kotlin
NumberFormat.getCurrencyInstance(Locale("es", "PE"))
```

El formatter recibe un `BigDecimal` construido desde el string del core. Su
único trabajo es agregar `S/`, separadores de miles y ubicar la coma decimal.
Nunca redondea: el core ya entregó el valor con la escala correcta.

## Pantallas

Las mismas cinco en las cuatro apps, con los mismos labels y el mismo orden de campos, para
que la comparación lado a lado en la demo sea limpia.

1. **Aritmética.** Dos inputs y una operación. Muestra lado a lado el resultado con el
   tipo de punto flotante nativo de la plataforma y el del core. Los seis casos del
   contrato divergen: `0.1 + 0.2` da `0.30000000000000004` con double y `0.30` con el core.
   Es la única pantalla donde se permite usar el tipo flotante nativo, y existe justamente
   para exhibir el fallo.
2. **Transferencia.** Dos cuentas fake en memoria. Monto, origen, destino. Muestra la
   comisión ITF, el total debitado, el comprobante y los saldos nuevos. La app espera
   `simulatedLatencyMs` antes de pintar, para que parezca una llamada HTTP: **no hay red**.
   Las cuentas se reinician al cerrar la app; sin BD, sin cache.
3. **Tarjeta.** Un número de tarjeta fake. Valida por Luhn, muestra marca y enmascarado, y
   cifra con ChaCha20-Poly1305. El hex resultante debe ser idéntico al de las otras tres
   plataformas — y lo que cifra una descifra cualquier otra.
4. **Benchmark.** Ejecuta el core N veces y reporta p50/p95 contra una implementación
   equivalente nativa que vive solo en el código de test.
5. **Pie de pantalla:** `coreVersion()` visible en todas. En la demo se compara con las
   otras tres apps: mismo string = mismo build.

## Pruebas

`androidTest/` debe incluir un test que lea `contracts/cases.json` y verifique
que cada caso produce el string esperado **exactamente**, con `assertEquals`
sobre strings, no comparación numérica con tolerancia. Ese test es la
evidencia central de la POC: si pasa en las cuatro plataformas, el argumento
está probado.

Es además el primer test de toda la POC que cruza el **borde FFI real**: el golden de
`rust-core` llama a las nueve funciones como funciones Rust ordinarias, así que no prueba
JNA, ni `System.loadLibrary`, ni los símbolos que el `strip` podría haberse comido. Eso lo
prueba recién este.

## Prohibiciones

- No agregues `implementation("...decimal...")` ni ninguna librería de cálculo
  financiero.
- No edites los archivos en `uniffi/core_financiero/` ni en `jniLibs/`.
- No agregues red ni persistencia. Esto es una POC de dominio.
- No uses `Double` para dinero en ningún lugar del código, ni en tests.
