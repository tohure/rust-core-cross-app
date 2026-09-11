# Fase 3 — `apps/ios`: diseño

**Fecha:** 2026-09-10
**Rama:** `feat/phase-3-app-ios`
**Entrada:** [apps/ios/CONTEXT.md](../../../apps/ios/CONTEXT.md) y
[docs/ui-spec.md](../../ui-spec.md)
**Estado:** aprobado, pendiente de plan de implementación

## Qué entrega esta fase

El segundo consumidor de `rust-core`, y el primero que cruza el FFI **sin JNA de por medio**:
en iOS el `.a` se enlaza estáticamente y Swift lo ve por un modulemap. Al cerrar, la fase deja:

1. El **test de contrato en verde**, 28/28 contra `contracts/cases.json` v2.3.0, sobre el
   simulador y con una corrida sobre hardware real.
2. `apps/ios/README.md` con los comandos **efectivamente ejecutados** y su diagrama Mermaid,
   más `BUILD.md`, `TESTING.md` y `PENDING.md`.
3. Las cinco pantallas de [`docs/ui-spec.md`](../../ui-spec.md), con los mismos labels y el
   mismo orden de campos que Android.

**Lo que ya está hecho antes de esta spec:** el proyecto Xcode existe, fue aplanado a la raíz
de `apps/ios/` para que quede tan plano como `apps/android/`, y **compila** contra el simulador
iPhone 17 Pro (`** BUILD SUCCEEDED **`, verificado). Nada más: no hay una línea de Swift propia.

## El riesgo, y por qué ordena todo lo demás

En la Fase 2 el riesgo era que nada había cruzado JNA. Acá es mayor, porque **nada linkeó nunca
el XCFramework** y hay cuatro cosas sin ejercitar, tres de ellas documentadas como trampas:

| Riesgo | Estado verificado hoy |
|---|---|
| Los targets de Rust para iOS | **no están instalados** — `rustup target list --installed` lista solo `aarch64-apple-darwin` y los tres de Android |
| El modulemap que uniffi emite con **otro nombre** | documentado en el CONTEXT, nunca ejecutado |
| Los **dos slices** del XCFramework son binarios distintos | ninguno se ha construido |
| Que Swift resuelva los símbolos del `.a` | nunca ocurrió |

De ahí el orden, igual que en la Fase 2: **el primer commit no es una pantalla.** Es la cadena
entera —instalar los dos targets, compilar los dos `.a`, generar los bindings Swift, armar el
directorio de headers con el renombre, crear el XCFramework, enlazarlo— hasta **un único test
que llame `coreVersion()` en el simulador**. Si pasa, el resto es mecánico. Si falla, falla en
diez minutos con un mensaje claro y no en la hora doce.

El entorno verificado sobre el que se apoya todo esto: Xcode 26.6 (build 17F113), SDK iOS 26.5,
Swift 6.3.3, simuladores iOS 18.5 y 26.5, y Rust 1.98.1.

---

## Decisiones

### D1 — El proyecto Xcode existente se queda, con cuatro correcciones

Lo creó Xcode y ya está aplanado. `objectVersion = 77` con `fileSystemSynchronizedGroups`
—carpetas sincronizadas, no listas de archivos— y **cero rutas absolutas**, que es lo que hizo
seguro moverlo de nivel. Lo que le falta:

| Qué | Hoy | Queda | Por qué |
|---|---|---|---|
| `IPHONEOS_DEPLOYMENT_TARGET` | `26.5` | `17.0` | ver D2 |
| `PRODUCT_BUNDLE_IDENTIFIER` | `dev.tohure.ios-rust-test.ios-rust-test` | `dev.tohure.ios-rust-test` | Xcode duplicó el segmento |
| Target `ios-rust-testUITests` | existe, vacío | **se borra** | Android no tiene suite de UI y esta POC tampoco la pide. Un target que se compila sin probar nada es ceremonia |
| Scheme | solo en `xcuserdata/` (gitignorado) | **compartido y commiteado** | hoy un clon fresco no tiene scheme y `xcodebuild -scheme` depende de que Xcode lo autocree. El README promete comandos que funcionan |

