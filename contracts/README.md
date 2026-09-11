# contracts/

El contrato compartido de la POC son **dos archivos**, y los leen las cinco bases de código:

| Archivo | Qué fija | Lo compara |
|---|---|---|
| `cases.json` | los vectores de contrato: entradas y strings esperados | el test de contrato de cada plataforma |
| `messages.es.json` | el mensaje de usuario de cada nombre de error | la pantalla de error de cada app |

Que los mismos casos produzcan los mismos strings en Rust, Android, iOS, React Native y
Angular **es** la demostración del proyecto. `messages.es.json` cubre el único pedazo que
`cases.json` no puede cubrir: los nombres de error se comparten, los **mensajes** no cruzan
el FFI (ver abajo).

Los dos son archivos **estáticos**. No se generan, no se derivan en build time, no tienen
script detrás. Se editan a mano y se versionan. Esa es toda su mecánica.

## Datos dummy

Tasas, códigos de banco, montos y la alícuota del ITF son **inventados**. No corresponden
a productos reales del banco ni pretenden exactitud financiera. Lo que se demuestra es que
cuatro plataformas producen el mismo string desde el mismo core.

Los **algoritmos**, en cambio, sí son normativos: están especificados abajo y `rust-core`
debe implementarlos tal cual. Un caso con `"valido": true` pasa el algoritmo; uno con
`false` lo falla por la razón de su campo `error`.

## La regla de comparación

**Igualdad exacta de strings.** `assertEquals` / `XCTAssertEqual` / `toBe` sobre el string
tal cual. Nunca comparación numérica, nunca tolerancia, nunca `assertEquals(a, b, delta)`.

Una comparación con tolerancia haría pasar el test aunque una plataforma derive en
centavos — que es exactamente el fallo que la POC existe para hacer visible.

## Cómo lo lee cada plataforma

| Proyecto | Ruta | Runner |
|---|---|---|
| `rust-core` | `../contracts/cases.json` | `cargo test --test contract` |
| `apps/android` | copiar a `src/androidTest/assets/` en el build | `androidTest` |
| `apps/ios` | agregar al bundle del test target | `XCTest` |
| `apps/react-native` | `../../contracts/cases.json` | Jest |
| `apps/web-angular` | `../../contracts/cases.json` | spec de Angular |

`messages.es.json` viaja por el mismo camino, con una diferencia: en las apps **no es solo
un archivo de test**, porque de él sale el texto que se pinta en la pantalla de error. En
`rust-core` sí es solo de test — el core no devuelve mensajes de usuario.

## Especificación de los algoritmos

Redondeo global: **2 decimales, `MidpointAwayFromZero`** (= `ROUND_HALF_UP` para positivos).
Todo monto viaja como `String` con exactamente 2 decimales.

### CCI — 20 dígitos

Posiciones 1-3 banco, 4-6 oficina, 7-18 cuenta, 19-20 dígitos de control.

```
PESOS = [3,2,9,8,7,6,5,4,3,2,9,8,7,6,5,4,3,2]        (18 posiciones)

d19 = (11 - (Σ digito[i] * PESOS[i]) mod 11) mod 11   ; si d19 > 9 -> d19 = 0
d20 = (11 - (Σ sobre los 19 con PESOS+[2]) mod 11) mod 11 ; si d20 > 9 -> d20 = 0
```

Errores: longitud ≠ 20 → `Longitud`; dígitos no coinciden → `DigitoControl`;
banco no está en la tabla → `BancoDesconocido`.

Tabla de bancos (dummy): `002` Banco Demo Uno · `011` Banco Demo Dos · `009` Banco Demo Tres.

### Tarjeta — Luhn

```
suma = 0 ; alternar = falso
para cada dígito de derecha a izquierda:
    d = dígito
    si alternar: d = d*2 ; si d > 9: d = d - 9
    suma += d ; alternar = !alternar
válida  <=>  suma mod 10 == 0
```

Marca por prefijo: `4` Visa · `51-55` o `2221-2720` Mastercard · `34`/`37` Amex.
Enmascarado: primeros 4 + `" **** **** "` + últimos 4.
Longitud aceptada 13-19; fuera de rango → `Longitud`, Luhn falla → `DigitoControl`.

### ITF

```
ALICUOTA = 0.00005            (0.005 %, constante nombrada, nunca literal suelto)
itf = redondear2(monto * ALICUOTA)
```

