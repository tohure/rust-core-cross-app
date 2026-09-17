# Fase 6 · Bloque 1 — `apps/android` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los pendientes de `apps/android`: extraer la capa FFI a un módulo Gradle propio, verificar el adapter contra la librería real, sobrevivir a la rotación, y alinear con `docs/ui-spec.md` los dos lugares donde Android diverge.

**Architecture:** `:core-financiero` nace como Android Library y se lleva JNA, los bindings generados, las `.so`, el adapter y la copia del contrato; `:app` queda con Compose, los ViewModels y el formateo. Los generados se mudan a un source set propio y **siguen versionados**: es un `git mv`, los bytes del `.so` no cambian y el pie de `coreVersion()` no se mueve.

**Tech Stack:** Kotlin 2.4.20, Jetpack Compose (BOM 2026.09.00), AGP 9.4.0, compileSdk 37, minSdk 28, Java 21, JNA 5.19.1, uniffi 0.31.

**Spec:** [docs/superpowers/specs/2026-09-16-phase-6-hardening-design.md](../specs/2026-09-16-phase-6-hardening-design.md)

**Precondición:** el Bloque 0 tiene que estar en verde. Este bloque **no toca el core, no toca el contrato y no regenera ningún artefacto**.

## Global Constraints

- **Todo identificador va en inglés**; documentación, comentarios y textos de UI, en español. Commits en Conventional Commits con scope `android`.
- **Ningún `Double` ni `Float` toca un monto**, tampoco en tests. Para comparar u ordenar en UI: `BigDecimal`.
- **Cero reglas de negocio en Kotlin.** La única excepción permitida es `ui/benchmark/NativeBaseline.kt`, que existe para exhibir la divergencia de centavos y lleva el comentario que lo dice.
- **Los artefactos generados no se editan a mano:** `uniffi/core_financiero/core_financiero.kt` y los `.so`. Si algo generado está mal, se corrige en `rust-core` y se regenera.
- Los labels y el orden de campos son normativos y viven en [docs/ui-spec.md](../../ui-spec.md). Cambiar uno obliga a cambiarlo en las cuatro apps.
- `e.message` es diagnóstico, **nunca** texto de usuario: los textos vienen de `contracts/messages.es.json` vía `ContractMessages`.
- Estado esperado al terminar: `:app` sin JNA y sin `import uniffi.*`; las dos suites en verde; ningún test perdido respecto de los 43 de hoy.

---

### Task 1: El módulo `:core-financiero` existe y la app compila contra él

**Files:**
- Create: `apps/android/core-financiero/build.gradle.kts`, `apps/android/core-financiero/src/main/AndroidManifest.xml`
- Modify: `apps/android/settings.gradle.kts`, `apps/android/gradle/libs.versions.toml`, `apps/android/app/build.gradle.kts`
- Move: `apps/android/app/src/main/java/uniffi/` → `apps/android/core-financiero/src/generated/java/uniffi/`, `apps/android/app/src/main/jniLibs/` → `apps/android/core-financiero/src/generated/jniLibs/`

**Interfaces:**
- Consumes: nada.
- Produces: el módulo `:core-financiero`, con el paquete Kotlin `uniffi.core_financiero` visible desde `:app`. Las tareas 2 y 3 mueven código adentro.

**Detalle que ahorra una tarde:** el `namespace` de un módulo Android es para el `R` y el `BuildConfig`, **no** para los paquetes de las fuentes. Poniéndole `dev.tohure.android_rust_test.core` al módulo, las clases que se muden en la Task 2 **conservan su paquete** `dev.tohure.android_rust_test.adapter` y ningún `import` de `:app` cambia.

- [ ] **Step 1: Declarar el plugin de librería en el catálogo**

En `apps/android/gradle/libs.versions.toml`, bajo `[plugins]`:

```toml
android-library = { id = "com.android.library", version.ref = "agp" }
```

- [ ] **Step 2: Crear el módulo**

`apps/android/core-financiero/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "dev.tohure.android_rust_test.core"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        minSdk = 28
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Mismo filtro que traía :app: el AAR de JNA empaqueta slices para ABIs que el
        // NDK ya no soporta, y son ~530 KB que no pueden ejecutarse en ningún dispositivo.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    // Los generados viven aparte del código escrito a mano. Siguen versionados: si se
    // generaran en build/, un `clean` dejaría la app sin compilar hasta volver a correr
    // el paso de Rust, y eso se descubre el día de la demo.
    sourceSets {
        getByName("main") {
            java.srcDir("src/generated/java")
            jniLibs.srcDir("src/generated/jniLibs")
        }
    }
}

dependencies {
    // El `@aar` no es opcional: es el artefacto que trae las .so nativas de JNA.
    implementation(variantOf(libs.jna) { artifactType("aar") })
}
```

`apps/android/core-financiero/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest />
```

Si el catálogo no declara el plugin `kotlin-android`, agregarlo junto a `android-library`:

```toml
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
```

- [ ] **Step 3: Incluir el módulo y enchufarlo a `:app`**

