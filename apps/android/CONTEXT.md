# app-android

App nativa Android que consume `rust-core`. Su único propósito es demostrar
que la lógica de dominio no vive aquí.

Stack: Kotlin, Jetpack Compose, minSdk 26, AGP con NDK r27+.

## Regla central

**Esta app no contiene ni una sola regla de negocio.** No hay cálculo de
cuotas, no hay validación de CCI, no hay tasas ni fórmulas. Todo eso se pide
al core. Si te descubres escribiendo aritmética sobre montos en Kotlin, estás
haciendo lo contrario de lo que la POC quiere demostrar.

Lo único que esta app hace con los montos es **formatearlos para mostrar**.

## Estructura

app/src/main/java/pe/banco/poc/
├── core/          bindings Kotlin generados (NO EDITAR, se regeneran)
│                  ojo: uniffi-bindgen emite en `uniffi/<crate>/`, no en esta ruta;
│                  hace falta un paso de build que los mueva, o ajustar la doc
├── adapter/       CoreFinanciero.kt, la única clase que llama al core
├── ui/            Compose: SimuladorScreen, ValidadorCciScreen
└── format/        MoneyFormatter.kt

`jniLibs/` contiene los `.so` por ABI. Ambos directorios son artefactos
generados: nunca los edites a mano, regenéralos con los comandos de
`rust-core/CONTEXT.md`.

## Dependencia obligatoria: JNA

Los bindings Kotlin de uniffi corren sobre **JNA, no JNI**. Sin esto la app compila y
revienta en runtime al primer llamado al core:

```kotlin
implementation("net.java.dev.jna:jna:5.14.0@aar")
```

## Cómo consumir el core

```kotlin
object CoreFinanciero {
    fun cronograma(monto: String, tea: String, cuotas: Int, seguro: String)
        : Result<Cronograma> = runCatching {
            uniffi.core_financiero.generarCronograma(monto, tea, cuotas.toUInt(), seguro)
        }
}
```

Reglas de la capa adapter:

1. Los montos viajan como `String` de extremo a extremo. **Nunca los conviertas
   a `Double` ni a `Float`**, en ningún punto, ni siquiera temporalmente.
2. Si necesitas comparar u ordenar montos en la UI, usa `BigDecimal`.
3. Los `ErrorDominio` del core se mapean a mensajes de usuario en la capa de
   UI, no en el adapter. El adapter propaga el error tal cual.
4. Las llamadas al core son síncronas y rápidas (microsegundos). No las metas
   en corrutinas ni en `Dispatchers.IO`, excepto en la pantalla de benchmark.

## Formateo

```kotlin
NumberFormat.getCurrencyInstance(Locale("es", "PE"))
```

El formatter recibe un `BigDecimal` construido desde el string del core. Su
único trabajo es agregar `S/`, separadores de miles y ubicar la coma decimal.
Nunca redondea: el core ya entregó el valor con la escala correcta.

## Pantallas de la POC

1. **Simulador de crédito.** Inputs: monto, TEA, número de cuotas. Muestra la
   TCEA, el total de intereses y la tabla de cuotas.
2. **Validador de CCI.** Input de 20 dígitos, muestra banco y oficina o el
   error de validación.
3. **Benchmark.** Ejecuta `generar_cronograma` N veces y reporta p50/p95.
   Compara contra una implementación Kotlin equivalente que vive
   exclusivamente en `androidTest` como línea base.
4. **Pie de pantalla:** `version_core()` visible en todas las pantallas. En la
   demo se compara con las otras tres apps.

## Pruebas

`androidTest/` debe incluir un test que lea `contracts/cases.json` y verifique
que cada caso produce el string esperado **exactamente**, con `assertEquals`
sobre strings, no comparación numérica con tolerancia. Ese test es la
evidencia central de la POC: si pasa en las cuatro plataformas, el argumento
está probado.

## Prohibiciones

- No agregues `implementation("...decimal...")` ni ninguna librería de cálculo
  financiero.
- No edites los archivos en `core/` ni en `jniLibs/`.
- No agregues red ni persistencia. Esto es una POC de dominio.
- No uses `Double` para dinero en ningún lugar del código, ni en tests.