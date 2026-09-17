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
}
