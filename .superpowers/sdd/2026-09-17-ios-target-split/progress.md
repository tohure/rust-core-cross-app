# SDD ledger — plan: docs/superpowers/plans/2026-09-17-ios-target-split.md

Spec: docs/superpowers/specs/2026-09-17-ios-target-split-design.md (legible, es la autoridad)
Rama: feat/ios-target-split — base 4f3770b (main), HEAD al arrancar 40e56e9

## Preflight — pares de tareas que comparten archivo o interfaz

| Par | Produce → consume | Hallazgo |
|---|---|---|
| 1 → 2 | T1 produce conteo 54 y el string de coreVersion; T2 Step 11 exige el mismo 54 | consistente |
| 1 → 3 | T1 produce el string; T3 Step 3 exige verlo igual en pantalla | consistente |
| 1 → 4 | T1 produce el string real (1.0.0+959025fca); T4 NO dice actualizar el README, que nombra 1.0.0+b719da3, viejo | **DEFECTO P3** |
| 2 → 3 | T2 produce el commit del target; T3 corre la suite sobre aparato | consistente |
| 2 → 4 | T2 mueve rutas y toca .gitignore; T4 actualiza BUILD.md y CONTEXT.md que las nombran | consistente |
| 3 → 4 | T3 produce cuál plan B del enlace se aplicó; T4 Step 1 item 3 lo documenta | consistente |

## Preflight — coherencia interna de cada tarea

| Tarea | Hallazgo |
|---|---|
| 1 | Coherente. Sin archivos, sin commit; los tres comandos son de solo lectura |
| 2 | **DEFECTO P1** (conteo de public) y **DEFECTO P2** (verificación del Step 9). Lo demás coherente: el .gitignore va antes de mover, el build roto del Step 3 es la verificación de que la mudanza tuvo efecto, y `git add -A apps/ios` es seguro porque .DS_Store está ignorado (.gitignore:2) |
| 3 | Coherente. El Step 2 modifica el pbxproj sólo si falla el enlace, y dice commitear aparte |
| 4 | Coherente salvo P3. El Mermaid está completo, no es descripción |

## Rulings del preflight

Ruling P1: el plan y la spec dicen 39 declaraciones `public`; son **40**, más el
`public init()` escrito a mano. Contado con grep sobre los siete archivos. Corrijo los dos
documentos. Costo si me equivoco: ninguno, el compilador es la verificación real; el número
sólo sirve para detectar que faltó marcar algo.

Ruling P2: la verificación del Step 9 usa `grep -L ... ios-rust-test/UI/*/*.swift`, que
reporta **5 falsos positivos** — ArithmeticUiState, BenchmarkUiState, NativeBaseline,
CardUiState y Palette no referencian nada del core y no deben llevar el import. Reemplazo el
glob por la lista explícita de 12. Costo si me equivoco: el implementador agregaría imports
de más a 5 archivos; los cazaría el warning de import no usado, no un fallo.

Ruling P3: el README nombra `1.0.0+b719da3` y el artefacto real dice `1.0.0+959025fca`. La
Task 4 no decía actualizarlo. Lo agrego al Step 4. Costo si me equivoco: el README seguiría
citando un SHA viejo como ejemplo, que es cosmético pero es justo el string que el runbook
manda comparar.

## Ejecución

Ruling T1-a: la Task 1 no produce diff —es solo verificación—, así que no despacho revisor de
tarea: verifico yo el informe y que el working tree y el HEAD no se movieran. Costo si me
equivoco: ninguno; no hay código que revisar.

Ruling T1-b: el script `sdd-workspace` pisó `.superpowers/sdd/.gitignore`, reemplazando su
contenido por `*` y tirando las reglas `!*/` y `!*/progress.md` que mantienen los ledgers
versionados. CLAUDE.md cita el ledger de la Fase 1 como documento vigente, así que dejarlo
pisado los sacaría del repo. Restaurado con `git checkout`. Costo si me equivoco: el scratch
de esta ejecución entraría al repo, que es justo lo que el archivo original ya evitaba.

Task 1: complete (sin commits — tarea de verificación, working tree limpio)
  Baseline: 54 tests in 13 suites, `** TEST SUCCEEDED **` sobre el iPhone 12 físico
  coreVersion del artefacto: 1.0.0+959025fca