`itf-002` (3500.00 → 0.175 → **0.18**) da el mismo resultado bajo ambas estrategias de
redondeo al medio: con banker's rounding el 8 ya es par, así que también da `0.18`. No
alcanza para distinguir la estrategia. El caso que sí discrimina es `itf-005`
(2500.00 → 0.125 → **0.13**): con banker's rounding el resultado sería `0.12`, porque
el 2 es par. La regla normativa del contrato no cambia: 2 decimales, medio hacia
afuera del cero.

### Aritmética

```
add(a,b)      = redondear2(a + b)
subtract(a,b) = redondear2(a - b)
```

Entrada con escala libre (`"0.1"` es válido), salida **siempre** con 2 decimales.

Los seis casos de `aritmetica` están elegidos para que **los seis diverjan** bajo IEEE-754.
Verificado: `0.1 + 0.2 = 0.30000000000000004` · `82.35 - 12.34 = 70.00999999999999` ·
`1000000.10 + 0.20 = 1000000.2999999999`. Si un caso deja de diverger, deja de servir para
la demo y hay que reemplazarlo.

### Transferencia

Función pura de estado: entran las cuentas, sale el estado nuevo.

```
escala_min(x) = cantidad MÍNIMA de decimales que representa a x exacto
              = escala de x después de quitarle los ceros a la derecha
                (escala_min(1.000) = 0 ; escala_min(0.001) = 3)

si origen == destino                      -> MismaCuenta
si origen o destino no existen            -> CuentaNoEncontrada
si monto <= 0 o escala_min(monto) > 2     -> MontoInvalido
comision = itf(monto)
total    = redondear2(monto + comision)
si escala_min(saldo(origen)) > 2          -> MontoInvalido
si saldo(origen) < total                  -> SaldoInsuficiente
si escala_min(saldo(destino)) > 2         -> MontoInvalido
saldo(origen)  -= total       # el origen paga monto + ITF
saldo(destino) += monto       # el destino recibe el monto íntegro
```

**Escala de entrada: 2 decimales como máximo.** A diferencia de `aritmetica`, que acepta
escala libre en la entrada, la transferencia es **normativa** en esto: todo monto y todo
saldo entran con **2 decimales como máximo**. Un monto con más decimales devuelve
`MontoInvalido` (`tr-007`, `"0.001"`); un saldo mal escalado, también.

El porqué: sin esa regla el redondeo al formatear la salida mueve la suma total de saldos
—un saldo de `0.005` sale como `0.01`— y el invariante de abajo, "no se crea ni se destruye
dinero", deja de valer. Con `"0.001"` la transferencia además "salía bien" sin mover un
centavo: `total_debitado "0.00"` y los dos saldos intactos.

**Lo que se mide es `escala_min`, no la escala con la que el número vino escrito.** La
distinción no es cosmética: `"1.000"` vale exactamente 1, se representa exacto con 2
decimales y **se acepta** —los tres ceros a la derecha no cambian el valor, así que no
pueden cambiar el resultado—, mientras que `"0.001"` necesita 3 decimales y se rechaza. Un
chequeo sobre la escala literal rechaza los dos y deja fuera montos perfectamente válidos.
En Rust eso es `Decimal::normalize().scale()`, no `Decimal::scale()`.

Dos salidas más, ambas **deterministas** — `execute_transfer` es pura, así que no
pueden depender de reloj ni de azar: si lo hicieran, las cuatro apps mostrarían valores
distintos lado a lado, que es lo contrario de lo que la POC prueba.

    comprobante          = "TRF-" + ultimos4(origen) + "-" + ultimos4(destino) + "-" + centavos(monto)
    latencia_simulada_ms = 250 + min(parte_entera(monto), 500)

`centavos(monto)` es el monto **redondeado a 2 decimales y multiplicado por 100**,
truncado a entero. Se renderiza como **entero decimal sin ceros a la izquierda**: `100.00`
da `10000`, `3500.00` da `350000` y `0.50` da `50` — nunca `0050`, nunca con separadores.
La latencia crece con el monto y está topeada en 750 ms: montos grandes "tardan más", y lo
decide el core, no la app.

`latencia_simulada_ms` es **entero sin signo, en milisegundos** (`u32`), y es **el único
campo dentro de un `esperado` que no es un string**: se compara como número, no como texto.
Todo el resto del `esperado` —montos, comprobantes, hex de cifrado, nombres de error— se
compara por igualdad exacta de strings, según la regla de arriba. (Fuera del `esperado`,
cada caso trae además `valido`, que es un booleano y dice si se espera éxito o error.)

