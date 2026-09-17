# Pendientes conocidos

Lo que esta app **no** hace, y la razón. Está separado del [README](README.md) a propósito: un
README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de acá bloquea la demo. Son decisiones tomadas, no olvidos.

> **Lo transversal no está acá.** El benchmark que falta repetir en aparato físico, la ausencia
> de CI en las cinco bases de código, el `catch` genérico que muestra texto de diagnóstico como
> mensaje de usuario, las divergencias de paridad abiertas y la regla de que un `Record` de uniffi
> se reemplaza y no se muta viven en
> **[docs/cross-app-pending.md](../../docs/cross-app-pending.md)**. Un tema, un dueño: antes estaban escritos con distintas
> palabras en tres archivos, y corregirlo en uno dejaba mintiendo a los otros dos.


## Deuda técnica medible

### El APK pesa 31 MB en debug y 24 en release — y no está minificado

JNA trae `libjnidispatch.so` para **seis** ABIs, incluidos `mips` y `mips64`, muertos desde 2017.
**`abiFilters` ya está aplicado** —en `:core-financiero` y en `:app`, con los tres ABI que se
usan—; este documento decía que no lo estaba y era falso desde hacía tiempo.

Lo medido en la Fase 6: **31,2 MiB** el APK de debug y **24,4 MiB** el de release. De dónde sale
el peso en el de release: 22,9 MB son los dos `classes.dex` y todo lo nativo junto son 1,9 MB, de
los cuales 1,4 son los tres slices de `libcore_financiero.so`.

**El release no está minificado**: `buildTypes.release` lleva `optimization { enable = false }`,
o sea que R8 no corre. Por eso la diferencia es sólo del 22 %, y por eso este número **no** es el
de un build embarcable. Está así a propósito —un APK minificado complica leer un stack trace en
la demo—, pero citarlo como «lo que pesa la app» se equivoca por un factor grande. El desglose
completo está en [TESTING.md](TESTING.md).

En producción, empaquetar como **Android App Bundle (`.aab`)** entrega sólo el slice de la
arquitectura del dispositivo destino.

> **Cerrados por la Fase 6, bloque 1:** que nada verificara el `runCatching` del adapter real
> —ahora lo cubre `UniffiCoreFinancieroTest`, tres tests instrumentados contra la `.so`— y que el
> estado no sobreviviera a la rotación —`rememberSaveable` sobre el índice de pestaña y
> `viewModel(factory)` para los cuatro, con `RotationTest` vigilándolo—.

### Optimizar el cruce del FFI: se evaluó con mediciones y no hay nada que hacer

**La pregunta ya se hizo y ya se contestó con números, no con opiniones.** Si vuelve a
aparecer, esto es lo que se midió en un Pixel 6 (el detalle y el método están en
[TESTING.md](TESTING.md)):

| Idea | Veredicto |
|---|---|
| **Pasar de JNA a JNI** | **No aplica: ya estás en JNI.** uniffi 0.32 genera *direct mapping* (`Native.register` + `external fun`), o sea métodos nativos enlazados de verdad. No hay despacho reflexivo por llamada que eliminar |
| **Subir `opt-level` de `"z"` a `3`** | **Descartado por medición.** `coreVersion()` —sin argumentos y sin parseo— cuesta 47 µs y `add` cuesta 146: si cada `String` vale ~49 µs, el cómputo de Rust cae dentro del ruido. Comprimir el binario o no da igual, así que la prioridad de tamaño se sostiene |
| **`java.lang.foreign` (Panama)** | **No existe en Android.** ART no implementa la FFM API |
| **Menos cruces por interacción** | **Es el único lever real… y ya está aplicado.** Cada pantalla hace una o dos llamadas. El Benchmark cruza N veces *a propósito*, que es su razón de ser |
| **Menos argumentos `String` por llamada** | Un `Record` de uniffi viaja como **un** `RustBuffer`, mientras que N `String` sueltos son N. La API ya usa `Record` donde hay varios campos (`TransferRequest`). Cambiar `add(a, b)` sería tocar el contrato y las cuatro apps para ahorrar microsegundos en algo que no es ruta caliente |
| **Calentar el puente al arrancar** | Innecesario: el pie llama `coreVersion()` en la primera composición, así que la librería ya está cargada antes de que el usuario toque nada |

