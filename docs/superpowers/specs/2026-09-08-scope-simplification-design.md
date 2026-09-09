# Recorte de alcance — propuesta

**Fecha:** 2026-09-08 · **Estado:** propuesto, pendiente de aprobación
**Motivo:** el alcance de los CONTEXT es más pesado que lo que la POC necesita demostrar.

## El problema

`rust-core/CONTEXT.md` especifica un cronograma francés completo con TCEA resuelta por
Newton-Raphson. Eso es **días de trabajo y la parte más frágil del proyecto** — y no es lo
que la POC quiere probar. La tesis es "un core en Rust reutilizable en 4 plataformas evita
errores"; para eso no hace falta un simulador de créditos.

Peor: es la parte con más superficie de fallo. Si el Newton-Raphson no converge en un caso
borde, se pierde la demo por algo que no era el punto.

## Lo que la POC necesita demostrar

Tres cosas, en orden de fuerza para la audiencia:

1. **Que el float rompe el dinero** — y que el core no.
2. **Que un caso de negocio real** (una transferencia) vive una sola vez y corre igual en
   las cuatro plataformas.
3. **Que Rust aporta algo que las plataformas no tienen fácil** — cifrado idéntico en las
   cuatro.

## API propuesta

### Caso 1 — Aritmética decimal (el problema, en una pantalla)

```rust
#[uniffi::export] pub fn sumar(a: String, b: String) -> Result<String, ErrorDominio>;
#[uniffi::export] pub fn restar(a: String, b: String) -> Result<String, ErrorDominio>;
```

La pantalla muestra lado a lado, con los mismos dos inputs:

```
0.1 + 0.2
  Double de esta plataforma : 0.30000000000000004
  Core Rust                 : 0.30
```

Es la lámina más barata de construir y la más difícil de discutir. Cada plataforma calcula
su lado con su tipo nativo — es la única parte del repo donde se permite usar `Double`,
y existe precisamente para exhibir el fallo.

### Caso 2 — Transferencia entre cuentas fake (el uso real)

```rust
#[derive(uniffi::Record)] pub struct Cuenta {
    pub id: String, pub titular: String, pub saldo: String,
}
#[derive(uniffi::Record)] pub struct SolicitudTransferencia {
    pub origen: String, pub destino: String, pub monto: String,
}
#[derive(uniffi::Record)] pub struct ResultadoTransferencia {
    pub cuentas: Vec<Cuenta>,          // el estado NUEVO, ya aplicado
    pub comision_itf: String,
    pub total_debitado: String,
    pub comprobante: String,
    pub latencia_simulada_ms: u32,     // "simula" la llamada HTTP
}

#[uniffi::export] pub fn ejecutar_transferencia(
    cuentas: Vec<Cuenta>,
    solicitud: SolicitudTransferencia,
) -> Result<ResultadoTransferencia, ErrorDominio>;
```

**El core sigue siendo puro.** Entra el estado, sale el estado nuevo — como un reducer. La
app guarda las cuentas en memoria y las tira al cerrar: sin BD, sin cache, sin red. Y la
"conexión HTTP" es la app esperando `latencia_simulada_ms` antes de pintar el resultado.

Esto resuelve la tensión que quedó abierta: se puede "registrar una transferencia" sin
romper la regla 1 (funciones puras). El `CONTEXT` ya anticipaba esto al mencionar una
"máquina de estados de transferencia" en el crate de dominio.

Valida: cuenta origen existe, destino existe y es distinta, saldo suficiente, monto > 0.

### Caso 3 — Cifrado (opcional, el argumento de seguridad)

```rust
#[uniffi::export] pub fn cifrar(texto: String, clave: String) -> Result<String, ErrorDominio>;
#[uniffi::export] pub fn descifrar(cifrado: String, clave: String) -> Result<String, ErrorDominio>;
```

ChaCha20-Poly1305. El mismo texto cifrado en Android se descifra en el web — cuatro
plataformas, una implementación, sin depender de la cripto de cada SO.

> **Ojo con el test golden:** un cifrado correcto usa nonce aleatorio, así que la salida
> **no** es determinista y no puede compararse por string. El contrato prueba
> *roundtrip* (`descifrar(cifrar(x)) == x`) más un vector de nonce fijo. Si esto se
> considera demasiada sutileza para la POC, se corta el caso 3 sin perder el argumento.

### Se mantienen

`validar_cci` (valida la cuenta destino de la transferencia) · `calcular_itf` (alimenta la
comisión) · `version_core`.

### Se eliminan

`generar_cronograma`, `Cronograma`, `Cuota`, la TCEA y todo Newton-Raphson · `validar_ruc`
(no lo usa ningún caso).

## Impacto en `contracts/cases.json`

| Grupo | Acción |
|---|---|
| `cronograma` | ❌ eliminar (3 casos) |
| `ruc` | ❌ eliminar (4 casos) |
| `cci` | ✅ se queda (4 casos) |
| `itf` | ✅ se queda (4 casos) |
| `aritmetica` | ➕ nuevo — incluye el clásico `0.1 + 0.2` |
| `transferencia` | ➕ nuevo — feliz, saldo insuficiente, cuenta inexistente, misma cuenta |

Sube a `version: "2.0.0"`: eliminar esperados es un cambio mayor.

## Lo que esto ahorra

Desaparece la parte más frágil (convergencia de Newton-Raphson, ajuste de redondeo en la
última cuota, 48 filas de cronograma que cuadren al centavo en cuatro plataformas) y se
gana la que más comunica (la divergencia del float, en una pantalla de dos líneas).

El resto de la arquitectura no se mueve: mismo grafo de build, mismo invariante
`Decimal → String`, mismo contrato compartido, mismas cuatro apps.
