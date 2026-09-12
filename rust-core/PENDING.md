# Pendientes conocidos del núcleo

Lo que este crate **no** hace, y la razón. Está separado del [README](README.md) a propósito:
un README que mezcla "cómo se usa" con "qué falta" no sirve para ninguna de las dos cosas.

Nada de acá bloquea la demo. Son decisiones tomadas, no olvidos.

## Deuda técnica conocida

### Borrar una función `contract_*` entera no lo caza ninguna guardia

Las seis guardias del test de contrato cazan un grupo vaciado, una clave nueva, una variante
sin mensaje. **No cazan que alguien borre una de las cinco funciones `contract_*`**: el
contador se borra junto con la función, y ni el conteo por grupo ni el set de claves saben
qué funciones existen. Verificado: borrando `contract_cci` la corrida da diez tests, todo
verde, sin un warning.

Cerrarlo requeriría extraer los cinco cuerpos a funciones normales referenciadas desde una
tabla `[(&str, fn(&Value)); 5]`. **No se hizo**, y la decisión se toma una sola vez acá y no
cuatro veces cuando Kotlin, Swift y TypeScript espejen este archivo: esa tabla colapsaría los
cinco nombres de test, que es justo lo que se lee cuando algo falla.

El detalle completo y la prueba por mutación están en
[TESTING.md](TESTING.md#sus-seis-guardias-y-el-hueco-que-queda-abierto).

### En wasm no hay red de `catch_unwind`, y no se puede arreglar desde acá

`wasm32-unknown-unknown` **impone** `panic = "abort"`: el wasm base no tiene unwinding, así
que el `panic = "unwind"` del perfil se ignora en ese target. La consecuencia es para la
**Fase 5**: un pánico del core en la app Angular no vuelve como error del FFI, es un trap de
WebAssembly que deja la instancia del módulo inutilizable.

No hay nada que cambiar en el core para evitarlo. Lo único que protege a esa app es la
disciplina de cero `panic!`/`unwrap()`/`expect()` en producción y los proptests
`*_never_panics`. Ver [README.md](README.md#reglas-que-no-se-negocian).

### El core está anclado a uniffi 0.31, y lo ancla React Native

`uniffi` no puede subir a 0.32 mientras la Fase 4 dependa de
`uniffi-bindgen-react-native`, que fija `uniffi = "=0.31"` en su `Cargo.toml` — en su último
release publicado (`0.31.0-5`, 2026-08-21) **y en su rama `main`**.

**Por qué no se puede ignorar el pin.** `UNIFFI_CONTRACT_VERSION` vale `30` tanto en 0.31 como
en 0.32, así que la incompatibilidad **no llega como un error de versión**. El encoding de
metadata sí cambió: 0.32 escribe un `orig_name: Option<String>` extra por función y por record,
y reasignó códigos de tipo (`TYPE_BOX` 26 y `TYPE_HASH_SET` 27 donde 0.31 tenía
`TYPE_CALLBACK_TRAIT_INTERFACE` 25). Un lector 0.31 sobre bytes 0.32 se desincroniza y falla
tarde y mal.

**Qué cuesta estar en 0.31: nada medible.** Este crate usa sólo `setup_scaffolding!`,
`uniffi::Error`, `uniffi::Record` y `#[uniffi::export]` sobre funciones libres — nada de
objetos, traits, callbacks ni async—, y todo eso existe igual en 0.31. Verificado al bajar: los
67 tests siguen en verde, el contrato sigue 28/28, y las API públicas generadas para Kotlin y
Swift son **idénticas** a las de 0.32 (mismas nueve funciones, mismas subclases de
`DomainException`, mismos campos de los Records, y `DomainError` conservando `LocalizedError`
en Swift). Ni Android ni iOS tocaron una línea de código de app.

**Condición para desanclar:** que ubrn cierre
[su issue #449](https://github.com/jhugman/uniffi-bindgen-react-native/issues/449) y publique
`0.32.0-6`. Al 2026-09-11 ese issue está abierto, sin asignar y con cero comentarios desde el
2026-08-21, y su autor presupuesta la migración como *"real migration rather than a dependency
bump"*: el cambio de `[ByRef] bytes` a `ForeignBytes` toca 22 sitios en cuatro flavours.
Cuando salga, subir las dos versiones a la vez —el core y ubrn— y volver a correr los tres
gates: los 67 de aquí, los 43 de Android y los 47 de iOS.

## Fuera de alcance por diseño

| No hace | Por qué |
|---|---|
| **I/O, red, disco, async, threads** | Son funciones puras: entra data, sale data. Si una función necesita I/O, no pertenece a este crate |
| **Persistencia** | Los saldos viven en memoria, del lado de la app. Es una POC de dominio |
| **Logging** | Nada que reporte estado: el core no tiene estado |
| **Benchmark propio** | La comparación contra la baseline nativa vive en las apps, que es donde se puede *ver* durante la demo |
| **i18n** | Un segundo idioma es otro archivo junto a `../contracts/messages.es.json`, no un cambio al core. Ver [FFI.md](FFI.md) |
