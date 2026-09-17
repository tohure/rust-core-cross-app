# Fase 6 — Hardening: contrato v2.4.0 y `apps/android`

Estado: **aprobado**, pendiente de plan.
Fecha: 2026-09-16.
Rama: `feat/phase-6-hardening`.

## Por qué existe esta fase

Las seis fases anteriores cerraron la POC: el núcleo existe y las cuatro apps lo consumen.
Lo que queda es lo que cada fase anotó en su `PENDING.md` en vez de resolver — decisiones
tomadas, no olvidos. Esta fase empieza a cerrarlas.

El inventario se rehízo **contra el código**, no copiando los documentos, y eso ya pagó:
dos de los cuatro `PENDING.md` le mienten al código.

- `apps/android/PENDING.md` declara `ndk.abiFilters` como no aplicado. Está aplicado desde
  hace tiempo, con comentario propio, en `apps/android/app/build.gradle.kts`.
- `apps/react-native/PENDING.md` declara abierta la reverificación cruzada de Android e iOS
  tras desactivar `getrandom`. Se cerró en la Task 14 de la Fase 5, y la evidencia vive solo
  en el ledger.

De los treinta y pico de ítems verificados en los cuatro documentos, esos dos son los únicos
desactualizados. El resto sigue vigente tal como está escrito.

## Alcance

Dos bloques, en este orden, y el orden es una dependencia real:

- **Bloque 0 — contrato v2.4.0.** Toca las cinco bases de código, pero solo en lo mínimo que
  el cambio de contrato obliga. Termina con una regeneración de los cuatro artefactos.
- **Bloque 1 — `apps/android`.** Cierra los pendientes de esa app. No toca el core, no toca
  el contrato y **no regenera ningún artefacto**.

Los pendientes de iOS, React Native y Angular quedan para sus propias fases, que reusarán las
decisiones de ésta y necesitarán un plan chico cada una.

### Fuera de alcance, explícito

CI para el repositorio; Web Worker para el benchmark de Angular; e2e con Detox para React
Native; desanclar uniffi 0.31 (lo bloquea `uniffi-bindgen-react-native` aguas arriba); partir
el target de iOS en dos; y cerrar el hueco de las guardias del test de contrato de Rust, que
`rust-core/PENDING.md` documenta con su prueba por mutación y decide no cerrar.

## Bloque 0 — contrato v2.4.0

### El defecto

`contracts/messages.es.json` tiene una sola clave, `Cifrado`, con el texto «No se pudo cifrar
los datos de la tarjeta.». Las cuatro apps la muestran también cuando lo que falló fue un
**descifrado**: la pantalla de Tarjeta tiene un bloque entero para pegar el hex producido por
otra plataforma, y ése es justamente el que la demo ejercita en vivo.

En el core, `DomainError::Encryption { detail }` cubre las dos direcciones
(`rust-core/crates/domain/src/error.rs:33`) y `contract_name()` la mapea a `"Cifrado"`
(`:53`).

### Por qué no se puede arreglar dentro de una sola app

`contracts/cases.json` es **un archivo único que las cinco bases de código leen**, y las cinco
asertan su versión: `rust-core/crates/ffi/tests/contract.rs:148`,
`apps/android/.../ContractTest.kt:49` y `ContractAssetsTest.kt:23,33`,
`apps/ios/.../ContractTest.swift:19` y `ContractFixtures.swift:41`,
`apps/react-native/__tests__/contract.napi.test.ts:25` y `contract.wasm.test.ts:58`, y
`apps/web-angular/src/app/core/contract.spec.ts:40`.

En el instante en que `cases.json` sube a 2.4.0, el test de contrato de las cuatro apps se
pone rojo aunque no se toque una línea de sus fuentes. Es exactamente lo que el `CLAUDE.md`
manda: un cambio de contrato se propaga a los cuatro consumidores en el mismo cambio.

Por eso es un bloque propio y por eso va primero.

### El cambio

1. **Core.** `DomainError` gana `Decryption { detail: String }`; `contract_name()` la mapea a
   `"Descifrado"`. `decrypt` pasa a devolverla; `encrypt` conserva `Encryption`.
