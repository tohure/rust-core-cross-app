plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "dev.tohure.android_rust_test"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "dev.tohure.android_rust_test"
        minSdk = 28
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    // El `@aar` no es opcional: es el artefacto que trae las .so nativas de JNA.
    implementation(variantOf(libs.jna) { artifactType("aar") })
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

// ── Contratos ────────────────────────────────────────────────────────────────
// `contracts/*.json` vive en la raíz del repo y es la copia única que las cinco bases
// de código comparan. Android no lee archivos fuera del APK, así que se copian a los
// dos source sets. Se copia en vez de apuntar `sourceSets` a `../../contracts` para que
// un archivo nuevo en esa carpeta NO entre al APK sin que alguien lo decida.
val contractsDir = rootProject.layout.projectDirectory.dir("../../contracts")
val contractFiles = listOf("cases.json", "messages.es.json")
// AGP 9 rechaza un `Provider<Directory>` en `sourceSets.assets.srcDir(...)` ("You cannot
// add Provider instances to the Android SourceSet API"); hay que resolverlo a `File` en
// configuración. Sigue siendo compatible con configuration cache: `layout.buildDirectory`
// no depende de ninguna salida de tarea, es la ruta fija `build/`.
val mainContractsDir = layout.buildDirectory.dir("generated/contracts/main")
val testContractsDir = layout.buildDirectory.dir("generated/contracts/androidTest")

val copyContractsForApp by tasks.registering(Copy::class) {
    from(contractsDir) { include(contractFiles) }
    into(mainContractsDir)
}

val copyContractsForTest by tasks.registering(Copy::class) {
    from(contractsDir) { include(contractFiles) }
    into(testContractsDir)
}

tasks.named("preBuild") { dependsOn(copyContractsForApp, copyContractsForTest) }

android.sourceSets {
    getByName("main").assets.srcDir(mainContractsDir.get().asFile)
    getByName("androidTest").assets.srcDir(testContractsDir.get().asFile)
}