Lo devuelve el core y la app lo espera antes de pintar, para que la demo "parezca" una
llamada HTTP. **No hay ningún cliente HTTP en ninguna parte.**

Invariante que el test debe verificar: `Σ saldos_después == Σ saldos_antes - comision`.
No se crea ni se destruye dinero.

### Cifrado — ChaCha20-Poly1305 (IETF)

Clave 32 bytes · nonce 12 bytes · tag 16 bytes, todo en hex.
Salida = hex de `ciphertext || tag`. Clave y nonce de demo están en `_clave_demo_hex` y
`_nonce_demo_hex` del propio JSON.

El **nonce es un parámetro**, no se genera dentro del core: generarlo requeriría entropía
del sistema (una syscall), lo que rompería la regla de funciones puras — y además haría la
salida no determinista, por lo tanto no comparable entre plataformas.

> ⚠️ Reutilizar el par (clave, nonce) es **catastrófico en producción**: filtra el keystream
> y permite falsificar el tag. Aquí el nonce es fijo a propósito, para que las cuatro
> plataformas produzcan el mismo string. La gestión de claves está fuera de alcance.

Los vectores de `tarjeta` se derivaron con ChaCha20-Poly1305 de la stdlib de Node 22 —
independiente de Rust, para que el contrato no sea un snapshot del core. El test verifica
el hex exacto **y** el roundtrip `decrypt(encrypt(x)) == x`.

## Contenido

| Grupo | Casos | Cubre |
|---|---|---|
| `aritmetica` | 6 | los seis divergen bajo IEEE-754 |
| `transferencia` | 7 | feliz, redondeo del ITF, saldo insuficiente, cuenta inexistente, misma cuenta, monto 0, monto con 3 decimales |
| `cci` | 4 | válido, otro banco, dígito de control malo, longitud mala |
| `itf` | 5 | incluye `itf-005`, el que distingue medio-hacia-afuera de banker's rounding |
| `tarjeta` | 6 | Visa, Mastercard y Amex con su cifrado; dos Luhn inválidos; longitud mala |
| **Total** | **28** | v2.3.0 |

`cuentas_iniciales` trae el estado de partida de las transferencias: las mismas dos cuentas
en las cuatro apps, para que la comparación lado a lado sea limpia.

## `messages.es.json` — los mensajes de error

### Qué es y por qué existe aparte

`cases.json` comparte los **nombres** de las variantes de error (`"MismaCuenta"`,
`"DigitoControl"`), y el test de contrato de cada plataforma los compara por igualdad exacta. Los
**mensajes**, en cambio, no cruzan el FFI: uniffi no usa el `Display` de `thiserror`, arma
el `message` a partir de los campos de la variante (en Kotlin, `Length` sale como
`field=cci, expected=20, received=18`) y devuelve **el string vacío** para las variantes sin
campos, como `CheckDigit`. En Swift el texto es `String(reflecting: self)`, o sea el volcado
de debug del enum, distinto del de Kotlin. Verificado sobre los bindings generados; el
detalle está en [rust-core/FFI.md](../rust-core/FFI.md) y los comandos en
[rust-core/BUILD.md](../rust-core/BUILD.md).

Consecuencia: sin este archivo, la POC probaría que las cuatro apps producen los mismos
montos y los mismos nombres de error, pero **las cuatro pantallas de error mostrarían textos
distintos** — y una de ellas, un cuadro en blanco. Es el único lugar del sistema donde la
paridad no la garantizaba nada.

Los mensajes **no los devuelve Rust** a propósito: `CLAUDE.md` pone el mapeo a mensaje de
usuario en la capa de UI, el core solo propaga `DomainError`. El beneficio práctico es que
un segundo idioma es otro archivo (`messages.en.json`) y no un cambio al core ni una
recompilación de los cuatro artefactos.

### Forma del archivo

```
version         semver propio, independiente del de cases.json
idioma          "es"
_nota           qué es y por qué los mensajes no salen del core
_placeholders   la regla de interpolación (abajo)
_fuente         de dónde salió el texto
mensajes        objeto: nombre del contrato -> mensaje de usuario
```

`mensajes` trae **exactamente las nueve variantes** de `DomainError`, ni una más ni una
menos: `Longitud`, `DigitoControl`, `BancoDesconocido`, `MontoInvalido`,
`CuentaNoEncontrada`, `MismaCuenta`, `SaldoInsuficiente`, `Cifrado` y `FueraDeRango`. Son
las mismas claves que devuelve `DomainError::contract_name()` y las mismas que aparecen en
el campo `error` de `cases.json`.

