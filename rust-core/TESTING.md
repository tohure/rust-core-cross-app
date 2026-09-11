# Tests del núcleo

Tres niveles, los tres obligatorios: **unitarias** en Rust puro, **property-based** con
`proptest`, y los **vectores de contrato** de `../contracts/cases.json` — los mismos 28 casos
que corren las cuatro apps.

Todos los comandos de este archivo **se ejecutaron tal como están escritos**, desde
`rust-core/`, y la salida que sigue a cada uno es la que devolvieron.

Si lo que buscás es compilar o exportar, eso está en [BUILD.md](BUILD.md).

## Correr los tests

```bash
cargo test --workspace                                        # todo: 67 tests
cargo test -p domain                                          # solo el núcleo, sin compilar uniffi
cargo test -p core_financiero --test contract                   # los 28 casos + las guardias
cargo test -p domain rounds_half_away_from_zero_not_to_even   # un solo test por nombre
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

`cargo test --workspace` compila **siete targets de test** y todos cierran en `0 failed`.
Solo cuatro llevan tests; los otros tres —el `[[bin]]` `uniffi-bindgen` y los dos de
doc-tests— reportan `0 passed`, que es lo esperado:

| Binario | Tests |
|---|---|
| `crates/ffi/src/lib.rs` (unitarias del lib) | 3 |
| `crates/ffi/tests/contract.rs` | 11 |
| `crates/domain/src/**` (unitarias del lib) | 47 |
| `crates/domain/tests/properties.rs` (`proptest`) | 6 |
| **Total** | **67** |

`cargo test -p core_financiero --test contract` imprime:

```
running 11 tests
test every_error_name_in_the_contract_has_a_user_message ... ok
test contract_itf ... ok
test contract_arithmetic ... ok
test contract_transfer ... ok
test the_contract_has_no_unknown_top_level_keys ... ok
test the_messages_file_covers_the_nine_error_variants ... ok
test the_contract_is_the_expected_version ... ok
test the_contract_has_the_expected_number_of_cases ... ok
test the_messages_file_has_the_expected_shape ... ok
test contract_cci ... ok
test contract_card ... ok

test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

El orden de las once líneas **varía entre corridas** —los tests corren en paralelo—; lo que
no varía es el `11 passed; 0 failed` del cierre.

## El test de contrato: qué prueba, qué no prueba y dónde vive

### Por qué vive en `crates/ffi/tests/`

El test de contrato está en `crates/ffi/tests/contract.rs` y **no** en `rust-core/tests/`. La razón es
mecánica: `rust-core/` es un workspace virtual, sin paquete raíz, y un directorio `tests/`
en la raíz de un workspace así **nunca se compila ni se ejecuta**. El test más importante
de la fase habría figurado como "pasado" sin haber corrido una sola vez. Dentro del paquete
`ffi`, `cargo test --workspace` lo alcanza — es la tabla de arriba, once tests.

### Qué prueba

Los 28 casos de `contracts/cases.json`, con **igualdad exacta de strings** (`assert_eq!`),
nunca comparación numérica con tolerancia. Cubre los cinco grupos del contrato:
`aritmetica` 6, `cci` 4, `itf` 5, `tarjeta` 6, `transferencia` 7. El contrato se embebe con
`include_str!`, así que editarlo fuerza recompilar el test y no hay I/O en runtime.

### Qué NO prueba

Llama a las funciones del crate `ffi` **como funciones Rust ordinarias**. Prueba la API
pública y el mapeo de tipos entre `domain` y la fachada; **no prueba el borde FFI real**:
nada cruza JNI, ni el ABI de C, ni el `catch_unwind` de uniffi. Un fallo de carga en runtime
—`System.loadLibrary`, JNA, símbolos comidos por el `strip`— no lo caza este test. Eso se
prueba recién con el test de contrato de `androidTest` en la Fase 2, corriendo el mismo `cases.json`
contra el `.so` de verdad.

### Sus seis guardias, y el hueco que queda abierto

Cinco `contract_*` ejercitan los casos; los otros seis tests existen para que esos cinco no
puedan mentir, y para que el segundo archivo del contrato —`contracts/messages.es.json`—
no se desincronice del core:

| Guardia | Qué caza |
|---|---|
| `the_contract_is_the_expected_version` | que el contrato deje de ser v2.3.0 |
| `the_contract_has_the_expected_number_of_cases` | un grupo vaciado a `[]` o renombrado |
| `the_contract_has_no_unknown_top_level_keys` | un grupo nuevo que ningún `contract_*` lee |
| `the_messages_file_has_the_expected_shape` | una clave de primer nivel nueva o renombrada en `messages.es.json` |
| `the_messages_file_covers_the_nine_error_variants` | una variante del core sin mensaje de usuario, o un mensaje presente pero vacío |
| `every_error_name_in_the_contract_has_a_user_message` | un error que `cases.json` espera y `messages.es.json` no tiene |

Ninguna se verificó por lectura: las seis se rompieron a propósito y se miró qué decían.

| Mutación | Qué reportó |
|---|---|
| `cci` vaciado a `[]` | sin la guardia, `contract_cci ... ok` en verde sin comparar un solo string |
| se borra la entrada `"Cifrado"` de `messages.es.json` | `sobran: [], faltan: ["Cifrado"]` |
| el mensaje de `MismaCuenta` se vacía a `""` | `el mensaje de MismaCuenta está vacío` — la igualdad de conjuntos sola lo dejaba pasar |
| `"MismaCuenta"` renombrada a `"MismaCuentaX"` | dos fallos: la igualdad de conjuntos, y `el caso tr-005 del grupo transferencia espera el error MismaCuenta` |

Cada `contract_*` además cuenta los casos que ejercitó y lo aserta contra una constante
propia; `every_error_name_in_the_contract_has_a_user_message` lleva el mismo contador, por
la misma razón: un `cases.json` sin casos de error pasaría en verde sin comparar nada.

### La séptima guardia no es un test: es el compilador

`every_variant_is_listed` no calcula nada. Es un `match` exhaustivo **sin rama por
defecto** cuya única función es que agregar una décima variante a `DomainError` no compile.
Verificado agregándola de verdad: son tres puertas, y saltan **en orden**.

| # | Dónde | Qué dice |
|---|---|---|
| 1 | `crates/ffi/src/lib.rs:53` | `non-exhaustive patterns: domain::DomainError::TenthVariant not covered` — es el `From` que traduce el error del núcleo a la fachada |
| 2 | `crates/ffi/tests/contract.rs:59` | el mismo error sobre `core_financiero::DomainError`, una vez arreglada la puerta 1 |
| 3 | `the_messages_file_covers_the_nine_error_variants` | recién con la variante en la lista, el test falla nombrando el mensaje que falta |

La puerta 2 es la que no es obvia, y la que no hay que borrar. Sin ella, la lista de nueve
variantes de `contract_error_names` quedaría corta **en silencio** —las nueve entradas del
JSON seguirían cuadrando con las nueve construidas a mano— y la variante nueva llegaría a
las cuatro apps sin mensaje de usuario. Que es, en pantalla, un cuadro de error en blanco:
uniffi arma el `message` desde los campos de la variante, y para una variante sin campos
eso es el string vacío.

**Hueco conocido y aceptado, uno:** borrar una función `contract_*` **entera** no lo caza
ninguna guardia — el contador se borra junto con la función, y ni el conteo por grupo ni el
set de claves saben qué funciones existen. Verificado: borrando `contract_cci` la corrida da
diez tests, todo verde, sin un warning. Cerrarlo requeriría extraer los cinco cuerpos a
funciones normales referenciadas desde una tabla `[(&str, fn(&Value)); 5]`, para que borrar
una rompa la compilación o dispare `dead_code` en clippy; no se hizo porque colapsaría los
cinco nombres de test, que es justo lo que se lee cuando algo falla. Queda escrito acá para
que la decisión se tome **una vez** y no cuatro veces, cuando Kotlin, Swift y TypeScript
espejen este archivo.

## Verificación de cierre de la Fase 1

El bloque que se corrió para declarar la fase terminada:

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
grep -rn "f32\|f64" crates/ --include='*.rs' || echo "sin punto flotante ✅"
# awk corta cada archivo en su `#[cfg(test)]`: lo de abajo son tests, donde unwrap() sí se permite
find crates/domain/src crates/ffi/src -name '*.rs' -exec awk '/#\[cfg\(test\)\]/{exit} /unwrap\(\)|expect\(/{print FILENAME":"FNR": "$0}' {} + | grep . || echo "sin unwrap/expect en produccion ✅"
```

Qué se debe ver — 67 tests en `0 failed`, clippy y fmt sin salida, y los dos últimos
comandos imprimiendo su mensaje de "sin ...", que es lo que pasa cuando **no** encuentran
nada.
