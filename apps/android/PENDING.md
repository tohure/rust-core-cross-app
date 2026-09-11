# Pendientes conocidos

Lo que esta app **no** hace, y la razón. Está separado del [README](README.md) a propósito: un
README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de acá bloquea la demo. Son decisiones tomadas, no olvidos.

## Deuda técnica medible

### El APK de debug pesa 32 MB

JNA trae `libjnidispatch.so` para **seis** ABIs, incluidos `mips` y `mips64`, muertos desde
2017. Se recorta con `abiFilters` en `app/build.gradle.kts`:

```kotlin
defaultConfig {
    ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
}
```

No está aplicado todavía: el tamaño del binario es criterio de la demo, así que se mide
antes y después en la Fase 2 en vez de aplicarlo a ciegas.


### Nada verifica el `runCatching` del adapter real

`CoreFinancieroAdapterTest` corre en la JVM, así que no puede cargar la `.so`: ejercita
`FakeCoreFinanciero`, no `UniffiCoreFinanciero`. Y el test de contrato llama a las funciones de
uniffi **directamente**, sin pasar por el adapter.

O sea que ninguna suite comprueba de forma automatizada que `UniffiCoreFinanciero` convierta una
excepción del core en `Result.failure` contra la librería real. Hay evidencia de que funciona
—se forzó un error en el emulador y el mensaje de usuario apareció— pero no es a prueba de
regresiones. Se cierra con un test instrumentado chico.

### El estado no sobrevive a la rotación

`BancoApp` usa `remember` y no `rememberSaveable` para la pestaña activa, y los ViewModels se
crean con `remember` en vez de `viewModel()`. Rotar la pantalla vuelve a Aritmética y limpia
todo. No afecta la demo, que se hace sin rotar.

### Optimizar el cruce del FFI: se evaluó con mediciones y no hay nada que hacer

**La pregunta ya se hizo y ya se contestó con números, no con opiniones.** Si vuelve a
aparecer, esto es lo que se midió en un Pixel 6 (el detalle y el método están en
[TESTING.md](TESTING.md)):

| Idea | Veredicto |
|---|---|
| **Pasar de JNA a JNI** | **No aplica: ya estás en JNI.** uniffi 0.32 genera *direct mapping* (`Native.register` + `external fun`), o sea métodos nativos enlazados de verdad. No hay despacho reflexivo por llamada que eliminar |
| **Subir `opt-level` de `"z"` a `3`** | **Descartado por medición.** `coreVersion()` —sin argumentos y sin parseo— cuesta 172 µs y `add` cuesta 444: si cada `String` vale ~150 µs, el cómputo de Rust cae dentro del ruido. Comprimir el binario o no da igual, así que la prioridad de tamaño se sostiene |
| **`java.lang.foreign` (Panama)** | **No existe en Android.** ART no implementa la FFM API |
| **Menos cruces por interacción** | **Es el único lever real… y ya está aplicado.** Cada pantalla hace una o dos llamadas. El Benchmark cruza N veces *a propósito*, que es su razón de ser |
| **Menos argumentos `String` por llamada** | Un `Record` de uniffi viaja como **un** `RustBuffer`, mientras que N `String` sueltos son N. La API ya usa `Record` donde hay varios campos (`TransferRequest`). Cambiar `add(a, b)` sería tocar el contrato y las cuatro apps para ahorrar microsegundos en algo que no es ruta caliente |
| **Calentar el puente al arrancar** | Innecesario: el pie llama `coreVersion()` en la primera composición, así que la librería ya está cargada antes de que el usuario toque nada |

El piso de 172 µs vive en **código generado que no se edita**: `RustBuffer` y
`UniffiRustCallStatus` son `Structure` de JNA —con reflexión de campos y memoria nativa por
llamada— y devolver un `String` cuesta un cruce extra para liberar el buffer. Bajar eso es
trabajo *upstream* en uniffi, no en esta app.

**Y no hace falta:** 444 µs es el 2,7% de un frame a 60 Hz, con una o dos llamadas por
interacción.

Lo único que quedó sin verificar es si un APK de **release** cambia algo; se midió con el de
debug (el `.so` sí es release). No debería, porque el camino del binding no lleva
instrumentación de debug.

### El `@Immutable` de los `UiState` se apoya en disciplina, no en el compilador

Los tipos que genera uniffi son `data class` con propiedades **`var`**:

```kotlin
data class Account(var id: String, var holder: String, var balance: String)
```

El reporte del compilador de Compose los lista como `unstable class`, y sin embargo
`TransferUiState` figura `stable` — porque lleva `@Immutable`, que **anula la inferencia**. Esa
anotación es una promesa, y acá se cumple solo porque la app **nunca muta un `Account` en el
lugar**: reemplaza la lista entera con la que devuelve el core. Si alguien escribiera
`account.balance = "0.00"`, Compose no se enteraría y la pantalla mostraría un saldo viejo.

**Es un riesgo de corrección, no de rendimiento**, y por eso está acá arriba de los detalles
menores. Las dos salidas obvias no sirven: los tipos son generados y no se editan, y envolverlos
en tipos propios de la app es exactamente el `toDomain()` que el proyecto rechaza —duplicaría el
contrato en Kotlin y se desincronizaría en la primera regeneración de bindings—.

Queda entonces como **regla**: un `Record` de uniffi se trata como inmutable, se reemplaza y no
se muta. Vale igual en las cuatro apps, aunque el riesgo no sea idéntico: en Swift los `Record`
son `struct`, o sea tipos de valor, así que mutar una propiedad produce una copia y la
asignación al estado sí se observa.

