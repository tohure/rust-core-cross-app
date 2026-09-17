# SDD ledger — plan: docs/superpowers/plans/2026-09-16-phase-6-block-1-android.md

Spec: docs/superpowers/specs/2026-09-16-phase-6-hardening-design.md
Rama: feat/phase-6-hardening (la misma del bloque 0, que quedó cerrado en 391a186)

Ruling (de entrada): la ejecución es **inline, sin subagentes**, a diferencia de las tareas 1-8
del bloque 0. Motivo: las tareas 9-12 del bloque 0 se hicieron así y salieron con la misma
disciplina de ledger; partir el contexto en briefs cuesta más de lo que aporta en un bloque que
toca un solo subproyecto. Costo si me equivoco: un solo par de ojos por tarea, sin el revisor
independiente que tuvieron las tareas 1-8.

## Escaneo previo de conflictos

| # | Par / tarea | Produce → consume | Hallazgo |
|---|---|---|---|
| 1 | T1 → T2, T3 | el módulo `:core-financiero` | OK. Las dos mueven código adentro y declaran el consumo. |
| 2 | **T1 (consigo misma)** | «los generados siguen versionados» | **PREMISA FALSA**. Ver ruling abajo. |
| 3 | T1 → toda regeneración futura | la ruta de salida de `cargo ndk` y de `uniffi-bindgen` | **RIPPLE NO DECLARADO**. Ver ruling abajo. |
| 4 | T2 → T4 | el adapter dentro del módulo | OK. |
| 5 | T3 → T9 | el reparto de suites | OK. |
| 6 | T8 → docs/ui-spec.md | el hex de la pantalla de Tarjeta | Pendiente de leer: el ui-spec es normativo para las CUATRO apps, así que alinear Android puede obligar a mirar las otras tres. Se evalúa al llegar.|

## Progreso

Task 1: Ruling: el plan afirma que los generados «siguen versionados» y ordena moverlos con
`git mv` (Step 4), marcarlos con `.gitattributes linguist-generated=true` (Step 5) y verificar el
movimiento con `git log` / `git diff` sobre la ruta nueva (Step 7). Las tres cosas son imposibles:
`apps/android/app/src/main/java/uniffi/` y `apps/android/app/src/main/jniLibs/` están IGNORADOS
por `.gitignore:14-15` y git no los trackea — verificado con `git ls-files` (vacío) y
`git check-ignore -v` (ambos ignorados). Decisión: se mueven con `mv` pelado, se actualizan las
dos rutas del `.gitignore`, NO se crea el `.gitattributes` (linguist sólo mira archivos
trackeados) y el Step 7 se reemplaza por la verificación que sí verifica: el SHA embebido en el
`.so` antes y después del movimiento. Costo si me equivoco: el `.gitattributes` no existe y a
alguien le aparecen los generados en un diff de GitHub — no pueden, están ignorados.

Task 1: Ruling: mover los generados cambia la ruta de salida de los comandos de regeneración, que
viven en `rust-core/CONTEXT.md` § «Comandos de exportación» —la fuente única, referenciada por
`rust-core/BUILD.md`— y escriben literalmente a `../apps/android/app/src/main/jniLibs` y
`../apps/android/app/src/main/java`. El plan declara que este bloque «no toca el core», pero sin
tocar ese bloque de comandos el próximo que regenere deja los artefactos en la ruta vieja y la
app compila contra lo que quedó, en silencio. Decisión: se amplía el alcance de la Task 1 a esas
dos rutas de `rust-core/*.md`, y sólo a esas. Aprobado por el usuario antes de ejecutar. Costo si
me equivoco: un bloque que se declaraba autocontenido toca dos archivos del core.

