# Fase 2 — `apps/android` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** construir la app Android que consume `rust-core` sin reescribir una sola regla de negocio, y dejar el test golden en verde contra `contracts/cases.json` v2.3.0 sobre un dispositivo real.

**Architecture:** un solo módulo `:app`. Tres seams —`CoreFinanciero`, `ContractSource`, `MessageSource`— para que los ViewModels se testeen en JVM sin emulador; cableado manual en `AppContainer`, sin librería de DI. Los tipos de uniffi se usan tal como se generan: no hay capa de mapeo. Compose con un `sealed interface Tab` en vez de librería de navegación.

**Tech Stack:** Kotlin 2.4.20, Compose BOM 2026.09.00, AGP 9.4.0, Java 21, JNA 5.14.0 (`@aar`), `org.json` (de la plataforma), JUnit4 + `androidx.test`.

**Spec:** [docs/superpowers/specs/2026-09-10-phase-2-app-android-design.md](../specs/2026-09-10-phase-2-app-android-design.md)

## Global Constraints

Copiadas de la spec y de `CLAUDE.md`. **Valen para todas las tareas.**

- **Ningún tipo de punto flotante toca un monto.** Ni `Double` ni `Float`, en ningún punto, ni siquiera temporalmente, ni en tests. Única excepción: `ui/benchmark/NativeBaseline.kt`, que existe para exhibir la divergencia y lleva un comentario que lo dice.
- **Cero reglas de negocio fuera de `rust-core`.** Ninguna validación de CCI, ningún Luhn, ninguna tasa, ninguna aritmética sobre montos. Misma excepción que arriba.
- **Ninguna librería de decimales** (`decimal.js`, `big.js`, equivalentes). Para comparar u ordenar montos en UI: `BigDecimal`.
- **Sin red, sin persistencia, sin async, sin I/O.** `simulatedLatencyMs` se espera con `delay`, no con una llamada.
- **Identificadores en inglés; texto de UI, comentarios y mensajes de commit en español.** `ArithmeticScreen`, no `AritmeticaScreen`. Las siglas peruanas (`cci`, `itf`) no se traducen: `calculateItf`, `validateCci`.
- **Commits en Conventional Commits, en español, scope `android`:** `feat(android):`, `test(android):`, `docs(android):`.
- **Los assets generados no se commitean.** `app/src/main/assets/*.json` y `app/src/androidTest/assets/*.json` van al `.gitignore` — los produce la tarea Gradle de la Task 2.
- **Comparaciones del golden: `assertEquals` sobre `String`**, nunca numérica con tolerancia.
- **Todo `when` sobre `DomainException` va exhaustivo, como expresión y sin rama `else`**, para que una décima variante rompa la compilación.
- **Emulador:** `Pixel_9_Pro` (arm64, android-36.1) ya corriendo como `emulator-5554`. Los tests instrumentados corren ahí.
- **Rutas relativas a** `apps/android/` salvo que se indique otra cosa.
- **`--tests` NO funciona con `connectedDebugAndroidTest`** en AGP 9 / Gradle 9: ese flag es
  solo de la tarea de unit tests JVM (`testDebugUnitTest`). Para acotar una corrida
  instrumentada a una clase se usa
  `-Pandroid.testInstrumentationRunnerArguments.class=<FQCN>`. Verificado en la Task 1.

### Los nueve tipos que emite uniffi

Leídos de `app/src/main/java/uniffi/core_financiero/core_financiero.kt`. **No se declaran tipos Kotlin paralelos a estos** (D5 de la spec).

```kotlin
data class Account(var id: String, var holder: String, var balance: String)
data class TransferRequest(var origin: String, var destination: String, var amount: String)
data class TransferResult(
    var accounts: List<Account>, var itfFee: String, var totalDebited: String,
    var receipt: String, var simulatedLatencyMs: UInt,
)
data class ValidCci(var bankCode: String, var bankName: String, var branch: String, var account: String)
data class ValidCard(var brand: String, var masked: String)

sealed class DomainException : Exception() {
    class Length(val `field`: String, val expected: UInt, val received: UInt) : DomainException()
    class CheckDigit : DomainException()
    class UnknownBank(val code: String) : DomainException()
    class InvalidAmount(val detail: String) : DomainException()
    class AccountNotFound(val id: String) : DomainException()
    class SameAccount : DomainException()
    class InsufficientFunds(val available: String, val required: String) : DomainException()
    class Encryption(val detail: String) : DomainException()
    class OutOfRange(val `field`: String) : DomainException()
}
```

Funciones de nivel superior en `uniffi.core_financiero`: `add`, `subtract`, `calculateItf`, `validateCci`, `validateCard`, `encrypt`, `decrypt`, `executeTransfer`, `coreVersion`. Todas lanzan `DomainException` salvo `coreVersion()`.

### Decisión de implementación que la spec no fijó

**Parsing JSON con `org.json` (de la plataforma Android), no `kotlinx.serialization`.** Motivo: cero dependencias nuevas y cero plugin de Gradle, y `JSONObject` es el análogo directo de `serde_json::Value`, que es lo que usa el golden de Rust — misma forma de recorrer el contrato en los dos lenguajes.

**Consecuencia que hay que aceptar:** `org.json` en `src/test/` (JVM) son stubs de `android.jar` que lanzan `RuntimeException`. Por eso **los parsers se testean en `androidTest/`, no en JVM**. Los ViewModels sí se testean en JVM porque reciben `ContractSource` / `MessageSource` / `CoreFinanciero` por constructor y en test se les pasa un fake. Eso es exactamente para lo que existen los seams de D4.

---

## Estructura de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `app/src/androidTest/java/…/CoreSmokeTest.kt` | que la `.so` cargue y JNA resuelva | 1 |
| `app/build.gradle.kts` | tarea `Copy` de contratos + `sourceSets` | 2 |
| `app/src/androidTest/java/…/ContractAssetsTest.kt` | que los JSON lleguen a los dos source sets | 2 |
| `…/contract/ContractSource.kt` | seam 2: interfaz, `initialAccounts()` | 3 |
| `…/contract/AssetContractSource.kt` | lee `cases.json` de assets | 3 |
| `…/contract/MessageSource.kt` | seam 3: interfaz, `messages()` | 3 |
| `…/contract/AssetMessageSource.kt` | lee `messages.es.json` de assets | 3 |
| `…/adapter/ContractMessages.kt` | mapeo variante → nombre del contrato + interpolación | 4 |
| `app/src/androidTest/java/…/GoldenTest.kt` | los 28 casos + las guardias | 5 |
| `…/adapter/CoreFinanciero.kt` | seam 1: la interfaz, nueve funciones | 6 |
| `…/adapter/UniffiCoreFinanciero.kt` | la implementación real | 6 |
| `app/src/test/java/…/FakeCoreFinanciero.kt` | fake determinista para JVM | 6 |
| `…/ui/theme/Color.kt`, `Theme.kt` | paleta fija, dynamic color apagado | 7 |
| `…/ui/components/Components.kt` | los cinco compartidos de `docs/ui-spec.md` | 7 |
| `…/AppContainer.kt` | cableado manual | 8 |
| `…/ui/navigation/BancoApp.kt` | cuatro tabs + footer | 8 |
| `…/ui/arithmetic/` | pantalla 1 | 9 |
| `…/ui/transfer/` | pantalla 2 | 10 |
| `…/ui/card/` | pantalla 3 | 11 |
| `…/ui/benchmark/` | pantalla 4 + `NativeBaseline.kt` | 12 |
| docs varias | las tres correcciones que la fase arrastra | 13 |
| `apps/android/README.md` | cierre de fase | 14 |

**Paquete raíz:** `dev.tohure.android_rust_test`. En las rutas de abajo, `…/` abrevia `app/src/main/java/dev/tohure/android_rust_test/`.

---

### Task 1: El smoke test — que la `.so` cargue y JNA resuelva

Retira el único riesgo grande de la fase. **Nada en esta POC cruzó JNA todavía.**

**Files:**
- Create: `app/src/androidTest/java/dev/tohure/android_rust_test/CoreSmokeTest.kt`
- Delete: `app/src/androidTest/java/dev/tohure/android_rust_test/ExampleInstrumentedTest.kt`
- Delete: `app/src/test/java/dev/tohure/android_rust_test/ExampleUnitTest.kt`

**Interfaces:**
- Consumes: `uniffi.core_financiero.coreVersion`, `uniffi.core_financiero.add`
- Produces: nada; es una prueba de andamiaje

- [ ] **Step 1: Escribir el test**

```kotlin
package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.add
import uniffi.core_financiero.coreVersion

/**
 * El primer test de toda la POC que cruza el borde FFI real.
 *
 * El golden de `rust-core` llama a las nueve funciones como funciones Rust ordinarias:
 * no prueba JNA, ni `System.loadLibrary`, ni si el `strip` del perfil release se comió
 * algún símbolo. Esto sí. Si este test falla, ninguna pantalla tiene sentido todavía.
 */
@RunWith(AndroidJUnit4::class)
class CoreSmokeTest {
    @Test
    fun theLibraryLoadsAndJnaResolvesSymbols() {
        // `coreVersion()` es la única función del core que no lanza: si la librería no
        // cargó, esto revienta con UnsatisfiedLinkError antes de comparar nada.
        val version = coreVersion()
        assertTrue("coreVersion() devolvió vacío: $version", version.isNotBlank())
    }

    @Test
    fun aValueCrossesTheBoundaryAndComesBack() {
        // Un caso del contrato (ar-001), acá solo para probar que un String cruza en
        // los dos sentidos. La verificación real de los 28 casos es la Task 5.
        assertEquals("0.30", add("0.1", "0.2"))
    }
}
```

- [ ] **Step 2: Borrar los tests del andamiaje**

```bash
rm app/src/androidTest/java/dev/tohure/android_rust_test/ExampleInstrumentedTest.kt
rm app/src/test/java/dev/tohure/android_rust_test/ExampleUnitTest.kt
```

- [ ] **Step 3: Correr el test en el emulador**

```bash
adb devices                       # debe listar emulator-5554 como `device`
./gradlew :app:connectedDebugAndroidTest
```

Esperado: **2 tests, 0 failures.**

**Si falla con `UnsatisfiedLinkError`:** `jniLibs/` está vacío o el ABI no coincide con el emulador. Reconstruir con el comando de `apps/android/README.md` → "Construir las librerías nativas" y confirmar que existe `arm64-v8a/libcore_financiero.so` (el emulador es arm64).

**Si falla con `UnsatisfiedLinkError: Unable to load library 'core_financiero'` pero el `.so` está:** falta JNA o entró como `jar` en vez de `aar`. Verificar con `unzip -l app/build/outputs/apk/debug/app-debug.apk | grep jnidispatch`.

- [ ] **Step 4: Commit**

```bash
git add app/src/androidTest app/src/test
git commit -m "test(android): el smoke que prueba que la .so carga y JNA resuelve

Primer test de la POC que cruza el borde FFI real. El golden de rust-core
llama a las nueve funciones como funciones Rust ordinarias, así que hasta acá
nadie había probado System.loadLibrary, la resolución de símbolos de JNA, ni si
el strip del perfil release se comió algo.

Se borran los dos tests de andamiaje de Android Studio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Los contratos llegan al APK

**Files:**
- Modify: `app/build.gradle.kts`
- Modify: `.gitignore` (raíz del repo)
- Create: `app/src/androidTest/java/dev/tohure/android_rust_test/ContractAssetsTest.kt`

**Interfaces:**
- Produces: `cases.json` y `messages.es.json` legibles como assets desde `main` y desde `androidTest`

- [ ] **Step 1: Escribir el test que falla**

```kotlin
package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Los dos JSON del contrato viven en `contracts/`, en la raíz del repo, y Android no lee
 * archivos fuera del APK. Una tarea Gradle los copia a los dos source sets; esto verifica
 * que llegaron y que son el contrato que esperamos, no una copia vieja.
 */
@RunWith(AndroidJUnit4::class)
class ContractAssetsTest {
    private val testAssets get() = InstrumentationRegistry.getInstrumentation().context.assets
    private val appAssets get() = InstrumentationRegistry.getInstrumentation().targetContext.assets