El piso de 47 µs vive en **código generado que no se edita**: `RustBuffer` y
`UniffiRustCallStatus` son `Structure` de JNA —con reflexión de campos y memoria nativa por
llamada— y devolver un `String` cuesta un cruce extra para liberar el buffer. Bajar eso es
trabajo *upstream* en uniffi, no en esta app.

**Y no hace falta:** 146 µs es el 0,9% de un frame a 60 Hz, con una o dos llamadas por
interacción.

**Lo que sí se puede bajar, y está medido: cambiar de puente.** React Native, en este mismo
Pixel 6 y contra el mismo núcleo, cruza en 4,23 µs por JSI — 11× menos que JNA. No es una opción
para esta app, que es nativa a propósito, pero conviene saber que **el costo no es del FFI en
general sino de JNA en particular**.

Lo único que quedó sin verificar es si un APK de **release** cambia algo; se midió con el de
debug (el `.so` sí es release). No debería, porque el camino del binding no lleva
instrumentación de debug.

### El `@Immutable` de los `UiState` ya no se apoya sólo en disciplina

Los tipos que genera uniffi son `data class` con propiedades **`var`**, y `@Immutable` **anula la
inferencia** del compilador de Compose: si alguien escribiera `account.balance = "0.00"`, Compose
no se enteraría y la pantalla mostraría un saldo viejo. Es un riesgo de **corrección**, no de
rendimiento.

**Desde la Fase 6 hay una guardia automatizada**: `UniffiRecordsAreNotMutatedTest` deriva la lista
de campos del propio binding generado —así que regenerar no la pudre— y falla nombrando archivo y
línea. Se la vio fallar antes de darla por buena.

La regla de fondo vale igual en las cuatro apps y vive en
[docs/cross-app-pending.md](../../docs/cross-app-pending.md): **un `Record` de uniffi se reemplaza,
no se muta.** Las otras tres todavía no tienen la guardia.

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

Los tres que estaban acá los cerró la Fase 6: el default de `nextEncrypt` ahora es el hex de 64
del contrato, `AssetSourcesTest` aserta el saldo de la segunda cuenta, y el benchmark formatea con
`Locale.ROOT` en vez de con el locale por defecto — que era la divergencia con React Native.

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
| 5 | Todos los ABI de JNA | **Configurar `ndk.abiFilters`** con los tres que se usan. En producción, empaquetar como **Android App Bundle (`.aab`)** entrega sólo el slice de la arquitectura del dispositivo destino, y baja la descarga del usuario final a ~3-5 MB | **Alta** |
| 6 | `@Immutable` a mano sobre los `var` de uniffi | **Regla de lint, o mappers inmutables con `val`** | Media |
| 7 | `remember` volátil | **`viewModel()` / `rememberSaveable`** para sobrevivir a la rotación | Baja en POC / Alta en producción |

**Cómo quedaría separado el módulo (recomendación #2):**

```
apps/android/
├── app/                        # Presentación pura (Compose, ViewModels, Theme)
│   ├── build.gradle.kts        # Depende de :core-financiero
│   └── src/main/java/          # Solo UI
└── core-financiero/            # Módulo Android Library
    ├── build.gradle.kts        # JNA (@aar), tareas de cargo-ndk y uniffi
    └── src/main/
        ├── jniLibs/            # .so generados
        └── java/
            ├── uniffi/         # Bindings generados por uniffi
            └── dev/tohure/...  # CoreFinanciero, UniffiCoreFinanciero, ContractMessages
```

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
