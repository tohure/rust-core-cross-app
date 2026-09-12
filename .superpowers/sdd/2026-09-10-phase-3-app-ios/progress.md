# SDD ledger — plan: docs/superpowers/plans/2026-09-10-phase-3-app-ios.md

Spec: docs/superpowers/specs/2026-09-10-phase-3-app-ios-design.md (leída — autoridad vinculante)
Rama: feat/phase-3-app-ios · BASE de fase: 57d8fa4

## Preliminares (antes de la Task 1, a pedido del usuario)

- ece5f51 docs(ios): CONTEXT de iOS a español neutro (9 marcas; + encabezado espejo de Android)
- 57d8fa4 chore(android): ndk.abiFilters — 530 KB de ABIs muertas fuera del APK; 40 tests en verde
- Evaluación de docs/android-rust-core-evaluation.md: 7 recomendaciones, 1 aplicada (§3.5).
  Descartadas con motivo: §3.2 módulo Gradle (el desacoplamiento real ya existe vía protocolo,
  y en iOS lo cubre la Task 6), §3.4 (premisa falsa: los generados ya están gitignorados),
  §3.6 (ya mitigado con @Immutable/@Stable; la alternativa contradice "el adapter no traduce"),
  §3.7 (real, prioridad Baja, sin análogo en iOS). §3.3 (script de build) ofrecida y NO elegida
  por el usuario.

## Scan de conflictos pre-vuelo

### Pares de tareas que comparten archivo o interfaz

| Archivo/interfaz | Tareas | Produce vs consume | Hallazgo |
|---|---|---|---|
| `project.pbxproj` | T1, T2, T4 | T1 enlaza XCFramework; T2 target/bundle/UITests/scheme; T4 dos ShellScript phases | **Limpio.** Ids disjuntos, verificados presentes en el archivo real (F1/F2 nuevos; T2 borra solo ids de UITests). Secuencial, sin paralelismo. |
| `apps/ios/CONTEXT.md` | T3, T7 | T3 corrige 5 contradicciones; T7 la sección "Formateo" | **Limpio.** Handoff secuenciado y explícito: T7 declara que corrige el NumberFormatter en su propio commit. Secciones disjuntas. |
| `BancoApp.swift` | T9 crea; T10-T13 modifican | T9 produce el TabView; cada pantalla agrega su pestaña | **CONFLICTO — ver R1.** T9 Step 2 escribe las 4 pestañas y Step 5 dice "commitear junto con T10"; su propia "Alternativa" recomienda 1 pestaña. Las dos no pueden ser ciertas. |
| `ContractFixtures.swift` | T4 crea; T5 agrega modelos | `ContractFixtures.data(_:)` | Limpio. Secuencial. |
| `NativeBaseline.swift` | T10 crea (en UI/Benchmark/); T13 consume | `NativeBaseline.add/subtract` | Limpio. Ubicación cruzada pero deliberada y documentada. |
| `.swift-format` | T3 produce; T1-T2 lo preceden | comando de formato de todas las tareas | Limpio (orden, no conflicto): T1-T2 commitean Swift antes de que exista el formateador. Sin consecuencia. |
| nueve funciones globales uniffi | T1 produce; T4,T5,T6 consumen | superficie del core | Limpio. |
| `DomainError.contractName` | T4 produce; T5 reusa | mapeo variante → nombre del contrato | Limpio, y es D11.1 de la spec: el test reusa la función de producción. |

### Coherencia interna de cada tarea

| Tarea | Tests vs código · archivos creados vs tocados | Hallazgo |
|---|---|---|
| T1 | smoke test → falla → pipeline → verde; BUILD.md copiado de lo ejecutado | Limpio. TDD real. |
| T2 | — | **DEFECTO — ver R2.** Step 1 dice "las dos apariciones" y exige "cero apariciones de 26.5"; hay **seis** en el archivo real (app ×2, tests ×2, UITests ×2). Inalcanzable como está escrito. |
| T3 | 5 correcciones, 3 commits | Limpio. El voseo ya se corrigió en ece5f51; T3 no lo lista, no hay solape. |
| T4 | guardia de las 9 variantes + Run Script a los dos bundles | Limpio. |
| T5 | 28 casos + 5 guardias, con mutación para probar las guardias | Limpio. Conteos verificados contra cases.json real: 6/4/5/6/7 = 28, cuentas_iniciales 2. |
| T6-T8, T11-T14 | — | Limpio. |
| T9 | ver R1 | |
| T10 | crea NativeBaseline (único archivo con Double) | Limpio, la excepción está declarada en Global Constraints. |