    @Test
    fun theTestApkCarriesBothContractFiles() {
        val cases = JSONObject(testAssets.open("cases.json").reader().readText())
        assertEquals("2.3.0", cases.getString("version"))
        val messages = JSONObject(testAssets.open("messages.es.json").reader().readText())
        assertEquals("1.0.0", messages.getString("version"))
    }

    @Test
    fun theAppApkCarriesBothContractFiles() {
        // Producción los necesita: `cuentas_iniciales` para la pantalla de Transferencia
        // y los nueve mensajes para las pantallas de error.
        val cases = JSONObject(appAssets.open("cases.json").reader().readText())
        assertEquals("2.3.0", cases.getString("version"))
        val messages = JSONObject(appAssets.open("messages.es.json").reader().readText())
        assertEquals("1.0.0", messages.getString("version"))
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.ContractAssetsTest
```

Esperado: **FAIL** con `FileNotFoundException: cases.json`.

- [ ] **Step 3: Agregar la tarea de copia**

En `app/build.gradle.kts`, **antes** del bloque `dependencies`:

```kotlin
// ── Contratos ────────────────────────────────────────────────────────────────
// `contracts/*.json` vive en la raíz del repo y es la copia única que las cinco bases
// de código comparan. Android no lee archivos fuera del APK, así que se copian a los
// dos source sets. Se copia en vez de apuntar `sourceSets` a `../../contracts` para que
// un archivo nuevo en esa carpeta NO entre al APK sin que alguien lo decida.
val contractsDir = rootProject.layout.projectDirectory.dir("../../contracts")
val contractFiles = listOf("cases.json", "messages.es.json")

val copyContractsForApp by tasks.registering(Copy::class) {
    from(contractsDir) { include(contractFiles) }
    into(layout.buildDirectory.dir("generated/contracts/main"))
}

val copyContractsForTest by tasks.registering(Copy::class) {
    from(contractsDir) { include(contractFiles) }
    into(layout.buildDirectory.dir("generated/contracts/androidTest"))
}

tasks.named("preBuild") { dependsOn(copyContractsForApp, copyContractsForTest) }

android.sourceSets {
    getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/contracts/main"))
    getByName("androidTest").assets.srcDir(layout.buildDirectory.dir("generated/contracts/androidTest"))
}
```

- [ ] **Step 4: Ignorar los assets generados**

En el `.gitignore` de la **raíz del repo**, junto a los otros artefactos de uniffi:

```
/apps/android/app/src/main/assets/
/apps/android/app/src/androidTest/assets/
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.ContractAssetsTest
```

Esperado: **2 tests, 0 failures.**

Si falla con "configuration cache problem": la ruta de `contractsDir` se está resolviendo en tiempo de ejecución. Verificar que usa `rootProject.layout.projectDirectory`, no `File(...)`.

- [ ] **Step 6: Commit**

```bash
git add app/build.gradle.kts ../../.gitignore app/src/androidTest
git commit -m "feat(android): los dos JSON del contrato llegan al APK

Una tarea Copy los lleva a los dos source sets. Se copia en vez de apuntar
sourceSets a ../../contracts porque apuntar metería en el APK cualquier
archivo que aparezca en contracts/ sin que nadie lo decida.

cases.json también va a producción, no solo a test: cuentas_iniciales es
dato del contrato y hardcodearlo en Kotlin lo duplicaría en las cuatro apps.

Los assets copiados van al .gitignore: son generados, como los bindings.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Los seams del contrato

**Files:**
- Create: `…/contract/ContractSource.kt`
- Create: `…/contract/AssetContractSource.kt`
- Create: `…/contract/MessageSource.kt`
- Create: `…/contract/AssetMessageSource.kt`
- Create: `app/src/androidTest/java/dev/tohure/android_rust_test/contract/AssetSourcesTest.kt`

**Interfaces:**
- Consumes: los assets de la Task 2; `uniffi.core_financiero.Account`
- Produces:
  - `interface ContractSource { fun initialAccounts(): List<Account> }`
  - `interface MessageSource { fun messages(): Map<String, String> }`
  - `class AssetContractSource(assets: AssetManager) : ContractSource`
  - `class AssetMessageSource(assets: AssetManager) : MessageSource`

- [ ] **Step 1: Escribir el test que falla**

```kotlin
package dev.tohure.android_rust_test.contract

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AssetSourcesTest {
    private val assets get() = InstrumentationRegistry.getInstrumentation().targetContext.assets

    @Test
    fun theInitialAccountsComeFromTheContract() {
        val accounts = AssetContractSource(assets).initialAccounts()
        assertEquals(2, accounts.size)
        assertEquals("00219100123456789047", accounts[0].id)
        assertEquals("Ana Quispe", accounts[0].holder)
        assertEquals("5000.00", accounts[0].balance)
        assertEquals("01122000987654321065", accounts[1].id)
        assertEquals("Luis Ramos", accounts[1].holder)
    }

    @Test
    fun theNineUserMessagesComeFromTheContract() {
        val messages = AssetMessageSource(assets).messages()
        assertEquals(9, messages.size)
        assertEquals(
            "La cuenta de origen y la de destino son la misma.",
            messages["MismaCuenta"],
        )
        assertTrue(
            "ningún mensaje puede estar vacío",
            messages.values.all { it.isNotBlank() },
        )
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.contract.AssetSourcesTest
```

Esperado: **FAIL** — no compila, `AssetContractSource` no existe.

- [ ] **Step 3: Escribir las interfaces**

`…/contract/ContractSource.kt`:

```kotlin
package dev.tohure.android_rust_test.contract

import uniffi.core_financiero.Account

/**
 * De dónde salen los datos del contrato que la app necesita en producción.
 *
 * Existe como interfaz para que los ViewModels no dependan de `android.content.Context`
 * y se puedan testear en la JVM, sin emulador.
 */
interface ContractSource {
    /** Las dos cuentas de `cuentas_iniciales`. Son datos del contrato, no de la app. */
    fun initialAccounts(): List<Account>

    /**
     * La clave y el nonce de demo, de `_clave_demo_hex` y `_nonce_demo_hex`.
     *
     * **El nonce es FIJO a propósito**, para que las cuatro plataformas produzcan el mismo
     * hex y se pueda comparar en la demo. En producción reutilizar un nonce con
     * ChaCha20-Poly1305 es catastrófico; ver `contracts/README.md`.
     *
     * Se declaran acá y no en la Task 11 a propósito: agregar métodos a esta interfaz más
     * tarde rompería la compilación de todos los fakes ya escritos.
     */
    fun demoKeyHex(): String
    fun demoNonceHex(): String
}
```

`…/contract/MessageSource.kt`:

```kotlin
package dev.tohure.android_rust_test.contract

/**
 * Los nueve mensajes de usuario, indexados por **nombre del contrato**
 * (`Longitud`, `DigitoControl`, …), no por el nombre de la variante en inglés.
 *
 * Los mensajes NO cruzan el FFI: uniffi arma el `message` de la excepción con los campos
 * de la variante y lo deja vacío para las que no tienen campos. Sin este archivo las
 * cuatro apps mostrarían textos distintos.
 *
 * Es interfaz por lo mismo que [ContractSource], y además porque así un segundo idioma
 * es otro archivo y no un cambio de código.
 */
interface MessageSource {
    fun messages(): Map<String, String>
}
```

- [ ] **Step 4: Escribir las implementaciones**

`…/contract/AssetContractSource.kt`:

```kotlin
package dev.tohure.android_rust_test.contract

import android.content.res.AssetManager
import org.json.JSONObject
import uniffi.core_financiero.Account

/**
 * Lee `cases.json` de los assets. El archivo lo pone ahí la tarea Gradle `copyContracts*`.
 *
 * Se parsea una sola vez: el contrato no cambia mientras la app corre.
 */
class AssetContractSource(private val assets: AssetManager) : ContractSource {
    private val root: JSONObject by lazy {
        JSONObject(assets.open("cases.json").bufferedReader().use { it.readText() })
    }

    override fun initialAccounts(): List<Account> {
        val array = root.getJSONArray("cuentas_iniciales")
        // Las claves de `cases.json` están en español a propósito: es un archivo de datos
        // que las cinco plataformas comparan por igualdad exacta, no código.
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Account(
                id = o.getString("id"),
                holder = o.getString("titular"),
                balance = o.getString("saldo"),
            )
        }
    }

    override fun demoKeyHex(): String = root.getString("_clave_demo_hex")
    override fun demoNonceHex(): String = root.getString("_nonce_demo_hex")
}
```

`…/contract/AssetMessageSource.kt`:

```kotlin
package dev.tohure.android_rust_test.contract

import android.content.res.AssetManager
import org.json.JSONObject

/** Lee `messages.es.json` de los assets. */
class AssetMessageSource(private val assets: AssetManager) : MessageSource {
    private val root: JSONObject by lazy {
        JSONObject(assets.open("messages.es.json").bufferedReader().use { it.readText() })
    }

    override fun messages(): Map<String, String> {
        val node = root.getJSONObject("mensajes")
        return node.keys().asSequence().associateWith { node.getString(it) }
    }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.contract.AssetSourcesTest
```

Esperado: **2 tests, 0 failures.**

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/dev/tohure/android_rust_test/contract app/src/androidTest
git commit -m "feat(android): ContractSource y MessageSource, los dos seams del contrato

Interfaces para que los ViewModels no dependan de android.content.Context y se
puedan testear en JVM sin emulador. Las implementaciones leen los assets que
copia la tarea Gradle.

El parsing se testea en androidTest y no en JVM a propósito: org.json en
src/test/ son stubs de android.jar que lanzan. Los ViewModels sí se testean en
JVM porque reciben estos seams por constructor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `ContractMessages` — el mapeo que producción y el golden comparten

**Files:**
- Create: `…/adapter/ContractMessages.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/adapter/ContractMessagesTest.kt`

**Interfaces:**
- Consumes: `MessageSource`, `uniffi.core_financiero.DomainException`
- Produces:
  - `fun DomainException.contractName(): String`
  - `class ContractMessages(source: MessageSource)` con `fun userMessage(e: DomainException): String`

- [ ] **Step 1: Escribir los tests que fallan**

```kotlin
package dev.tohure.android_rust_test.adapter

import dev.tohure.android_rust_test.contract.MessageSource
import org.junit.Assert.assertEquals
import org.junit.Test
import uniffi.core_financiero.DomainException

/** Fake: no toca assets, así que este test corre en la JVM sin emulador. */
private class FakeMessageSource(private val map: Map<String, String>) : MessageSource {
    override fun messages(): Map<String, String> = map
}

class ContractMessagesTest {
    private val source = FakeMessageSource(
        mapOf(
            "Longitud" to "El número ingresado no tiene la cantidad de dígitos correcta.",
            "DigitoControl" to "El número ingresado no es válido: no pasa el dígito de control.",
            "BancoDesconocido" to "No reconocemos el banco del código {code}.",
            "MontoInvalido" to "El monto ingresado no es válido.",
            "CuentaNoEncontrada" to "No encontramos la cuenta {id}.",
            "MismaCuenta" to "La cuenta de origen y la de destino son la misma.",
            "SaldoInsuficiente" to "Saldo insuficiente: tenés {available} y se necesitan {required}.",
            "Cifrado" to "No se pudo cifrar los datos de la tarjeta.",
            "FueraDeRango" to "El valor de {field} está fuera del rango permitido.",
        ),
    )
    private val messages = ContractMessages(source)

    @Test
    fun theNineVariantsMapToTheContractNames() {
        assertEquals("Longitud", DomainException.Length("cci", 20u, 18u).contractName())
        assertEquals("DigitoControl", DomainException.CheckDigit().contractName())
        assertEquals("BancoDesconocido", DomainException.UnknownBank("999").contractName())
        assertEquals("MontoInvalido", DomainException.InvalidAmount("cero").contractName())
        assertEquals("CuentaNoEncontrada", DomainException.AccountNotFound("A").contractName())
        assertEquals("MismaCuenta", DomainException.SameAccount().contractName())
        assertEquals(
            "SaldoInsuficiente",
            DomainException.InsufficientFunds("1.00", "2.00").contractName(),
        )
        assertEquals("Cifrado", DomainException.Encryption("nonce").contractName())
        assertEquals("FueraDeRango", DomainException.OutOfRange("monto").contractName())
    }

    @Test
    fun placeholdersAreInterpolatedRaw() {
        // CRUDO: nada de NumberFormat sobre los montos. Los formateadores de Android, iOS
        // y el navegador no coinciden, y una diferencia rompe la comparación carácter por
        // carácter que es toda la tesis de la POC.
        assertEquals(
            "Saldo insuficiente: tenés 1234.56 y se necesitan 2000.00.",
            messages.userMessage(DomainException.InsufficientFunds("1234.56", "2000.00")),
        )
        assertEquals(
            "No encontramos la cuenta ACC-9.",
            messages.userMessage(DomainException.AccountNotFound("ACC-9")),
        )
        assertEquals(
            "No reconocemos el banco del código 999.",
            messages.userMessage(DomainException.UnknownBank("999")),
        )
        assertEquals(
            "El valor de monto está fuera del rango permitido.",
            messages.userMessage(DomainException.OutOfRange("monto")),
        )
    }

    @Test
    fun aVariantWithoutPlaceholdersComesBackVerbatim() {
        assertEquals(
            "La cuenta de origen y la de destino son la misma.",
            messages.userMessage(DomainException.SameAccount()),
        )
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*ContractMessagesTest*'
```

Esperado: **FAIL** — no compila, `contractName` no existe.

- [ ] **Step 3: Escribir la implementación**

```kotlin
package dev.tohure.android_rust_test.adapter

import dev.tohure.android_rust_test.contract.MessageSource
import uniffi.core_financiero.DomainException

/**
 * El nombre que `contracts/cases.json` le da a este error.
 *
 * `DomainError::contract_name()` es un método de Rust y **no cruza el FFI**: el enum
 * generado trae solo los nombres en inglés. Verificado en la Fase 1: los nueve nombres
 * del contrato aparecen 0 veces en el `.kt` generado.
 *
 * El `when` va **exhaustivo, como expresión y sin rama `else`**. Es deliberado: agregar
 * una décima variante al core tiene que romper la compilación acá — un fallo ruidoso y
 * ubicado— en vez de caer en un `"Desconocido"` que compila, pasa en verde, y se descubre
 * el día de la demo cuando esta app muestra un error que las otras tres no.
 */
fun DomainException.contractName(): String =
    when (this) {
        is DomainException.Length -> "Longitud"
        is DomainException.CheckDigit -> "DigitoControl"
        is DomainException.UnknownBank -> "BancoDesconocido"
        is DomainException.InvalidAmount -> "MontoInvalido"
        is DomainException.AccountNotFound -> "CuentaNoEncontrada"
        is DomainException.SameAccount -> "MismaCuenta"
        is DomainException.InsufficientFunds -> "SaldoInsuficiente"
        is DomainException.Encryption -> "Cifrado"
        is DomainException.OutOfRange -> "FueraDeRango"
    }

/**
 * Traduce un error del core al texto que ve el usuario.
 *
 * Vive en producción, no solo en el test, porque `contracts/messages.es.json` indexa los
 * mensajes por nombre del contrato: la pantalla de error necesita el mapeo igual que el
 * golden. **El golden reusa esta misma función** en vez de escribir la suya — así verifica
 * contra `cases.json` el mapeo que la UI usa de verdad, y no una copia que puede divergir.
 */
class ContractMessages(source: MessageSource) {
    private val messages: Map<String, String> = source.messages()

    fun userMessage(e: DomainException): String {
        val name = e.contractName()
        val template = messages[name]
            ?: error("contracts/messages.es.json no tiene el mensaje de `$name`")
        return interpolate(template, e)
    }

    /**
     * Reemplaza `{code}`, `{id}`, `{available}`, `{required}` y `{field}` por los campos
     * de la variante, **crudos**. Nada de `NumberFormat` acá: los formateadores de moneda
     * de Android, iOS y el navegador no coinciden entre sí, y una diferencia rompe la
     * comparación carácter por carácter. El formateo vive en las pantallas de montos.
     */
    private fun interpolate(template: String, e: DomainException): String =
        when (e) {
            is DomainException.Length -> template
            is DomainException.CheckDigit -> template
            is DomainException.UnknownBank -> template.replace("{code}", e.code)
            is DomainException.InvalidAmount -> template
            is DomainException.AccountNotFound -> template.replace("{id}", e.id)
            is DomainException.SameAccount -> template
            is DomainException.InsufficientFunds ->
                template
                    .replace("{available}", e.available)
                    .replace("{required}", e.required)
            is DomainException.Encryption -> template
            is DomainException.OutOfRange -> template.replace("{field}", e.`field`)
        }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*ContractMessagesTest*'
```

Esperado: **3 tests, 0 failures.** Corre en la JVM, sin emulador.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/tohure/android_rust_test/adapter app/src/test
git commit -m "feat(android): ContractMessages, el mapeo variante a nombre del contrato

Va en producción y no solo en el test: messages.es.json indexa los mensajes por
nombre del contrato, así que la pantalla de error lo necesita igual que el
golden. Se escribe una vez y el golden reusa esta misma función, para verificar
contra cases.json el mapeo que la UI usa de verdad.

El when es exhaustivo, como expresión y sin else, para que una décima variante
en el core rompa la compilación acá en vez de caer en un Desconocido que pasa
en verde.

Los placeholders se interpolan crudos: NumberFormat ahí rompería la comparación
carácter por carácter entre las cuatro apps.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: El test golden — los 28 casos y sus guardias

**El entregable central de la fase.** Espeja `rust-core/crates/ffi/tests/golden.rs`.

**Files:**
- Create: `app/src/androidTest/java/dev/tohure/android_rust_test/GoldenTest.kt`

**Interfaces:**
- Consumes: los assets de la Task 2; `contractName()` de la Task 4; las nueve funciones de uniffi
- Produces: nada; es el criterio de cierre de la fase

- [ ] **Step 1: Escribir el golden completo**

```kotlin
package dev.tohure.android_rust_test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.tohure.android_rust_test.adapter.contractName
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.add
import uniffi.core_financiero.calculateItf
import uniffi.core_financiero.decrypt
import uniffi.core_financiero.encrypt
import uniffi.core_financiero.executeTransfer
import uniffi.core_financiero.subtract
import uniffi.core_financiero.validateCard
import uniffi.core_financiero.validateCci

/**
 * Espejo Kotlin de `rust-core/crates/ffi/tests/golden.rs`. Que este test pase **es** la
 * demostración: los mismos 28 casos producen los mismos strings que en Rust.
 *
 * Comparaciones con `assertEquals` sobre `String`, nunca numéricas con tolerancia.
 *
 * Las guardias son las mismas que en Rust y por el mismo motivo: un `for` sobre cero
 * elementos no aserta nada, y un test que no compara ningún string reporta éxito.
 */
@RunWith(AndroidJUnit4::class)
class GoldenTest {
    private val contract: JSONObject by lazy {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        JSONObject(assets.open("cases.json").bufferedReader().use { it.readText() })
    }

    private fun group(name: String): JSONArray = contract.getJSONArray(name)

    private fun keyHex() = contract.getString("_clave_demo_hex")
    private fun nonceHex() = contract.getString("_nonce_demo_hex")

    // ── Guardias del contrato ─────────────────────────────────────────────────

    @Test
    fun theContractIsTheExpectedVersion() {
        assertEquals("2.3.0", contract.getString("version"))
        assertEquals("PEN", contract.getString("moneda"))
    }

    @Test
    fun theContractHasTheExpectedNumberOfCases() {
        assertEquals(6, group("aritmetica").length())
        assertEquals(4, group("cci").length())
        assertEquals(5, group("itf").length())
        assertEquals(6, group("tarjeta").length())
        assertEquals(7, group("transferencia").length())
        assertEquals(2, group("cuentas_iniciales").length())
    }

    @Test
    fun theContractHasNoUnknownTopLevelKeys() {
        val known = setOf(
            "version", "moneda", "_nota", "_alicuota_itf",
            "_clave_demo_hex", "_nonce_demo_hex",
            "aritmetica", "cuentas_iniciales", "transferencia", "cci", "itf", "tarjeta",
        )
        val actual = contract.keys().asSequence().toSet()
        assertEquals(
            "las claves de primer nivel de cases.json no son las conocidas",
            emptySet<String>(),
            actual - known,
        )
        assertEquals(
            "faltan claves de primer nivel en cases.json",
            emptySet<String>(),
            known - actual,
        )
    }

    // ── Los cinco grupos ──────────────────────────────────────────────────────

    @Test
    fun goldenArithmetic() {
        val cases = group("aritmetica")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            val actual = when (val op = c.getString("op")) {
                "sumar" -> add(c.getString("a"), c.getString("b"))
                "restar" -> subtract(c.getString("a"), c.getString("b"))
                else -> error("operación desconocida en $id: $op")
            }
            assertEquals("caso $id", c.getString("esperado"), actual)
            checked++
        }
        // El contador no es decorativo: si el grupo llegara vacío, el `for` no compararía
        // nada y el test pasaría en verde sin haber probado nada.
        assertEquals("se esperaban 6 casos de aritmetica", 6, checked)
    }

    @Test
    fun goldenItf() {
        val cases = group("itf")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(
                "caso ${c.getString("id")}",
                c.getString("esperado"),
                calculateItf(c.getString("entrada")),
            )
            checked++
        }
        assertEquals("se esperaban 5 casos de itf", 5, checked)
    }

    @Test
    fun goldenCci() {
        val cases = group("cci")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                val actual = validateCci(c.getString("entrada"))
                assertEquals("caso $id codigo_banco", expected.getString("codigo_banco"), actual.bankCode)
                assertEquals("caso $id nombre_banco", expected.getString("nombre_banco"), actual.bankName)
                assertEquals("caso $id oficina", expected.getString("oficina"), actual.branch)
                assertEquals("caso $id cuenta", expected.getString("cuenta"), actual.account)
            } else {
                val e = assertThrowsDomain("caso $id") { validateCci(c.getString("entrada")) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 4 casos de cci", 4, checked)
    }

    @Test
    fun goldenCard() {
        val cases = group("tarjeta")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                val card = validateCard(c.getString("entrada"))
                assertEquals("caso $id marca", expected.getString("marca"), card.brand)
                assertEquals("caso $id enmascarado", expected.getString("enmascarado"), card.masked)

                val hex = encrypt(c.getString("entrada"), keyHex(), nonceHex())
                assertEquals("caso $id cifrado_hex", expected.getString("cifrado_hex"), hex)
                // Lo que cifra una plataforma lo descifra cualquier otra.
                assertEquals("caso $id roundtrip", c.getString("entrada"), decrypt(hex, keyHex(), nonceHex()))
            } else {
                val e = assertThrowsDomain("caso $id") { validateCard(c.getString("entrada")) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 6 casos de tarjeta", 6, checked)
    }

    @Test
    fun goldenTransfer() {
        val initial = initialAccounts()
        val cases = group("transferencia")
        var checked = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            val input = c.getJSONObject("entrada")
            val request = TransferRequest(
                origin = input.getString("origen"),
                destination = input.getString("destino"),
                amount = input.getString("monto"),
            )
            if (c.getBoolean("valido")) {
                val expected = c.getJSONObject("esperado")
                val r = executeTransfer(initial, request)
                assertEquals("caso $id comision_itf", expected.getString("comision_itf"), r.itfFee)
                assertEquals("caso $id total_debitado", expected.getString("total_debitado"), r.totalDebited)
                assertEquals("caso $id comprobante", expected.getString("comprobante"), r.receipt)
                assertEquals(
                    "caso $id latencia_simulada_ms",
                    expected.getInt("latencia_simulada_ms"),
                    r.simulatedLatencyMs.toInt(),
                )
                val expectedAccounts = expected.getJSONArray("cuentas")
                assertEquals("caso $id cantidad de cuentas", expectedAccounts.length(), r.accounts.size)
                for (j in 0 until expectedAccounts.length()) {
                    val e = expectedAccounts.getJSONObject(j)
                    assertEquals("caso $id cuenta $j id", e.getString("id"), r.accounts[j].id)
                    assertEquals("caso $id cuenta $j titular", e.getString("titular"), r.accounts[j].holder)
                    assertEquals("caso $id cuenta $j saldo", e.getString("saldo"), r.accounts[j].balance)
                }
            } else {
                val e = assertThrowsDomain("caso $id") { executeTransfer(initial, request) }
                assertEquals("caso $id", c.getString("error"), e.contractName())
            }
            checked++
        }
        assertEquals("se esperaban 7 casos de transferencia", 7, checked)
    }

    // ── Ayudantes ─────────────────────────────────────────────────────────────

    private fun initialAccounts(): List<Account> {
        val array = group("cuentas_iniciales")
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            Account(o.getString("id"), o.getString("titular"), o.getString("saldo"))
        }
    }

    private fun assertThrowsDomain(label: String, block: () -> Unit): DomainException {
        try {
            block()
        } catch (e: DomainException) {
            return e
        }
        throw AssertionError("$label: se esperaba un DomainException y no se lanzó ninguno")
    }
}
```

- [ ] **Step 2: Correr el golden**

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=dev.tohure.android_rust_test.GoldenTest
```

Esperado: **8 tests, 0 failures.** Los cinco `golden*` más las tres guardias.

**Si un caso falla:** el valor esperado de `cases.json` **no se toca**. El contrato es la fuente de verdad y pasó 28/28 en Rust; una diferencia acá significa que el adapter Kotlin está mal, no el contrato. Corregir el Kotlin.

- [ ] **Step 3: Verificar las guardias por mutación**

No basta con que pasen. Editar temporalmente `contracts/cases.json` y vaciar `"cci": []`, correr, y confirmar que **falla** `theContractHasTheExpectedNumberOfCases` y también `goldenCci` por el contador. Restaurar con `git checkout contracts/cases.json`.

- [ ] **Step 4: Commit**

```bash
git add app/src/androidTest
git commit -m "test(android): el golden, 28 casos contra el contrato v2.3.0

Espejo Kotlin de rust-core/crates/ffi/tests/golden.rs. Que este test pase ES la
demostración de la POC en esta plataforma: los mismos casos producen los mismos
strings que en Rust, comparados con assertEquals sobre String y nunca con
tolerancia numérica.

Lleva las mismas guardias que el de Rust y por el mismo motivo: contador por
grupo, conteo de casos y claves de primer nivel desconocidas. Sin ellas, vaciar
un grupo a [] deja el test en verde sin comparar un solo string — verificado
por mutación, igual que en la Fase 1.

Reusa contractName() de producción en vez de escribir su propio mapeo: así
verifica contra cases.json el mapeo que la UI va a usar de verdad.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: El adapter y su fake

**Files:**
- Create: `…/adapter/CoreFinanciero.kt`
- Create: `…/adapter/UniffiCoreFinanciero.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/adapter/FakeCoreFinanciero.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/adapter/UniffiCoreFinancieroContractTest.kt`

**Interfaces:**
- Produces: `interface CoreFinanciero` con las nueve funciones devolviendo `Result<T>`; `UniffiCoreFinanciero`; `FakeCoreFinanciero(...)` para tests de ViewModel

- [ ] **Step 1: Escribir la interfaz**

```kotlin
package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci

/**
 * La única superficie por la que la app habla con el core.
 *
 * **Reexporta los tipos de uniffi; no los traduce.** Una segunda nomenclatura en Kotlin
 * duplicaría el contrato y se desincronizaría en la primera regeneración de bindings.
 * Esta interfaz existe para **sustituir la implementación** —y así testear los ViewModels
 * en la JVM, sin emulador—, no para mapear tipos.
 *
 * Devuelve `Result<T>` y no lanza: el mapeo a mensaje de usuario ocurre en la capa de UI
 * con [ContractMessages], no acá. El adapter propaga el `DomainException` tal cual.
 */
interface CoreFinanciero {
    fun add(a: String, b: String): Result<String>
    fun subtract(a: String, b: String): Result<String>
    fun calculateItf(amount: String): Result<String>
    fun validateCci(cci: String): Result<ValidCci>
    fun validateCard(number: String): Result<ValidCard>
    fun encrypt(text: String, keyHex: String, nonceHex: String): Result<String>
    fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String): Result<String>
    fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult>

    /** La única que no falla. Es la prueba en pantalla de que las cuatro apps comparten build. */
    fun coreVersion(): String
}
```

- [ ] **Step 2: Escribir la implementación real**

```kotlin
package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci
import uniffi.core_financiero.add as coreAdd
import uniffi.core_financiero.calculateItf as coreCalculateItf
import uniffi.core_financiero.coreVersion as coreCoreVersion
import uniffi.core_financiero.decrypt as coreDecrypt
import uniffi.core_financiero.encrypt as coreEncrypt
import uniffi.core_financiero.executeTransfer as coreExecuteTransfer
import uniffi.core_financiero.subtract as coreSubtract
import uniffi.core_financiero.validateCard as coreValidateCard
import uniffi.core_financiero.validateCci as coreValidateCci

/**
 * Habla con `libcore_financiero.so` a través de los bindings de uniffi, que corren sobre
 * JNA. Las llamadas son síncronas y de microsegundos: **no van en corrutinas ni en
 * `Dispatchers.IO`**, salvo en la pantalla de benchmark.
 */
class UniffiCoreFinanciero : CoreFinanciero {
    override fun add(a: String, b: String) = runCatching { coreAdd(a, b) }
    override fun subtract(a: String, b: String) = runCatching { coreSubtract(a, b) }
    override fun calculateItf(amount: String) = runCatching { coreCalculateItf(amount) }
    override fun validateCci(cci: String): Result<ValidCci> = runCatching { coreValidateCci(cci) }
    override fun validateCard(number: String): Result<ValidCard> = runCatching { coreValidateCard(number) }

    override fun encrypt(text: String, keyHex: String, nonceHex: String) =
        runCatching { coreEncrypt(text, keyHex, nonceHex) }

    override fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) =
        runCatching { coreDecrypt(ciphertextHex, keyHex, nonceHex) }

    override fun transfer(accounts: List<Account>, request: TransferRequest): Result<TransferResult> =
        runCatching { coreExecuteTransfer(accounts, request) }

    override fun coreVersion(): String = coreCoreVersion()
}
```

- [ ] **Step 3: Escribir el fake para los tests de ViewModel**

```kotlin
package dev.tohure.android_rust_test.adapter

import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferRequest
import uniffi.core_financiero.TransferResult
import uniffi.core_financiero.ValidCard
import uniffi.core_financiero.ValidCci

/**
 * Fake determinista para testear ViewModels en la JVM, sin `.so` y sin emulador.
 *
 * **No calcula nada**: devuelve lo que se le configuró. Poner aritmética acá sería
 * reimplementar el core en Kotlin, que es lo contrario de lo que la POC demuestra. Los
 * valores que se le pasan salen de `contracts/cases.json`.
 */
class FakeCoreFinanciero(
    private var nextAdd: Result<String> = Result.success("0.30"),
    private var nextSubtract: Result<String> = Result.success("0.00"),
    private var nextItf: Result<String> = Result.success("0.05"),
    private var nextCci: Result<ValidCci> = Result.success(ValidCci("002", "Banco Demo Uno", "191", "001234567890")),
    private var nextCard: Result<ValidCard> = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
    private var nextEncrypt: Result<String> = Result.success("bdca3931"),
    private var nextDecrypt: Result<String> = Result.success("4111111111111111"),
    private var nextTransfer: Result<TransferResult> = Result.success(
        TransferResult(emptyList(), "0.05", "100.05", "TRF-0001", 120u),
    ),
    private val version: String = "1.0.0+test",
) : CoreFinanciero {
    override fun add(a: String, b: String) = nextAdd
    override fun subtract(a: String, b: String) = nextSubtract
    override fun calculateItf(amount: String) = nextItf
    override fun validateCci(cci: String) = nextCci
    override fun validateCard(number: String) = nextCard
    override fun encrypt(text: String, keyHex: String, nonceHex: String) = nextEncrypt
    override fun decrypt(ciphertextHex: String, keyHex: String, nonceHex: String) = nextDecrypt
    override fun transfer(accounts: List<Account>, request: TransferRequest) = nextTransfer
    override fun coreVersion() = version

    fun failNextTransfer(e: Throwable) { nextTransfer = Result.failure(e) }
    fun failNextAdd(e: Throwable) { nextAdd = Result.failure(e) }
    fun failNextCard(e: Throwable) { nextCard = Result.failure(e) }
}
```

- [ ] **Step 4: Escribir el test que fija el contrato de la interfaz**

```kotlin
package dev.tohure.android_rust_test.adapter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import uniffi.core_financiero.DomainException

/** Verifica el CONTRATO de la interfaz con el fake — el core real lo prueba el golden. */
class UniffiCoreFinancieroContractTest {
    @Test
    fun aFailureComesBackAsResultFailureAndNotAsAThrow() {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.SameAccount())
        val result = core.transfer(emptyList(), uniffi.core_financiero.TransferRequest("A", "A", "1.00"))
        assertTrue("el adapter no debe lanzar", result.isFailure)
        assertTrue(result.exceptionOrNull() is DomainException.SameAccount)
    }

    @Test
    fun coreVersionNeverFails() {
        assertEquals("1.0.0+test", FakeCoreFinanciero().coreVersion())
    }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*UniffiCoreFinancieroContractTest*'
```

Esperado: **2 tests, 0 failures.**

- [ ] **Step 6: Commit**

```bash
git add app/src/main/java/dev/tohure/android_rust_test/adapter app/src/test
git commit -m "feat(android): CoreFinanciero, el seam que hace testeables los ViewModels

Interfaz + implementación uniffi + fake determinista. Sin este seam los
ViewModels no se pueden testear sin emulador: dependen de funciones top-level
de uniffi que necesitan la .so.

Reexporta los tipos de uniffi y NO los traduce: la interfaz existe para
sustituir la implementación, no para mapear tipos. Un toDomain() duplicaría el
contrato en Kotlin y se desincronizaría en la primera regeneración.

Devuelve Result<T> y no lanza; el mapeo a mensaje de usuario es de la UI.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Tema y componentes compartidos

**Files:**
- Modify: `…/ui/theme/Color.kt`
- Modify: `…/ui/theme/Theme.kt`
- Create: `…/ui/components/Components.kt`
- Create: `…/format/MoneyFormatter.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/format/MoneyFormatterTest.kt`

**Interfaces:**
- Produces: `AndroidrusttestTheme`, `ScreenHeader`, `LabeledField`, `ResultRow`, `SectionDivider`, `CoreVersionFooter`, `MoneyFormatter.format(amount: String): String`

- [ ] **Step 1: Escribir el test del formateador**

```kotlin
package dev.tohure.android_rust_test.format

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyFormatterTest {
    @Test
    fun addsCurrencyAndThousandSeparatorsWithoutRounding() {
        // El core ya entregó el valor con la escala correcta: el formateador NUNCA redondea.
        assertEquals("S/ 1,500.08", MoneyFormatter.format("1500.08"))
        assertEquals("S/ 0.05", MoneyFormatter.format("0.05"))
        assertEquals("S/ 8,499.92", MoneyFormatter.format("8499.92"))
    }

    @Test
    fun aValueThatIsNotAnAmountComesBackUntouched() {
        // Defensivo: si el core devolviera algo inesperado, la pantalla muestra el string
        // crudo en vez de romperse. Nunca inventa un número.
        assertEquals("--", MoneyFormatter.format("--"))
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*MoneyFormatterTest*'
```

Esperado: **FAIL** — `MoneyFormatter` no existe.

- [ ] **Step 3: Escribir el formateador**

```kotlin
package dev.tohure.android_rust_test.format

import java.math.BigDecimal

/**
 * Agrega `S/` y separadores de miles. **Solo al pintar.**
 *
 * Recibe el `String` que devolvió el core y lo convierte a `BigDecimal` —nunca a `Double`—
 * únicamente para agrupar los miles. No redondea: el core ya entregó el valor con la
 * escala correcta (2 decimales para PEN).
 *
 * No se usa en los mensajes de error: ahí los montos van crudos, porque los formateadores
 * de Android, iOS y el navegador no coinciden entre sí.
 */
object MoneyFormatter {
    fun format(amount: String): String {
        val value = runCatching { BigDecimal(amount) }.getOrNull() ?: return amount
        val parts = value.toPlainString().split(".")
        val grouped = parts[0]
            .reversed()
            .chunked(3)
            .joinToString(",")
            .reversed()
        val decimals = parts.getOrNull(1)
        return if (decimals != null) "S/ $grouped.$decimals" else "S/ $grouped"
    }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*MoneyFormatterTest*'
```

Esperado: **2 tests, 0 failures.**

- [ ] **Step 5: Escribir la paleta**

Reemplazar el contenido de `…/ui/theme/Color.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.theme

import androidx.compose.ui.graphics.Color

// Paleta compartida por las cuatro apps: naranja, azul, blanco.
// Los valores son los mismos en Android, iOS, React Native y Angular; las variantes
// tonales las pone el sistema de cada plataforma.
val BrandOrange = Color(0xFFEA5B0C)
val BrandOrangeDark = Color(0xFFB33F00)
val BrandBlue = Color(0xFF0A3D62)
val BrandBlueLight = Color(0xFF2E6B96)
val SurfaceWhite = Color(0xFFFFFBF8)
val SurfaceDark = Color(0xFF14100E)

// Señalización de la pantalla de Aritmética: el resultado del float nativo va en el
// color de error y el del core en el de éxito. No es decoración — es el punto.
val FloatRed = Color(0xFFB3261E)
val CoreGreen = Color(0xFF1B6B3A)
```

- [ ] **Step 6: Escribir el tema, con dynamic color apagado**

Reemplazar el `AndroidrusttestTheme` de `…/ui/theme/Theme.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = BrandOrange,
    onPrimary = Color.White,
    secondary = BrandBlue,
    onSecondary = Color.White,
    background = SurfaceWhite,
    surface = SurfaceWhite,
    error = FloatRed,
)

private val DarkColors = darkColorScheme(
    primary = BrandOrangeDark,
    onPrimary = Color.White,
    secondary = BrandBlueLight,
    onSecondary = Color.White,
    background = SurfaceDark,
    surface = SurfaceDark,
    error = FloatRed,
)

/**
 * Material 3 como lenguaje —componentes, formas, superficies tonales, motion— con
 * **esquema fijo**.
 *
 * **`dynamicColor` está apagado a propósito, no por olvido.** El color dinámico de
 * Material You deriva el esquema del wallpaper del usuario y **reemplaza** esta paleta:
 * activarlo haría que el naranja y el azul no se vieran en la mayoría de los dispositivos,
 * y las cuatro apps de la demo dejarían de compartir lo único visual que comparten. Si
 * alguien lo "arregla", rompe la paridad que la POC existe para mostrar.
 */
@Composable
fun AndroidrusttestTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content,
    )
}
```

Agregar el import `androidx.compose.ui.graphics.Color` al archivo.

- [ ] **Step 7: Escribir los componentes compartidos**

```kotlin
package dev.tohure.android_rust_test.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/**
 * Los cinco componentes de `docs/ui-spec.md`, compartidos por las cuatro pantallas.
 *
 * Convención de firma: **`modifier` va último y el caller decide el posicionamiento.**
 * El componente aporta tipografía y espaciado internos; el padding posicional lo pone
 * quien lo usa. Así el mismo componente sirve dentro de una lista y dentro de una tarjeta
 * sin inventar variantes.
 */
@Composable
fun ScreenHeader(title: String, subtitle: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(4.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun LabeledField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        singleLine = true,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
fun ResultRow(label: String, value: String, modifier: Modifier = Modifier, mono: Boolean = false) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(
            value,
            style = MaterialTheme.typography.bodyLarge,
            fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
        )
    }
}

@Composable
fun SectionDivider(title: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().padding(top = 16.dp, bottom = 8.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(4.dp))
        HorizontalDivider()
    }
}

/**
 * El pie que va en las cuatro pantallas. Es la prueba EN PANTALLA de que las cuatro apps
 * corren el mismo build: en la demo se comparan los cuatro strings. Va sin reformatear.
 */
@Composable
fun CoreVersionFooter(version: String, modifier: Modifier = Modifier) {
    Text(
        text = version,
        style = MaterialTheme.typography.labelSmall,
        fontFamily = FontFamily.Monospace,
        modifier = modifier.fillMaxWidth().padding(8.dp),
    )
}
```

- [ ] **Step 8: Compilar y commitear**

```bash
./gradlew :app:assembleDebug :app:testDebugUnitTest
git add app/src/main/java/dev/tohure/android_rust_test/ui app/src/main/java/dev/tohure/android_rust_test/format app/src/test
git commit -m "feat(android): tema con paleta compartida y los cinco componentes de la spec

Paleta naranja/azul/blanco, la misma que van a usar las cuatro apps. Material 3
como lenguaje con esquema FIJO: dynamic color queda apagado a propósito y con
comentario, porque el color derivado del wallpaper reemplazaría la paleta y las
cuatro apps dejarían de compartir lo único visual que comparten.

MoneyFormatter agrega S/ y separadores usando BigDecimal, nunca Double, y no
redondea: el core ya entregó el valor con la escala correcta. No se usa en los
mensajes de error, donde los montos van crudos.

Los componentes siguen la convención de firma de la spec: modifier último y el
caller decide el posicionamiento.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: El cascarón — `AppContainer`, navegación y `MainActivity`

**Files:**
- Create: `…/AppContainer.kt`
- Create: `…/ui/navigation/BancoApp.kt`
- Modify: `…/MainActivity.kt`

**Interfaces:**
- Consumes: `CoreFinanciero`, `ContractSource`, `MessageSource`, `ContractMessages`, los componentes de la Task 7
- Produces: `AppContainer(context)`, `sealed interface Tab`, `@Composable fun BancoApp(container: AppContainer)`

- [ ] **Step 1: Escribir el contenedor**

```kotlin
package dev.tohure.android_rust_test

import android.content.Context
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.adapter.UniffiCoreFinanciero
import dev.tohure.android_rust_test.contract.AssetContractSource
import dev.tohure.android_rust_test.contract.AssetMessageSource
import dev.tohure.android_rust_test.contract.ContractSource

/**
 * Cableado manual, sin librería de DI.
 *
 * Hilt trae KSP y tiempo de build; Koin trae resolución en runtime que falla tarde.
 * Ninguno de los dos es *más* desacoplado que esto: son más automáticos. Con cinco
 * pantallas y tres dependencias, explícito gana — se lee de arriba abajo y el compilador
 * lo verifica entero.
 */
class AppContainer(context: Context) {
    private val assets = context.applicationContext.assets

    val core: CoreFinanciero = UniffiCoreFinanciero()
    val contract: ContractSource = AssetContractSource(assets)
    val messages: ContractMessages = ContractMessages(AssetMessageSource(assets))
}
```

- [ ] **Step 2: Escribir el cascarón de navegación**

```kotlin
package dev.tohure.android_rust_test.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import dev.tohure.android_rust_test.AppContainer
import dev.tohure.android_rust_test.ui.components.CoreVersionFooter

/**
 * Cuatro pestañas, sin librería de navegación.
 *
 * No hay back stack, ni argumentos, ni deep links: Navigation 3 o Navigation Compose
 * serían una dependencia de la que no se usaría ninguna función. Un `sealed interface`
 * y un `when` alcanzan, y el `when` exhaustivo garantiza que agregar una pestaña obligue
 * a implementarla.
 */
sealed interface Tab {
    val label: String

    data object Arithmetic : Tab { override val label = "Aritmética" }
    data object Transfer : Tab { override val label = "Transferencia" }
    data object Card : Tab { override val label = "Tarjeta" }
    data object Benchmark : Tab { override val label = "Benchmark" }

    companion object {
        val all = listOf(Arithmetic, Transfer, Card, Benchmark)
    }
}

@Composable
fun BancoApp(container: AppContainer) {
    var current: Tab by remember { mutableStateOf(Tab.Arithmetic) }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            Column {
                // El pie va en LAS CUATRO pantallas, no en un "Acerca de": en la demo se
                // comparan los cuatro strings lado a lado.
                CoreVersionFooter(container.core.coreVersion())
                NavigationBar {
                    Tab.all.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab,
                            onClick = { current = tab },
                            icon = {},
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            when (current) {
                Tab.Arithmetic -> Text("Aritmética")   // Task 9
                Tab.Transfer -> Text("Transferencia")  // Task 10
                Tab.Card -> Text("Tarjeta")            // Task 11
                Tab.Benchmark -> Text("Benchmark")     // Task 12
            }
        }
    }
}
```

- [ ] **Step 3: Cablear `MainActivity`**

```kotlin
package dev.tohure.android_rust_test

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dev.tohure.android_rust_test.ui.navigation.BancoApp
import dev.tohure.android_rust_test.ui.theme.AndroidrusttestTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = AppContainer(this)
        setContent {
            AndroidrusttestTheme {
                BancoApp(container)
            }
        }
    }
}
```

- [ ] **Step 4: Instalar y mirar la app**

```bash
./gradlew :app:installDebug
adb shell am start -n dev.tohure.android_rust_test/.MainActivity
adb exec-out screencap -p > /tmp/shell.png
```

Esperado: cuatro pestañas, el pie con el string de `coreVersion()` visible, y el texto de la pestaña activa. **Si el pie sale vacío, la `.so` no cargó** — volver a la Task 1.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/dev/tohure/android_rust_test
git commit -m "feat(android): AppContainer, las cuatro pestañas y el pie de coreVersion

Cableado manual sin librería de DI: con cinco pantallas y tres dependencias,
explícito gana. Hilt trae KSP y tiempo de build, Koin resolución en runtime que
falla tarde, y ninguno es más desacoplado.

Navegación con un sealed interface y un when exhaustivo, sin librería: no hay
back stack, ni argumentos, ni deep links que justifiquen la dependencia.

El pie con coreVersion() va en las cuatro pestañas, no en un Acerca de: es la
prueba en pantalla de que las cuatro apps corren el mismo build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Pantalla de Aritmética

**Files:**
- Create: `…/ui/arithmetic/ArithmeticUiState.kt`
- Create: `…/ui/arithmetic/ArithmeticViewModel.kt`
- Create: `…/ui/arithmetic/ArithmeticScreen.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/ui/arithmetic/ArithmeticViewModelTest.kt`
- Modify: `…/ui/navigation/BancoApp.kt`

**Interfaces:**
- Consumes: `CoreFinanciero`, `ContractMessages`
- Produces: `ArithmeticUiState`, `ArithmeticViewModel(core, messages)`, `@Composable ArithmeticScreen(vm)`

- [ ] **Step 1: Escribir el test del ViewModel**

```kotlin
package dev.tohure.android_rust_test.ui.arithmetic

import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.core_financiero.DomainException

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

class ArithmeticViewModelTest {
    private fun messages() = ContractMessages(
        FakeMessages(mapOf("MontoInvalido" to "El monto ingresado no es válido.")),
    )

    @Test
    fun theResultOfTheCoreLandsInTheState() = runTest {
        val vm = ArithmeticViewModel(FakeCoreFinanciero(nextAdd = Result.success("0.30")), messages())
        vm.operandAChanged("0.1")
        vm.operandBChanged("0.2")
        vm.compute()
        assertEquals("0.30", vm.uiState.value.coreResult)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun theNativeFloatResultIsComputedForContrast() = runTest {
        val vm = ArithmeticViewModel(FakeCoreFinanciero(), messages())
        vm.operandAChanged("0.1")
        vm.operandBChanged("0.2")
        vm.compute()
        // Esta pantalla es la ÚNICA donde se permite el flotante nativo, y existe para
        // exhibir el fallo: 0.1 + 0.2 no da 0.3 en IEEE-754.
        assertEquals("0.30000000000000004", vm.uiState.value.nativeResult)
    }

    @Test
    fun anErrorFromTheCoreBecomesUserText() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextAdd(DomainException.InvalidAmount("vacío"))
        val vm = ArithmeticViewModel(core, messages())
        vm.compute()
        assertEquals("El monto ingresado no es válido.", vm.uiState.value.error)
    }

    @Test
    fun clearErrorConsumesTheError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextAdd(DomainException.InvalidAmount("vacío"))
        val vm = ArithmeticViewModel(core, messages())
        vm.compute()
        vm.clearError()
        // Sin esta acción el mensaje reaparece al rotar la pantalla, porque sigue en el estado.
        assertNull(vm.uiState.value.error)
    }
}
```

- [ ] **Step 2: Agregar la dependencia de test de corrutinas**

En `gradle/libs.versions.toml`:

```toml
coroutinesTest = "1.10.2"
kotlinx-coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutinesTest" }
```

En `app/build.gradle.kts`, dentro de `dependencies`:

```kotlin
testImplementation(libs.kotlinx.coroutines.test)
```

- [ ] **Step 3: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*ArithmeticViewModelTest*'
```

Esperado: **FAIL** — `ArithmeticViewModel` no existe.

- [ ] **Step 4: Escribir el estado**

```kotlin
package dev.tohure.android_rust_test.ui.arithmetic

import androidx.compose.runtime.Immutable

/** Las dos operaciones que expone el core. */
enum class Operation { ADD, SUBTRACT }

@Immutable
data class ArithmeticUiState(
    val operandA: String = "0.1",
    val operandB: String = "0.2",
    val operation: Operation = Operation.ADD,
    /** Lo que devuelve el core: `Decimal` con la escala correcta. */
    val coreResult: String = "",
    /** Lo que devuelve el flotante nativo. Existe para exhibir la divergencia. */
    val nativeResult: String = "",
    val error: String? = null,
)
```

- [ ] **Step 5: Escribir el ViewModel**

```kotlin
package dev.tohure.android_rust_test.ui.arithmetic

import androidx.lifecycle.ViewModel
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.core_financiero.DomainException

class ArithmeticViewModel(
    private val core: CoreFinanciero,
    private val messages: ContractMessages,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ArithmeticUiState())
    val uiState: StateFlow<ArithmeticUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    // Sin límite de decimales acá: el contrato acepta escala libre en la entrada de
    // aritmética (`ar-001` es "0.1"). Los 2 decimales son normativos solo para transferencia.
    fun operandAChanged(value: String) { _uiState.value = _uiState.value.copy(operandA = value) }
    fun operandBChanged(value: String) { _uiState.value = _uiState.value.copy(operandB = value) }
    fun operationChanged(op: Operation) { _uiState.value = _uiState.value.copy(operation = op) }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun compute() {
        val s = _uiState.value
        val result = when (s.operation) {
            Operation.ADD -> core.add(s.operandA, s.operandB)
            Operation.SUBTRACT -> core.subtract(s.operandA, s.operandB)
        }
        result
            .onSuccess { value ->
                _uiState.value = s.copy(
                    coreResult = value,
                    nativeResult = nativeFloat(s),
                    error = null,
                )
            }.onFailure { e ->
                _uiState.value = s.copy(
                    coreResult = "",
                    nativeResult = "",
                    error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                )
            }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }

    // ── El flotante nativo, que existe para fallar ────────────────────────────

    /**
     * **La única aritmética con punto flotante permitida en toda la app**, y está acá a
     * propósito: la pantalla de Aritmética existe para exhibir que `0.1 + 0.2` da
     * `0.30000000000000004` con `Double` y `0.30` con el core.
     *
     * No es una implementación alternativa del dominio: es el contraejemplo.
     */
    private fun nativeFloat(s: ArithmeticUiState): String {
        val a = s.operandA.toDoubleOrNull() ?: return "—"
        val b = s.operandB.toDoubleOrNull() ?: return "—"
        return when (s.operation) {
            Operation.ADD -> (a + b).toString()
            Operation.SUBTRACT -> (a - b).toString()
        }
    }
}
```

- [ ] **Step 6: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*ArithmeticViewModelTest*'
```

Esperado: **4 tests, 0 failures.**

- [ ] **Step 7: Escribir la pantalla**

```kotlin
package dev.tohure.android_rust_test.ui.arithmetic

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.theme.CoreGreen
import dev.tohure.android_rust_test.ui.theme.FloatRed

@Composable
fun ArithmeticScreen(vm: ArithmeticViewModel, modifier: Modifier = Modifier) {
    // collectAsStateWithLifecycle, NO collectAsState: el primero deja de colectar cuando
    // la pantalla no está visible.
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Aritmética", "El float rompe el dinero")
        Spacer(Modifier.height(16.dp))

        LabeledField("Operando A", state.operandA, vm::operandAChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Operando B", state.operandB, vm::operandBChanged)
        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(state.operation == Operation.ADD, { vm.operationChanged(Operation.ADD) })
            Text("Sumar")
            Spacer(Modifier.height(0.dp))
            RadioButton(state.operation == Operation.SUBTRACT, { vm.operationChanged(Operation.SUBTRACT) })
            Text("Restar")
        }

        Button(vm::compute, Modifier.fillMaxWidth()) { Text("Calcular") }
        Spacer(Modifier.height(16.dp))

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        ComparisonCard("Punto flotante nativo", state.nativeResult, FloatRed)
        Spacer(Modifier.height(8.dp))
        ComparisonCard("Core (Rust · Decimal)", state.coreResult, CoreGreen)
    }
}

@Composable
private fun ComparisonCard(label: String, value: String, accent: Color) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = accent)
            Spacer(Modifier.height(4.dp))
            Text(
                value.ifBlank { "—" },
                style = MaterialTheme.typography.headlineSmall,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}
```

