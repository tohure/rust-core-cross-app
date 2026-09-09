# contratos/

`casos.json` es el contrato compartido de la POC: un solo archivo de vectores golden
que leen las cinco bases de código. Que los mismos casos produzcan los mismos strings
en Rust, Android, iOS, React Native y Angular **es** la demostración del proyecto.

## Datos dummy

Las tasas, códigos de banco, montos y la alícuota del ITF son **inventados**. No
corresponden a productos reales del banco ni pretenden exactitud financiera. Lo que se
demuestra es que cuatro plataformas producen el mismo string a partir del mismo core,
no que el cálculo replique un producto de producción.

Los algoritmos, en cambio, sí son internamente consistentes y están documentados en
`generador/generar_casos.py`. Un caso marcado `"valido": true` pasa el algoritmo; uno
marcado `false` lo falla por la razón que indica su campo `error`.

## Cómo lo lee cada plataforma

| Proyecto | Ruta | Runner |
|---|---|---|
| `rust-core` | `../contratos/casos.json` | `cargo test --test golden` |
| `apps/android` | copiar a `src/androidTest/assets/` en el build | `androidTest` |
| `apps/ios` | agregar al bundle del test target | `XCTest` |
| `apps/react-native` | `../../contratos/casos.json` | Jest |
| `apps/web-angular` | `../../contratos/casos.json` | spec de Angular |

## La regla de comparación

**Igualdad exacta de strings.** `assertEquals` / `XCTAssertEqual` / `toBe` sobre el
string tal cual. Nunca comparación numérica, nunca tolerancia, nunca `assertEquals(a, b, delta)`.

Una comparación con tolerancia haría pasar el test aunque una plataforma derive en
centavos — que es exactamente el fallo que la POC existe para hacer visible.

## Contenido

| Grupo | Casos | Cubre |
|---|---|---|
| `cci` | 4 | válido, otro banco, dígito de control malo, longitud mala |
| `ruc` | 4 | dos válidos, dígito verificador malo, longitud mala |
| `itf` | 4 | incluye `itf-002` (3500.00 → 0.175 → **0.18**), el caso de redondeo al medio |
| `cronograma` | 3 | base; **sin seguro** (`cred-002`); monto con centavos a 48 cuotas |

`cred-002` tiene `seguro: "0.00"`, así que su **TCEA debe dar exactamente igual a la TEA
(22.00%)**. Es el caso canario del Newton-Raphson: si la TCEA de ese caso no es idéntica
a su TEA, la implementación de la TIR está mal, sin importar qué digan los otros dos.

Cada cronograma trae la tabla `cuotas` completa, no solo los totales: el invariante
"suma de capitales == monto exacto" y "saldo final == 0" se verifica cuota por cuota.

## Cómo agregar un caso

1. Id nuevo y estable (`cci-005`). **Nunca recicles ni renumeres ids existentes**: los
   cinco proyectos reportan fallos por ese id y el historial se vuelve ilegible.
2. Subir `version` con semver:
   - **minor** — agregar un caso nuevo (no invalida builds previos).
   - **major** — corregir un valor esperado existente (invalida todo build anterior).
3. Corregir un esperado va **siempre en su propio commit**, con la justificación
   aritmética en el mensaje y sin mezclar cambios al core. Es la única forma de auditar
   después si el contrato se dobló para que pasara el código.

## `generador/`

Implementación de referencia en Python que se usó una sola vez para derivar la v1.0.0.
**No es parte del build, no la consume ninguna app y no es fuente de verdad.**

Existe para que los esperados vinieran de una implementación *independiente* de Rust:
si el core y este script coinciden, dos implementaciones separadas llegaron al mismo
string. Si se hubieran generado corriendo el propio core, `casos.json` sería un snapshot
de la implementación y consagraría cualquier bug como "lo esperado".

Si algún día el script y `casos.json` discrepan, **gana `casos.json`**.

```bash
python3 contratos/generador/generar_casos.py   # imprime el JSON por stdout
```