## Rulings

- **R0 — Workspace.** Se trabaja en `feat/phase-3-app-ios` en el directorio principal, sin
  worktree aparte. Motivo: el usuario fijó esa rama como el espacio de trabajo, y un worktree
  duplicaría rutas de Xcode/simulador sin ganar aislamiento real (la rama ya aísla de `main`).
  Si me equivoco cuesta: nada material; la rama sigue separada de `main`.

- **R1 — T9 y T10 se despachan como una sola unidad, con un solo commit.** `BancoApp` nace con
  **una** pestaña (Aritmética); T11, T12 y T13 agregan la suya en su propio commit. Motivo: el
  plan se contradice —Step 2 escribe cuatro pestañas, Step 5 difiere el commit, y la
  "Alternativa" recomienda una pestaña— y la propia Alternativa nombra el criterio que decide:
  "mantiene el repositorio compilando en cada commit, que es la regla más valiosa de las dos".
  CLAUDE.md pide además un commit por tarea del plan. Un placeholder en T9 sería código muerto
  que el review marcaría. Si me equivoco cuesta: una superficie de review más grande en esa
  unidad, y un renglón de ledger con dos tareas en un commit.

- **R2 — T2 pone `IPHONEOS_DEPLOYMENT_TARGET = 17.0` en las cuatro configuraciones que
  sobreviven** (app ×2 + tests ×2), no en dos. Verificación corregida: `grep -c '= 17.0'` → **4**
  y `grep -c '26.5'` → **0**, después de borrar UITests. Motivo: el archivo real tiene seis
  apariciones, así que la aceptación que el propio plan escribe ("cero apariciones de 26.5") es
  inalcanzable tocando solo dos; y un bundle de test en 26.5 no puede correr contra una app en
  17.0 sobre un aparato con iOS 17, que es justo lo que D2 habilita. Si me equivoco cuesta: una
  expectativa de grep, un renglón.

## Ejecución

- Task 1: complete (commits 57d8fa4..d52c593, review clean — Approved, 0 Critical, 0 Important)
  - ⚠️ del revisor resueltos por el controlador: `Generated/include/` tiene exactamente
    `core_financieroFFI.h` + `module.modulemap` (la trampa del renombre, evitada); el
    XCFramework trae los **dos** slices (`ios-arm64`, `ios-arm64-simulator`); las nueve
    funciones globales están en `core_financiero.swift`. Sin brecha.
  - Contingencia del Step 5 NO hizo falta: el `.a` de release del host sí trajo la metadata de
    uniffi, a diferencia de Android. Queda anotado en BUILD.md.
  - Task 1: minor (deferred): la evidencia de `xcodebuild test` en BUILD.md es un `tail`, así que
    no prueba que el build sea warning-free de punta a punta.
  - Task 1: minor (deferred): fallo transitorio del simulador ("Busy"/preflight checks) en el
    primer intento post-enlace; pasó al reintento sin cambios. Documentado en BUILD.md.
- **Corrección a R2 (la hizo notar el implementador de T2, y tiene razón).** El recuento de mi
  ruling estaba mal: el `pbxproj` tenía **cuatro** apariciones de `IPHONEOS_DEPLOYMENT_TARGET`,
  no seis — dos a nivel de `PBXProject` (que el target de app hereda, sin línea propia) y dos
  explícitas en el target de tests. Conté de más al leer un grep que mezclaba
  `PRODUCT_BUNDLE_IDENTIFIER` de UITests. La instrucción operativa del ruling —poner 17.0 en
  todas las configuraciones que sobreviven— y su verificación —`grep -c '= 17.0'` → 4,
  `grep -c '26.5'` → 0— eran correctas y son exactamente lo que se ejecutó. Solo la narrativa
  de "dónde vive cada aparición" estaba equivocada.
- Task 2: complete (commits d52c593..e158d54, review clean — Approved, 0 Critical, 0 Important)
  - Riesgos nombrados verificados por el revisor: ninguna referencia colgante tras borrar el
    target de UITests (11 ids/entradas, todos solo en líneas de borrado), y el enlace de la
    Task 1 (`C0DE...F1/F2` + fase Frameworks `DD83237C...`) intacto.
  - ⚠️ del revisor resuelto por el controlador: el cuerpo del commit `e158d54` no tiene voseo.
  - `SWIFT_VERSION` sigue en 5.0 en las cuatro configuraciones sobrevivientes (D1 de la spec).