2. **`contracts/cases.json` → v2.4.0.** Un grupo nuevo, `descifrado`, con dos casos: un hex
   bien formado pero no descifrable con la clave de la demo, y un hex mal formado. Ambos
   esperan `"Descifrado"`.
3. **`contracts/messages.es.json` → v1.2.0.** Clave `Descifrado` nueva, y el texto de
   `Cifrado` deja de tener que servir para las dos direcciones.
4. **`rust-core/README.md`.** La tabla de mensajes que las cuatro apps copian es la copia
   gemela de ese archivo; `messages.es.json` lo dice en su campo `_fuente`. Se actualiza en el
   mismo cambio o quedan divergentes.
5. **Las guardias del test de contrato, en las cinco bases.** Conteo de casos por grupo, set
   de claves de primer nivel, y la lista de nombres de error esperados. En Rust son
   `contract.rs:165`, `:210` y `:329`; las otras cuatro tienen su espejo.
6. **El mapeo de error, en las cuatro apps.** Es exhaustivo, como expresión y sin rama `else`
   — `ContractMessages.kt` en Android y sus equivalentes—, así que **la compilación se rompe
   sola**. No es un efecto colateral: es el mecanismo que el proyecto diseñó para que una
   variante nueva no pase en verde, y esta fase es la primera vez que se ejercita de verdad.

### Aditivo, y eso importa para la auditoría

No hay ningún vector de descifrado fallido en el contrato de hoy: el grupo `tarjeta` tiene seis
casos y ninguno ejercita `decrypt`. El bump entonces **no corrige ni un solo valor esperado**,
que es la clase de cambio que el `CLAUDE.md` obliga a justificar aritméticamente en un commit
propio. Solo agrega.

Aun así, el cambio a `cases.json` y a `messages.es.json` va en **su propio commit**, separado
de los cambios al core y a las apps. Es la única forma de auditar después si el contrato se
dobló para que pasara el código.

### La regeneración, y qué la hace necesaria

Una variante nueva en el enum de error cambia la superficie del FFI. Las cuatro apps consumen
artefactos generados y versionados; hasta que se regeneren, sus bindings no conocen
`Decryption`. Por eso este bloque termina regenerando **los cuatro desde el mismo HEAD**, que
es además lo único que vuelve a alinear los cuatro pies de `coreVersion()` — el string es
`<semver>+<SHA corto>`, inyectado en compilación por `rust-core/crates/ffi/build.rs`.

Esa regeneración necesita un paso documentado que hoy no existe como tal: los comandos viven
repartidos por plataforma en `rust-core/BUILD.md`. Ver "Documentación", más abajo.

### Riesgo de ejecución, dicho de frente

El bloque no se puede declarar terminado sin correr los cuatro tests de contrato, y dos de
ellos necesitan hardware: Android pide dispositivo o emulador y iOS pide Xcode con un aparato
o simulador. React Native y Angular corren en Node. **Ese es el cuello de botella de la fase**,
no la escritura del código.

## Bloque 1 — `apps/android`

### Estructura: el módulo `:core-financiero`

Hoy `:app` es un monolito que conoce JNA, ve las `.so` y compila contra los bindings
generados. El módulo nuevo es una Android Library que se lleva:

- los bindings generados y las `.so`,
- la dependencia de JNA,
- el adapter (`CoreFinanciero`, `UniffiCoreFinanciero`),
- `ContractMessages` y `contractName()`,
- las fuentes de contrato (`AssetContractSource`, `AssetMessageSource` y sus interfaces),
- la tarea Gradle que copia `contracts/*.json` a los assets.

`:app` queda con Compose, los cuatro ViewModels, `MoneyFormatter` y `AppContainer`, y **deja
de declarar JNA**. Los cambios de UI dejan de reevaluar la capa FFI, y si algún día se adopta
KMP, `:core-financiero` es el `androidMain` sin tocar la UI.

Es la recomendación que `apps/android/PENDING.md` marca con prioridad Alta, y es el mismo
desacople que `apps/react-native` ya tiene conseguido por frontera de paquete.

### Los generados dejan de mezclarse con el código escrito a mano