Ruling T2-a: el plan pedía marcar `public` los requirements de los tres `protocol`. **El plan
estaba mal**: Swift rechaza eso con `'public' modifier cannot be used in protocols`; los
requirements heredan la visibilidad del protocolo. El implementador desvió correctamente y el
revisor lo verificó contra el lenguaje, no contra su palabra. Quedan 28 `public` explícitos +
13 implícitos = 41, que es 40 + el init manual. Costo si me equivoco: ninguno, no compilaría.

Ruling T2-b: el Step 7 esperaba que el `grep -c` diera 9 y da 10, porque el patrón matchea
también el comentario de encabezado actualizado. Defecto cosmético del plan, no del código.
Costo si me equivoco: ninguno.

Ruling T2-c: los tres `xcodebuild` de simulador necesitaron `,OS=26.5` porque "iPhone 17 Pro"
no existe en el runtime 27.0 de esta máquina. **Esto afecta a la Task 4**: los comandos del
README y de TESTING.md están escritos sin el `OS=`, así que hoy no corren tal cual en esta
máquina. Lo agrego al alcance de la Task 4. Costo si me equivoco: el README seguiría con un
comando que falla, que es justo lo que el proyecto prohíbe.

Ruling T2-d: el commit quedó con `Co-Authored-By: Claude Sonnet 5`, no el `Opus 5` que decían
las Global Constraints. La atribución correcta es la del modelo que escribió el código, y lo
escribió Sonnet. No lo reescribo. Costo si me equivoco: una línea de atribución imprecisa en
un commit.

Task 2: minor (deferred): la fase Frameworks del target de tests no declara `CoreFinancieroKit`
explícitamente; funciona por dependencia transitiva vía la app y `BUILT_PRODUCTS_DIR`, que es
patrón estándar de Xcode. Se le pasa a la revisión final para que triaje.

Task 2: complete (commits f985308..92b8b3c, review clean — spec OK, calidad aprobada, 1 minor)

Ruling T3-a: el Step 3 pide «abrir la app en el aparato y anotar el string del pie». No hay
forma programática de capturar la pantalla de un iPhone físico en este entorno —`devicectl` no
da screenshot y no hay XCUITest—. Sustituyo por tres evidencias que juntas cubren lo mismo:
(a) el string del artefacto del slice de aparato, que es de donde el pie lo saca;
(b) una captura del simulador con el pie visible, vía `xcrun simctl io booted screenshot`;
(c) la suite completa sobre el aparato en verde, que incluye `CoreSmokeTest` probando que
`coreVersion()` cruza el FFI en el slice `aarch64-apple-ios`.
Costo si me equivoco: quedaría sin confirmar que el pie se *pinta* en el iPhone, cosa que la
Fase 3 ya verificó a ojo y que este refactor no toca. Se lo digo al usuario para que lo mire
si quiere.

CORRECCIÓN al baseline de la Task 1: el string NO es `1.0.0+959025fca` sino **`1.0.0+959025f`**.
El error es mío, del plan: el `grep -oE '…[0-9a-f]{7,}'` del Step 4 es codicioso y `strings` no
separa literales contiguos en un binario de Rust, así que se comió la `ca` del literal
siguiente (``called `Result::unwrap()`…``). El SHA nunca se movió; lo que estaba mal era el
método de extracción. Lo encontró el subagente de la Task 3 leyendo las capturas, no el regex.
Plan corregido a `{7}` exacto, con la advertencia.

Ruling T3-b: el Pixel 6 físico (25251FDF60033N, oriole) apareció conectado a mitad de la
ejecución; antes sólo estaba el emulador. Re-verifiqué el pie ahí mismo en vez de dejar la
salvedad del emulador: `uiautomator dump` sobre el Pixel 6 da `1.0.0+959025f`, idéntico a iOS.
La salvedad del emulador queda sin efecto para la comparación del pie. Costo si me equivoco:
ninguno, es evidencia de más.

Task 3: complete (sin commits — no hizo falta ningún plan B del enlace)
  iPhone 12 físico: 54 tests en 13 suites, ** TEST SUCCEEDED **
  Pie iOS = 1.0.0+959025f ; pie Android en Pixel 6 físico = 1.0.0+959025f ; coinciden

Ruling T4-a: el revisor marcó como Important que el informe de la Task 4 «fabricó» una cita del
brief para justificar tocar `TESTING.md`. **Falso positivo, y la culpa del malentendido es
mía.** La autorización existió: la di yo en el prompt de despacho —«TESTING.md no está en la
lista de archivos del brief pero sí menciona el comando de simulador que hoy falla, así que si
lo tocás por eso, decilo»— y el revisor sólo veía el brief, no mi despacho. El cambio de
alcance estaba autorizado; lo impreciso era a quién se lo atribuía el informe. Mando corregir
el registro, no el documento. Costo si me equivoco: el ledger diría que la expansión de alcance
vino del controlador cuando vino de otro lado, cosa que puedo verificar leyendo mi despacho.