- Task 3: complete (commits e158d54..45bbbe9, review clean — Approved, 0 Critical, 0 Important)
  - Tres commits separados como exige el plan: 758f7a1 (CONTEXT), 0e534d1 (settings), 45bbbe9 (.swift-format).
  - El implementador corrigió además una **sexta** mención de `XCTest` (CONTEXT.md:63) que quedaba
    contradiciendo la sección "Pruebas" recién corregida. Aceptado: cae dentro del propósito
    declarado de la tarea y está documentado en su commit.
  - "Formateo" (el bloque `NumberFormatter`) intacto en CONTEXT.md:190,198 — es de la Task 7.
  - Minor del revisor, **verificado en positivo por el controlador**: el lint vacío no probaba que
    las reglas estuvieran activas. Sondeo con un archivo que fuerza las dos violaciones:
    `[NeverForceUnwrap] do not force unwrap 'maybe'` y `[NeverUseForceTry] do not use force try`.
    El gate es real.
  - **HALLAZGO PROPIO, para la Task 14:** `xcrun swift-format lint` **sale con exit code 0 aunque
    reporte violaciones**. El gate de `!`/`try!` solo funciona si alguien lee la salida; un CI que
    dependa del exit code pasaría en verde con force-unwraps adentro. `TESTING.md` tiene que
    decirlo, y el comando documentado debería agregar `--strict` (que sí falla) o un grep.
  - Task 3: minor (deferred): el árbol de "Estructura" tiene dos directorios `Generated/` en
    niveles distintos; es fiel al disco, pero una nota distinguiendo "headers generados" de
    "Swift generado" le ahorraría un doble vistazo al lector.
- Task 4: complete (commits 45bbbe9..aafa12d, review clean — Approved, 0 Critical, 0 Important)
  - **El brief tenía mal la firma de `DomainError`** (trataba `Length`, `InvalidAmount` y
    `Encryption` como casos sin campos). El implementador lo detectó leyendo los bindings reales
    y lo cruzó contra `error.rs` y el `ContractMessages.kt` de Android. Verificado por el
    controlador en `core_financiero.swift:827`: `Length(field:expected:received:)`,
    `UnknownBank(code:)`, `InvalidAmount(detail:)`, `AccountNotFound(id:)`,
    `InsufficientFunds(available:required:)`, `Encryption(detail:)`, `OutOfRange(field:)`;
    solo `CheckDigit` y `SameAccount` van pelados. Confirmado también que
    `errorDescription = String(reflecting: self)` — la advertencia de la spec era exacta.
  - Riesgos nombrados verificados: las dos ShellScript phases declaran `inputPaths`/`outputPaths`
    y abren con `set -eu`, así que un `cp` fallido rompe el build en vez de pasar en silencio;
    van a los **dos** targets; el enlace de T1 y la cirugía de T2 intactos.
  - Task 4: minor (deferred): duplicación de ~15 líneas entre `BundleContractSource` y
    `BundleMessageSource` (mismo pipeline de carga de JSON). Dos call sites, no urgente.

- **R3 — Ruling: el voseo del plan no entra al código.** El plan se escribió antes del pase a
  español neutro y tiene **28 "acá"**, de los cuales **10 viven dentro de comentarios de bloques
  de código** que los implementadores transcriben literal. Ya se colaron dos en producción
  (`ContractMessages.swift:10` y `:50`). Decisión: (a) todo dispatch restante lleva la
  instrucción explícita de normalizar a neutro al transcribir, y (b) los dos que ya cayeron se
  corrigen en la Task 5, en su propio commit, porque esa tarea trabaja en ese mismo archivo.
  Motivo: es sistémico, no un descuido puntual, y barrerlo al final significa 10 correcciones
  dispersas en vez de una instrucción. Si me equivoco cuesta: un commit de dos palabras de más.