`SWIFT_VERSION` se queda en **5.0**. Swift 6 con concurrencia estricta traería un problema que
esta POC no tiene: las llamadas al core son síncronas y no cruzan actores.

### D2 — Deployment target 17.0

El `CONTEXT.md` decía "iOS 16+", Xcode puso 26.5, y la sección de ViewModel del propio CONTEXT
pide `@Observable`, que es iOS 17+. Las tres no podían ser ciertas. Se cierra en **17.0**:

- **`@Observable` disponible** — menos ceremonia que `ObservableObject` + `@Published`, e
  invalida solo las vistas que leen la propiedad que cambió.
- **La firma de dos parámetros de `.onChange(of:)`**, que es la vigente.
- **Liquid Glass no se pierde.** El diseño lo decide **el SDK contra el que se compila** —el
  26.5 de Xcode 26—, no el deployment target: en un aparato con iOS 26 los controles estándar
  adoptan la apariencia nueva igual. En uno con iOS 17 la misma app se ve con la anterior.
- Cualquier API **exclusiva** de iOS 26 —`.glassEffect()`, `GlassEffectContainer`— necesita
  `if #available(iOS 26, *)`, y esos guards viven **confinados en `UI/Components/`**. Es la
  regla que hace barato mover el piso después: bajar o subir el target es editar cinco
  componentes, no barrer cuatro pantallas.

Aparatos que quedan disponibles: simuladores 18.5 y 26.5, el iPad Air con iOS 26, y el iPhone
físico una vez actualizado a 17+.

### D3 — El core se construye a mano y se documenta, no en una Run Script Phase

Igual que Android. Una fase de script que corra `cargo` en cada build ata Xcode a ver `rustup`
en **su** `PATH` —que no es el del shell del usuario—, alarga cada compilación, y esconde
justamente el paso que la POC quiere exhibir. El pipeline vive en `apps/ios/BUILD.md`, escrito
**durante** el primer commit, copiando los comandos que ese commit ejecuta.

Los comandos canónicos ya están en [`rust-core/CONTEXT.md`](../../../rust-core/CONTEXT.md) y de
ahí se copian, incluido el bloque de tres líneas que arma `Generated/include` con el
`module.modulemap` renombrado. No se deducen.

### D4 — Los JSON del contrato se copian al bundle en tiempo de build, directo al producto

Android los copia a `assets/` con una tarea Gradle registrada antes de `preBuild`. Acá se hace
una vuelta mejor: una **Run Script Phase** —en el target de app y en el de test— que copia los
dos JSON directo al bundle construido, declarando `inputPaths`/`outputPaths` para que el
sistema de build los rastree e invalide.

```bash
DST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
cp "$SRCROOT/../../contracts/cases.json"       "$DST/"
cp "$SRCROOT/../../contracts/messages.es.json" "$DST/"
```

Sin copia intermedia en el árbol de fuentes, sin entrada nueva en `.gitignore`, y **sin la
posibilidad de un JSON viejo en el bundle** — que es el modo de fallar que deja a Rust en verde
y a la pantalla de error mostrando otra cosa.

Los dos archivos van a **los dos** bundles, por el mismo reparto que en Android:

| Archivo | Bundle de app | Bundle de test | Para qué |
|---|---|---|---|
| `cases.json` | sí | sí | prod: `cuentas_iniciales` · test: los 28 casos |
| `messages.es.json` | sí | sí | prod: los mensajes de error · test: la guardia de las nueve variantes |

`cuentas_iniciales` en producción no es desperdicio: las dos cuentas son datos del contrato, y
hardcodearlas en Swift las haría divergir de las otras tres apps.

### D5 — La documentación nace partida, no se parte después