- [ ] **Step 8: Enchufarla en la navegación**

En `BancoApp.kt`, reemplazar `Tab.Arithmetic -> Text("Aritmética")` por:

```kotlin
Tab.Arithmetic -> ArithmeticScreen(
    remember { ArithmeticViewModel(container.core, container.messages) },
)
```

Agregar los imports de `ArithmeticScreen`, `ArithmeticViewModel` y `androidx.compose.runtime.remember`.

- [ ] **Step 9: Verificar en el emulador y commitear**

```bash
./gradlew :app:installDebug
adb shell am start -n dev.tohure.android_rust_test/.MainActivity
adb exec-out screencap -p > /tmp/arithmetic.png
```

Esperado: con `0.1` y `0.2`, la tarjeta roja muestra `0.30000000000000004` y la verde `0.30`.

```bash
git add app/src/main/java/dev/tohure/android_rust_test app/src/test gradle/libs.versions.toml app/build.gradle.kts
git commit -m "feat(android): pantalla de Aritmética, la que exhibe el fallo del float

Muestra lado a lado el resultado del Double nativo y el del core. Es la ÚNICA
pantalla donde se permite aritmética con punto flotante, y está ahí como
contraejemplo: 0.1 + 0.2 da 0.30000000000000004 con Double y 0.30 con el core.

Sin límite de decimales en la entrada: el contrato acepta escala libre en
aritmética (ar-001 es 0.1). Los 2 decimales son normativos solo para
transferencia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Pantalla de Transferencia

**Files:**
- Create: `…/ui/transfer/TransferUiState.kt`
- Create: `…/ui/transfer/TransferViewModel.kt`
- Create: `…/ui/transfer/TransferScreen.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/ui/transfer/TransferViewModelTest.kt`
- Modify: `…/ui/navigation/BancoApp.kt`

**Interfaces:**
- Consumes: `CoreFinanciero`, `ContractMessages`, `ContractSource`, `MoneyFormatter`
- Produces: `TransferUiState`, `TransferViewModel(core, contract, messages)`, `@Composable TransferScreen(vm)`

- [ ] **Step 1: Escribir el test del ViewModel**

```kotlin
package dev.tohure.android_rust_test.ui.transfer