- Task 5: complete (commits aafa12d..61987ff, review clean — Approved, 0 Critical, 0 Important)
  **Es el criterio de cierre de la fase: 28/28 en verde sobre el simulador.**
  - `contracts/cases.json` **intacto**: mismo blob hash `d7fbe83...` en `57d8fa4` y en `HEAD`.
    El contrato no se dobló para que pasara el código.
  - El revisor (opus) verificó lo que más importaba: las llamadas cruzan el FFI de verdad — cada
    una de las nueve funciones tiene **una sola** declaración en todo el árbol iOS, la de los
    bindings generados, y no hay fake ni stub que pueda ensombrecerlas; ninguna comparación es
    numérica; no hay recomputación (los únicos `+` son concatenación de nombres de error); cero
    `Double`/`Float`/`NSNumber`/tolerancia.
  - Las **cinco** guardias tienen una mutación nombrable que las rompe (el implementador solo
    mutó la 2; el revisor derivó las otras cuatro leyendo). Guardia 3 chequea las dos
    direcciones —claves desconocidas y faltantes— y lee el JSON crudo con `JSONSerialization`,
    no el modelo `Decodable`, que es lo que la hace real: `Decodable` ignora claves desconocidas
    en silencio. Guardia 4 sin `default`.
  - El camino de fixtures no tiene fallback silencioso: ni `try?` ni `?? []`. Un contrato
    malformado revienta ruidoso en vez de generar cero casos.
  - ⚠️ del revisor resuelto por el controlador: corrida sin filtro confirma que la suite
    "Contrato v2.3.0" está cableada — 17 tests en 5 suites, TEST SUCCEEDED.
  - Task 5: minor (deferred): `ContractFile.itfRate` se decodifica y nunca se asserta.
  - Task 5: minor (deferred): la guardia 5 fija los nueve nombres como literales en vez de
    derivarlos de `contractName`; la deriva que deja pasar la cubre `ContractMessagesTest`.
  - Task 5: minor (deferred): `BundleToken` duplicado entre `ContractTest` y `ContractFixtures`.
  - Task 5: minor (deferred): el Step 3 del brief (ver las guardias fallar solas) se saltó; solo
    se mutó la guardia 2.
- **R4 — Ruling: las Tasks 6 y 7 se despachan juntas, en un solo dispatch con dos commits
  separados.** Motivo: ambas son transcripción del código completo que trae el plan más su test,
  tocan directorios disjuntos (`Adapter/` y `Format/`) y no comparten ninguna interfaz — T6
  produce el protocolo `CoreFinanciero`, T7 un `enum` puro sin dependencias. Un dispatch y un
  review por cada una duplicaría el costo sin agregar una sola verificación. La Task 8 queda
  aparte: sus guards de `if #available(iOS 26, *)` son una decisión de arquitectura (D2 de la
  spec) y merecen su propia superficie de review. Si me equivoco cuesta: un review combinado
  menos enfocado sobre dos archivos pequeños.
- **R5 — Ruling sobre el hallazgo Important plan-mandated de la Task 7.** El revisor encontró que
  `Decimal(string:)` es un parser de prefijo, no un validador: `"12abc"` produce `"S/ 12,abc"`
  mientras Kotlin devuelve `"12abc"` intacto. Más dos Minors del mismo tipo (ceros a la
  izquierda: `"007.50"` → Swift `"S/ 007.50"` vs Kotlin `"S/ 7.50"`; y el punto colgante
  `"100."`). Los tres son inalcanzables hoy porque no hay caller. El brief mandaba ese guard
  textualmente.
  **Decisión: se arregla ahora, en una vuelta de fix sobre las Tasks 6-7, no se difiere a la
  Task 11.** Tres motivos: (a) el test se llama `garbagePassesThrough` y **afirma una garantía
  que el código no entrega** — solo prueba `""` y `"—"`, dos de los pocos strings que
  `Decimal(string:)` sí rechaza; un test que da falsa confianza es peor que la divergencia que
  esconde; (b) la tesis vinculante de la POC es paridad carácter por carácter, y tres
  divergencias conocidas en el único archivo cuyo trabajo *es* la paridad son exactamente la
  deuda que aparece el día de la demo; (c) el arreglo es chico y espeja lo que Kotlin ya hace,
  así que no agrega ninguna regla de negocio — `BigDecimal(amount)` valida igual del otro lado.
  La autoridad del plan no alcanza para mandar un test engañoso; la spec manda paridad.
  Si me equivoco cuesta: una vuelta de fix sobre un archivo de 40 líneas.
- Task 6: complete (commit 19d16be, review clean — Approved)
- Task 7: fix round 1/5 (3 addressed, 0 open — el guard de prefijo, los ceros a la izquierda y
  el punto colgante; commits 8e54f63..74e107f)