En `apps/android/settings.gradle.kts`, tras `include(":app")`:

```kotlin
include(":core-financiero")
```

En `apps/android/app/build.gradle.kts`, en `dependencies`, agregar la primera línea y **borrar** la de JNA:

```kotlin
    implementation(project(":core-financiero"))
```

- [ ] **Step 4: Mover los generados**

```bash
cd apps/android
mkdir -p core-financiero/src/generated/java
git mv app/src/main/java/uniffi core-financiero/src/generated/java/uniffi
git mv app/src/main/jniLibs core-financiero/src/generated/jniLibs
```

- [ ] **Step 5: Marcarlos como generados**

Crear `apps/android/.gitattributes`:

```gitattributes
# Los produce `uniffi-bindgen` y `cargo ndk`; se regeneran desde rust-core, no se editan.
core-financiero/src/generated/** linguist-generated=true
```

- [ ] **Step 6: Compilar**

Run: `cd apps/android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL. Si falla con símbolos de JNA no resueltos desde `:app`, cambiar en el módulo `implementation(variantOf(libs.jna) …)` por `api(variantOf(libs.jna) …)`: querría decir que el binding generado expone tipos de JNA en firmas públicas.

- [ ] **Step 7: Verificar que el `.so` no cambió**

Run:
```bash
cd apps/android && git log --oneline -1 -- core-financiero/src/generated/jniLibs && git diff --stat HEAD -- core-financiero/src/generated/jniLibs
```
Expected: el diff no reporta cambios de contenido, solo el renombre. Los bytes del `.so` son los mismos y el pie de `coreVersion()` no se movió.

- [ ] **Step 8: Commit**

```bash
git add apps/android
git commit -m "refactor(android): módulo :core-financiero con los generados en su propio source set"
```

---

### Task 2: El adapter y el contrato se mudan al módulo

**Files:**
- Move: `app/src/main/java/dev/tohure/android_rust_test/adapter/` → `core-financiero/src/main/java/dev/tohure/android_rust_test/adapter/`, `app/src/main/java/dev/tohure/android_rust_test/contract/` → `core-financiero/src/main/java/dev/tohure/android_rust_test/contract/`
- Modify: `apps/android/app/build.gradle.kts` (quitar el bloque de contratos), `apps/android/core-financiero/build.gradle.kts` (recibirlo)

**Interfaces:**
- Consumes: el módulo de la Task 1.
- Produces: `dev.tohure.android_rust_test.adapter.CoreFinanciero`, `UniffiCoreFinanciero`, `ContractMessages`, `DomainException.contractName()`, y `contract.ContractSource` / `MessageSource` / `AssetContractSource` / `AssetMessageSource`, todos servidos por `:core-financiero` con **el mismo paquete de antes**. La Task 4 los usa desde el androidTest del módulo.

- [ ] **Step 1: Mover los dos paquetes**

```bash
cd apps/android
mkdir -p core-financiero/src/main/java/dev/tohure/android_rust_test
git mv app/src/main/java/dev/tohure/android_rust_test/adapter core-financiero/src/main/java/dev/tohure/android_rust_test/adapter
git mv app/src/main/java/dev/tohure/android_rust_test/contract core-financiero/src/main/java/dev/tohure/android_rust_test/contract
```

- [ ] **Step 2: Mover el bloque de contratos al módulo**

Cortar de `apps/android/app/build.gradle.kts` todo el bloque bajo el comentario `── Contratos ──` y pegarlo al pie de `apps/android/core-financiero/build.gradle.kts`, **sin cambios salvo uno**: el `Copy` de test apunta al `androidTest` del módulo, que es donde ahora vive el test de contrato. El comentario que explica por qué se copia en vez de apuntar `sourceSets` a `../../contracts` se muda tal cual: sigue siendo cierto.

- [ ] **Step 3: Compilar los dos módulos**

Run: `cd apps/android && ./gradlew :core-financiero:assembleDebug :app:assembleDebug`
Expected: BUILD SUCCESSFUL. Ningún `import` de `:app` cambió, porque los paquetes Kotlin son los mismos.

- [ ] **Step 4: Verificar que `:app` no ve más el FFI**

Run:
```bash
cd apps/android && grep -rn "import uniffi\.\|net.java.dev.jna" app/src/main app/build.gradle.kts
```
Expected: **cero coincidencias en `app/src/main`**. Las que queden en `app/src/test` son de los ViewModels, que siguen usando los tipos del core como datos; eso es esperado y no es una violación del seam.

- [ ] **Step 5: Commit**

```bash
git add apps/android
git commit -m "refactor(android): el adapter y las fuentes del contrato pasan a :core-financiero"
```

---

### Task 3: Las suites se reparten donde corresponde

**Files:**
- Move: `app/src/androidTest/java/dev/tohure/android_rust_test/ContractTest.kt`, `ContractAssetsTest.kt`, `CoreSmokeTest.kt` y `contract/AssetSourcesTest.kt` → `core-financiero/src/androidTest/java/dev/tohure/android_rust_test/…`; `app/src/test/java/dev/tohure/android_rust_test/adapter/ContractMessagesTest.kt` → `core-financiero/src/test/java/…`
- Modify: `apps/android/core-financiero/build.gradle.kts` (dependencias de test)

**Interfaces:**
- Consumes: el módulo de las tareas 1 y 2.
- Produces: dos suites por módulo. La Task 4 agrega la suya al androidTest de `:core-financiero`.

**Qué se queda en `:app`:** los cuatro tests de ViewModel con `FakeCoreFinanciero`, `MoneyFormatterTest` y `NativeBaselineTest`. Prueban presentación, y ahí es donde viven.

- [ ] **Step 1: Declarar las dependencias de test del módulo**

En `apps/android/core-financiero/build.gradle.kts`, en `dependencies`:

```kotlin
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
```

- [ ] **Step 2: Mover los cinco archivos**

```bash
cd apps/android
mkdir -p core-financiero/src/androidTest/java/dev/tohure/android_rust_test/contract
mkdir -p core-financiero/src/test/java/dev/tohure/android_rust_test/adapter
git mv app/src/androidTest/java/dev/tohure/android_rust_test/ContractTest.kt core-financiero/src/androidTest/java/dev/tohure/android_rust_test/
git mv app/src/androidTest/java/dev/tohure/android_rust_test/ContractAssetsTest.kt core-financiero/src/androidTest/java/dev/tohure/android_rust_test/
git mv app/src/androidTest/java/dev/tohure/android_rust_test/CoreSmokeTest.kt core-financiero/src/androidTest/java/dev/tohure/android_rust_test/
git mv app/src/androidTest/java/dev/tohure/android_rust_test/contract/AssetSourcesTest.kt core-financiero/src/androidTest/java/dev/tohure/android_rust_test/contract/
git mv app/src/test/java/dev/tohure/android_rust_test/adapter/ContractMessagesTest.kt core-financiero/src/test/java/dev/tohure/android_rust_test/adapter/
```

- [ ] **Step 3: Corregir el contexto de assets de `AssetSourcesTest`**

Ese test usa `getInstrumentation().targetContext.assets`, que era el APK de `:app`. Ahora el `Copy` de contratos alimenta el APK de test del módulo, así que pasa a `getInstrumentation().context.assets`, igual que `ContractTest`.

- [ ] **Step 4: Correr las cuatro combinaciones**

Run:
```bash
cd apps/android && ./gradlew :app:testDebugUnitTest :core-financiero:testDebugUnitTest && \
./gradlew :app:connectedDebugAndroidTest :core-financiero:connectedDebugAndroidTest
```
Expected: PASS las cuatro. **Necesita dispositivo o emulador.** Sumados, los tests son los mismos que antes de la mudanza: ninguno se perdió.

- [ ] **Step 5: Commit**

```bash
git add apps/android
git commit -m "test(android): repartir las suites entre :app y :core-financiero"
```

---

### Task 4: El `runCatching` del adapter, verificado contra la librería real

**Files:**
- Create: `apps/android/core-financiero/src/androidTest/java/dev/tohure/android_rust_test/adapter/UniffiCoreFinancieroTest.kt`

**Interfaces:**
- Consumes: `UniffiCoreFinanciero`, `ContractMessages`, `AssetMessageSource` y `DomainException.contractName()` de la Task 2.
- Produces: nada que otra tarea consuma.

**El hueco que cierra:** `CoreFinancieroAdapterTest` corre en la JVM sobre `FakeCoreFinanciero`, y el test de contrato llama a uniffi **directamente**, sin pasar por el adapter. Hoy ninguna suite comprueba que `UniffiCoreFinanciero` convierta una excepción del core en `Result.failure` contra la `.so` real. La evidencia actual es «se forzó un error en el emulador una vez».

- [ ] **Step 1: Escribir el test que falla**

```kotlin
package dev.tohure.android_rust_test.adapter

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.tohure.android_rust_test.contract.AssetMessageSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.DomainException