Es texto de **usuario**, no diagnóstico: se lee en una pantalla de banco. El `message` de
Kotlin y el `errorDescription` de Swift son para el log y el stacktrace, nunca para pintar.

A diferencia de `cases.json`, este archivo **lleva acentos** — es español de UI. Se lee como
UTF-8 en las cinco bases de código; leerlo como Latin-1 rompe la comparación carácter por
carácter.

### La regla de interpolación

Cuatro de los nueve mensajes traen marcadores entre llaves: `{code}`, `{id}`, `{available}`,
`{required}` y `{field}`. Se interpolan **crudos, tal como los devuelve el core**.

Nada de `NumberFormat` ni de `Intl.NumberFormat` sobre los montos de `SaldoInsuficiente`:
los formateadores de moneda de Android, iOS y el navegador no coinciden entre sí (`S/`,
`S/.`, `PEN`, separador de miles) y una diferencia ahí rompe la comparación carácter por
carácter que es toda la tesis. El formateo de moneda vive en las pantallas de montos.

`{field}` y `{code}` llegan en español desde el core (`"marca"`, `"monto"`, `"002"`): no hay
que traducirlos.

### La guardia que lo sostiene

`rust-core/crates/ffi/tests/contract.rs` lo ata en tres tests, y las otras tres plataformas
los espejan:

- `the_messages_file_has_the_expected_shape` — las claves de primer nivel son las conocidas;
- `the_messages_file_covers_the_nine_error_variants` — las claves de `mensajes` son
  exactamente los nueve `contract_name()`, ninguna vacía. Los nueve no están tipeados en el
  test: salen de las nueve variantes reales, y un `match` exhaustivo sin rama por defecto
  hace que agregar una décima **rompa la compilación** del test de contrato;
- `every_error_name_in_the_contract_has_a_user_message` — todo nombre que `cases.json` espera
  tiene su mensaje, reportando el id del caso que se quedaría sin texto.

Verificado por mutación: sacar `Cifrado` falla con `faltan: ["Cifrado"]`, agregar una clave
de más falla con `sobran: [...]`, y vaciar un mensaje falla nombrando la variante.

### Cómo agregar una variante de error

Agregar una variante a `DomainError` obliga, **en el mismo cambio**, a:

1. su brazo en `contract_name()` (el compilador lo exige en `domain` y en `ffi`);
2. su entrada en `messages.es.json`, con el mensaje de usuario;
3. su patrón en `every_variant_is_listed` del test de contrato — hasta que esté, el test de contrato no compila;
4. subir el `version` de `messages.es.json` con el mismo criterio semver de abajo: **minor**
   al agregar una entrada, **major** al cambiar o borrar el texto de una existente, porque
   ese texto es normativo para las cuatro pantallas.

Y un caso en `cases.json` que la ejercite, si el error es alcanzable desde la API pública.
Hoy tres nombres —`BancoDesconocido`, `Cifrado` y `FueraDeRango`— no tienen caso en el
contrato, así que para ellos este archivo y el test de arriba son la única fuente de verdad.

## Cómo agregar un caso

1. Id nuevo y estable (`cci-005`). **Nunca recicles ni renumeres ids existentes**: los
   cinco proyectos reportan fallos por ese id.
2. Subir `version` con semver. El criterio es si un consumidor ya escrito sigue pasando:
   - **minor** al agregar un caso nuevo, un grupo nuevo, o **un campo nuevo dentro de un
     `esperado` existente**. En los tres, ningún valor previo cambia: un consumidor viejo
     sigue en verde y solo deja de verificar lo nuevo. Es lo que hizo la v2.1.0 al sumar
     `comprobante` y `latencia_simulada_ms` a los esperados de `transferencia`.
   - **major** al corregir o eliminar un esperado existente, o al renombrar un campo, un
     grupo o un id: invalida todo build anterior.

   El campo nuevo es minor pero **no es gratis**: obliga a agregar su comparación en los
   cinco proyectos, o queda un campo del contrato que nadie verifica.
3. Corregir un esperado va **siempre en su propio commit**, con la justificación
   aritmética en el mensaje y sin mezclar cambios al core. Es la única forma de auditar
   después si el contrato se dobló para que pasara el código.
4. Si el caso nuevo espera un `error` cuyo nombre todavía no está en `messages.es.json`,
   ese mensaje se agrega en el mismo cambio. El test de contrato lo exige: sin la entrada, el test
   falla nombrando el id del caso que quedaría con la pantalla de error en blanco.
