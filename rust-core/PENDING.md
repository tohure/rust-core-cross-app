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

## Fuera de alcance por diseño

| No hace | Por qué |
|---|---|
| **I/O, red, disco, async, threads** | Son funciones puras: entra data, sale data. Si una función necesita I/O, no pertenece a este crate |
| **Persistencia** | Los saldos viven en memoria, del lado de la app. Es una POC de dominio |
| **Logging** | Nada que reporte estado: el core no tiene estado |
| **Benchmark propio** | La comparación contra la baseline nativa vive en las apps, que es donde se puede *ver* durante la demo |
| **i18n** | Un segundo idioma es otro archivo junto a `../contracts/messages.es.json`, no un cambio al core. Ver [FFI.md](FFI.md) |