/**
 * El único test que ejercita el adapter **real** contra `libcore_financiero.so`.
 *
 * `CoreFinancieroAdapterTest` corre en la JVM y solo puede ver `FakeCoreFinanciero`; el
 * test de contrato llama a uniffi directo, sin pasar por acá. Sin este archivo, que el
 * `runCatching` traduzca una excepción del core a `Result.failure` es una creencia, no
 * un hecho verificado.
 */
@RunWith(AndroidJUnit4::class)
class UniffiCoreFinancieroTest {
    private val core: CoreFinanciero = UniffiCoreFinanciero()

    @Test
    fun aValidCallComesBackAsSuccess() {
        assertEquals("0.30", core.add("0.1", "0.2").getOrNull())
    }

    @Test
    fun aCoreErrorComesBackAsFailureAndNotAsAThrow() {
        val result = core.add("no-es-un-numero", "1")
        assertTrue("se esperaba failure y llegó $result", result.isFailure)
        val e = result.exceptionOrNull()
        assertTrue("se esperaba DomainException y llegó ${e?.javaClass?.name}", e is DomainException)
    }

    @Test
    fun theFailureCarriesAContractNameWithAUserMessage() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val messages = ContractMessages(AssetMessageSource(assets))
        val e = core.add("no-es-un-numero", "1").exceptionOrNull() as DomainException