import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferResult

private class FakeContract : ContractSource {
    override fun initialAccounts() = listOf(
        Account("00219100123456789047", "Ana Quispe", "5000.00"),
        Account("01122000987654321065", "Luis Ramos", "1200.50"),
    )

    override fun demoKeyHex() = "00010203"
    override fun demoNonceHex() = "0001"
}

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

class TransferViewModelTest {
    private fun messages() = ContractMessages(
        FakeMessages(
            mapOf(
                "MismaCuenta" to "La cuenta de origen y la de destino son la misma.",
                "SaldoInsuficiente" to "Saldo insuficiente: tenés {available} y se necesitan {required}.",
            ),
        ),
    )

    @Test
    fun theInitialAccountsComeFromTheContractNotFromCode() {
        val vm = TransferViewModel(FakeCoreFinanciero(), FakeContract(), messages())
        assertEquals(2, vm.uiState.value.accounts.size)
        assertEquals("Ana Quispe", vm.uiState.value.accounts[0].holder)
    }

    @Test
    fun theAmountFieldRejectsMoreThanTwoDecimals() {
        val vm = TransferViewModel(FakeCoreFinanciero(), FakeContract(), messages())
        vm.amountChanged("100.12")
        assertEquals("100.12", vm.uiState.value.amount)
        // Filtro de TEXTO, no regla de negocio: el core igual rechaza (tr-007), pero el
        // usuario no tiene que llegar hasta ahí.
        vm.amountChanged("100.123")
        assertEquals("100.12", vm.uiState.value.amount)
    }