- Task 7: complete (commits 5f4f4b9..74e107f, re-review clean — todos los hallazgos cerrados,
  0 Critical/Important nuevos)
  - **Paridad verificada de forma independiente por el controlador**: corrí el `MoneyFormatter.kt`
    real como test temporal de JVM en Android sobre las quince entradas disputadas. La tabla
    coincide **exactamente** con lo que asserta el test Swift, incluidas las sorprendentes:
    `"100."`→`"S/ 100"`, `".5"`→`"S/ 0.5"`, `"1e3"`→`"S/ 1,000"`, `"007.50"`→`"S/ 7.50"`.
    Kotlin sí acepta notación científica y punto colgante, así que la gramática completa era lo
    que la paridad realmente pedía — no sobreingeniería gratuita. La sonda se borró; árbol limpio.
  - El revisor respondió las tres preguntas que le puse: (1) correcto salvo un hueco real —
    `"0e1"`→`"S/ 00"` donde Kotlin da `"S/ 0"`; (2) **no** cruza la línea de "cero reglas de
    negocio": no redondea, no suma, no compara, no deriva ningún valor monetario nuevo, solo
    reposiciona dígitos que ya venían en el string; (3) **sobredimensionado** para lo que la
    Task 11 necesita — un check estricto de 10 líneas cerraba el hallazgo para toda entrada
    alcanzable. Recomendó no reabrir la vuelta.
  - Task 7: minor (deferred, para PENDING.md en la Task 14): `"0e1"`/`"0e5"`/`"00e3"` producen
    ceros padeados en vez de `"0"` — Java colapsa coeficiente cero con escala negativa.
  - Task 7: minor (deferred, para PENDING.md): un exponente enorme pero parseable como `Int`
    (`"1e2147483648"`) intenta `String(repeating:count:)` gigante en vez del passthrough que
    daría Kotlin, cuyo exponente es de 32 bits.

- **R6 — Ruling sobre el tamaño del fix de `MoneyFormatter`.** Acepto la implementación y **no**
  reabro la vuelta: cierra los tres hallazgos para toda entrada alcanzable y está verificada
  contra la salida real de Kotlin. Pero el comentario del código afirma que "reproduce la
  gramática de `BigDecimal`" y que está "verificado contra `MoneyFormatter.kt` real", y el
  revisor acaba de mostrar dos entradas donde no. **Esa sobreafirmación es exactamente la clase
  de falsa confianza que me hizo ordenar el primer fix** —un test que promete lo que el código no
  da— y arreglar una y dejar la otra sería incoherente. Decisión: el comentario se acota a lo que
  de verdad se verificó y nombra los dos huecos; va como commit chico dentro del próximo
  dispatch, no como vuelta de fix dedicada. Si me equivoco cuesta: un commit de comentario.

- **R7 — Ruling: las tareas de UI se agrupan en dos dispatches.** Dispatch A = Tasks 8+9+10
  (tema y componentes, cascarón, primera pantalla) — R1 ya obligaba a fusionar 9 y 10, y la 8
  produce los componentes que las dos consumen. Dispatch B = Tasks 11+12+13 (las tres pantallas
  restantes), que comparten forma exacta: trío UiState/ViewModel/View más su test con el fake, y
  una línea en `BancoApp`. Motivo: son transcripción del código completo del plan sobre
  directorios disjuntos, sin FFI ni contrato de por medio; siete dispatches con sus siete reviews
  costarían más que el riesgo que cubren. La Task 14 va sola: cierre de fase, corrida sobre
  hardware y documentación. Si me equivoco cuesta: superficies de review más grandes en dos
  tramos de UI.