Android terminó partiendo su README en cuatro (`b6d1176`, *"el README se parte en cuatro, uno
por pregunta"*). Esa lección ya está pagada; iOS arranca así:

| Archivo | La pregunta que contesta | Cuándo se escribe |
|---|---|---|
| `README.md` | ¿Qué es esto y cómo la corro? | al cierre, copiando comandos que ya corrieron |
| `BUILD.md` | ¿Cómo construyo el core, los bindings y el XCFramework? | **en el primer commit** — es lo que ese commit ejecuta |
| `TESTING.md` | ¿Qué suites hay y qué prueba cada una? | junto con el test de contrato |
| `PENDING.md` | ¿Qué NO hace y por qué? | se llena sobre la marcha |
| `CONTEXT.md` | la spec de entrada | ya existe; se corrige (ver "Correcciones") |

El **diagrama Mermaid** va en el `README.md`, como pide el criterio de cierre de fase: el camino
desde el `.a` que produce Rust hasta la pantalla SwiftUI.

### D6 — Skills, formato y gates

| Qué | Estado verificado | Acción |
|---|---|---|
| `swift-lsp@claude-plugins-official` | habilitado a nivel **usuario**; `sourcekit-lsp` presente en Xcode 26 | declararlo en el `.claude/settings.json` del repo, al lado de `superpowers` — hoy el repo no lo declara y un clon fresco no lo tiene |
| `swift-format` 6.3.0 | viene con Xcode, en el toolchain por defecto | es el `cargo fmt` de esta fase: `.swift-format` commiteado en `apps/ios/` y el comando en `TESTING.md` |
| `twostraws/swift-agent-skills` | ★2617 pero **no instalable** | descartado como bloque, según [`skills-by-phase.md`](../skills-by-phase.md) |

Gates por tarea, sin cambios: **TDD** → **`/simplify`** → **`requesting-code-review`** →
**`verification-before-completion`**. `/security-review` **no** es gate acá: `skills-by-phase.md`
lo reserva para `rust-core`, porque las apps son cascarones sin red ni persistencia.

### D7 — CodeGraph: qué contesta y qué no

Dos hechos verificados durante el brainstorming, no supuestos:

1. **CodeGraph respeta `.gitignore`.** Evidencia: `FfiConverterString` aparece **92 veces** en el
   binding Kotlin generado de Android, y `codegraph_search` devuelve **cero** resultados. Por lo
   tanto `apps/ios/Generated/core_financiero.swift` **nunca** va a estar en el índice.
   - *Consecuencia buena:* el índice no se llena de converters de FFI — 763 nodos hoy, todos
     código escrito a mano. **No se "arregla" sacándolo del `.gitignore`.**
   - *Consecuencia operativa:* **para confirmar una firma del binding generado, CodeGraph no
     sirve.** Y hay que confirmarlas: el CONTEXT insiste en que las nueve firmas Swift se
     *leyeron* de los bindings, no se dedujeron. Regla de trabajo: `codegraph_*` para el código
     de la app, lectura directa del archivo para el borde uniffi.
2. **El watcher no capta un `mv` de árbol entero.** Ocurrió al aplanar la carpeta: el índice
   siguió mostrando los paths viejos hasta correr `codegraph index --force`. Tras cualquier
   movimiento estructural, reindexar. Va a `BUILD.md`.

### D8 — Los seams: dos fuertes y uno honestamente débil

Android tiene tres seams. Acá hay que decir algo incómodo en vez de copiar la justificación:
**en iOS el seam de `CoreFinanciero` pierde su fuerza principal.** En Android existía porque los
tests de JVM *no pueden* cargar la `.so` — una restricción física. En iOS los tests corren en el
simulador enlazados contra la app, así que **pueden llamar al core real**. La restricción no
existe.

| Seam | Fuerza en Android | Fuerza en iOS |
|---|---|---|
| `CoreFinanciero` (protocolo) | **fuerte** — sin él no hay test sin emulador | **débil** — se conserva por determinismo de los tests de ViewModel y por paridad estructural con Android, no por necesidad técnica |
| `ContractSource` | saca `Context` del ViewModel | **fuerte, y distinta**: producción lee de `Bundle.main` y el test de `Bundle(for:)`. El mismo código tiene que leer de dos bundles |
| `MessageSource` | ídem | ídem, más "un segundo idioma es otro archivo, no un cambio de código" |

Se conserva el protocolo, **con el motivo escrito**. Un seam que se mantiene por paridad es
defendible; uno que se mantiene fingiendo una necesidad que no existe, no.

**Cableado sin librería de DI**, igual que Android: un `AppContainer` manual. Con cinco
pantallas y tres dependencias, explícito gana.

### D9 — Sin mapeo de tipos, y sin una sola dependencia

`Account`, `TransferRequest`, `TransferResult`, `ValidCci` y `ValidCard` se usan **tal como los
emite uniffi**. Un `toDomain()` duplicaría el contrato en Swift, se desincronizaría en la primera
regeneración de bindings, y es exactamente lo que el proyecto argumenta que no hay que hacer. El
protocolo de D8 existe para sustituir la implementación, **no para traducir los tipos**.

Y algo que iOS puede presumir sobre Android: **cero paquetes SPM.** Android necesitó JNA porque
los bindings de uniffi corren sobre ella; Swift habla con el `.a` por el modulemap, sin
intermediario. `Package.resolved` no va a existir en este proyecto.

### D10 — Estructura: espejo archivo por archivo de Android

```
apps/ios/
├── CONTEXT.md · BUILD.md · TESTING.md · PENDING.md · README.md · .swift-format
├── CoreFinanciero.xcframework/     generado · gitignorado
├── Generated/                      generado · gitignorado
├── ios-rust-test.xcodeproj/
├── ios-rust-test/
│   ├── ios_rust_testApp.swift
│   ├── AppContainer.swift          cableado manual, sin DI
│   ├── Adapter/                    CoreFinanciero · UniffiCoreFinanciero · ContractMessages
│   ├── Contract/                   ContractSource · BundleContractSource
│   │                               MessageSource · BundleMessageSource
│   ├── Format/                     MoneyFormatter
│   └── UI/
│       ├── Theme/                  paleta naranja/azul/blanco, fija
│       ├── Components/             ScreenHeader · LabeledField · ResultRow
│       │                           SectionDivider · CoreVersionFooter
│       ├── Navigation/             BancoApp.swift — TabView de cuatro pestañas
│       ├── Arithmetic/ Transfer/ Card/
│       └── Benchmark/              + NativeBaseline.swift (la excepción, comentada)
└── ios-rust-testTests/
```

**Identificadores en inglés**, como manda `CLAUDE.md`: `ArithmeticView.swift`, no
`AritmeticaView.swift`. El espejo archivo por archivo con Android no es estética — la demo es una
comparación lado a lado, y el code review también.

Detalle que paga solo: como el proyecto usa `fileSystemSynchronizedGroups`, **crear todas esas
carpetas no toca el `pbxproj`**. Se sincronizan solas.

### D11 — Errores: la cadena de Android, con dos trampas de Swift

```
core (.a) → CoreFinanciero → XxxViewModel → XxxUiState → SwiftUI
                                  │
                            ContractMessages
                                  │ switch exhaustivo, SIN default ← nueve líneas
                            "SaldoInsuficiente"
                                  │ busca en messages.es.json
                            "Saldo insuficiente: tienes {available}…"
                                  │ interpola CRUDO
                            state.error
```

1. **`ContractMessages` es una sola función**, en producción, y **el test de contrato reusa esa
   misma función** en vez de escribir su copia. Así se verifica contra `cases.json` el mapeo que
   la UI usa de verdad.
2. **`localizedDescription` es diagnóstico, jamás texto de usuario.** El binding lo define como
   `String(reflecting: self)` —el volcado de debug del enum, `DomainError.CheckDigit`—, que no
   coincide ni con los `#[error("...")]` en español del core ni con lo que produce Kotlin. Es el
   modo de fallar más caro de esta fase: rompe la paridad **sin que ningún test falle**.
3. **El `switch` va exhaustivo y sin `default`**, para que una décima variante del core rompa la
   compilación en vez de caer en un `"Desconocido"` que pasa en verde.
4. **Los placeholders se interpolan crudos** —`{available}`, `{id}`, `{code}`, `{required}`,
   `{field}`— tal como los devuelve el core. Nada de `NumberFormatter` ahí: los formateadores de
   Android, iOS y el navegador no coinciden entre sí y una diferencia rompe la comparación
   carácter por carácter que es toda la tesis.
5. **El adapter no traduce**: propaga el error tal cual; convierte el ViewModel.

### D12 — Testing: Swift Testing, un solo target, las mismas guardias

Xcode dejó **Swift Testing** (`import Testing`, `@Test`, `#expect`) y conviene quedarse ahí en
vez de volver a XCTest, como decía el CONTEXT. El motivo es concreto: `@Test(arguments:)`
convierte cada uno de los 28 casos en **un test con nombre propio**, así que un fallo dice *cuál*
caso falló sin leer el log.

```swift
@Test("aritmetica", arguments: try contractCases("aritmetica"))
func arithmetic(_ c: Case) throws {
    #expect(try add(a: c.a, b: c.b) == c.expected)   // String == String, exacto
}
```

| Test | Qué prueba | Cuándo |
|---|---|---|
| `CoreSmokeTest` — `coreVersion()` | que el XCFramework linkea y los símbolos resuelven | **primer commit** |
| `ContractTest` — los 28 casos | que Swift y Rust producen los mismos strings | segundo |
| ViewModels con `FakeCoreFinanciero` | estados, errores, `clearError()` | con cada pantalla |

A diferencia de Android **no hay dos suites**: los tres niveles corren en el mismo bundle sobre
el simulador, porque no hay nada que separar. Eso simplifica, y de paso es la razón por la que el
seam de D8 quedó débil.

Las comparaciones son de **igualdad exacta de strings**, nunca numéricas con tolerancia.

**Las guardias siguen siendo obligatorias, y con Swift Testing por el mismo motivo exacto que en
Rust y Kotlin:** `@Test(arguments: [])` sobre un array vacío genera cero casos y **reporta
éxito**. Un grupo vaciado a `[]` dejaría el test en verde sin comparar un solo string —
verificado por mutación en la Fase 1. Van las cinco:

1. versión del contrato `2.3.0` y moneda `PEN`;
2. conteo por grupo — `aritmetica` 6, `cci` 4, `itf` 5, `tarjeta` 6, `transferencia` 7,
   `cuentas_iniciales` 2;
3. claves de primer nivel desconocidas **y faltantes**, en los dos sentidos;
4. el `switch` exhaustivo de las nueve variantes de `DomainError`;
5. la que ata el `messages.es.json` **realmente copiado al bundle** con esas nueve variantes —
   la única que Rust no puede dar, porque Rust lee el archivo fuente con `include_str!` y esta
   app lee lo que copió la Run Script Phase de D4.

### D13 — Dónde corre cada cosa

Simulador 26.5 para iterar: rápido, sin cable, repetible, y de paso muestra el look Liquid Glass.
Al cerrar la fase, la misma suite **una vez sobre hardware real** —el iPhone actualizado a 17+ o
el iPad Air con iOS 26—, porque ahí se ejercita el slice `aarch64-apple-ios`, que es **el que se
embarca** y es un binario distinto del de simulador. Los dos comandos entran al `README.md`.

---

## Buenas prácticas que gobiernan el código

Las reglas del invariante de `CLAUDE.md`, traducidas a lo que significan en Swift:

| Regla del proyecto | En Swift |
|---|---|
| Ningún flotante toca un monto | ni `Double` ni `Float`, **tampoco en tests**. Excepción única: `NativeBaseline.swift`, aislada y con el comentario que dice por qué existe |
| Sin `panic!`/`unwrap()`/`expect()` (regla 5) | **prohibidos el `!` de force-unwrap, `try!` y `as!`** en producción. Un `try!` sobre una llamada al core convierte un `DomainError` en un crash, que es justo lo que el mapeo de errores de uniffi existe para evitar |
| Comparar u ordenar montos en UI | `Decimal` de Foundation, construido con `Decimal(string:locale:)` y **locale POSIX** para que el punto decimal se interprete bien. Es el error más común en este archivo |
| Leer el campo de monto | **nunca `NumberFormatter`** — devuelve `NSNumber`, o sea `Double` |
| Sin async | `@MainActor` sobre los ViewModels; `async` **solo** para el `Task.sleep` que simula `simulatedLatencyMs` y para el benchmark. Un `await` sobre una función del core significa que algo se desvió |
| Cero reglas de negocio fuera del core | si aparece aritmética sobre montos en Swift, el cálculo está en el lugar equivocado |
| Formato | `swift-format` 6.3.0, con `.swift-format` commiteado |

Las diez reglas de "cómo se escribe el ViewModel por dentro" ya están en
[`apps/ios/CONTEXT.md`](../../../apps/ios/CONTEXT.md) y no se duplican acá.

## Correcciones que esta fase arrastra

Encontradas al explorar, y que hay que arreglar porque contradicen el contrato o entre sí. **Cada
una en su propio commit, separada de la implementación:**

1. **`apps/ios/CONTEXT.md` dice "iOS 16+"** y a la vez pide `@Observable`, que es 17+. Se fija en
   17.0 (D2).
2. **`apps/ios/CONTEXT.md` nombra las vistas en español** (`AritmeticaView.swift`), contra la
   regla de identificadores en inglés de `CLAUDE.md`. Es el mismo residuo que la Fase 2 encontró
   en el CONTEXT de Android.
3. **`apps/ios/CONTEXT.md` especifica `XCTest` y `XCTAssertEqual`**; el proyecto usa Swift
   Testing (D12).
4. **`apps/ios/CONTEXT.md` muestra la firma vieja de `.onChange(of:)`** como principal y la nueva
   como comentario. Con target 17.0 es al revés.
5. **El `.claude/settings.json` del repo no declara `swift-lsp`** (D6).
6. **La pantalla de Tarjeta no dice qué espera.** Encontrado probando la app de Android: el
   campo `Número` acepta cualquier dígito, pero el core exige un número que pase Luhn, así
   que quien hace la demo tiene que **adivinarlo frente a la audiencia** —y el rechazo
   parece un fallo del producto en vez de una función—. Se agrega un texto de ayuda
   obligatorio con dos líneas exactas, normativas en `docs/ui-spec.md` y por lo tanto
   iguales en las cuatro apps. **No se afloja la validación:** `encrypt` acepta cualquier
   cadena, pero esta pantalla hace **tres** cosas —valida por Luhn, cifra y descifra— y
   sacarle el filtro borraría un tercio de lo que demuestra. Con la ayuda puesta, tipear
   `41111` pasa a ser parte del show: es el caso `tj-006` del contrato, y exhibe que la
   validación también vive en el core. Se corrige en `docs/ui-spec.md` y en
   `apps/android/` —hoy la única app que existe, y por eso el momento más barato— y las
   tres apps siguientes nacen con ella.

## Fuera de alcance

Persistencia, red, Keychain, biométricos, animaciones, layout específico de iPad, i18n más allá
del español, firma para App Store, widgets y App Intents.

## Criterio de cierre

La fase termina cuando están las tres cosas de `CLAUDE.md`, no una:

1. **`ContractTest` en verde, 28/28**, sobre el simulador **y** una corrida sobre hardware real.
2. **`apps/ios/README.md`** con los comandos efectivamente ejecutados y su diagrama Mermaid, más
   `BUILD.md`, `TESTING.md` y `PENDING.md`.
3. **Las cinco pantallas**, con los labels exactos de `docs/ui-spec.md`.
