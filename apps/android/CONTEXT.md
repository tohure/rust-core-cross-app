# app-android

App nativa Android que consume `rust-core`. Su único propósito es demostrar
que la lógica de dominio no vive aquí.

Stack: Kotlin 2.4.20, Jetpack Compose (BOM 2026.09.00), **AGP 9.4.0**, compileSdk 37,
**minSdk 28**, Java 21, NDK 30.0.16248370 (r27+). Package: `dev.tohure.android_rust_test`.

El proyecto base ya existe y compila; los valores de arriba salen de
`gradle/libs.versions.toml` y `app/build.gradle.kts`, no de una decisión de este documento.

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
  FFI**: hay que escribirlo, nueve líneas, **en código de producción** —no solo en el test—,
  con un `when` exhaustivo usado como expresión y **sin rama `else`**, para que una décima
  variante rompa la compilación en vez de pasar en verde. Va en producción porque
  `contracts/messages.es.json` indexa los mensajes de usuario por el nombre del contrato, así
  que la pantalla de error lo necesita igual que el golden; se escribe una vez y el golden
  reusa ese mismo. Ver [rust-core/README.md](../../rust-core/README.md).

`validateCci` y `calculateItf` no tienen pantalla propia entre las cinco de la demo: hoy
las consume el test golden. Si se decide darles pantalla, se agrega **en las cuatro apps a
la vez** — la paridad es la demo.

**Las pantallas, sus labels y el orden de campos están en
[`docs/ui-spec.md`](../../docs/ui-spec.md)**, que es normativo para las cuatro apps. No
inventes labels acá: cambiarlos obliga a cambiarlos en las cuatro.

## Estructura

app/src/main/java/
├── uniffi/core_financiero/  bindings Kotlin generados (NO EDITAR, se regeneran)
│                            uniffi-bindgen los emite acá solo: con
│                            `--out-dir app/src/main/java` crea él mismo el árbol del
│                            paquete `uniffi.core_financiero`. No hace falta moverlos.
└── dev/tohure/android_rust_test/
    ├── adapter/       CoreFinanciero.kt, la única clase que llama al core
    ├── ui/            Compose, una carpeta por pantalla (ver "Arquitectura de UI")
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
   textos de usuario, iguales en las cuatro apps, viven en
   [`contracts/messages.es.json`](../../contracts/messages.es.json), que esta app
   lee igual que `cases.json`. Está indexado por el **nombre del contrato**
   (`Longitud`, `DigitoControl`, …) y no por el de la variante, así que el mapeo
   `DomainException` → nombre del contrato hace falta **en producción**, y el
   golden reusa ese mismo mapeo en vez de escribir el suyo. Va exhaustivo: `when`
   como expresión, sin `else`. El porqué del archivo está en
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

## Arquitectura de UI

