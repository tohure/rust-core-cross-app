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

### Detalles menores

- El default `nextEncrypt` de `FakeCoreFinanciero` es un hex truncado de 8 caracteres, no el de
  64 del contrato. Es coherente con el único test que lo usa, pero contradice el comentario de
  la clase.
- `AssetSourcesTest` no aserta el `balance` de la segunda cuenta.
- Los tiempos del benchmark se formatean con `"%.2f µs".format(...)`, que usa el locale por
  defecto: en un dispositivo es-PE mostraría coma decimal.

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