Task 4: fix round 1/5 — 1 hallazgo Important abierto (footgun de `strings` sin documentar en
BUILD.md), 1 descartado como falso positivo con ruling T4-a, 1 Minor sin acción (la fila nueva
del README, que el revisor mismo juzga razonable).
Task 4: fix round 1/5 (1 addressed, 0 open; commits fa4e872..bd1962d)
Task 4: complete (commits 60b3adb..bd1962d, review clean — 1 minor sin acción, 1 falso
  positivo con ruling T4-a)

## Revisión final de rama (opus, 4f3770b..bd1962d)

Verificó carácter por carácter que la mudanza de los ocho archivos no escondiera lógica:
`UniffiCoreFinanciero.swift` —el delete+create que git no pareó como rename— normalizado tiene
**una sola diferencia con el original: el `public init() {}`**. Los nueve cuerpos byte a byte
iguales. Los 21 archivos de app y test son exactamente una línea `+import`. `cases.json` no se
toca. Ningún `Double`/`Float` nuevo, ninguna regla de negocio en Swift.

Nueve hallazgos, todos de documentación e higiene del pbxproj, ninguno funcional. Los tres que
importaban:
- F1: `apps/android/PENDING.md` quedaba afirmando que iOS sigue siendo un target único, y
  mandaba al lector al PENDING de iOS, que lo desmiente. **La spec §11 omitió ese archivo.**
- F2: el comando que yo mismo propuse con `{7}` exacto **reintroduce el fallo que la sección
  denuncia**: `git rev-parse --short` respeta `core.abbrev=auto`, que crece con el repo, así que
  con 8+ caracteres `{7}` trunca en silencio. Reemplazado por un `grep -F` contra el SHA
  conocido, que falla ruidoso. Y `959025fca` tiene 9 caracteres, no 10.
- F3: `apps/ios/CONTEXT.md` seguía diciendo que uniffi emite las globales «en el módulo de la
  app» y que «no las prefijes con nada» — las dos falsas después del split, y del mismo tipo de
  premisa vieja que este PR salió a corregir.

Ruling FR-a: triaje del minor diferido de la Task 2 (el bundle de test no declara
`CoreFinancieroKit` en su fase Frameworks). **No se arregla: la omisión es correcta.** El kit es
estático y el `.xctest` hostea en la app vía `TEST_HOST`, así que los símbolos ya están en el
binario de la app; enlazarlo también arrastraría una segunda copia de los objetos del kit. Lo
que sí faltaba era decirlo por escrito, porque el próximo que abra el pbxproj lo va a leer como
olvido — agregado a BUILD.md. Costo si me equivoco: ninguno, es documentar el statu quo.

Ruling FR-b: triaje del minor diferido de la Task 4 (fila del README y `TESTING.md` fuera de la
lista del brief). **No es alcance de más.** `TESTING.md` publica un comando que hoy falla en
esta máquina, y dejarlo sin la nota violaría la regla del proyecto sobre comandos no
ejecutados. Costo si me equivoco: dos ediciones de documentación de más.

Ruling FR-c: F6 tenía dos salidas —bajar `fallback` a `internal`, o darle consumidor—. Elegí
darle consumidor: el test comparaba contra el literal `"No se pudo completar la operación."`,
duplicando el string que la constante existe para centralizar. Ahora compara contra
`ContractMessages.fallback`. Costo si me equivoco: un `public` de más en la superficie del kit.

Tanda de arreglo: 1 sola, F1-F9 + el agregado (commits f2a8b99, 2c7342c).
Re-revisión acotada: los diez ADDRESSED, sin roturas nuevas. El re-revisor corrió `plutil
-lint`, `xcodebuild build` y `xcodebuild test` por su cuenta en vez de confiar en el informe:
54 tests en 13 suites.

Verificación final sobre aparato, después de la tanda de arreglos: el `pbxproj` cambió (F4
sacó la referencia colgada a Foundation, F8 los ajustes muertos de dylib), así que se repitió
la corrida sobre el iPhone 12 físico y no sólo en simulador.
`Test run with 54 tests in 13 suites passed` · `** TEST SUCCEEDED **`

RAMA LISTA para PR. Siete commits de contenido sobre 4f3770b.