Task 1: Hallazgo (tercer error del plan, y el más caro de diagnosticar): el Step 2 declara el source set de generados con `java.srcDir("src/generated/java")`. Con el Kotlin integrado de AGP 9 eso deja el directorio **fuera del compilador de Kotlin**. El modo de fallo es traicionero: `:core-financiero:assembleDebug` dice BUILD SUCCESSFUL, el AAR sale con las tres `.so` adentro, y el jar de clases del módulo trae **una sola clase** —el `R`—. El error aparece recién al compilar `:app`, como `Unresolved reference 'DomainException'` en los tres ViewModels, a un módulo de distancia de su causa. Corregido a `kotlin.srcDir`: el jar pasó de 1 clase a 98. Verificado con `./gradlew clean` de por medio, no con caché.
Task 1: Hallazgo (cuarto): el plan no menciona que el plugin `com.android.library` hay que declararlo en el `build.gradle.kts` RAÍZ con `apply false`, junto a los otros dos. Sin eso, `alias(libs.plugins.android.library)` en el módulo falla con «the plugin is already on the classpath with an unknown version, so compatibility cannot be checked».
Task 1: Ruling: el módulo declara JNA con `api` y no con `implementation`, que es lo que el plan ponía por defecto dejando el cambio a `api` como contingencia del Step 6. Motivo: los bindings generados exponen tipos de JNA en firmas públicas, así que `:app` los necesita en su classpath de compilación. Costo si me equivoco: `:app` ve JNA transitivamente aunque no la declare — que es exactamente lo que se quiere, porque el objetivo es que no la declare.
Task 1: Ruling (alcance, ampliado sobre la marcha): además de `rust-core/CONTEXT.md` y `rust-core/BUILD.md` que ya estaban aprobados, la mudanza obligó a corregir la ruta en `rust-core/README.md` —el bucle de los seis artefactos, que es ejecutable y habría impreso una línea vacía— y en `apps/android/BUILD.md` y `apps/android/README.md`, que tienen ocho comandos ejecutables con la ruta vieja. Un comando equivocado deja los artefactos donde no van y la app compila en silencio contra lo que quedó. La Task 11 sigue siendo dueña del resto de la documentación de Android (diagrama, estructura, prosa).
Task 1: complete — `:app:assembleDebug` en verde tras `clean`, el APK lleva las tres `.so`, el SHA embebido es el mismo antes y después de mover (`1.0.0+959025f`), `:app` ya no declara JNA, JVM 29/29 e instrumentada 16/16 sobre el AVD Pixel_9_Pro —incluida `theLibraryLoadsAndJnaResolvesSymbols`, que es la que prueba que el `.so` ahora carga desde el AAR del módulo—.

Task 2: Ruling (quinto error del plan, y toca una Global Constraint): el Step 4 espera **cero** `import uniffi.*` en `app/src/main`, y el estado final declarado del bloque dice «`:app` sin JNA y sin `import uniffi.*`». Es inalcanzable y además contradice una decisión de diseño documentada: `CoreFinanciero.kt` dice «**Reexporta los tipos de uniffi; no los traduce.** Una segunda nomenclatura en Kotlin duplicaría el contrato y se desincronizaría en la primera regeneración de bindings», y `apps/android/CONTEXT.md:332` lo pone en la tabla de «Qué NO hacer»: «`toDomain()` mapeando tipos → **No.** El adapter reexporta». CLAUDE.md dice que gana el CONTEXT del subproyecto. Decisión: el estado final correcto es `:app` **sin JNA** y sin llamar al core directo; los cuatro TIPOS —`Account`, `DomainException`, `TransferRequest`, `TransferResult`— siguen cruzando a propósito. Verificado: `:app` no importa una sola FUNCIÓN de `uniffi.core_financiero`, y la única referencia a la implementación es `AppContainer` construyendo `UniffiCoreFinanciero()`, que es el composition root y tiene que elegir una. Costo si me equivoco: el bloque no cumple su Global Constraint tal como está escrita, y hay que reescribirla en el plan.
Task 2: Ruling: el commit deja la suite instrumentada de `:app` en ROJO por un commit —11 de 16—, y se acepta. Causa verificada, no supuesta: el bloque `Copy` de contratos se mudó al módulo, así que el APK de androidTest de `:app` ya no lleva `cases.json` ni `messages.es.json` (`unzip -l` sobre `app-debug-androidTest.apk` no muestra ningún asset json), y los diez casos de `ContractTest` más uno de `ContractAssetsTest` no encuentran el archivo. Es el mismo acoplamiento que el plan asume al no correr la suite instrumentada en esta tarea: la cierra la Task 3 moviendo esos tests al androidTest del módulo, que es donde el `Copy` ahora deja los assets. La JVM quedó en verde, 29/29. Costo si me equivoco: alguien que haga checkout de este commit puntual encuentra la instrumentada roja.

Task 3: complete — las cuatro combinaciones en verde y ningún test perdido. JVM: 25 en `:app` + 4 en `:core-financiero` = 29, los mismos 29 de antes. Instrumentada: 16 en `:core-financiero`, 0 fallos, los mismos 16 de antes. El Step 3 del plan acertó: `AssetSourcesTest` usaba `targetContext`, que era el APK de `:app`; con el `Copy` en el módulo hay que usar `context`, el del APK de test.
Task 3: Hallazgo que hay que tener presente en las tareas 5 y 6: el androidTest de `:app` quedó **vacío** —los cuatro archivos se mudaron—, así que `:app:connectedDebugAndroidTest` ahora pasa en verde **sin correr un solo test**. Un verde que no prueba nada es exactamente el defecto que esta fase vino a corregir en otros lados. Lo cierran la Task 5 (rotación) y la Task 6 (guardia del `@Immutable`), que agregan instrumentados a `:app`; si alguna se cayera del alcance, hay que decidir explícitamente qué pasa con esa suite en vez de dejarla vacía.