        // El nombre del contrato es el puente que NO cruza el FFI: si esto falla, la
        // pantalla de error queda en blanco aunque el core haya reportado bien.
        assertEquals("MontoInvalido", e.contractName())
        assertTrue("el mensaje de usuario no puede estar vacío", messages.userMessage(e).isNotBlank())
    }
}
```

- [ ] **Step 2: Correr y confirmar qué falla**

Run: `cd apps/android && ./gradlew :core-financiero:connectedDebugAndroidTest --tests '*UniffiCoreFinancieroTest*'`
Expected: los tres pasan si el adapter ya funciona — que es la hipótesis. **Si `theFailureCarriesAContractNameWithAUserMessage` falla porque el nombre real no es `MontoInvalido`**, corregir el valor esperado al que devuelve el core para esa entrada: el que manda es el core, no el test.

- [ ] **Step 3: Commit**

```bash
git add apps/android/core-financiero/src/androidTest
git commit -m "test(android): el adapter real traduce errores del core a Result.failure"
```

---

### Task 5: El estado sobrevive a la rotación

**Files:**
- Create: `apps/android/app/src/main/java/dev/tohure/android_rust_test/AppViewModelFactory.kt`
- Modify: `apps/android/app/src/main/java/dev/tohure/android_rust_test/ui/navigation/BancoApp.kt:56-66`, `apps/android/gradle/libs.versions.toml`, `apps/android/app/build.gradle.kts`
- Test: `apps/android/app/src/androidTest/java/dev/tohure/android_rust_test/RotationTest.kt`

**Interfaces:**
- Consumes: `AppContainer` y los cuatro ViewModels.
- Produces: `AppViewModelFactory(container)`, consumida solo por `BancoApp`.

- [ ] **Step 1: Declarar la dependencia que falta**

En `apps/android/gradle/libs.versions.toml`, bajo `[libraries]`:

```toml
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeKtx" }
```

En `apps/android/app/build.gradle.kts`, en `dependencies`:

```kotlin
    implementation(libs.androidx.lifecycle.viewmodel.compose)
```

- [ ] **Step 2: Escribir el test que falla**

```kotlin
package dev.tohure.android_rust_test

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Rotar la pantalla no puede perder ni la pestaña ni lo tecleado. Con `remember` se
 * perdían las dos: la app volvía a Aritmética con todo en blanco.
 */
@RunWith(AndroidJUnit4::class)
class RotationTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun theActiveTabAndItsStateSurviveARecreation() {
        rule.onNodeWithText("Tarjeta").performClick()
        rule.onNodeWithText("Número de tarjeta").performTextInput("4111111111111111")

        rule.activityRule.scenario.recreate()

        rule.onNodeWithText("4111111111111111").assertIsDisplayed()
    }
}
```

Los labels salen de [docs/ui-spec.md](../../ui-spec.md); si no coinciden exactamente con los de `CardScreen.kt`, usar los del código, que es lo que la spec norma.

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd apps/android && ./gradlew :app:connectedDebugAndroidTest --tests '*RotationTest*'`
Expected: FAIL — tras `recreate()` la app está en Aritmética y el texto no existe.

- [ ] **Step 4: Escribir la factory**

`apps/android/app/src/main/java/dev/tohure/android_rust_test/AppViewModelFactory.kt`:

```kotlin
package dev.tohure.android_rust_test

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import dev.tohure.android_rust_test.ui.arithmetic.ArithmeticViewModel
import dev.tohure.android_rust_test.ui.benchmark.BenchmarkViewModel
import dev.tohure.android_rust_test.ui.card.CardViewModel
import dev.tohure.android_rust_test.ui.transfer.TransferViewModel

/**
 * El cableado manual de `AppContainer`, ahora también para `viewModel()`.
 *
 * Con `remember` los cuatro ViewModels morían en cada rotación. `viewModel()` los ata al
 * `ViewModelStore` de la Activity, que sobrevive al cambio de configuración — pero exige
 * una factory, porque los cuatro tienen dependencias en el constructor.
 *
 * Sin librería de DI, por lo mismo que `AppContainer`: con cuatro ViewModels, un `when`
 * explícito se lee de arriba abajo y lo verifica el compilador.
 */
class AppViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        when (modelClass) {
            ArithmeticViewModel::class.java ->
                ArithmeticViewModel(container.core, container.messages)
            TransferViewModel::class.java ->
                TransferViewModel(container.core, container.contract, container.messages)
            CardViewModel::class.java ->
                CardViewModel(container.core, container.contract, container.messages)
            BenchmarkViewModel::class.java ->
                BenchmarkViewModel(container.core)
            else -> error("ViewModel no registrado en AppViewModelFactory: ${modelClass.name}")
        } as T
}
```

- [ ] **Step 5: Usarla en `BancoApp`**

Reemplazar en `BancoApp.kt` el bloque de los cuatro `remember` y la línea de la pestaña:

```kotlin
    // El índice y no el objeto: `Tab` es un `sealed interface` y guardarlo pediría un
    // `Saver` propio para algo que es un número.
    var currentIndex by rememberSaveable { mutableIntStateOf(0) }
    val current = Tab.all[currentIndex]

    val factory = remember(container) { AppViewModelFactory(container) }
    val arithmeticViewModel: ArithmeticViewModel = viewModel(factory = factory)
    val transferViewModel: TransferViewModel = viewModel(factory = factory)
    val cardViewModel: CardViewModel = viewModel(factory = factory)
    val benchmarkViewModel: BenchmarkViewModel = viewModel(factory = factory)
```

y en el `NavigationBarItem`, `onClick = { currentIndex = index }`, obtenido con `Tab.all.forEachIndexed { index, tab -> … }`. Los imports nuevos son `androidx.compose.runtime.mutableIntStateOf`, `androidx.compose.runtime.saveable.rememberSaveable` y `androidx.lifecycle.viewmodel.compose.viewModel`. El comentario que explica por qué los cuatro se crean fuera del `when` se conserva: sigue valiendo.

- [ ] **Step 6: Correr el test y la suite de `:app`**

Run: `cd apps/android && ./gradlew :app:connectedDebugAndroidTest :app:testDebugUnitTest`
Expected: PASS, con `RotationTest` en verde.

- [ ] **Step 7: Commit**

```bash
git add apps/android
git commit -m "fix(android): la pestaña y el estado sobreviven a la rotación"
```

---

### Task 6: La guardia del `@Immutable`

**Files:**
- Create: `apps/android/app/src/test/java/dev/tohure/android_rust_test/UniffiRecordsAreNotMutatedTest.kt`

**Interfaces:**
- Consumes: el binding generado en `core-financiero/src/generated/java/uniffi/core_financiero/core_financiero.kt`.
- Produces: nada que otra tarea consuma.

**Qué protege:** los `Record` de uniffi son `data class` con propiedades `var`. `@Immutable` sobre los `UiState` **anula la inferencia** de Compose, y se cumple solo porque la app nunca muta un `Account` en el lugar: reemplaza la lista entera. Si alguien escribiera `account.balance = "0.00"`, Compose no se enteraría y la pantalla mostraría un saldo viejo. Es un riesgo de corrección, no de rendimiento.

- [ ] **Step 1: Escribir el test**

```kotlin
package dev.tohure.android_rust_test

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Los cinco `Record` que genera uniffi son `data class` con propiedades `var`, y el
 * `@Immutable` de los `UiState` es una promesa que solo se sostiene si nadie los muta.
 *
 * Las dos salidas obvias no sirven: los tipos son generados y no se editan, y envolverlos
 * en tipos propios sería duplicar el contrato en Kotlin. Queda esta guardia, que **deriva
 * la lista de campos del propio binding**: regenerar los bindings no la pudre.
 */
class UniffiRecordsAreNotMutatedTest {
    private val generated = File(
        "../core-financiero/src/generated/java/uniffi/core_financiero/core_financiero.kt",
    )
    private val uiSources = File("src/main/java/dev/tohure/android_rust_test/ui")

    private val records = listOf(
        "Account", "TransferRequest", "TransferResult", "ValidCci", "ValidCard",
    )

    private fun mutableFieldsOfRecords(): Set<String> {
        val source = generated.readText()
        return records.flatMap { name ->
            val header = Regex("""data class $name\s*\(([^)]*)\)""", RegexOption.DOT_MATCHES_ALL)
                .find(source)
                ?.groupValues
                ?.get(1)
                ?: error("no se encontró el Record `$name` en el binding generado")
            Regex("""var\s+(\w+)\s*:""").findAll(header).map { it.groupValues[1] }.toList()
        }.toSet()
    }

    @Test
    fun theGeneratedBindingStillHasTheFiveRecords() {
        // Si esto falla, cambió la forma del generado y la guardia de abajo dejó de mirar
        // lo que cree mirar.
        assertEquals(
            "se esperaban los campos de los cinco Records",
            true,
            mutableFieldsOfRecords().containsAll(listOf("balance", "origin", "receipt", "masked")),
        )
    }

    @Test
    fun noUiFileAssignsToAUniffiRecordField() {
        val fields = mutableFieldsOfRecords()
        val offenders = uiSources.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .flatMap { file ->
                file.readLines().mapIndexedNotNull { i, line ->
                    fields.firstOrNull { field ->
                        Regex("""\.$field\s*=(?!=)""").containsMatchIn(line)
                    }?.let { "${file.name}:${i + 1} → .$it =" }
                }
            }
            .toList()

        assertEquals(
            "un Record de uniffi se REEMPLAZA, no se muta: Compose no observa la mutación " +
                "y la pantalla queda con el valor viejo. Encontrado en: $offenders",
            emptyList<String>(),
            offenders,
        )
    }
}
```

