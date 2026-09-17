plugins {
    alias(libs.plugins.android.library)
}

android {
    // El `namespace` es para el `R` y el `BuildConfig` del módulo, **no** para los paquetes
    // de las fuentes: las clases que se muden acá conservan su paquete
    // `dev.tohure.android_rust_test.*` y ningún `import` de `:app` cambia.
    namespace = "dev.tohure.android_rust_test.core"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        minSdk = 28
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Mismo filtro que traía `:app`: el AAR de JNA empaqueta slices para ABIs que el NDK
        // ya no soporta —`mips` y `mips64` salieron en r17, `armeabi` en r16— más un `x86` de
        // 32 bits sin `libcore_financiero.so` que lo acompañe. Son ~530 KB que no pueden
        // ejecutarse en ningún dispositivo.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    // `FfiCostProbe` mide el costo del cruce FFI, y ese número **sólo vale sobre un APK que no
    // sea `debuggable`**: con `debuggable=true` el ART deja de optimizar el camino del binding
    // y la medición sale ~4x pesimista. No es una hipótesis — está verificado con la baseline
    // nativa como control, que da 2,12 µs idéntico en los dos builds. Ver TESTING.md.
    //
    // Los instrumentados corren contra `debug`, como siempre; `-PprobeRelease` los manda al
    // release, que va firmado con el keystore de debug para poder instalarse.
    testBuildType = if (providers.gradleProperty("probeRelease").isPresent) "release" else "debug"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    // Los generados viven en un source set aparte del código escrito a mano, para que se vea
    // de un vistazo qué se edita y qué no. **No van en `build/`**: un `clean` dejaría la app
    // sin compilar hasta volver a correr el paso de Rust, y eso se descubre el día de la demo.
    // Están ignorados por git (`.gitignore`), igual que antes de mudarse: se regeneran desde
    // `rust-core` en cada máquina, no se commitean.
    sourceSets {
        getByName("main") {
            // **`kotlin.srcDir`, no `java.srcDir`.** Con el Kotlin integrado de AGP 9, un
            // `java.srcDir` deja el directorio fuera del compilador de Kotlin: el módulo
            // compila igual, el AAR sale con las `.so` adentro, y el jar de clases trae una
            // sola clase —el `R`—. El fallo aparece recién al compilar `:app`, como
            // "Unresolved reference 'DomainException'", lejos de su causa. Verificado.
            kotlin.srcDir("src/generated/java")
            jniLibs.srcDir("src/generated/jniLibs")
        }
    }
}

dependencies {
    // `api` y no `implementation`: los bindings generados exponen tipos de JNA en firmas
    // públicas, así que `:app` los necesita en su classpath de compilación aunque no declare
    // JNA. Verificado compilando.
    api(variantOf(libs.jna) { artifactType("aar") })

    // Las suites que viven acá: el test de contrato y el smoke del FFI son instrumentados
    // —cruzan la frontera de verdad—; el del mapeo de mensajes corre en la JVM.
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}

// ── Contratos ────────────────────────────────────────────────────────────────
// `contracts/*.json` vive en la raíz del repo y es la copia única que las cinco bases
// de código comparan. Android no lee archivos fuera del APK, así que se copian a los
// dos source sets. Se copia en vez de apuntar `sourceSets` a `../../contracts` para que
// un archivo nuevo en esa carpeta NO entre al APK sin que alguien lo decida.
//
// Vive en este módulo y no en `:app` desde la Fase 6: los assets de una librería Android
// se mergean en el APK de la app, así que las pantallas los siguen viendo; y el `Copy` de
// test alimenta el APK de test de ESTE módulo, que es donde vive el test de contrato.
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