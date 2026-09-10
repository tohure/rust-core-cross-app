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
├── ui/            Compose: AritmeticaScreen, TransferenciaScreen, TarjetaScreen
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
    fun transferir(cuentas: List<Cuenta>, s: SolicitudTransferencia)
        : Result<ResultadoTransferencia> = runCatching {
            uniffi.core_financiero.ejecutarTransferencia(cuentas, s)
        }

    fun cifrar(numero: String, claveHex: String, nonceHex: String)
        : Result<String> = runCatching {
            uniffi.core_financiero.cifrar(numero, claveHex, nonceHex)
        }
}
```

Reglas de la capa adapter:

1. Los montos viajan como `String` de extremo a extremo. **Nunca los conviertas
   a `Double` ni a `Float`**, en ningún punto, ni siquiera temporalmente.
2. Si necesitas comparar u ordenar montos en la UI, usa `BigDecimal`.
3. Los `DomainException` del core (así lo nombra el binding Kotlin) se mapean a
   mensajes de usuario en la capa de
   UI, no en el adapter. El adapter propaga el error tal cual.
   **`e.message` es diagnóstico, nunca texto de usuario**: uniffi no usa los
   `#[error("...")]` en español del core, arma el mensaje con los campos de la
   variante (`"field=cci, expected=20, received=18"`) y devuelve **string
   vacío** para `CheckDigit` y `SameAccount`, que no tienen campos. Los nueve
   textos de usuario, iguales en las cuatro apps, están en la tabla de
   [rust-core/README.md](../../rust-core/README.md) — "Los mensajes de error en
   español NO cruzan el FFI".
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

1. **Aritmética.** Dos inputs y una operación. Muestra lado a lado el resultado con el
   tipo de punto flotante nativo de la plataforma y el del core. Los seis casos del
   contrato divergen: `0.1 + 0.2` da `0.30000000000000004` con double y `0.30` con el core.
   Es la única pantalla donde se permite usar el tipo flotante nativo, y existe justamente
   para exhibir el fallo.
2. **Transferencia.** Dos cuentas fake en memoria. Monto, origen, destino. Muestra la
   comisión ITF, el total debitado, el comprobante y los saldos nuevos. La app espera
   `latencia_simulada_ms` antes de pintar, para que parezca una llamada HTTP: **no hay red**.
   Las cuentas se reinician al cerrar la app; sin BD, sin cache.
3. **Tarjeta.** Un número de tarjeta fake. Valida por Luhn, muestra marca y enmascarado, y
   cifra con ChaCha20-Poly1305. El hex resultante debe ser idéntico al de las otras tres
   plataformas — y lo que cifra una descifra cualquier otra.
4. **Benchmark.** Ejecuta el core N veces y reporta p50/p95 contra una implementación
   equivalente nativa que vive solo en el código de test.
5. **Pie de pantalla:** `coreVersion()` visible en todas. En la demo se compara con las
   otras tres apps: mismo string = mismo build.

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