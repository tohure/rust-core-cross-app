# Plan — Fase 0: Toolchain y contrato

**Spec:** [`../specs/2026-09-08-toolchain-y-contrato-design.md`](../specs/2026-09-08-toolchain-y-contrato-design.md)
**Rama:** `feat/fase-0-toolchain-y-contrato`
**Entregable:** entorno Rust funcionando + `contratos/casos.json` v1.0.0

## Archivos que toca esta fase

| Archivo | Responsabilidad |
|---|---|
| `contratos/casos.json` | **Nuevo.** Vectores golden. Contrato compartido por los 5 proyectos. |
| `contratos/README.md` | **Nuevo.** Cómo se lee el archivo desde cada plataforma y cómo se agrega un caso. |
| `CLAUDE.md` | Quitar la nota de "pendiente conocido" de `contratos/`. |
| `README.md` | **Vacío hoy.** Portada: qué es la POC, el diagrama de dependencias, cómo arrancar. |
| `CONTEXT.md` (raíz) | **Vacío hoy.** Decidir: llenarlo o borrarlo (ver Tarea 5). |

No se crea nada dentro de `rust-core/` en esta fase.

---

## Tarea 1 — Instalar el toolchain base de Rust

**Solo el toolchain host.** Nada de targets de Android, iOS ni wasm: esos entran en sus
fases (tabla en la spec).

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup toolchain install stable
rustup component add clippy rustfmt
```

**Verificación (obligatoria antes de seguir):**
```bash
cargo --version && rustc --version && cargo clippy --version && cargo fmt --version
```
Los cuatro deben imprimir versión. Si `cargo` no se encuentra en una shell nueva, el
`source` de `~/.cargo/env` no quedó en el perfil de zsh — arreglarlo ahora, no después.

**Commit:** ninguno (no cambia el repo). Dejar constancia de las versiones en el
mensaje del commit de la Tarea 2.

---

## Tarea 2 — Escribir `contratos/casos.json` v1.0.0

Estructura base, extendida respecto del ejemplo en `rust-core/CONTEXT.md` para cubrir
también RUC e ITF:

```json
{
  "version": "1.0.0",
  "moneda": "PEN",
  "cronograma": [...],
  "cci": [...],
  "ruc": [...],
  "itf": [...]
}
```

Escribir los casos **a mano**, en este orden (de más fácil de verificar a más difícil):

1. **`cci`** — 3 casos. Las posiciones y el dígito de control están definidos en
   `rust-core/CONTEXT.md`. Verificables con aritmética simple.
2. **`ruc`** — 2 casos. Módulo 11 con pesos `[5,4,3,2,7,6,5,4,3,2]`.
3. **`itf`** — 2 casos. La alícuota va como constante nombrada en el core; en el JSON
   va el resultado ya redondeado a 2 decimales.
4. **`cronograma`** — 3 casos (base, ajuste de última cuota, plazo largo). Método
   francés, cuota constante, `MidpointAwayFromZero`. Para cada uno, incluir en el JSON
   `primera_cuota`, `total_intereses` y la **última** cuota (ahí es donde vive el ajuste
   por redondeo, y es el caso que más falla).
   Poner `"tcea": null` — se llena en Fase 1 (ver riesgos en la spec).

Todos los montos son **strings** con 2 decimales exactos. Ningún número suelto para
dinero en el JSON, ni siquiera aquí.

**Verificación:**
```bash
python3 -m json.tool contratos/casos.json > /dev/null && echo "JSON válido"
python3 -c "
import json; d=json.load(open('contratos/casos.json'))
assert d['version']=='1.0.0'
for k in ('cronograma','cci','ruc','itf'):
    assert d[k], f'{k} vacío'
    ids=[c['id'] for c in d[k]]
    assert len(ids)==len(set(ids)), f'ids duplicados en {k}'
print({k:len(d[k]) for k in ('cronograma','cci','ruc','itf')})
"
```

**Commit:** `feat(contratos): agregar casos.json v1.0.0 como contrato compartido`

---

## Tarea 3 — `contratos/README.md`

Corto y operativo. Debe responder tres cosas:
- Cómo lo carga cada plataforma (Rust `tests/`, `androidTest/`, bundle de XCTest, Jest,
  spec de Angular) — la ruta relativa desde cada proyecto.
- La regla de comparación: igualdad exacta de strings, nunca tolerancia numérica.
- Cómo se agrega un caso: id nuevo estable, nunca reciclar ni renumerar ids existentes,
  y actualizar `version` con semver (caso nuevo = minor; corregir un esperado = major,
  porque invalida builds previos).

**Commit:** `docs(contratos): documentar el formato y las reglas de casos.json`

---

## Tarea 4 — `README.md` de la raíz

Hoy tiene solo el título. Contenido mínimo: qué demuestra la POC, el diagrama de
dependencias de build (copiarlo de `CLAUDE.md`), el estado por fase, y el arranque
rápido. Sin duplicar reglas que ya viven en los `CONTEXT.md`: enlazar, no repetir.

**Commit:** `docs: portada del proyecto con arquitectura y estado por fase`

---

## Tarea 5 — Resolver el `CONTEXT.md` de la raíz

Está vacío (0 bytes). Hay dos opciones y **hay que elegir una**, porque un archivo
vacío con ese nombre invita a que alguien escriba ahí reglas que contradigan a
`CLAUDE.md`:

- **(a) Borrarlo.** `CLAUDE.md` ya cumple ese rol para la raíz. Recomendada.
- **(b) Llenarlo** con el contexto de negocio (el encargo del banco, por qué Rust, qué
  se evalúa) y que `CLAUDE.md` lo enlace como lectura de fondo.

Decidir con el humano antes de ejecutar.

**Commit:** según la opción elegida.

---

## Tarea 6 — Actualizar `CLAUDE.md` y cerrar la fase

Quitar el bloque "Pendiente conocido" de la sección de `contratos/`, ya resuelto.
Marcar Fase 0 como completada en la lista de fases.

**Verificación final de la fase:**
```bash
cargo --version                                    # toolchain listo
python3 -m json.tool contratos/casos.json >/dev/null # contrato válido
git log --oneline feat/fase-0-toolchain-y-contrato   # historia limpia
```

**Commit:** `docs(claude): marcar fase 0 completada`

Luego: `superpowers:finishing-a-development-branch` para cerrar la rama.

---

## Nota de ejecución

Esta fase es casi toda configuración y datos, no código, así que
`test-driven-development` no aplica en su forma estricta. Sí aplica su espíritu y es el
punto entero de la fase: **el criterio de aceptación (`casos.json`) se escribe antes que
la implementación que debe satisfacerlo.**

A partir de la Fase 1 sí aplica la Ley de Hierro: ningún cálculo sin un test que falle primero.