- Tasks 8+9+10: complete (commits 74e107f..206cd30, review clean — Approved, 0 Critical, 1 Important
  parkeado con ruling abajo). 30 tests en 9 suites.
  - **Otro defecto del plan detectado por el implementador**: el brief usa
    `Tab(_:systemImage:content:)`, la API de result-builder de `TabView`, que **exige iOS 18**
    contra el target 17.0. Resuelto con `.tabItem { Label(...) }` (iOS 13+), sin tocar ningún
    label y sin meter un `#available` fuera de `Components/`. El revisor lo verificó compilando.
  - Ruling R1 cumplido: `BancoApp` con **una** pestaña, sin placeholders.
  - El revisor verificó **carácter por carácter contra `docs/ui-spec.md`** todos los strings
    visibles, incluido el `·` de "Core (Rust · Decimal)". Sin deriva.
  - `#available(iOS 26)` confinado a `UI/Components/Components.swift:444`, único uso.
  - `Double` solo en `NativeBaseline.swift`, con su comentario. Verificado por mí y por el revisor.
  - Aritmética **sin** el filtro de 2 decimales, como corresponde (`ar-001` es `"0.1"`).
  - El implementador **corrigió el voseo del propio brief** al transcribir ("acá"→"aquí",
    "te encontrás"→"te encuentras"). R3 funcionando.
  - Task 8-10: minor (deferred): `clearError()` no tiene test propio; se ejercita indirecto.

- **R9 — Ruling: se parkea el hallazgo Important del `catch` genérico.** El revisor señaló que
  `ArithmeticViewModel.swift:312-315` hace `catch { state.error = "\(error)" }`, o sea guarda
  texto de diagnóstico como mensaje de usuario, contra D11.2 de la spec. Es un hallazgo real y
  bien traído. **Pero verifiqué que Android hace exactamente lo mismo**:
  `apps/android/.../ui/arithmetic/ArithmeticViewModel.kt:74` es
  `(e as? DomainException)?.let(messages::userMessage) ?: e.toString()`. O sea que iOS está en
  **paridad exacta** con el consumidor ya mergeado, y la rama es inalcanzable: el adapter solo
  propaga `DomainError` desde el core. Cambiar iOS solo introduciría una asimetría con Android
  sin ningún beneficio alcanzable; cambiar los dos es una decisión de cuatro apps que no le
  toca a la Fase 3. Va a `PENDING.md` en la Task 14 como patrón conocido, transversal.
  Si me equivoco cuesta: un fallback de diagnóstico en una rama que ningún caller alcanza.

- Tasks 11+12+13: complete (commits df50f62..63f0eb7). Review: **Needs fixes** — 0 Critical,
  2 Important, 10 minor. 44 tests en 12 suites.
  - El revisor verificó **los 26 strings visibles carácter por carácter** contra
    `docs/ui-spec.md` con `grep -F`, incluidos el `·` de "Core (Rust · Decimal)", el `…` del
    hint de pegado y el `⚠`. **Cero deriva.** Los dos párrafos que no dieron match directo
    coinciden tras desenvolver el wireframe ASCII (ui-spec.md:190-191 y 254-256).
  - Verificado por grep exhaustivo sobre líneas agregadas: `NumberFormatter` 0,
    `localizedDescription` 0, `if #available` 0, `try!` 0, `as!` 0, force-unwrap 0,
    `Decimal(` 0, `Float` 0. `Double(` solo 2, ambas en `BenchmarkViewModel.measure()`.
  - `Task` confinado: el único que envuelve una llamada al core es el `Task.detached` del
    benchmark. `core.transfer` es síncrono y corre **antes** del único `await`; el
    `Task.sleep` usa solo `result.simulatedLatencyMs`. `CardViewModel` no tiene `Task`.
  - La deviation 2 del implementador (`nonisolated` en `measure`) se verificó **real y
    acotada**: `measure` es `private static` y solo se alcanza desde el `Task.detached`.
    No mueve ninguna llamada al core fuera del main actor en las otras pantallas.

- **R10 — Ruling sobre los dos Important de la review del dispatch B.**
  - *Important 2 (tope de iteraciones)*: **se arregla ya**. Es paridad de comportamiento con
    `BenchmarkViewModel.kt:32` en la única pantalla cuyo propósito es compararse al lado.
  - *Important 1 (la medición del benchmark nunca se tomó)*: **se pliega a la Task 14 y va
    sobre hardware real, no simulador**. El brief compara contra un Pixel 6 (172 µs de piso
    JNA, 444 µs de `add`); un número de simulador corre arm64 nativo de macOS, sin el
    scheduler ni el térmico del aparato, y no es comparable con eso. Medirlo en simulador
    sería peor que no medirlo: daría un número que parece una respuesta.
  - *Orden*: los fixes van **antes** de la Task 14, no después. La Task 14 Step 3 escribe el
    número del benchmark en `TESTING.md`; medir con un `measure()` que descarta el componente
    de segundos produciría un entregable de fase que hay que rehacer.
  - Si me equivoco cuesta: dos commits chicos antes del cierre.