Se mudan a `src/generated/java` y `src/generated/jniLibs` dentro del módulo, declarados en
`sourceSets` y marcados en `.gitattributes` como generados.

**Siguen versionados.** La alternativa ortodoxa —generarlos en `build/generated/`— haría que
un `./gradlew clean` o un checkout nuevo rompiera la compilación hasta correr el paso de Rust,
y eso se descubre el día de la demo. Es un `git mv`: los bytes del `.so` no cambian y el pie
de `coreVersion()` no se mueve.

### No hay tareas Gradle que corran `cargo`

`apps/android/PENDING.md` lo recomienda con prioridad Media. **Se descarta**, y la razón no es
pereza: automatizar la generación dentro del build de Android hace que Android regenere el core
en cada compilación y su pie deje de coincidir con iOS, React Native y Angular, cuyos artefactos
están congelados. El primer paso del runbook de demo es justamente que los cuatro coincidan.

La generación se queda como **un paso manual documentado** en `rust-core`, que produce los
artefactos de las cuatro plataformas de una vez.

### Las dos suites se reparten donde corresponde

Al módulo: el test de contrato, el smoke de carga de la librería, los tests de las fuentes de
assets y el de `ContractMessages`. En `:app`: los cuatro tests de ViewModel con
`FakeCoreFinanciero`, y el de `MoneyFormatter`.

### Los seis arreglos

Cada uno con su test antes que el código, como manda `superpowers:test-driven-development`.

1. **El `runCatching` del adapter real, verificado.** Hoy ninguna suite comprueba que
   `UniffiCoreFinanciero` convierta una excepción del core en `Result.failure` contra la
   librería real: `CoreFinancieroAdapterTest` corre en la JVM sobre `FakeCoreFinanciero`, y el
   test de contrato llama a uniffi directamente, sin pasar por el adapter. Se cierra con un
   test instrumentado en el módulo que fuerza un error del core, verifica que vuelve como
   `Result.failure` con un `DomainException`, y que `ContractMessages` lo traduce al texto del
   contrato. Es el único ítem cuya evidencia hoy es «se probó a mano una vez».
2. **El estado sobrevive a la rotación.** `viewModel()` con factory en vez de `remember`, y
   `rememberSaveable` para la pestaña activa. Es el ítem 7 de la evaluación técnica: baja en
   una POC, alta en producción.
3. **La guardia del `@Immutable`.** Los `Record` de uniffi son `data class` con propiedades
   `var`; `@Immutable` anula la inferencia de Compose y se cumple solo porque la app nunca muta
   un `Account` en el lugar. Un test JVM parsea el binding generado, extrae los campos `var` de
   los cinco `data class` y falla si encuentra una asignación a esos campos en `ui/`. La lista
   sale de los propios bindings, así que no se pudre al regenerarlos. Se descartó un módulo de
   Android Lint propio: es la respuesta de producción, y acá sería un módulo Gradle entero para
   cazar un error que nadie comete todavía.
4. **El benchmark, con locale fijo y con voz.** `"%.2f µs".format(...)` usa el locale por
   defecto: en un dispositivo es-PE muestra coma decimal, mientras React Native usa `toFixed(2)`
   y siempre da punto. Pasa a `Locale.ROOT`. Y con 0 iteraciones, donde hoy retorna en silencio,
   adopta el mensaje explícito que React Native ya muestra.
5. **El hex en mayúsculas.** `docs/ui-spec.md:226` acepta solo `[0-9a-f]`; iOS lo cumple y
   Android no: `CardViewModel.kt:44-46` acepta `A-F` y normaliza con `lowercase()`. **Android
   se alinea a la spec**, porque el que diverge es Android.
6. **Los tres minors.** El default `nextEncrypt` de `FakeCoreFinanciero` pasa al hex de 64
   caracteres del contrato, que es lo que su propio comentario promete; `AssetSourcesTest`
   aserta el `balance` de la segunda cuenta; y se mide el APK de **release**, que es lo único
   que el benchmark de la Fase 2 dejó sin medir, con el número anotado en `TESTING.md`.

## Documentación

### Un paso único para generar el core