### Las advertencias de estabilidad de Compose, y por qué se anotó

`AppContainer` y los cuatro ViewModels llevan `@Immutable` / `@Stable`. Se agregaron porque el
compilador marcaba los cuatro `vm` como parámetros inestables —`ViewModel`, `StateFlow` y
`MutableStateFlow` vienen de librerías compiladas sin inferencia de estabilidad, algo que le
pasa a toda app Android que pasa un ViewModel a un composable—.

**No se anotó por rendimiento.** Las pantallas se llaman desde el `when` de `BancoApp`, que solo
recompone al cambiar de pestaña: lo que se ahorra es una ejecución de función por tap, cuatro o
cinco veces en una demo. Se anotó por **higiene de advertencias**: una lista que uno aprende a
ignorar tapa la que sí importa.

Dos cosas que **no** se hicieron, y son decisiones:

- **No se anotó la interfaz `CoreFinanciero`.** Anotar una interfaz promete que *todas* sus
  implementaciones son estables, y `FakeCoreFinanciero` tiene `var` públicos. Sería una promesa
  falsa, y no hace falta: `@Stable` sobre la clase del ViewModel ya anula la inferencia.
- **No se hoisteó el estado** a firmas `(state, onXxx)`. Es la respuesta canónica de Compose y
  daría previews gratis, pero dejaría a Android como la única app con esa forma: en iOS la vista
  crea su propio `@Observable`, y RN y Angular hacen lo mismo con hooks y signals. La
  comparación lado a lado es la demo.

Para regenerar el reporte y verificarlo, agregar temporalmente a `app/build.gradle.kts`:

```kotlin
composeCompiler {
    reportsDestination = layout.buildDirectory.dir("compose_compiler")
}
```

y correr `./gradlew :app:compileDebugKotlin --rerun-tasks`. Deja
`app/build/compose_compiler/app-classes.txt` y `app-composables.txt`. Qué se debe ver: las cinco
clases como `stable`, y las cuatro pantallas como `restartable skippable` con `stable vm`. **El
bloque se quita después de mirar**: no está commiteado a propósito, para no pagar su costo en
cada build.

### Detalles menores

- El default `nextEncrypt` de `FakeCoreFinanciero` es un hex truncado de 8 caracteres, no el de
  64 del contrato. Es coherente con el único test que lo usa, pero contradice el comentario de
  la clase.
- `AssetSourcesTest` no aserta el `balance` de la segunda cuenta.
- Los tiempos del benchmark se formatean con `"%.2f µs".format(...)`, que usa el locale por
  defecto: en un dispositivo es-PE mostraría coma decimal.

## Camino a producción: lo que una evaluación técnica marcó

Estas siete no son defectos de la POC: son la distancia entre una POC correcta y una app de
producción. Ninguna bloquea la demo. Salieron de una evaluación técnica de la integración
`rust-core` ↔ Android, y se anotan aquí porque **una recomendación que vive sólo en una
conversación no existe**.

| # | Hoy | Recomendación | Prioridad |
|---|---|---|---|
| 1 | UniFFI 0.31 + JNA Direct | **Mantener UniFFI.** JNI puro bajaría la latencia de ~150-450 µs a <5 µs, pero obliga a mantener a mano las firmas `Java_dev_...` y los bindings de las cuatro plataformas. El riesgo de desincronización pasa de mínimo a alto | — |
| 2 | Monolito en `:app` | **Extraer `:core-financiero` como Android Library.** `:app` deja de conocer JNA y de ver las `.so`; los cambios de UI no reevalúan la capa FFI; y si algún día se adopta KMP, `:core-financiero` se vuelve el `androidMain` sin tocar la UI | **Alta** |
| 3 | Comandos manuales de terminal | **Automatizar `cargo ndk` y `uniffi-bindgen` como tareas Gradle `Exec`** | Media |
| 4 | Generados en `src/main/` | **Generar en `build/generated/`**, que es donde el sistema de build sabe que son artefactos | Media |
| 5 | Todos los ABI de JNA | **Configurar `ndk.abiFilters`** con los tres que se usan | **Alta** |
| 6 | `@Immutable` a mano sobre los `var` de uniffi | **Regla de lint, o mappers inmutables con `val`** | Media |
| 7 | `remember` volátil | **`viewModel()` / `rememberSaveable`** para sobrevivir a la rotación | Baja en POC / Alta en producción |

La #2 es la que más lejos llega, y **`apps/react-native` ya nace con ella**: su librería es la
frontera nativa y su `example/` es la app, que nunca importa uniffi. Es el mismo desacople,
conseguido por frontera de paquete en vez de módulo Gradle. Ver
[apps/react-native/README.md](../react-native/README.md).

La #7 ya está anotada arriba, en "El estado no sobrevive a la rotación".

## Fuera de alcance por diseño

Esto **no** son pendientes: son cosas que la POC decidió no hacer.

- Persistencia, red, animaciones, tablet/foldable, e i18n más allá del español.
- **Keychain, Keystore, biométricos y almacenamiento seguro.** La pantalla de Tarjeta invita a
  pedirlo, así que conviene ser explícito: la POC demuestra que **el algoritmo de cifrado** vive
  en el core y produce el mismo resultado en las cuatro plataformas. Dónde guardarías una clave
  en una app real es otro problema, y no está acá.
- **Multi-módulo Gradle, Hilt y Koin.** Cinco pantallas y tres dependencias no los justifican;
  el cableado es manual en `AppContainer` y se lee de arriba abajo.
- **Librería de navegación.** Cuatro pestañas sin back stack ni argumentos: un `sealed interface`
  y un `when` alcanzan.
