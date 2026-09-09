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

### RUC — 11 dígitos

```
PESOS = [5,4,3,2,7,6,5,4,3,2]
resto = 11 - (Σ digito[i] * PESOS[i]) mod 11
digito_verificador = 0 si resto == 10, 1 si resto == 11, si no resto
```

### ITF

```
ALICUOTA = 0.00005            (0.005 %, constante nombrada, nunca literal suelto)
itf = redondear2(monto * ALICUOTA)
```

`itf-002` (3500.00 → 0.175 → **0.18**) es el caso de redondeo al medio: si una
plataforma usa banker's rounding devuelve `0.17` y el test lo caza.

### Cronograma — método francés

```
TEM       = (1 + TEA/100)^(1/12) - 1
cuota_base = redondear2( monto * TEM / (1 - (1+TEM)^-n) )

para k en 1..n:
    interes[k] = redondear2( saldo * TEM )
    seguro[k]  = redondear2( saldo * tasa_seguro/100 )
    capital[k] = redondear2( cuota_base - interes[k] )
    si k == n: capital[k] = saldo          # la última absorbe el ajuste
    total[k]   = redondear2( capital[k] + interes[k] + seguro[k] )
    saldo      = redondear2( saldo - capital[k] )
```

Invariantes que el test debe verificar, no solo los totales:
`Σ capital == monto exacto` · `saldo final == 0` · `todo saldo >= 0`.

**TCEA:** TIR mensual por Newton-Raphson sobre el flujo real `[-monto, total[1..n]]`,
tolerancia `1e-10`, máx 100 iteraciones, anualizada como `((1+tir)^12 - 1) * 100`.
Si no converge → `FueraDeRango`.

> En Rust, `(1+x)^(1/12)` con `Decimal` requiere el feature `maths` de `rust_decimal`
> (`MathematicalOps::powd`). No está en el crate por defecto.

## Caso canario

`cred-002` tiene `seguro: "0.00"`, así que su **TCEA debe dar exactamente igual a su TEA
(22.00%)**: sin seguro ni comisiones la TIR del flujo es la propia tasa. Si ese caso no
cuadra, el Newton-Raphson está mal, sin importar qué digan los otros dos.

## Contenido

| Grupo | Casos | Cubre |
|---|---|---|
| `cci` | 4 | válido, otro banco, dígito de control malo, longitud mala |
| `ruc` | 4 | dos válidos, dígito verificador malo, longitud mala |
| `itf` | 4 | incluye el caso de redondeo al medio |
| `cronograma` | 3 | base; **sin seguro** (`cred-002`); monto con centavos a 48 cuotas |

Cada cronograma trae la tabla `cuotas` completa, no solo los totales.

## Cómo agregar un caso

1. Id nuevo y estable (`cci-005`). **Nunca recicles ni renumeres ids existentes**: los
   cinco proyectos reportan fallos por ese id.
2. Subir `version` con semver: **minor** al agregar un caso; **major** al corregir un
   esperado existente (invalida todo build anterior).
3. Corregir un esperado va **siempre en su propio commit**, con la justificación
   aritmética en el mensaje y sin mezclar cambios al core. Es la única forma de auditar
   después si el contrato se dobló para que pasara el código.