`rust-core` gana un paso documentado —«generar el core que consumen las cuatro apps»— que
produce de una vez los artefactos de Android, iOS, React Native y wasm. Hoy esos comandos
viven repartidos por plataforma en `rust-core/BUILD.md` y nadie tiene la secuencia completa a
la vista.

Cada `README.md` de app gana, antes de sus propios pasos, un renglón que dice que el binario
de Rust se genera primero y apunta ahí. Sin eso, quien clone el repo dentro de seis meses no
tiene forma de saber en qué orden va.

### Los `PENDING.md` dejan de repetirse

Hay cuatro documentos diciendo lo mismo con redacciones distintas. Se crea
**`docs/cross-app-pending.md`**, dueño único de lo que no es de ninguna app en particular:

- el benchmark que falta repetir en dispositivo físico, que bloquea a iOS y a React Native por
  igual;
- la ausencia de CI, que es de las cinco bases de código;
- el `catch` genérico que guarda texto de diagnóstico como mensaje de usuario, presente en
  Android y en iOS (en Android el fallback `?: e.toString()` **no** se dispara para un
  `DomainException` —`ContractMessages` cubre las nueve variantes— sino para cualquier otro
  `Throwable`, que en la práctica es una excepción de JNA);
- las tres divergencias de paridad que encontró la Fase 4: el hex en mayúsculas, el subtítulo
  de Tarjeta de `docs/ui-spec.md:195` que se autolista entre las plataformas, y el
  comportamiento con 0 iteraciones;
- la regla de que un `Record` de uniffi se trata como inmutable, que vale en las cuatro apps.

Cada `PENDING.md` de app conserva **solo lo suyo** —el módulo Gradle es de Android, `ng serve`
es de Angular, JSI es de React Native— y para lo demás pone un renglón que apunta al archivo
transversal. Un tema, un dueño, ninguna copia.

Y se corrigen las dos mentiras: el `abiFilters` de Android y la reverificación cruzada de
React Native.

### El `CLAUDE.md` gana la Fase 6

Con sus dos bloques, su rama y el estado de cada uno. La tabla de fases es lo primero que lee
quien vuelve al repo.

## Criterios de aceptación

**Bloque 0:**

- Los cinco tests de contrato en verde contra `cases.json` v2.4.0, con los dos casos nuevos de
  `descifrado` verificados en las cinco bases.
- `messages.es.json` v1.2.0 y la tabla de `rust-core/README.md` idénticas.
- Los cuatro artefactos regenerados desde el mismo HEAD, y los cuatro pies de `coreVersion()`
  mostrando el mismo string.
- El cambio al contrato, en su propio commit.

**Bloque 1:**

- `:app` no declara JNA y no importa `uniffi.*` en ningún archivo.
- Ningún test se pierde en la mudanza: los 43 de hoy siguen existiendo y en verde, repartidos
  entre los dos módulos. El conteo total sube, no baja — el Bloque 0 le agrega al test de
  contrato los dos casos de `descifrado`, y este bloque suma el instrumentado del adapter real
  y la guardia del `@Immutable`.
- La app rota sin perder el estado ni la pestaña.
- `README.md` con los comandos **efectivamente ejecutados** y el diagrama Mermaid mostrando el
  módulo nuevo; `CONTEXT.md` con la estructura al día; `PENDING.md` recortado.

## Ejecución

`superpowers:writing-plans` produce el plan del Bloque 0 y el del Bloque 1. La ejecución es
mixta: Opus para el contrato, la frontera FFI y las decisiones de estructura; Sonnet para lo
mecánico —mover archivos, repartir suites, los minors—. Cierre con
`superpowers:verification-before-completion` y `superpowers:requesting-code-review`.

## Referencias

- Inventarios verificados de los cuatro `PENDING.md`, hechos contra el código en esta sesión.
- [Comprehensive Rust](https://google.github.io/comprehensive-rust/) — el curso de Google,
  aportado como material de apoyo. Su capítulo de Android apunta a AOSP con Soong y JNI a mano,
  no a Gradle con uniffi, así que no cambia ninguna decisión de este spec; sirve como
  referencia de Rust para quien toque `crates/domain`.
