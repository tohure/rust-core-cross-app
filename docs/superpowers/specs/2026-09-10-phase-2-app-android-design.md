# Fase 2 — `apps/android`: diseño

**Fecha:** 2026-09-10
**Rama:** `feat/phase-2-app-android`
**Entrada:** [apps/android/CONTEXT.md](../../../apps/android/CONTEXT.md) y
[docs/ui-spec.md](../../ui-spec.md)
**Estado:** aprobado, pendiente de plan de implementación

## Qué entrega esta fase

El primer consumidor real de `rust-core`. Al cerrar, la fase deja:

1. El **test golden en verde** contra `contracts/cases.json` v2.3.0, corriendo en un
   dispositivo — el primer test de toda la POC que cruza el borde FFI real.
2. `apps/android/README.md` con los comandos **efectivamente ejecutados** y su diagrama
   Mermaid. *(Ya escrito: la parte de toolchain y pipeline se verificó antes de esta spec.)*
3. Las cinco pantallas de [`docs/ui-spec.md`](../../ui-spec.md), con los mismos labels y el
   mismo orden de campos que van a tener las otras tres apps.

**Lo que ya está hecho y no es parte del alcance:** toolchain (`cargo-ndk` 4.1.2, tres
targets), las `.so` de los tres ABIs con alineación de 16 KB verificada, los bindings Kotlin
con las nueve funciones, JNA cableada, y el APK armando. Ver
[apps/android/README.md](../../../apps/android/README.md).

## El riesgo, y por qué ordena todo lo demás

**Nada en esta POC cruzó JNA todavía.** El golden de Rust llama a las nueve funciones como
funciones Rust ordinarias; el APK lleva las `.so` adentro pero ningún proceso las cargó.
`System.loadLibrary` puede fallar, JNA puede no resolver un símbolo, el `strip` puede
haberse comido algo. Si eso falla, cinco pantallas construidas encima no sirven de nada.

De ahí el orden: **el primer commit no es una pantalla ni el golden completo, sino un único
test que llame `coreVersion()` desde el emulador.** Es la prueba mínima de que la librería
carga y JNA resuelve. Si pasa, el resto es mecánico. Si falla, falla en cinco minutos con un
mensaje claro y no en la hora doce.

---

## Decisiones

### D1 — Los contratos llegan al APK por una tarea Gradle de copia

`contracts/*.json` vive en la raíz del repo y Android no lee archivos fuera del APK. Una
tarea `Copy` registrada antes de `preBuild` lleva **los dos JSON a los dos source sets**:

| Archivo | `main/assets` | `androidTest/assets` | Para qué |
|---|---|---|---|
| `cases.json` | sí | sí | prod: `cuentas_iniciales` · test: los 28 casos |
| `messages.es.json` | sí | sí | prod: los mensajes de error · test: la guardia de las nueve variantes |

**Por qué copiar y no apuntar `sourceSets` a `../../contracts`:** apuntar mete en el APK
cualquier archivo que aparezca en `contracts/` sin que nadie lo decida, y `cases.json` no
tendría por qué estar en producción si no fuera por `cuentas_iniciales`. La copia es
explícita y falla ruidosamente si el archivo no está. Descartado también el symlink: se rompe
en Windows y en algunos checkouts de CI, y el fallo es silencioso.

**`cuentas_iniciales` en producción no es desperdicio.** Las dos cuentas son datos del
contrato; hardcodearlas en Kotlin las duplicaría en las cuatro apps y divergirían.

Los assets copiados van al `.gitignore`, como los bindings y las `.so`: son generados.

### D2 — La baseline del benchmark vive en producción, aislada y comentada

`CLAUDE.md` permitía baseline nativa como única excepción a "cero lógica de negocio fuera de
`rust-core`", pero la ubicaba "en `androidTest`" — y a la vez la pantalla de Benchmark tiene
que pintar `Core` vs `Nativa`. **Las dos cosas no podían ser ciertas.**

Se resuelve a favor de la pantalla: `ui/benchmark/NativeBaseline.kt`, en producción, aislada
en su propio archivo y con el comentario obligatorio que dice por qué existe. **Motivo: el
día de la demo nadie corre `androidTest`.** Lo que no está en pantalla no le demuestra nada a
quien mira.

Consecuencia: hay que actualizar `CLAUDE.md` y `apps/android/CONTEXT.md` — la excepción pasa
a ser "aislada en su archivo, con comentario", no "solo en test". Va en su propio commit.