Destilado de [TanayenAI](https://github.com/tohure/TanayenAI), que resolvió bien esta capa.
**Ojo con qué se copia:** ahí el ViewModel vive en `shared/commonMain/presentation/viewmodel`
y es KMP, compartido entre Android e iOS. **Acá eso no aplica y no va a aplicar**: lo
compartido es el dominio en Rust, que cruza por uniffi como funciones puras. Cada app escribe
su propio ViewModel, en su propio lenguaje, y eso es exactamente lo que la POC demuestra.
Lo transferible son los patrones de UI, no la estrategia de compartir.

Lo mismo con el stack de ese proyecto: **Koin, SQLDelight, Ktor y KMP-NativeCoroutines no
entran acá.** No hay red, ni persistencia, ni flows cruzando a Swift, y una app de cinco
pantallas con un solo adapter no necesita un contenedor de DI. `viewModel()` de
`lifecycle-viewmodel-compose` alcanza.

### Un ViewModel y un UiState por pantalla

```kotlin
@Immutable
data class TransferUiState(
    val origin: String = "",
    val destination: String = "",
    val amount: String = "",          // String. Siempre. Nunca Double.
    val accounts: ImmutableList<Account> = persistentListOf(),
    val result: TransferResult? = null,
    val isLoading: Boolean = false,   // true mientras corre simulatedLatencyMs
    val error: String? = null,        // ya resuelto a texto de usuario
)

class TransferViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(TransferUiState())
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()
}
```

Cinco reglas, todas con motivo:

1. **`@Immutable` + valores por defecto en todos los campos.** El default hace que la
   pantalla tenga un estado inicial válido sin ceremonia, y `@Immutable` le promete a Compose
   que puede saltarse la recomposición.
2. **Listas como `ImmutableList` / `persistentListOf()`** (`kotlinx.collections.immutable`).
   Un `List<T>` de Kotlin es *inestable* para Compose —la interfaz no garantiza que nadie la
   mute— y recompone de más. Es la diferencia entre una lista que se salta el frame y una que
   no.
3. **El error es un campo del estado, no una excepción que sube a la vista.** Se guarda ya
   resuelto a texto de usuario, leído de `contracts/messages.es.json`.
4. **El estado no calcula.** Guarda lo que devolvió el core. Aritmética en el ViewModel =
   lógica de negocio fuera de `rust-core`.
5. **Se colecta con `collectAsStateWithLifecycle()`**, de
   `androidx.lifecycle:lifecycle-runtime-compose` — **no** con `collectAsState()`. La
   diferencia es que el primero deja de colectar cuando la pantalla no está visible; el
   segundo sigue colectando en background.

### Cómo se escribe el ViewModel por dentro

Esto es lo que hay que copiar de TanayenAI. Son convenciones, no estilo: cada una tapa un
fallo concreto.

```kotlin
class TransferViewModel(private val core: CoreFinanciero) : ViewModel() {
    private val _uiState = MutableStateFlow(TransferUiState())
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()

    /** Cache crudo, separado del estado: el estado guarda lo YA derivado. */
    private var allAccounts: List<Account> = emptyList()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    fun amountChanged(value: String) {
        if (!AMOUNT.matches(value)) return          // filtro de texto, no regla de negocio
        _uiState.value = _uiState.value.copy(amount = value)
    }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun transfer() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            core.transfer(allAccounts, currentRequest())
                .onSuccess { result ->
                    delay(result.simulatedLatencyMs.toLong())   // la "red" que no existe
                    allAccounts = result.accounts
                    _uiState.value = _uiState.value.copy(result = result, isLoading = false)
                }.onFailure { e ->
                    _uiState.value =
                        _uiState.value.copy(error = userMessage(e), isLoading = false)
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
```

**Diez reglas, con el fallo que cada una evita:**

1. **`_uiState` privado, `uiState` público de solo lectura.** La vista no puede escribir
   estado. Si puede, tarde o temprano lo hace.
2. **Toda mutación es `_uiState.value = _uiState.value.copy(...)`.** Nunca se muta un campo.
   Un `data class` inmutable con `copy()` es lo que le permite a Compose comparar
   referencias y saltarse la recomposición.
3. **Las funciones públicas son acciones con nombre de dominio** —`transfer()`,
   `amountChanged()`, `clearError()`—, no setters. La vista dice *qué pasó*, no *qué guardar*.
4. **`runCatching { }.onSuccess { }.onFailure { }` en cada acción**, no `try/catch` disperso.
   Un solo camino de error significa que ninguno queda sin `isLoading = false`, que es el bug
   clásico: la pantalla se queda cargando para siempre porque el `catch` se olvidó de apagar
   el spinner.
5. **`clearError()` existe.** El error se *consume*, no se muestra y se olvida: sin esta
   acción el mensaje reaparece al rotar la pantalla, porque sigue en el estado.
6. **Un booleano por operación**, no uno global. `isLoading` (transferencia en curso) y
   `isSaving` son cosas distintas; colapsarlos hace que una operación apague el indicador de
   la otra.
7. **El error se guarda ya traducido a texto de usuario.** La traducción vive acá, leyendo
   `contracts/messages.es.json`; la vista solo pinta. Ver la regla 3 del adapter.
8. **El cache crudo va aparte del estado.** El estado guarda lo derivado —lo que la pantalla
   pinta—; el cache guarda la lista completa. Así filtrar no obliga a volver a pedir, y en
   esta POC evita reconstruir la lista de cuentas en cada tecla.
9. **Lo derivado se calcula en un `private fun` del ViewModel**, nunca en el `@Composable`.
   Un cálculo dentro de un composable se re-ejecuta en cada recomposición.
10. **Comentarios de sección** (`// ── Acciones ───`) agrupando funciones relacionadas. Con
    ocho o diez acciones por pantalla, es la diferencia entre navegar el archivo y buscarlo.

### Y cómo NO se escribe la capa de datos acá

TanayenAI tiene `domain/repository` (interfaces) + `data/repository` (impls con SQLDelight),
`suspend fun` con `withContext(Dispatchers.Default)` adentro, y un `toDomain()` que mapea los
tipos de la base a los de dominio. **Ese diseño resuelve problemas que esta POC no tiene**, y
copiarlo sería ceremonia:

| Práctica de allá | Acá | Por qué |
|---|---|---|
| Interfaz de repositorio + impl | **No.** Un solo `object CoreFinanciero` | No hay implementación alternativa que inyectar, ni base de datos que sustituir en tests. La interfaz existiría para nadie. |
| `withContext(Dispatchers.Default)` dentro del repo | **No.** Llamadas síncronas | El core responde en microsegundos. El salto de hilo cuesta más que el cálculo. Única excepción: la pantalla de benchmark. |
| `toDomain()` mapeando tipos | **No.** El adapter reexporta | Los tipos que emite uniffi *son* los de dominio. Una segunda nomenclatura en Kotlin se desincroniza en la primera regeneración de bindings. |
| `sealed class Result<Success/Error/Loading>` | **No.** `kotlin.Result` de `runCatching` | `Loading` no es un resultado, es un campo del `UiState`. Meterlo en el tipo de retorno obliga a un `when` con una rama imposible en cada llamada. |
| `Flow` para lectura reactiva | **No.** Funciones puras | El core no tiene estado que observar. Devuelve un valor y termina. |
| Koin para DI | **No.** `viewModel()` | Cinco pantallas y un adapter sin dependencias. |

**La regla detrás de la tabla:** cada capa de esas existe para desacoplar algo que puede
cambiar. Acá lo único que hay del otro lado del adapter es una librería estática de Rust que
no se reemplaza, no se moquea y no tiene modos. Agregar capas sobre eso no es arquitectura,
es ceremonia — y en una POC cuyo argumento es *"la lógica vive en un solo lugar"*, cada capa
intermedia en Kotlin debilita la demostración.

### `kotlinx.collections.immutable`: cuidado con la versión

Se usa `ImmutableList` / `persistentListOf()` para las listas del estado (ver arriba). **La
línea 0.5.x renombró todos los métodos que devuelven copia** (KEEP-0459): `add` → `adding`,
`removeAt` → `removingAt`, `set` → `replacingAt`, `put` → `putting`, `clear` → `cleared`.
Los nombres viejos siguen compilando con warning de deprecación. Como este proyecto arranca
de cero, se usan **los nombres nuevos desde el principio**: cualquier ejemplo de internet
anterior a 0.5 va a estar con los viejos.

### Componentes compartidos, y la firma que los hace reusables

Los de [`docs/ui-spec.md`](../../docs/ui-spec.md) —`ScreenHeader`, `LabeledField`,
`ResultRow`, `SectionDivider`, `CoreVersionFooter`— van en un solo archivo de componentes,
no repetidos por pantalla.

```kotlin
@Composable
fun ScreenHeader(title: String, subtitle: String, modifier: Modifier = Modifier) { … }
```

**`modifier: Modifier = Modifier` va último y el caller decide el posicionamiento.** El
componente aporta tipografía y espaciado *internos*; el padding posicional lo pone quien lo
usa. Así el mismo `ScreenHeader` sirve dentro de una lista y dentro de una tarjeta sin
inventar variantes.

### Insets

La app va edge-to-edge (obligatorio desde targetSdk 35). Los campos de monto y los botones
no pueden quedar tapados por la barra de navegación ni por el teclado. Hay una skill
`edge-to-edge` instalada en el repo para esto.

## Pantallas

Las mismas cinco en las cuatro apps, con los mismos labels y el mismo orden de campos, para
que la comparación lado a lado en la demo sea limpia: **Aritmética, Transferencia, Tarjeta,
Benchmark**, y el pie con `coreVersion()` visible en las cuatro.

**Los wireframes, los labels exactos y el orden de campos viven en
[`docs/ui-spec.md`](../../docs/ui-spec.md)** — normativo para las cuatro apps. No se
duplican acá: cuatro copias de la misma lista divergen, que es justo lo que la demo no puede
permitirse. Cambiar un label obliga a cambiarlo en las cuatro apps y en ese archivo, en el
mismo cambio.

### Pantalla de Benchmark

Es la única pantalla donde existe una implementación equivalente nativa, aislada en
`ui/benchmark/NativeBaseline.kt`. Existe para exhibir la divergencia de centavos bajo
IEEE-754 y debe llevar un comentario que lo explique. Es la única excepción permitida
a la regla "cero lógica de negocio fuera de `rust-core`".

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