- [ ] **Step 2: Correr y verificar que pasa**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest --tests '*UniffiRecordsAreNotMutatedTest*'`
Expected: PASS. Hoy la app no muta ningún `Record`; la guardia existe para que siga siendo cierto.

- [ ] **Step 3: Verificar que la guardia cazaría el error**

Agregar temporalmente a cualquier archivo de `ui/` una línea como `cuenta.balance = "0.00"` dentro de una función, correr el test y confirmar que **falla nombrando el archivo y la línea**. Después revertir la línea. Una guardia que nunca se vio fallar no es una guardia.

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/test/java/dev/tohure/android_rust_test/UniffiRecordsAreNotMutatedTest.kt
git commit -m "test(android): guardia contra mutar un Record de uniffi desde la UI"
```

---

### Task 7: El benchmark, con locale fijo y con voz

**Files:**
- Modify: `apps/android/app/src/main/java/dev/tohure/android_rust_test/ui/benchmark/BenchmarkUiState.kt`, `BenchmarkViewModel.kt:44-52,76`, `BenchmarkScreen.kt`
- Test: `apps/android/app/src/test/java/dev/tohure/android_rust_test/ui/benchmark/BenchmarkViewModelTest.kt`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `BenchmarkUiState.error: String?`, que `BenchmarkScreen` pinta.

**Las dos divergencias que cierra:** `"%.2f µs".format(...)` usa el locale por defecto, así que en un dispositivo es-PE muestra coma decimal mientras React Native usa `toFixed(2)` y siempre da punto. Y con 0 iteraciones Android retorna en silencio mientras React Native explica qué pasó.

- [ ] **Step 1: Escribir los tests que fallan**

En `BenchmarkViewModelTest.kt`:

```kotlin
    @Test
    fun zeroIterationsExplainsWhyNothingHappened() = runTest {
        val vm = BenchmarkViewModel(FakeCoreFinanciero(), UnconfinedTestDispatcher(testScheduler))
        vm.iterationsChanged("0")
        vm.run()
        advanceUntilIdle()

        assertEquals(
            "Ingresa un número de iteraciones mayor que cero.",
            vm.uiState.value.error,
        )
        assertEquals(false, vm.uiState.value.isRunning)
    }

    @Test
    fun aValidRunFormatsWithADotRegardlessOfLocale() = runTest {
        val previous = Locale.getDefault()
        Locale.setDefault(Locale("es", "PE"))
        try {
            val vm = BenchmarkViewModel(FakeCoreFinanciero(), UnconfinedTestDispatcher(testScheduler))
            vm.iterationsChanged("10")
            vm.run()
            advanceUntilIdle()

            // Las cuatro apps muestran el mismo formato; RN usa toFixed(2), que siempre
            // da punto. Con el locale por defecto, acá saldría coma.
            assertTrue(
                "se esperaba punto decimal y llegó ${vm.uiState.value.coreP50}",
                vm.uiState.value.coreP50.contains("."),
            )
        } finally {
            Locale.setDefault(previous)
        }
    }
```

Ajustar la construcción de `BenchmarkViewModel` y del fake a como ya lo hacen los tests vecinos de ese archivo.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest --tests '*BenchmarkViewModelTest*'`
Expected: FAIL — `error` no existe como campo, y el formato sale con coma.

- [ ] **Step 3: Agregar el campo de error**

En `BenchmarkUiState.kt`:

```kotlin
    val error: String? = null,
```

- [ ] **Step 4: Dar voz al guard y fijar el locale**

En `BenchmarkViewModel.kt`, reemplazar el `return` mudo:

```kotlin
        val n = _uiState.value.iterations.toIntOrNull()?.takeIf { it > 0 }
        if (n == null) {
            // React Native ya lo explica y Android callaba. El texto es el mismo en las
            // cuatro apps: la comparación lado a lado es la demo.
            _uiState.value = _uiState.value.copy(
                error = "Ingresa un número de iteraciones mayor que cero.",
                isRunning = false,
            )
            return
        }
```

y dentro de `viewModelScope.launch`, al prender `isRunning`, limpiar el error con `copy(isRunning = true, error = null)`.

En la línea del percentil:

```kotlin
        fun at(p: Double) =
            String.format(Locale.ROOT, "%.2f µs", samples[(n * p).toInt().coerceIn(0, n - 1)] / 1000.0)
```

con `import java.util.Locale`.

- [ ] **Step 5: Pintar el error en la pantalla**

En `BenchmarkScreen.kt`, mostrar `uiState.error` con el mismo componente de error que usan las otras pantallas, para que las cuatro se vean igual.

- [ ] **Step 6: Correr la suite de `:app`**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/android/app
git commit -m "fix(android): benchmark con locale fijo y mensaje con cero iteraciones"
```

---

### Task 8: El hex se alinea con `docs/ui-spec.md`

**Files:**
- Modify: `apps/android/app/src/main/java/dev/tohure/android_rust_test/ui/card/CardViewModel.kt:42-47`
- Test: `apps/android/app/src/test/java/dev/tohure/android_rust_test/ui/card/CardViewModelTest.kt`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otra tarea consuma.