    @Test
    fun aSuccessfulTransferLandsInTheStateAfterTheSimulatedLatency() = runTest {
        val core = FakeCoreFinanciero(
            nextTransfer = Result.success(
                TransferResult(
                    accounts = listOf(
                        Account("00219100123456789047", "Ana Quispe", "4899.99"),
                        Account("01122000987654321065", "Luis Ramos", "3100.00"),
                    ),
                    itfFee = "0.01",
                    totalDebited = "100.01",
                    receipt = "TRF-0001",
                    simulatedLatencyMs = 120u,
                ),
            ),
        )
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        assertEquals("0.01", vm.uiState.value.result?.itfFee)
        assertEquals("4899.99", vm.uiState.value.accounts[0].balance)
        assertFalse(vm.uiState.value.isLoading)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun aDomainErrorBecomesUserTextAndTurnsOffTheSpinner() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.InsufficientFunds("50.00", "100.01"))
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        assertEquals(
            "Saldo insuficiente: tenés 50.00 y se necesitan 100.01.",
            vm.uiState.value.error,
        )
        // El bug clásico: el catch se olvida de apagar el spinner y la pantalla queda
        // cargando para siempre.
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun clearErrorConsumesTheError() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextTransfer(DomainException.SameAccount())
        val vm = TransferViewModel(core, FakeContract(), messages())
        vm.transfer()
        advanceUntilIdle()
        vm.clearError()
        assertNull(vm.uiState.value.error)
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*TransferViewModelTest*'
```

Esperado: **FAIL** — `TransferViewModel` no existe.

- [ ] **Step 3: Escribir el estado**

```kotlin
package dev.tohure.android_rust_test.ui.transfer

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import uniffi.core_financiero.Account
import uniffi.core_financiero.TransferResult

@Immutable
data class TransferUiState(
    val origin: String = "",
    val destination: String = "",
    /** `String`. Siempre. El estado es el último lugar donde alguien se tienta con un número. */
    val amount: String = "",
    val accounts: ImmutableList<Account> = persistentListOf(),
    val result: TransferResult? = null,
    /** `true` mientras corre `simulatedLatencyMs`. */
    val isLoading: Boolean = false,
    /** Ya resuelto a texto de usuario, no la excepción. */
    val error: String? = null,
)
```

- [ ] **Step 4: Agregar `kotlinx.collections.immutable`**

En `gradle/libs.versions.toml`:

```toml
collectionsImmutable = "0.5.0"
kotlinx-collections-immutable = { group = "org.jetbrains.kotlinx", name = "kotlinx-collections-immutable", version.ref = "collectionsImmutable" }
```

En `app/build.gradle.kts`:

```kotlin
implementation(libs.kotlinx.collections.immutable)
```

**Nota de versión:** la línea 0.5.x renombró los métodos que devuelven copia (KEEP-0459): `add` → `adding`, `set` → `replacingAt`. Este proyecto arranca de cero, así que usa los nombres nuevos. Cualquier ejemplo anterior a 0.5 va a estar con los viejos.

- [ ] **Step 5: Escribir el ViewModel**

```kotlin
package dev.tohure.android_rust_test.ui.transfer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.TransferRequest

/** Máximo 2 decimales. Es un filtro de TEXTO, no una regla de negocio. */
private val AMOUNT = Regex("""^\d{0,9}(\.\d{0,2})?$""")

class TransferViewModel(
    private val core: CoreFinanciero,
    contract: ContractSource,
    private val messages: ContractMessages,
) : ViewModel() {
    /**
     * Cache crudo, separado del estado: el estado guarda lo que la pantalla pinta.
     *
     * Las dos cuentas son DATOS DEL CONTRATO, no de la app. Hardcodearlas acá las
     * duplicaría en las cuatro apps y divergirían.
     *
     * Se inicializa ANTES que `_uiState`: el orden de los inicializadores de propiedad
     * importa, y al revés esto sería `null` al construir el estado inicial.
     */
    private var allAccounts: List<Account> = contract.initialAccounts()

    private val _uiState = MutableStateFlow(
        TransferUiState(
            origin = allAccounts.getOrNull(0)?.id.orEmpty(),
            destination = allAccounts.getOrNull(1)?.id.orEmpty(),
            accounts = allAccounts.toImmutableList(),
        ),
    )
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    fun originChanged(value: String) { _uiState.value = _uiState.value.copy(origin = value) }
    fun destinationChanged(value: String) { _uiState.value = _uiState.value.copy(destination = value) }

    /**
     * El core ya rechaza un monto con más de 2 decimales (`tr-007`, `MontoInvalido`), pero
     * el usuario no tiene que llegar hasta ahí: es una demo y la pantalla tiene que verse
     * bien. Esto **no parsea, no redondea y no calcula**: decide si el string que se acaba
     * de teclear se acepta en el campo.
     */
    fun amountChanged(value: String) {
        if (!AMOUNT.matches(value)) return
        _uiState.value = _uiState.value.copy(amount = value)
    }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun transfer() {
        viewModelScope.launch {
            val s = _uiState.value
            _uiState.value = s.copy(isLoading = true, error = null)
            val request = TransferRequest(s.origin, s.destination, s.amount)
            core.transfer(allAccounts, request)
                .onSuccess { result ->
                    // Espera para que parezca una llamada de red. NO HAY RED.
                    delay(result.simulatedLatencyMs.toLong())
                    allAccounts = result.accounts
                    _uiState.value = _uiState.value.copy(
                        result = result,
                        accounts = result.accounts.toImmutableList(),
                        isLoading = false,
                    )
                }.onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                        isLoading = false,
                    )
                }
        }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }
}
```

- [ ] **Step 6: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*TransferViewModelTest*'
```