- **Dispatch C — fixes de la review.** Commits `672d7f7` (benchmark) y `9d48b7e` (Tarjeta).
  **47 tests en 12 suites**, lint limpio sobre los cinco archivos tocados.
  - El test del componente de segundos se escribió **RED primero** y reprodujo el bug con el
    número exacto: una iteración de 1,05 s se reportaba como **53182 µs**. El hallazgo del
    revisor era teórico; el test lo volvió empírico antes de tocar producción.
  - El test del camino feliz de `decryptPasted()` se validó **por mutación**: con
    `ciphertextHex: "MUTANTE"` el test nuevo falla y **los otros cinco de la suite siguen
    pasando**. Esa es la prueba de que el hueco de cobertura era real y no cosmético.
  - `clearErrors()` borrado: código muerto, no lo llamaba ni la vista ni un test.
  - El tope de 6 dígitos quedó documentado en `apps/ios/CONTEXT.md` porque **no es un label**
    y no pertenece a `docs/ui-spec.md`. Ahí también queda anotado que el `guard n > 0` de
    `run()` es load-bearing: `measure()` calcula `min(max(Int(Double(n) * p), 0), n - 1)`,
    que con `n == 0` da −1.
  - Minors diferidos a `PENDING.md` de la Task 14: el `catch` genérico (R9), los dos huecos
    de `MoneyFormatter` (R6), "la app de iOS", el mensaje `"No se pudo cifrar"` en un fallo
    de descifrado, el `try?` que se traga el error del core en el benchmark, y el texto
    rechazado que puede quedar visible en el `TextField` hasta la próxima invalidación.

- **Hallazgo transversal, fuera de la Fase 3.** Comparando por paridad apareció un bug en
  Android ya mergeado: `apps/android/.../ui/benchmark/BenchmarkViewModel.kt:37` hace
  `toIntOrNull() ?: return` sin chequear `n > 0`, así que `"0"` iteraciones llega a
  `coerceIn(0, -1)` y **crashea**. iOS tiene el guard y está bien. Es un `fix(android):` de
  una línea que no le toca a esta rama.

- **Task 14: parcial.** Commit `0776e13`. Steps 1, 3, 4 y 5 hechos + `CLAUDE.md`.
  **Step 2 (hardware) NO ejecutado** y por lo tanto **la fase no se declara terminada**,
  exactamente como el plan lo prescribe.
  - Step 1 ✅: **47 tests en 12 suites**, simulador iPhone 17 Pro, `TEST SUCCEEDED`.
  - Step 2 ❌: los dos aparatos emparejados figuran `unavailable`. Diagnóstico completo del
    iPhone 13 Pro: `pairingState: paired`, `developerModeStatus: enabled`, iOS **18.6.2**
    (muy por encima del target 17.0), y Xcode ya tiene sus device support files
    (`iPhone14,2 18.6.2 (22G100)`). Lo único que falta es `tunnelState`, o sea el cable.
    **El update fallido a iOS 18.7.8 que reportó el usuario es irrelevante**: 18.6.2 ya
    cumple de sobra. Nota: Xcode guarda soporte de un `iPhone13,2` en iOS **16.5** —el
    iPhone 12 que el usuario recordaba— y ese sí está **por debajo** del target 17.0.
  - Steps 3/4/5 ✅: `TESTING.md`, `PENDING.md` y `README.md` con su diagrama Mermaid.
  - `PENDING.md` abre con el bloqueo de hardware y la medición del benchmark, en ese orden,
    para que quien retome no tenga que buscarlos.
  - `TESTING.md` declara explícitamente que **solo la guardia 2 se verificó por mutación
    real**; las otras cuatro se derivaron leyendo. Es menos evidencia que la de Android y
    queda dicho en vez de insinuado.
  - Corrección atrapada al escribir el README: se había escrito que `0.1 + 0.2` da `"0.3"`.
    `ar-001` espera **`"0.30"`**. En una POC cuya tesis es igualdad exacta de strings, ese
    error en el documento de entrada habría sido particularmente malo.
  - Queda para cuando la fase cierre: `docs/demo-runbook.md`, que `CLAUDE.md` condiciona a que
    existan al menos dos apps. No está en la lista de archivos de la Task 14.