### D3 — Identidad visual: nativa por plataforma, con paleta compartida

Cada app se ve nativa de su plataforma (Material 3 acá, Liquid Glass en iOS), pero las cuatro
comparten una **paleta naranja / azul / blanco**, con las variantes y degradés que cada set de
controles necesite.

**Dynamic color va apagado, deliberadamente.** "Material You" en sentido estricto incluye el
esquema derivado del wallpaper del usuario, que **reemplaza** la paleta de la app: activarlo
haría que el naranja y el azul no se vieran en la mayoría de los dispositivos, y las cuatro
apps dejarían de compartir lo único visual que comparten. Se toma Material 3 como **lenguaje**
—componentes, formas, superficies tonales, motion— con esquema fijo sembrado de esa paleta.
El archivo del tema lleva un comentario que lo explica, porque es lo primero que alguien va a
querer "arreglar".

**La paleta es dirección visual, no identidad.** La app se queda con el banco ficticio del
contrato ("Banco Demo Uno"): no se usa el nombre ni el logo de un banco real.

### D4 — Tres seams, cada uno con una fuerza concreta

El código va desacoplado **donde el desacople se paga solo**, no por si acaso.

```kotlin
interface CoreFinanciero {                    // adapter/CoreFinanciero.kt
    fun add(a: String, b: String): Result<String>
    fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult>
    // … las nueve
}

class UniffiCoreFinanciero : CoreFinanciero   // adapter/ — la real
class FakeCoreFinanciero : CoreFinanciero     // test/ — determinista, sin .so
```

| Seam | Fuerza que lo justifica **hoy** | Qué habilita después |
|---|---|---|
| `CoreFinanciero` | sin él los ViewModels **no se pueden testear sin emulador**: dependen de funciones top-level de uniffi que necesitan la `.so` | segunda fuente (WASM, mock de demo, A/B entre versiones del core) |
| `ContractSource` | saca `android.content.Context` del ViewModel | contrato desde otro origen |
| `MessageSource` | idem, y hace testeable la traducción de errores | **un segundo idioma es otro archivo, no un cambio de código** |

**Cableado sin librería de DI.** Un `AppContainer` manual (~30 líneas) y `viewModelFactory`.
Hilt trae KSP y tiempo de build; Koin trae resolución en runtime que falla tarde. Ninguno de
los dos es *más* desacoplado: son más automáticos. Con cinco pantallas, explícito gana — se
lee de arriba abajo y el compilador lo verifica.

### D5 — Lo que NO se desacopla, y es una decisión, no un olvido

**No hay `toDomain()` mapeando los tipos de uniffi a tipos Kotlin paralelos.** `Account`,
`TransferRequest`, `TransferResult`, `ValidCci` y `ValidCard` se usan tal como los emite
uniffi.

Ese es el desacople que en esta POC trabaja en contra: duplica el contrato en Kotlin, se
desincroniza en la primera regeneración de bindings, y es exactamente lo que el proyecto
argumenta que no hay que hacer. **La interfaz de D4 existe para sustituir la implementación,
no para traducir los tipos.**

### D6 — Estructura: un solo módulo, navegación sin librería

```
dev/tohure/android_rust_test/
├── MainActivity.kt
├── AppContainer.kt            cableado manual
├── adapter/
│   ├── CoreFinanciero.kt      la interfaz (seam 1)
│   ├── UniffiCoreFinanciero.kt
│   └── ContractMessages.kt    mapeo variante → nombre del contrato, e interpolación.
│                              Depende de MessageSource, no de assets.
├── contract/
│   ├── ContractSource.kt      seam 2 — cuentas_iniciales
│   ├── AssetContractSource.kt   lee cases.json de assets
│   ├── MessageSource.kt       seam 3 — los nueve mensajes
│   └── AssetMessageSource.kt    lee messages.es.json de assets
├── format/
│   └── MoneyFormatter.kt      S/ y separadores. Solo al pintar.
└── ui/
    ├── theme/                 paleta fija, dynamic color apagado
    ├── components/            ScreenHeader, LabeledField, ResultRow, SectionDivider,
    │                          CoreVersionFooter
    ├── navigation/            BancoApp.kt — cuatro tabs + footer
    ├── arithmetic/            ArithmeticScreen.kt + ArithmeticViewModel.kt
    ├── transfer/
    ├── card/
    └── benchmark/             + NativeBaseline.kt (la excepción de D2)
```