Esperado: **5 tests, 0 failures.**

- [ ] **Step 7: Escribir la pantalla**

```kotlin
package dev.tohure.android_rust_test.ui.transfer

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.format.MoneyFormatter
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider

@Composable
fun TransferScreen(vm: TransferViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        ScreenHeader("Transferencia", "Dos cuentas en memoria")
        Spacer(Modifier.height(16.dp))

        // Orden de campos fijado por docs/ui-spec.md: origen, destino, monto. No se altera.
        LabeledField("Origen", state.origin, vm::originChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Destino", state.destination, vm::destinationChanged)
        Spacer(Modifier.height(8.dp))
        LabeledField("Monto", state.amount, vm::amountChanged, keyboardType = KeyboardType.Decimal)
        Spacer(Modifier.height(12.dp))

        Button(vm::transfer, Modifier.fillMaxWidth(), enabled = !state.isLoading) {
            if (state.isLoading) CircularProgressIndicator(Modifier.height(16.dp)) else Text("Transferir")
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        state.result?.let { r ->
            SectionDivider("Resultado")
            ResultRow("Comisión ITF", MoneyFormatter.format(r.itfFee))
            ResultRow("Total debitado", MoneyFormatter.format(r.totalDebited))
            ResultRow("Comprobante", r.receipt, mono = true)
        }

        SectionDivider("Saldos")
        state.accounts.forEach { account ->
            ResultRow("${account.id}  ${account.holder}", MoneyFormatter.format(account.balance))
        }
    }
}
```

- [ ] **Step 8: Enchufarla, verificar y commitear**

En `BancoApp.kt`, reemplazar `Tab.Transfer -> Text("Transferencia")` por:

```kotlin
Tab.Transfer -> TransferScreen(
    remember { TransferViewModel(container.core, container.contract, container.messages) },
)
```

```bash
./gradlew :app:installDebug :app:testDebugUnitTest
adb shell am start -n dev.tohure.android_rust_test/.MainActivity
```

Esperado: con monto `100.00`, aparece la comisión ITF, el total debitado, el comprobante y los dos saldos nuevos, después de la espera de `simulatedLatencyMs`.

```bash
git add app/src/main/java/dev/tohure/android_rust_test app/src/test gradle/libs.versions.toml app/build.gradle.kts
git commit -m "feat(android): pantalla de Transferencia

Las dos cuentas salen de cuentas_iniciales del contrato, no de código:
hardcodearlas las duplicaría en las cuatro apps y divergirían.

El campo de monto acepta 2 decimales por un filtro de TEXTO, no por una
validación de negocio: el core ya rechaza el resto (tr-007), pero el usuario no
tiene que llegar hasta ahí. No parsea, no redondea y no calcula.

isLoading se apaga en las dos ramas del resultado. El bug clásico es que el
catch se olvide y la pantalla quede cargando para siempre.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Pantalla de Tarjeta

**Files:**
- Create: `…/ui/card/CardUiState.kt`, `CardViewModel.kt`, `CardScreen.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/ui/card/CardViewModelTest.kt`
- Modify: `…/ui/navigation/BancoApp.kt`

**Interfaces:**
- Consumes: `CoreFinanciero`, `ContractMessages`, `ContractSource`
- Produces: `CardUiState`, `CardViewModel(core, contract, messages)`, `@Composable CardScreen(vm)`

- [ ] **Step 1: Escribir el test del ViewModel**

```kotlin
package dev.tohure.android_rust_test.ui.card

import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.FakeCoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import dev.tohure.android_rust_test.contract.MessageSource
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import uniffi.core_financiero.Account
import uniffi.core_financiero.DomainException
import uniffi.core_financiero.ValidCard

private class FakeContract : ContractSource {
    override fun initialAccounts(): List<Account> = emptyList()
    override fun demoKeyHex() = "00010203"
    override fun demoNonceHex() = "0001"
}

private class FakeMessages(private val map: Map<String, String>) : MessageSource {
    override fun messages() = map
}

class CardViewModelTest {
    private fun messages() = ContractMessages(
        FakeMessages(
            mapOf("DigitoControl" to "El número ingresado no es válido: no pasa el dígito de control."),
        ),
    )

    @Test
    fun aValidCardFillsBrandMaskAndCipher() = runTest {
        val core = FakeCoreFinanciero(
            nextCard = Result.success(ValidCard("Visa", "4111 **** **** 1111")),
            nextEncrypt = Result.success("bdca3931"),
        )
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111111")
        vm.validateAndEncrypt()
        assertEquals("Visa", vm.uiState.value.brand)
        assertEquals("4111 **** **** 1111", vm.uiState.value.masked)
        assertEquals("bdca3931", vm.uiState.value.cipherHex)
        assertNull(vm.uiState.value.error)
    }

    @Test
    fun anInvalidCardBecomesUserText() = runTest {
        val core = FakeCoreFinanciero()
        core.failNextCard(DomainException.CheckDigit())
        val vm = CardViewModel(core, FakeContract(), messages())
        vm.numberChanged("4111111111111112")
        vm.validateAndEncrypt()
        assertEquals(
            "El número ingresado no es válido: no pasa el dígito de control.",
            vm.uiState.value.error,
        )
        assertEquals("", vm.uiState.value.cipherHex)
    }
}
```

- [ ] **Step 3: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*CardViewModelTest*'
```

Esperado: **FAIL** — `CardViewModel` no existe.

- [ ] **Step 4: Escribir estado y ViewModel**

`…/ui/card/CardUiState.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.card

import androidx.compose.runtime.Immutable

@Immutable
data class CardUiState(
    val number: String = "",
    val brand: String = "",
    val masked: String = "",
    /** El hex debe ser idéntico en las cuatro plataformas. Es el punto de la demo. */
    val cipherHex: String = "",
    val error: String? = null,
)
```

`…/ui/card/CardViewModel.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.card

import androidx.lifecycle.ViewModel
import dev.tohure.android_rust_test.adapter.ContractMessages
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import dev.tohure.android_rust_test.contract.ContractSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uniffi.core_financiero.DomainException

class CardViewModel(
    private val core: CoreFinanciero,
    private val contract: ContractSource,
    private val messages: ContractMessages,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CardUiState())
    val uiState: StateFlow<CardUiState> = _uiState.asStateFlow()

    // ── Entrada del usuario ───────────────────────────────────────────────────

    fun numberChanged(value: String) {
        // Solo dígitos: filtro de texto. Luhn lo valida el core, no esta app.
        if (!value.all(Char::isDigit)) return
        _uiState.value = _uiState.value.copy(number = value)
    }

    // ── Acciones ──────────────────────────────────────────────────────────────

    fun validateAndEncrypt() {
        val number = _uiState.value.number
        core.validateCard(number)
            .mapCatching { card ->
                val hex = core.encrypt(number, contract.demoKeyHex(), contract.demoNonceHex())
                    .getOrThrow()
                card to hex
            }.onSuccess { (card, hex) ->
                _uiState.value = _uiState.value.copy(
                    brand = card.brand,
                    masked = card.masked,
                    cipherHex = hex,
                    error = null,
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    brand = "",
                    masked = "",
                    cipherHex = "",
                    error = (e as? DomainException)?.let(messages::userMessage) ?: e.toString(),
                )
            }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = null) }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*CardViewModelTest*'
```

Esperado: **2 tests, 0 failures.**

- [ ] **Step 6: Escribir la pantalla**

```kotlin
package dev.tohure.android_rust_test.ui.card

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider

@Composable
fun CardScreen(vm: CardViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Tarjeta", "Luhn y cifrado ChaCha20-Poly1305")
        Spacer(Modifier.height(16.dp))

        LabeledField("Número", state.number, vm::numberChanged, keyboardType = KeyboardType.Number)
        Spacer(Modifier.height(12.dp))
        Button(vm::validateAndEncrypt, Modifier.fillMaxWidth()) { Text("Validar y cifrar") }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        if (state.cipherHex.isNotEmpty()) {
            SectionDivider("Resultado")
            ResultRow("Marca", state.brand)
            ResultRow("Enmascarado", state.masked, mono = true)
            Text("Cifrado (hex)", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(4.dp))
            Card(Modifier.fillMaxWidth()) {
                // Monoespaciado y con corte de línea: en la demo se compara a simple vista
                // contra las otras tres pantallas.
                Text(
                    state.cipherHex,
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
}
```

- [ ] **Step 7: Enchufarla, verificar y commitear**

En `BancoApp.kt`: `Tab.Card -> CardScreen(remember { CardViewModel(container.core, container.contract, container.messages) })`

```bash
./gradlew :app:installDebug :app:testDebugUnitTest
```

Esperado: con `4111111111111111` aparece `Visa`, `4111 **** **** 1111` y el hex que empieza en `bdca3931…` — el mismo del caso `tj-001` del contrato.