**Por qué Android es el que cede:** [docs/ui-spec.md](../../ui-spec.md) acepta solo `[0-9a-f]` en ese campo. iOS lo cumple y rechaza las mayúsculas; Android las acepta y las normaliza con `lowercase()`. La spec es normativa para las cuatro apps, así que el que diverge es Android.

- [ ] **Step 1: Escribir el test que falla**

```kotlin
    @Test
    fun uppercaseHexIsRejectedLikeTheSpecSays() {
        val vm = CardViewModel(FakeCoreFinanciero(), FakeContractSource(), messages)
        vm.foreignHexChanged("ABCD")

        // docs/ui-spec.md acepta solo [0-9a-f]. Android normalizaba y por eso divergía
        // de iOS con la misma entrada.
        assertEquals("", vm.uiState.value.foreignHex)

        vm.foreignHexChanged("abcd")
        assertEquals("abcd", vm.uiState.value.foreignHex)
    }
```

Construir el ViewModel y los fakes como ya lo hacen los tests vecinos del archivo.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest --tests '*CardViewModelTest*'`
Expected: FAIL — hoy `"ABCD"` se acepta y se guarda como `"abcd"`.

- [ ] **Step 3: Implementar**

```kotlin
    fun foreignHexChanged(value: String) {
        // Solo hex en minúscula: docs/ui-spec.md acepta [0-9a-f] y iOS ya lo cumple.
        // Normalizar mayúsculas hacía que la misma entrada se comportara distinto en dos
        // apps que la demo pone lado a lado. Que el hex sea descifrable lo decide el core.
        if (!value.all { it.isDigit() || it in 'a'..'f' }) return
        _uiState.value = _uiState.value.copy(foreignHex = value)
        clearForeignError()
    }
```

- [ ] **Step 4: Correr la suite**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/android/app
git commit -m "fix(android): el campo de hex acepta solo [0-9a-f], como manda ui-spec"
```

---

### Task 9: Los dos minors de los tests

**Files:**
- Modify: `apps/android/app/src/test/java/dev/tohure/android_rust_test/adapter/FakeCoreFinanciero.kt`, `apps/android/core-financiero/src/androidTest/java/dev/tohure/android_rust_test/contract/AssetSourcesTest.kt`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: El default de `nextEncrypt` deja de contradecir su comentario**

En `FakeCoreFinanciero.kt`, el default es un hex truncado de 8 caracteres mientras el comentario de la clase promete el del contrato. Cambiarlo por el hex de 64 de `tj-001`:

```kotlin
    // El cifrado de tj-001 en contracts/cases.json, completo. Antes era un hex de 8
    // caracteres, que contradecía el comentario de esta clase.
    var nextEncrypt: Result<String> =
        Result.success("bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd")
```

- [ ] **Step 2: `AssetSourcesTest` aserta la segunda cuenta entera**

Agregar la línea que falta, tomando el valor de `contracts/cases.json` (grupo `cuentas_iniciales`, segunda entrada):

```kotlin
        assertEquals("3200.50", accounts[1].balance)
```

Verificar el valor exacto contra el contrato antes de escribirlo:

```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && python3 -c "
import json; print(json.load(open('contracts/cases.json'))['cuentas_iniciales'])"
```

- [ ] **Step 3: Correr las dos suites**

Run: `cd apps/android && ./gradlew :app:testDebugUnitTest :core-financiero:connectedDebugAndroidTest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/android
git commit -m "test(android): el fake usa el hex completo del contrato y se aserta el segundo saldo"
```

---

### Task 10: El APK de release, medido

**Files:**
- Modify: `apps/android/TESTING.md`

**Interfaces:**
- Consumes: el proyecto ya reestructurado.
- Produces: el número que cierra el último hueco del benchmark de la Fase 2.

**Qué quedó sin medir:** la Fase 2 midió con el APK de debug —el `.so` sí era release— y anotó que faltaba confirmar si un APK de release cambia algo. No debería, porque el camino del binding no lleva instrumentación de debug, pero eso es una predicción, no una medición.

- [ ] **Step 1: Construir los dos APK**

Run: `cd apps/android && ./gradlew :app:assembleDebug :app:assembleRelease`
Expected: BUILD SUCCESSFUL. El de release sale sin firmar, que alcanza para medir tamaño.

- [ ] **Step 2: Medir**

Run:
```bash
cd apps/android && ls -l app/build/outputs/apk/debug/*.apk app/build/outputs/apk/release/*.apk
```
Expected: los dos tamaños. Anotar ambos.

- [ ] **Step 3: Repetir el benchmark en release si el aparato lo permite**

Instalar el APK de release en el dispositivo, correr la pantalla de Benchmark con las mismas iteraciones que usó la Fase 2 y anotar los percentiles.

- [ ] **Step 4: Escribirlo en `TESTING.md`**

Agregar a la sección del benchmark el tamaño de los dos APK y, si se midió, los percentiles de release al lado de los de debug, diciendo explícitamente si la predicción se cumplió o no. **Si no se cumplió, gana la medición.**

- [ ] **Step 5: Commit**

