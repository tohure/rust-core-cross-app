# rust-core-cross-app

POC: un núcleo de dominio financiero escrito en **Rust**, consumido sin reescribirse por
cuatro frontends — Android nativo, iOS nativo, React Native y web Angular.

![Arquitectura](assets/architecture-rust-core-multiplatform.png)

## Qué demuestra

Una sola tesis: **la lógica de negocio se comparte, la UI varía por plataforma.**

Tres casos de uso, con datos fake y sin red: **aritmética decimal** (el float rompe el
dinero y el core no), **una transferencia** entre dos cuentas en memoria, y el **cifrado
de un número de tarjeta** con ChaCha20-Poly1305 — el mismo hex en las cuatro plataformas,
y lo que cifra una lo descifra cualquier otra.

Un pago, una transferencia o la simulación de un crédito son la misma lógica en web que en
mobile; lo que cambia es la presentación. Si eso es cierto, el dominio y la data pueden
vivir en un solo lugar y cada plataforma poner su propia UI encima — sin duplicar reglas,
sin que se desincronicen, y sin obligar a todos los equipos a la misma tecnología de UI.

La evidencia no es una opinión de arquitectura: las cuatro apps corren los mismos casos de
[`contracts/cases.json`](contracts/README.md) y deben producir **strings idénticos carácter
por carácter**. Si pasa en las cuatro, el argumento está probado.

### Por qué strings y no números

Los montos cruzan la frontera como `String`, nunca como punto flotante. En JavaScript un
monto en `double` IEEE-754 deriva en centavos; en un banco eso no es un detalle. El core
usa `Decimal` internamente y entrega el valor ya con la escala correcta — la UI solo le
pone el `S/` y los separadores.

La pantalla de benchmark existe para hacer visible esa divergencia: compara el core contra
una implementación equivalente en Kotlin/TypeScript, y esa baseline **falla** al menos un
caso del contrato a propósito.

## Arquitectura

El fan-out no es plano. Angular **no** consume el core directamente: consume el paquete
WASM que produce el proyecto React Native.

```
rust-core/crates/ffi        (único crate exportado; domain/calculation/validation no conocen uniffi)
   │
   ├── cargo ndk + uniffi-bindgen kotlin ──> apps/android      (.so por ABI + bindings Kotlin)
   ├── xcodebuild -create-xcframework    ──> apps/ios          (XCFramework + Swift)
   └── ubrn (desde apps/react-native)
         ├── build android|ios --and-generate ──> apps/react-native  (Turbo Module / JSI)
         └── build web                        ──> WASM ──> apps/web-angular
```

## Estado

**Las seis fases están completadas: la POC está cerrada.**

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Toolchain + `contracts/cases.json` | ✅ Completada |
| 1 | `rust-core` — dominio, cálculo, validación, cifrado, FFI | ✅ Completada |
| 2 | `apps/android` — Kotlin + Compose | ✅ Completada |
| 3 | `apps/ios` — Swift + SwiftUI | ✅ Completada |
| 4 | `apps/react-native` — Turbo Module, y origen del WASM | ✅ Completada |
| 5 | `apps/web-angular` — WASM | ✅ Completada |

Cada fase terminó con su test de contrato en verde **y** con el `README.md` de su subproyecto:
comandos ya ejecutados (no deducidos) más un diagrama de arquitectura en Mermaid.

**El cierre de la Fase 5 verificó lo que sólo se podía comprobar con las cuatro apps a la
vez:** las cuatro mostrando el mismo `coreVersion()` en pantalla. Antes de regenerar los
artefactos estaban en tres SHA de git distintos, así que nunca habrían coincidido en una demo
armada sin ese chequeo — el procedimiento está en
[docs/demo-runbook.md](docs/demo-runbook.md), y no es opcional.

## Arranque

### Paso 0, y no es opcional: generar los artefactos del núcleo

**Los binarios que produce Rust no están en git.** Un clone limpio no tiene el `.so` de
Android, ni el `.xcframework` de iOS, ni el Turbo Module, ni el `.wasm` — están en
`.gitignore` a propósito, porque son artefactos de build. **Ninguna de las cuatro apps
compila sin ellos**, y el error que dan no siempre dice que eso es lo que falta.

Antes que nada, averiguá en cuál de los dos casos estás:

```bash
# desde la raíz del repo — lista los cuatro artefactos, uno por app
ls apps/android/core-financiero/src/generated/jniLibs/*/libcore_financiero.so \
   apps/ios/CoreFinanciero.xcframework/*/libcore_financiero.a \
   apps/react-native/src/generated/*.ts \
   packages/core-financiero-wasm/generated/*.wasm 2>&1 | tail -20
```

Si alguno dice `No such file or directory`, **empezá por acá**:

**→ [rust-core/BUILD.md § Generar el core que consumen las cuatro
apps](rust-core/BUILD.md#generar-el-core-que-consumen-las-cuatro-apps)**

Esa sección fija el orden de los cuatro pasos y qué artefacto deja cada uno. Dos cosas que
conviene saber antes de abrirla:

- **Es un paso manual a propósito**, fuera de cualquier build automático. Si Gradle regenerara
  el core en cada compilación, el `coreVersion()` de Android dejaría de coincidir con el de las
  otras tres.
- **Los cuatro se generan desde el mismo `HEAD`**, o los cuatro pies de `coreVersion()` dejan de
  coincidir y la comparación lado a lado de la demo deja de valer aunque las pantallas se vean
  bien.

### Paso 1: correr lo que quieras

```bash
# El núcleo, desde rust-core/
cargo test --workspace          # 71 tests
cargo test -p core_financiero --test contract   # solo los 31 vectores del contrato

# Android, desde apps/android/ — son DOS módulos Gradle desde la Fase 6
./gradlew :app:testDebugUnitTest :core-financiero:testDebugUnitTest        # 36, en la JVM
./gradlew :app:connectedDebugAndroidTest :core-financiero:connectedDebugAndroidTest  # 21, sobre aparato
./gradlew :app:installRelease                     # release para la demo: el debug es 3-4x más lento

# iOS, desde apps/ios/ — 54 tests, en simulador o aparato real
xcodebuild test -project ios-rust-test.xcodeproj -scheme ios-rust-test \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
open ios-rust-test.xcodeproj   # y a correrla con ⌘R

# React Native, desde apps/react-native/ — 129 tests (N-API + WASM)
pnpm test
cd example && pnpm exec react-native start --reset-cache   # Metro, en su propia terminal
# y en otra terminal: pnpm exec react-native run-android | run-ios

# Angular, desde apps/web-angular/ — 102 tests
pnpm test
pnpm exec ng serve                                # http://localhost:4200
```

### No hay nada que configurar a mano

Una duda razonable al llegar acá: «¿y dónde le digo a cada app cómo se llama lo que generó
Rust?». **En ningún lado.** El cableado está fijo en el código de cada proyecto y los artefactos
caen en rutas fijas: si están en su lugar, compila. La tabla de dónde vive cada cosa está en el
README de cada app, en «Antes de correrla».

Cada subproyecto tiene su README con los requisitos y el paso a paso completo:
[rust-core/README.md](rust-core/README.md), [apps/android/README.md](apps/android/README.md),
[apps/ios/README.md](apps/ios/README.md),
[apps/react-native/README.md](apps/react-native/README.md) y
[apps/web-angular/README.md](apps/web-angular/README.md).

Cada fase instala solo el toolchain y las skills que necesita: ver
[docs/superpowers/skills-by-phase.md](docs/superpowers/skills-by-phase.md).

## Documentación

| Documento | Qué contiene |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Arquitectura, invariantes, fases, ramas. Punto de entrada. |
| [contracts/README.md](contracts/README.md) | El contrato compartido y la especificación de los algoritmos. |
| [rust-core/CONTEXT.md](rust-core/CONTEXT.md) | Reglas del núcleo y contrato de API pública. |
| [apps/*/CONTEXT.md](apps/) | Una por plataforma: stack, estructura, prohibiciones. |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Specs por fase + revisión de los CONTEXT. |
| [docs/superpowers/plans/](docs/superpowers/plans/) | Planes ejecutables por fase. |

## Alcance

Es una POC de **dominio**. No hay red, ni base de datos, ni cache, ni runtime async, ni
Module Federation. Los datos son dummy: tasas, códigos de banco y montos son inventados y
no corresponden a productos reales. Lo que se demuestra es la **coincidencia entre
plataformas**, no la exactitud financiera.

## Desarrollo

Spec-Driven Development con el plugin [superpowers](https://github.com/anthropics/claude-plugins-official):
spec → plan → ejecución con TDD → review → cierre de rama. Una rama por fase.
Detalle en [CLAUDE.md](CLAUDE.md).