```bash
git add app/src/main/java/dev/tohure/android_rust_test app/src/test
git commit -m "feat(android): pantalla de Tarjeta

Valida por Luhn y cifra con ChaCha20-Poly1305 llamando al core; el hex debe ser
idéntico al de las otras tres plataformas, y por eso va monoespaciado y con
corte de línea para compararlo a simple vista.

La clave y el nonce salen de _clave_demo_hex y _nonce_demo_hex del contrato. El
nonce es fijo a propósito, para que las cuatro plataformas produzcan el mismo
hex; en producción eso sería catastrófico y está documentado en
contracts/README.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Pantalla de Benchmark y la baseline nativa

**Files:**
- Create: `…/ui/benchmark/NativeBaseline.kt`
- Create: `…/ui/benchmark/BenchmarkUiState.kt`, `BenchmarkViewModel.kt`, `BenchmarkScreen.kt`
- Create: `app/src/test/java/dev/tohure/android_rust_test/ui/benchmark/NativeBaselineTest.kt`
- Modify: `…/ui/navigation/BancoApp.kt`

**Interfaces:**
- Consumes: `CoreFinanciero`
- Produces: `NativeBaseline.add(a, b): String`, `BenchmarkUiState`, `BenchmarkViewModel(core)`, `@Composable BenchmarkScreen(vm)`

- [ ] **Step 1: Escribir el test de la baseline**

```kotlin
package dev.tohure.android_rust_test.ui.benchmark

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NativeBaselineTest {
    @Test
    fun theNativeBaselineDivergesFromTheCoreAndThatIsThePoint() {
        // El core devuelve "0.30" para este caso (ar-001 del contrato). El Double no.
        // Si esto dejara de fallar, la baseline dejaría de servir para la demo.
        assertNotEquals("0.30", NativeBaseline.add("0.1", "0.2"))
        assertEquals("0.30000000000000004", NativeBaseline.add("0.1", "0.2"))
    }
}
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
./gradlew :app:testDebugUnitTest --tests '*NativeBaselineTest*'
```

Esperado: **FAIL** — `NativeBaseline` no existe.

- [ ] **Step 3: Escribir la baseline**

```kotlin
package dev.tohure.android_rust_test.ui.benchmark

/**
 * ⚠ **LA ÚNICA EXCEPCIÓN PERMITIDA A "CERO LÓGICA DE NEGOCIO FUERA DE `rust-core`".**
 *
 * Este archivo existe **para exhibir la divergencia de centavos del punto flotante**, no
 * para calcular nada que la app use. Es el contraejemplo de la pantalla de Benchmark: se
 * compara contra el core para mostrar que `Double` pierde precisión sobre dinero.
 *
 * **No lo copies, no lo extiendas y no lo llames desde ninguna otra pantalla.** Si te
 * encontrás necesitando aritmética sobre montos en Kotlin fuera de acá, el cálculo está en
 * el lugar equivocado: pedíselo al core.
 *
 * Vive en producción y no en `androidTest` porque la pantalla de Benchmark tiene que
 * pintarlo: el día de la demo nadie corre los tests instrumentados.
 */
object NativeBaseline {
    fun add(a: String, b: String): String {
        val x = a.toDoubleOrNull() ?: return "—"
        val y = b.toDoubleOrNull() ?: return "—"
        return (x + y).toString()
    }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
./gradlew :app:testDebugUnitTest --tests '*NativeBaselineTest*'
```

Esperado: **1 test, 0 failures.**

- [ ] **Step 5: Escribir estado, ViewModel y pantalla**

`…/ui/benchmark/BenchmarkUiState.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.runtime.Immutable

@Immutable
data class BenchmarkUiState(
    val iterations: String = "1000",
    val coreP50: String = "—",
    val coreP95: String = "—",
    val nativeP50: String = "—",
    val nativeP95: String = "—",
    val isRunning: Boolean = false,
)
```

`…/ui/benchmark/BenchmarkViewModel.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.benchmark

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.tohure.android_rust_test.adapter.CoreFinanciero
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BenchmarkViewModel(private val core: CoreFinanciero) : ViewModel() {
    private val _uiState = MutableStateFlow(BenchmarkUiState())
    val uiState: StateFlow<BenchmarkUiState> = _uiState.asStateFlow()

    fun iterationsChanged(value: String) {
        if (!value.all(Char::isDigit) || value.length > 6) return
        _uiState.value = _uiState.value.copy(iterations = value)
    }

    fun run() {
        val n = _uiState.value.iterations.toIntOrNull() ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRunning = true)
            // ESTA es la única pantalla donde las llamadas al core salen del hilo principal.
            // En el resto son síncronas y de microsegundos: envolverlas sería puro ruido.
            val core50to95 = withContext(Dispatchers.Default) { measure(n) { core.add("0.1", "0.2") } }
            val native50to95 = withContext(Dispatchers.Default) { measure(n) { NativeBaseline.add("0.1", "0.2") } }
            _uiState.value = _uiState.value.copy(
                coreP50 = core50to95.first, coreP95 = core50to95.second,
                nativeP50 = native50to95.first, nativeP95 = native50to95.second,
                isRunning = false,
            )
        }
    }

    /** Devuelve (p50, p95) formateados en microsegundos. */
    private inline fun measure(n: Int, block: () -> Unit): Pair<String, String> {
        val samples = LongArray(n)
        repeat(n) { i ->
            val start = System.nanoTime()
            block()
            samples[i] = System.nanoTime() - start
        }
        samples.sort()
        fun at(p: Double) = "%.2f µs".format(samples[(n * p).toInt().coerceIn(0, n - 1)] / 1000.0)
        return at(0.50) to at(0.95)
    }
}
```

`…/ui/benchmark/BenchmarkScreen.kt`:

```kotlin
package dev.tohure.android_rust_test.ui.benchmark

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.tohure.android_rust_test.ui.components.LabeledField
import dev.tohure.android_rust_test.ui.components.ResultRow
import dev.tohure.android_rust_test.ui.components.ScreenHeader
import dev.tohure.android_rust_test.ui.components.SectionDivider

@Composable
fun BenchmarkScreen(vm: BenchmarkViewModel, modifier: Modifier = Modifier) {
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(modifier.padding(16.dp)) {
        ScreenHeader("Benchmark", "Core vs. implementación nativa")
        Spacer(Modifier.height(16.dp))

        LabeledField("Iteraciones", state.iterations, vm::iterationsChanged, keyboardType = KeyboardType.Number)
        Spacer(Modifier.height(12.dp))
        Button(vm::run, Modifier.fillMaxWidth(), enabled = !state.isRunning) { Text("Ejecutar") }

        SectionDivider("Resultado")
        ResultRow("Core · p50", state.coreP50, mono = true)
        ResultRow("Core · p95", state.coreP95, mono = true)
        ResultRow("Nativa · p50", state.nativeP50, mono = true)
        ResultRow("Nativa · p95", state.nativeP95, mono = true)

        Spacer(Modifier.height(16.dp))
        Text(
            "⚠ La baseline nativa diverge en centavos: existe para exhibirlo.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}
```

- [ ] **Step 6: Enchufarla, verificar y commitear**

En `BancoApp.kt`: `Tab.Benchmark -> BenchmarkScreen(remember { BenchmarkViewModel(container.core) })`

```bash
./gradlew :app:installDebug :app:testDebugUnitTest
```

```bash
git add app/src/main/java/dev/tohure/android_rust_test app/src/test
git commit -m "feat(android): pantalla de Benchmark y la baseline nativa

NativeBaseline.kt es la única excepción permitida a cero lógica de negocio
fuera de rust-core, y lleva el comentario que lo dice. Vive en producción y no
en androidTest porque la pantalla tiene que pintarlo: el día de la demo nadie
corre los tests instrumentados.

Su test aserta que DIVERGE del core: si dejara de fallar contra 0.30, dejaría
de servir para la demo.

Es además la única pantalla donde las llamadas al core salen del hilo
principal; en el resto son síncronas y de microsegundos.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Las tres correcciones de documentación

Anotadas en la spec. **Van separadas de la implementación**, cada una en su commit.

**Files:**
- Modify: `docs/ui-spec.md`
- Modify: `CLAUDE.md`
- Modify: `apps/android/CONTEXT.md`

- [ ] **Step 1: Corregir los valores inventados de la spec de UI**

En `docs/ui-spec.md`, reemplazar en los wireframes:

| Está | Va |
|---|---|
| `ACC-001`, `ACC-002` | `00219100123456789047`, `01122000987654321065` |
| `Ana Torres`, `Luis Paz` | `Ana Quispe`, `Luis Ramos` |
| `**** 1111` | `4111 **** **** 1111` |

```bash
git add docs/ui-spec.md
git commit -m "docs(ui-spec): los wireframes usaban valores que el core nunca produce

Decían ACC-001 / Ana Torres / '**** 1111'; el contrato v2.3.0 dice
00219100123456789047 (Ana Quispe), 01122000987654321065 (Luis Ramos) y
'4111 **** **** 1111'.

Una spec de UI con datos falsos hace que la primera pantalla se escriba contra
valores que no existen, y el error aparece recién al correr el golden.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Corregir la contradicción del benchmark**

En `CLAUDE.md`, en la regla 2 de "El invariante que sostiene toda la POC", cambiar
"la baseline Kotlin en `androidTest`" por "`ui/benchmark/NativeBaseline.kt` en Android".

En `apps/android/CONTEXT.md`, cambiar "una implementación equivalente nativa que vive solo
en el código de test" por "una implementación equivalente nativa aislada en
`ui/benchmark/NativeBaseline.kt`, con el comentario que explica por qué existe".

```bash
git add CLAUDE.md apps/android/CONTEXT.md
git commit -m "docs: la baseline del benchmark vive en producción, no solo en test

Las dos afirmaciones no podían ser ciertas a la vez: CLAUDE.md la ubicaba solo
en androidTest y la pantalla de Benchmark tiene que pintar Core vs Nativa.

Se resuelve a favor de la pantalla, porque el día de la demo nadie corre
androidTest. La excepción pasa a ser 'aislada en su archivo, con comentario',
no 'solo en test'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Corregir los nombres de pantalla en español**

En `apps/android/CONTEXT.md`, cualquier residuo de `AritmeticaScreen`, `TransferenciaScreen`
o `TarjetaScreen` pasa a `ArithmeticScreen`, `TransferScreen`, `CardScreen`.

```bash
grep -rn "AritmeticaScreen\|TransferenciaScreen\|TarjetaScreen" apps/ docs/ CLAUDE.md
git add apps/android/CONTEXT.md
git commit -m "docs(android): nombres de pantalla en inglés, como manda la regla

CLAUDE.md exige identificadores en inglés en las cinco bases de código; el
CONTEXT tenía AritmeticaScreen y compañía. El texto de UI sigue en español.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Cierre de fase

**Files:**
- Modify: `apps/android/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correr la suite completa**

```bash
cd apps/android
./gradlew :app:testDebugUnitTest
./gradlew :app:connectedDebugAndroidTest
cd ../../rust-core && cargo test --workspace
```

Esperado: **todo en verde.** Anotar los números reales para el README.

- [ ] **Step 2: Actualizar el README con lo que corrió**

Reemplazar la sección "Lo que falta (Fase 2)" de `apps/android/README.md` por una sección
"Correr los tests" con los comandos de arriba y **su salida real**, y actualizar el estado
del encabezado y el diagrama Mermaid (sacar el `classDef pend` de los nodos que ya existen).

- [ ] **Step 3: Actualizar el estado en `CLAUDE.md`**

Marcar la Fase 2 como ✅ completada en la lista de fases y en la tabla de toolchain, con el
conteo real de tests.

- [ ] **Step 4: Commit y cierre**

```bash
git add apps/android/README.md ../../CLAUDE.md
git commit -m "docs(android): cierre de la Fase 2

Los tres entregables de CLAUDE.md: golden en verde sobre dispositivo, README
con los comandos efectivamente ejecutados y su salida, y el diagrama Mermaid
actualizado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Cerrar la rama**

Usar `superpowers:finishing-a-development-branch`. **No mergear antes de que el golden pase.**