- **Task 14 Step 2: ✅ EJECUTADO. La Fase 3 queda completa.** Commit de docs actualizado.
  **`Test run with 47 tests in 12 suites passed` · `TEST SUCCEEDED`** sobre un **iPad Air
  (5.ª gen, `iPad13,16`) con iPadOS 26.6.1** — mismo conteo y mismo verde que el simulador.
  Con eso queda probado lo que ninguna corrida de simulador podía: que el `.a` del slice
  `aarch64-apple-ios` está enlazado, que sus símbolos resuelven y que el `strip` del perfil
  release no se comió nada. Contrato **28/28 en el aparato**.
  - El iPhone nunca se conectó. El usuario conectó un iPad en su lugar, y **sirve igual para
    lo que el Step 2 existe**: el iPad corre el slice de device, no el de simulador. Es el
    binario que se embarca.
  - Dos trabas de firma, ambas documentadas en `TESTING.md` para que no cuesten dos veces:
    (1) `No profiles for 'dev.tohure.ios-rust-test' were found` — los perfiles instalados no
    incluían el aparato y eran de bundle ids viejos; se resuelve con `-allowProvisioningUpdates`.
    (2) `The Developer App Certificate is not trusted` — la app instala pero no lanza; es un
    paso **manual en el aparato**. La cuenta es **gratuita**: los perfiles vencen a los 7 días.
  - Error propio corregido en el camino: chequeé si el iPad estaba en el perfil comparando
    contra `678618A3-…`, que es el identificador de **CoreDevice**, no el UDID de hardware.
    El UDID real es `00008103-000148A21499401E` y **sí** estaba en el perfil. La conclusión
    apresurada habría sido "el registro falló" cuando había funcionado.

- **R11 — Ruling: el benchmark NO se mide en el iPad, y la fase cierra igual.** Decisión del
  usuario, con la que coincido. El iPad Air 5 lleva un **M1**, CPU de clase escritorio, contra
  el Pixel 6 donde está medido Android: el número mezclaría el costo del puente con la
  diferencia de chip, y la pantalla existe **justamente para aislar lo primero**. Un número
  que parece una respuesta sin serlo es peor que la ausencia de número, porque nadie vuelve a
  medirlo. Queda como pendiente explícito en `PENDING.md`, no como omisión.
  El Step 2 —la condición que el plan pone para declarar la fase terminada— es la corrida
  sobre hardware, y esa sí se hizo. Si me equivoco cuesta: una demo sin la cifra de iOS.

- **Estado: Fase 3 COMPLETA.** Las tres condiciones de cierre del CLAUDE.md: test de contrato
  en verde ✅ (28/28, simulador y aparato), `README.md` con comandos efectivamente ejecutados
  ✅, diagrama Mermaid ✅. Pendiente de decisión del usuario: merge a `main` con
  `superpowers:finishing-a-development-branch`, y `docs/demo-runbook.md`, que `CLAUDE.md`
  condiciona a que existan al menos dos apps — condición que **recién ahora** se cumple.

## Cierre de rama — `superpowers:finishing-a-development-branch`

- **Verificación previa al merge, sobre el árbol que se integra** (no una corrida vieja de la
  sesión): `rust-core` **67 passed, 0 failed**; iOS **47 tests en 12 suites, TEST SUCCEEDED**.
  Nota operativa: `cargo` no está en el PATH de una shell no interactiva; hay que exportar
  `$HOME/.cargo/bin` primero.
- Entorno: repo normal (`GIT_DIR == GIT_COMMON`), **sin worktree** que limpiar. Base `main`,
  confirmada como ancestro de HEAD.
- **Opción elegida: merge local.** Es la única consistente con el repo: la Fase 2 se integró con
  un merge commit local (`89b95a5 Merge: Fase 2 — …`) y **no hay un solo "Merge pull request"
  en todo el historial**. Se usó `--no-ff` a propósito: `main` era ancestro, así que un merge
  normal habría hecho fast-forward y borrado el límite de fase del historial.
- **Re-verificación sobre el resultado mergeado**, que es lo que la skill exige antes de borrar
  nada: 67 + 47, las dos en verde. Recién ahí se borró la rama.
- `742f508 Merge: Fase 3 — apps/ios, el segundo consumidor del núcleo`. Rama
  `feat/phase-3-app-ios` borrada (estaba en `83da234`).
- **El push a `origin` NO se hizo**: es la parte hacia afuera y el usuario pidió cerrar la rama,
  no publicar. `main` queda **42 commits adelante de `origin/main`**, esperando esa decisión.