```bash
git add apps/android/TESTING.md
git commit -m "docs(android): medir el APK de release, que era lo único sin medir del benchmark"
```

---

### Task 11: La documentación, que es la mitad del entregable

**Files:**
- Create: `docs/cross-app-pending.md`
- Modify: `apps/android/README.md` (diagrama y comandos), `apps/android/CONTEXT.md` (estructura), `apps/android/PENDING.md` (recorte), `apps/ios/PENDING.md`, `apps/react-native/PENDING.md`, `apps/web-angular/PENDING.md` (recorte y punteros), `CLAUDE.md` (Fase 6), `docs/ui-spec.md` (los dos textos que se corrigen en las cuatro apps)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el cierre del bloque.

**La regla del repo:** una fase no termina con la UI andando. Termina con el README del subproyecto, con los comandos **efectivamente ejecutados**, y con un diagrama Mermaid que muestre cómo está organizado. Un README con comandos deducidos se descubre roto el día de la demo.

- [ ] **Step 1: Crear `docs/cross-app-pending.md`**

Dueño único de lo que no es de ninguna app: el benchmark que falta repetir en aparato físico (bloquea a iOS y a React Native), la ausencia de CI (de las cinco bases), el `catch` genérico que guarda texto de diagnóstico como mensaje de usuario (en Android el fallback `?: e.toString()` **no** se dispara para un `DomainException` —`ContractMessages` cubre las variantes con `when` exhaustivo— sino para cualquier otro `Throwable`, que en la práctica es una excepción de JNA), las divergencias de paridad que sigan abiertas después de este bloque, y la regla de que un `Record` de uniffi se reemplaza y no se muta.

Encabezarlo diciendo qué es: el archivo que los cuatro `PENDING.md` dejan de repetir.

- [ ] **Step 2: Recortar los cuatro `PENDING.md`**

Cada uno conserva **solo lo suyo** y para lo demás pone un renglón que apunta a `docs/cross-app-pending.md`. Nada de copiar el texto: un tema, un dueño.

En el de Android, además, borrar lo que este bloque cerró —el módulo, el test del adapter, la rotación, la guardia del `@Immutable`, los minors, el APK de release— y **corregir la mentira**: dice que `ndk.abiFilters` no está aplicado y está aplicado desde hace tiempo.

En el de React Native, corregir la otra: declara abierta la reverificación cruzada de Android e iOS, que se cerró en la Task 14 de la Fase 5 y cuya evidencia vive solo en el ledger.

- [ ] **Step 3: Corregir los dos textos de `docs/ui-spec.md`**

El subtítulo de la pantalla de Tarjeta (`:195`) se autolista entre las plataformas que producen el hex, así que en iOS dice «iOS, React Native o Angular» estando en iOS. Y el mensaje de cero iteraciones del Benchmark pasa a ser normativo, con el texto que este bloque le puso a Android. **Las tres apps restantes lo adoptan en sus propias fases**; acá se deja escrito para que no se invente dos veces.

- [ ] **Step 4: Reescribir el diagrama de `apps/android/README.md`**

El diagrama Mermaid actual muestra un solo módulo. Ahora tiene que mostrar el camino completo: `rust-core` → artefactos generados → `:core-financiero` → `:app` → pantalla, con las dos suites colgando de dónde corren.

- [ ] **Step 5: Actualizar los comandos del README**

Los de build y test cambiaron: hay dos módulos. Copiar los comandos **tal como se ejecutaron** en las tareas anteriores, con los totales de test que dieron de verdad.

- [ ] **Step 6: Actualizar `apps/android/CONTEXT.md`**

La sección "Estructura" describe el árbol viejo, con los bindings en `app/src/main/java/uniffi/`. Reescribirla con los dos módulos, y decir explícitamente que los generados viven en `core-financiero/src/generated/` y siguen versionados.

- [ ] **Step 7: Agregar la Fase 6 al `CLAUDE.md`**

En la tabla de fases y en la de ramas, con los dos bloques y su estado. Y actualizar el párrafo de estado de `apps/android`, que hoy dice 43 tests.

- [ ] **Step 8: Verificar que los enlaces resuelven**

Run:
```bash
cd /Users/tohure/Documents/Projects/rust-core-cross-app && grep -rn "cross-app-pending" --include='*.md' . | grep -v node_modules
```
Expected: el archivo nuevo y los cuatro `PENDING.md` apuntándole.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "docs: cierre del Bloque 1 y un solo dueño para los pendientes transversales"
```

---

## Criterios de salida del Bloque 1

- `:app` no declara JNA y no tiene ningún `import uniffi.*` en `src/main`.
- Las dos suites de los dos módulos en verde, sin ningún test perdido respecto de los 43 de hoy, más los nuevos: el adapter real, la rotación y la guardia del `@Immutable`.
- La app rota sin perder la pestaña ni lo tecleado.
- El hex en mayúsculas se rechaza, como en iOS.
- `README.md` con comandos ejecutados y el diagrama al día; `CONTEXT.md` con la estructura nueva; `PENDING.md` recortado y sin la mentira del `abiFilters`.