**Un solo módulo `:app`.** No hay implementación alternativa que inyectar a nivel módulo ni
tiempo de build que ganar con cinco pantallas.

**Navegación sin librería.** Cuatro pestañas, sin back stack, sin argumentos, sin deep
links: una `sealed interface Tab` y un `when`. Navigation 3 o Navigation Compose serían una
dependencia de la que no se usaría ninguna función.

**Identificadores en inglés, texto de UI en español** — la regla de `CLAUDE.md`. Así que
`ArithmeticScreen`, no `AritmeticaScreen`; `apps/android/CONTEXT.md` tenía los nombres en
español y es residuo a corregir.

### D7 — Errores: una sola función, usada por producción y por el golden

```
core (.so) ──> CoreFinanciero ──> XxxViewModel ──> XxxUiState ──> Compose
                    │                   │
              runCatching          ContractMessages
              Result<T>                 │
                                  DomainException
                                        │ when exhaustivo, SIN else ← nueve líneas
                                  "SaldoInsuficiente"
                                        │ busca en messages.es.json
                                  "Saldo insuficiente: tenés {available}…"
                                        │ interpola CRUDO
                                  state.error
```

1. **`ContractMessages` es una sola función**, no dos copias. El golden compara sus nombres
   contra `cases.json`, así que verifica el mapeo que la UI usa de verdad.
2. **Los placeholders se interpolan crudos** —`{available}`, `{id}`, `{code}`, `{required}`,
   `{field}`— tal como los devuelve el core. Nada de `NumberFormat` ahí: los formateadores de
   Android, iOS y el navegador no coinciden entre sí y una diferencia rompe la comparación
   carácter por carácter que es toda la tesis.
3. **El adapter no traduce.** Propaga el `DomainException` tal cual; convierte el ViewModel.
4. **El `when` va exhaustivo y sin `else`**, como expresión, para que una décima variante en
   el core rompa la compilación en vez de caer en un `"Desconocido"` que pasa en verde.

### D8 — Testing: tres niveles, en este orden

| Test | Dónde | Necesita | Cuándo |
|---|---|---|---|
| `CoreSmokeTest` — `coreVersion()` cruza | `androidTest/` | emulador + `.so` | **primer commit** |
| `GoldenTest` — los 28 casos, `assertEquals` sobre strings | `androidTest/` | emulador + `.so` | segundo |
| ViewModels — estados, errores, `clearError()` | `test/` (JVM) | nada: `FakeCoreFinanciero` | con cada pantalla |

El golden espeja **las guardias del de Rust**: contador por grupo, guardia de claves de
primer nivel desconocidas, versión del contrato, y el `when` exhaustivo. Sin ellas, un grupo
vaciado a `[]` deja el test en verde sin comparar un solo string — verificado por mutación en
la Fase 1.

Comparaciones con `assertEquals` **sobre strings**, nunca numéricas con tolerancia.

---

## Correcciones que esta fase arrastra

Encontradas al explorar, y que hay que arreglar porque contradicen el contrato o entre sí:

1. **`docs/ui-spec.md` inventa valores que el core nunca produce.** Los wireframes usan
   `ACC-001` / "Ana Torres" / `**** 1111`; el contrato dice `00219100123456789047` (Ana
   Quispe), `01122000987654321065` (Luis Ramos) y `4111 **** **** 1111`. Se corrigen: una
   spec de UI con datos falsos hace que la primera pantalla se escriba contra valores que no
   existen.
2. **La contradicción del benchmark** (D2), en `CLAUDE.md` y en `apps/android/CONTEXT.md`.
3. **Los nombres de pantalla en español** en `apps/android/CONTEXT.md` (D6).

Cada una en su propio commit, separada de la implementación.

## Fuera de alcance

Persistencia, red, animaciones, tablet/foldable, i18n más allá del español, y `abiFilters`
—que se mide antes y después, en su propio paso, porque el tamaño del binario es criterio de
la demo—.

## Criterio de cierre

La fase termina cuando las tres cosas de `CLAUDE.md` están, no una:

1. `GoldenTest` en verde, 28/28, sobre un dispositivo.
2. `apps/android/README.md` con los comandos ejecutados y su diagrama.
3. Las cinco pantallas, con los labels de `docs/ui-spec.md`.