Ruling (a pedido del usuario, tras la Task 3): las tareas 4 a 11 se ejecutan seguidas y la
verificación va en UNA pasada al final, en vez de correr las suites tarea por tarea como pide cada
Step. Motivo: la corrida instrumentada necesita emulador y es lo más lento del ciclo; hacerla ocho
veces no agrega señal si los cambios no se pisan entre sí. Mitigación: se compila tras cada tarea
—es barato— y el commit por tarea se mantiene, así que un `git bisect` sigue sirviendo. Costo si me
equivoco: si algo se rompe en la Task 5 me entero en la Task 11 y el diagnóstico es más caro,
porque hay siete commits de por medio en vez de uno.

Task 4: complete (commit f6667af) — tres tests instrumentados nuevos sobre el adapter real. `MontoInvalido` verificado contra el core (`add` → `parse_amount` → `InvalidAmount`), no adivinado del plan.
Task 5: complete — rojo verificado antes del arreglo (1 test, 1 fallo tras `recreate()`) y verde después. La pestaña pasa a `rememberSaveable` sobre el ÍNDICE y los cuatro ViewModels a `viewModel(factory)`, atados al `ViewModelStore` de la Activity.
Task 5: Hallazgo (sexto error del plan, y afecta a dos tareas): tanto el Step 2 de la Task 4 como el Step 3 de la Task 5 mandan correr `./gradlew :app:connectedDebugAndroidTest --tests '*RotationTest*'`. **`--tests` no existe para `connectedAndroidTest`**: es una opción de las tareas `Test` de la JVM, y Gradle corta con «Unknown command-line option '--tests'». El equivalente real es `-Pandroid.testInstrumentationRunnerArguments.class=<FQN>`. Vale la pena que quede escrito: es la forma de correr UN solo test instrumentado, y sin ella el ciclo rojo-verde de TDD sobre aparato obliga a correr la suite entera.
Task 5: Ruling: el label del campo de tarjeta es `"Número"`, no `"Número de tarjeta"` como escribe el test del plan. Se usó el del código, que es lo que el propio plan indica cuando no coinciden.

Task 6: Hallazgo (séptimo error del plan): el regex que deriva los campos, `var\s+(\w+)\s*:`, NO matchea el binding real. uniffi emite los nombres **entre backticks** —``var `id`: kotlin.String``—, así que el set de campos habría salido VACÍO y `noUiFileAssignsToAUniffiRecordField` habría pasado en verde sin mirar un solo campo: una guardia vacua, que es el mismo defecto que esta fase vino a corregir. Corregido a `var\s+`?(\w+)`?\s*:`. Nota a favor del plan: su primer test, `theGeneratedBindingStillHasTheFiveRecords`, es exactamente el canario de esto — con el set vacío, el `containsAll` falla.
Task 6: complete — guardia escrita y **vista fallar**, que es lo que el Step 3 exige. Con `account.balance = "0.00"` inyectado en `TransferScreen.kt`, el test falla nombrando `TransferScreen.kt:60 → .balance =`; revertido, verde. El primer intento de inyección no sirvió: usé una variable inexistente y lo que falló fue la compilación de `:app`, o sea que la guardia ni llegó a correr. Para ver fallar a una guardia que lee el FUENTE hay que inyectar algo que compile.

Task 7: complete — los dos rojos verificados antes (el campo `error` no existía y la compilación del test cortaba), verdes después. `BenchmarkUiState.error`, el guard con voz y `String.format(Locale.ROOT, …)` en el percentil; la pantalla lo pinta con el mismo componente y color que las otras tres.
Task 7: Hallazgo de PARIDAD, y sale del alcance de este bloque: el plan dice que el texto de cero iteraciones «es el mismo en las cuatro apps». Verificado uno por uno: React Native (`useBenchmark.ts:46`) y Angular (`benchmark-screen.ts:338`) tienen el string EXACTO, `"Ingresa un número de iteraciones mayor que cero."`. **iOS no lo tiene**: `BenchmarkViewModel.swift:32` hace `guard let n = Int(state.iterations), n > 0 else { return }`, un return mudo — el mismo defecto que Android tenía hasta esta tarea. O sea que al cerrar este bloque iOS queda como la ÚNICA app que no explica por qué no pasó nada, y CLAUDE.md dice que cambiar un texto de UI en una app obliga a cambiarlo en las cuatro. No se toca acá porque este bloque es sólo Android; hay que abrirlo como trabajo de iOS y decidirlo explícitamente.
