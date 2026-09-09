# Skills por fase

Cada fase instala **solo** lo que necesita, al empezar esa fase — igual que el toolchain.
Preferencia: oficial del fabricante > el de más estrellas > ninguno.

Verificado el 2026-09-08: estrellas, existencia y si el repo es un *marketplace* de
plugins (`/plugin install`) o un repo plano de skills (copiar a `.claude/skills/`).

## Transversal — ya activo

| Skill | Fuente | Uso |
|---|---|---|
| `superpowers` 6.3.0 | `claude-plugins-official` | SDD: brainstorming → plans → subagent-driven-development. ✅ instalado |
| `test-driven-development` | dentro de superpowers | **Obligatorio desde la Fase 1.** Ver abajo. |
| `/simplify` | built-in | Al cerrar cada tarea, antes del review. |
| `/security-review` | built-in | Gate de la Fase 1 (ver nota de seguridad). |

## Fase 1 — `rust-core`

```bash
/plugin install rust-analyzer-lsp@claude-plugins-official   # oficial Anthropic
/plugin install security-guidance@claude-plugins-official   # gate de seguridad del core
```

No existe un marketplace oficial de skills de Rust más allá del LSP. Los repos de
"rust agent skills" en GitHub son de terceros sin aval; no se usan.

## Fase 2 — `apps/android`

```bash
/plugin marketplace add android/skills          # oficial Google · ★7254
/plugin install android-skills@android-skills
/plugin install kotlin-agent-skills@Kotlin      # oficial JetBrains · ★1038 (ya a nivel usuario)
```

## Fase 3 — `apps/ios`

```bash
/plugin install swift-lsp@claude-plugins-official   # oficial Anthropic (ya a nivel usuario)
```

⚠️ **`twostraws/swift-agent-skills` (★2617) no es instalable.** No es un repo de skills:
es un *directorio curado de enlaces* a skills de terceros, y su propio README advierte que
aparecer ahí **no es un aval** y que hay que leer cada skill antes de usarla. Si se quiere
alguna de esa lista, se evalúa e incorpora una por una, a mano y con criterio — no en bloque.

## Fase 4 — `apps/react-native`

```bash
/plugin marketplace add callstackincubator/agent-skills      # Callstack · ★1639
/plugin install building-react-native-apps@callstack-agent-skills
/plugin install testing-react-native-apps@callstack-agent-skills
```

`migrating-to-react-native` del mismo marketplace cubre migración incremental de apps
nativas iOS/Android a RN. No hace falta para la POC, pero es **directamente aplicable al
caso real de la empresa** — vale la pena mirarlo aparte de este proyecto.

## Fase 5 — `apps/web-angular`

`angular/skills` (oficial Angular · ★638) **no es marketplace**: es un repo plano con
`angular-developer/` y `angular-new-app/`. Se instala copiando:

```bash
git clone --depth 1 https://github.com/angular/skills /tmp/angular-skills
cp -r /tmp/angular-skills/angular-developer .claude/skills/
```

---

## Gates de calidad por tarea

Se aplican en **cada** tarea de **cada** fase, no al final:

1. **TDD** (`superpowers:test-driven-development`) — Ley de Hierro: ningún código de
   producción sin un test que falle primero. En este proyecto es literal: el caso de
   `contracts/cases.json` se escribe y se ve fallar antes que el cálculo.
2. **`/simplify`** al terminar la tarea, antes de pedir review.
3. **`superpowers:requesting-code-review`** por tarea.
4. **`superpowers:verification-before-completion`** antes de declarar la fase terminada.

## Sobre seguridad

Para las apps la seguridad está fuera de alcance: son cascarones sin red ni persistencia.

**Para `rust-core` no.** Es el componente que se propone como estándar del banco, y el
argumento de venta incluye robustez. La Fase 1 corre `/security-review` como gate de
salida, enfocado en lo que aplica a un core sin I/O:

- **Pánicos alcanzables desde el FFI** — un pánico cruzando la frontera es un crash de la
  app del banco. Ver hallazgo B1 del [review de CONTEXT](specs/2026-09-08-context-review.md):
  `panic = "abort"` desactiva el `catch_unwind` de uniffi.
- **Overflow aritmético** — `Decimal` no satura sola; hay que decidir qué pasa con montos
  absurdos y probarlo con `proptest`.
- **Entradas no confiables** — `validar_cci` y `validar_ruc` reciben texto arbitrario del
  usuario. El proptest de "nunca entra en pánico con ninguna entrada" es un test de
  seguridad, no solo de robustez.
- **`unsafe`** — el core no debe tener ni un bloque. Se verifica con
  `#![forbid(unsafe_code)]` en cada crate, que lo convierte en error de compilación.
- **Dependencias** — `cargo audit` sobre el árbol. Con `rust_decimal`, `thiserror` y
  `uniffi` el árbol es chico; mantenerlo así es parte del argumento.

## SOLID y DRY

Aplican a cada paso de cada spec:

- **SRP** — un crate por responsabilidad (`domain`, `calculation`, `validation`, `ffi`);
  un archivo por responsabilidad dentro del crate.
- **OCP** — agregar un caso a `cases.json` no debe obligar a tocar el runner del test.
- **DIP** — los crates internos **no** conocen uniffi; solo `ffi` depende de él. Es lo que
  mantiene el dominio testeable en Rust puro y rápido.
- **ISP** — `#[uniffi::Record]` como parámetro en vez de listas largas de `String`
  posicionales (hallazgo B3 del review).
- **DRY** — una sola fuente por regla: el cálculo vive en Rust y en ningún otro lado; el
  invariante del float vive en `CLAUDE.md` y los CONTEXT lo referencian (hallazgo C).
