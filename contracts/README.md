# contracts/

`cases.json` es el contrato compartido de la POC: un archivo de vectores golden que leen
las cinco bases de código. Que los mismos casos produzcan los mismos strings en Rust,
Android, iOS, React Native y Angular **es** la demostración del proyecto.

Es un archivo **estático**. No se genera, no se deriva en build time, no tiene script
detrás. Se edita a mano y se versiona. Esa es toda su mecánica.

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
| `rust-core` | `../contracts/cases.json` | `cargo test --test golden` |
| `apps/android` | copiar a `src/androidTest/assets/` en el build | `androidTest` |
| `apps/ios` | agregar al bundle del test target | `XCTest` |
| `apps/react-native` | `../../contracts/cases.json` | Jest |
| `apps/web-angular` | `../../contracts/cases.json` | spec de Angular |

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

`itf-002` (3500.00 → 0.175 → **0.18**) es el caso de redondeo al medio: si una plataforma
usa banker's rounding devuelve `0.17` y el test lo caza.

### Aritmética

```
sumar(a,b)  = redondear2(a + b)
restar(a,b) = redondear2(a - b)
```

Entrada con escala libre (`"0.1"` es válido), salida **siempre** con 2 decimales.

Los seis casos de `aritmetica` están elegidos para que **los seis diverjan** bajo IEEE-754.
Verificado: `0.1 + 0.2 = 0.30000000000000004` · `82.35 - 12.34 = 70.00999999999999` ·
`1000000.10 + 0.20 = 1000000.2999999999`. Si un caso deja de diverger, deja de servir para
la demo y hay que reemplazarlo.

### Transferencia

Función pura de estado: entran las cuentas, sale el estado nuevo.

```
si origen == destino                      -> MismaCuenta
si origen o destino no existen            -> CuentaNoEncontrada
si monto <= 0                             -> MontoInvalido
comision = itf(monto)
total    = redondear2(monto + comision)
si saldo(origen) < total                  -> SaldoInsuficiente
saldo(origen)  -= total       # el origen paga monto + ITF
saldo(destino) += monto       # el destino recibe el monto íntegro
```

Dos salidas más, ambas **deterministas** — `ejecutar_transferencia` es pura, así que no
pueden depender de reloj ni de azar: si lo hicieran, las cuatro apps mostrarían valores
distintos lado a lado, que es lo contrario de lo que la POC prueba.

    comprobante          = "TRF-" + ultimos4(origen) + "-" + ultimos4(destino) + "-" + centavos(monto)
    latencia_simulada_ms = 250 + min(parte_entera(monto), 500)

`centavos(monto)` es el monto redondeado a 2 decimales por 100, sin decimales. La latencia
crece con el monto y está topeada en 750 ms: montos grandes "tardan más", y lo decide el
core, no la app.

`latencia_simulada_ms` lo devuelve el core y la app lo espera antes de pintar, para que la
demo "parezca" una llamada HTTP. **No hay ningún cliente HTTP en ninguna parte.**

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
el hex exacto **y** el roundtrip `descifrar(cifrar(x)) == x`.

## Contenido

| Grupo | Casos | Cubre |
|---|---|---|
| `aritmetica` | 6 | los seis divergen bajo IEEE-754 |
| `transferencia` | 6 | feliz, redondeo del ITF, saldo insuficiente, cuenta inexistente, misma cuenta, monto 0 |
| `cci` | 4 | válido, otro banco, dígito de control malo, longitud mala |
| `itf` | 4 | incluye el caso de redondeo al medio |
| `tarjeta` | 6 | Visa, Mastercard y Amex con su cifrado; dos Luhn inválidos; longitud mala |

`cuentas_iniciales` trae el estado de partida de las transferencias: las mismas dos cuentas
en las cuatro apps, para que la comparación lado a lado sea limpia.

## Cómo agregar un caso

1. Id nuevo y estable (`cci-005`). **Nunca recicles ni renumeres ids existentes**: los
   cinco proyectos reportan fallos por ese id.
2. Subir `version` con semver: **minor** al agregar un caso; **major** al corregir un
   esperado existente (invalida todo build anterior).
3. Corregir un esperado va **siempre en su propio commit**, con la justificación
   aritmética en el mensaje y sin mezclar cambios al core. Es la única forma de auditar
   después si el contrato se dobló para que pasara el código.
