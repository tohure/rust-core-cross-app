# Partir `apps/ios` en dos targets — diseño

**Fecha:** 2026-09-17
**Rama:** `feat/ios-target-split`
**Estado:** aprobado, pendiente de ejecución
**Subproyecto:** `apps/ios/`

Cierra el último ítem de deuda técnica estructural que quedaba abierto en
[apps/ios/PENDING.md](../../../apps/ios/PENDING.md): iOS es la única de las cuatro apps
que sigue siendo un target único con el borde FFI mezclado con la presentación.

---

## 1. Por qué, y una corrección al PENDING

`apps/ios/PENDING.md` justifica este trabajo con esta frase:

> si `Generated/` y el XCFramework vivieran en otro target, un test de presentación que
> intentara llamar al core real **no compilaría**, y la disciplina dejaría de depender de
> la revisión.

**Esa frase es falsa y se corrige en este mismo cambio.** El bundle de tests hostea en la
app (`TEST_HOST`), la app enlaza el framework, y los tests de ViewModel tienen que
importarlo igual porque `ContractMessages`, `ValidCci`, `Account` y `DomainError` viven
ahí — `FakeCoreFinanciero` devuelve `ValidCci`. Una vez que el archivo escribe
`import CoreFinancieroKit`, `UniffiCoreFinanciero()` compila sin quejas.

En Android el seam lo cierra el **runtime**, no el compilador: un test de JVM que toque el
core real falla al cargar la `.so`. iOS no tiene ese mecanismo porque el core se enlaza
estáticamente y está disponible siempre. Ningún split de targets lo cambia.

Lo que el split sí compra, que es la justificación real:

1. **El `import` explícito como marcador.** `import CoreFinancieroKit` en la cabecera de un
   archivo dice de un vistazo quién toca el core. Es más débil que un error de compilación,
   pero es grep-able y aparece en el diff, que es donde la revisión mira.
2. **Paridad estructural con las otras tres apps.** `:core-financiero` en Android, frontera
   de paquete en React Native, paquete del workspace en Angular. Que las cuatro tengan la
   misma forma es lo que hace comparable el code review, y es un argumento que esta POC ya
   usa en otros lados.
3. **Caché de compilación.** La presentación deja de recompilarse cuando se regeneran los
   bindings.
4. **Un lugar donde encajaría un `iosMain` de KMP** sin tocar la UI.

Lo que **no** compra, dicho para que nadie lo escriba de nuevo: no impone el seam por
compilador, y no aísla los tests del core real.

## 2. Alcance

**Dentro:**

- Un target nuevo, `CoreFinancieroKit`, framework estático.
- Mudanza física de `Adapter/`, `Contract/` y `Generated/core_financiero.swift`.
- Los `public` que la mudanza obliga.
- Los `import` en los 21 archivos que quedan del otro lado de la frontera.
- Actualización de `.gitignore`, `BUILD.md`, `CONTEXT.md`, `README.md` y `PENDING.md`.

**Fuera:**

- Una segunda suite de tests (`CoreFinancieroKitTests`). Evaluada y descartada: con
  framework estático habría que resolver el doble enlace del `.a`, y como el seam no queda
  impuesto igual, el riesgo no compra nada.
- Swift Package Manager. Sigue fuera de alcance por las mismas razones que ya dice el
  PENDING: el XCFramework se referencia directo y empaquetarlo agrega una capa que nadie
  consume.
- Cualquier cambio de comportamiento, de UI o de contrato.

## 3. El nombre

`CoreFinancieroKit`. Hay dos colisiones que evitar:

- `CoreFinanciero` ya es el nombre del **protocolo** del adapter. Un módulo homónimo
  obligaría a escribir `CoreFinanciero.CoreFinanciero` para desambiguarlo.
- `CoreFinanciero.xcframework` ya existe en `apps/ios/`. Un `CoreFinanciero.framework` al
  lado, en el mismo directorio de productos, se presta a confusión.

Se descartó `CoreFinancieroFFI` porque se parece demasiado a `core_financieroFFI`, que es
el módulo C del modulemap del XCFramework; confundir los dos en un error de compilación
cuesta tiempo.

## 4. Estructura resultante

```
apps/ios/
├── CoreFinanciero.xcframework/        lo que produce rust-core (gitignored)
├── Generated/include/                 headers + modulemap (gitignored)
├── CoreFinancieroKit/                 ← TARGET NUEVO
│   ├── Adapter/CoreFinanciero.swift           protocolo, 9 funciones
│   ├── Adapter/UniffiCoreFinanciero.swift     implementación real
│   ├── Adapter/ContractMessages.swift         + extension DomainError.contractName
│   ├── Contract/ContractSource.swift
│   ├── Contract/MessageSource.swift
│   ├── Contract/BundleContractSource.swift
│   ├── Contract/BundleMessageSource.swift
│   └── Generated/core_financiero.swift        generado (gitignored)
├── ios-rust-test/                     app
│   ├── AppContainer.swift
│   ├── ios_rust_testApp.swift
│   ├── Assets.xcassets/
│   ├── Format/MoneyFormatter.swift
│   └── UI/…
└── ios-rust-testTests/                una sola suite, sin cambios de ubicación
```

`Format/MoneyFormatter.swift` se queda en la app: está verificado que no referencia ningún
tipo del core, así que no gana `import`.

Las dos `Bundle*Source` se mudan **sin cambiarles la forma**, porque ya reciben el `Bundle`
por parámetro: producción pasa `.main`, los tests pasan el suyo. Por eso las Run Script
Phases que copian `contracts/*.json` **no se tocan** y siguen en la app y en el bundle de
test.

Acá divergimos de Android a propósito y conviene decirlo: allá los `contracts/*.json` viven
en los assets del módulo `:core-financiero`, porque los assets de una librería Android se
mergean en el APK. Un framework estático de iOS no embarca recursos, así que el único lugar
posible es el bundle de la app.

## 5. El target

`PBXNativeTarget` `CoreFinancieroKit`, `productType = com.apple.product-type.framework`,
con un `PBXFileSystemSynchronizedRootGroup` propio apuntando a `CoreFinancieroKit/`.

Ajustes deliberados:

| Ajuste | Valor | Por qué |
|---|---|---|
| `MACH_O_TYPE` | `staticlib` | Ver abajo. |
| `DEFINES_MODULE` | `YES` | Para que `import CoreFinancieroKit` exista. |
| `SKIP_INSTALL` | `YES` | No se distribuye por separado. |
| `IPHONEOS_DEPLOYMENT_TARGET` | `17.0` | Igual que la app. |
| `SWIFT_VERSION` | `5.0` | Igual que la app. |
| `SWIFT_DEFAULT_ACTOR_ISOLATION` | `MainActor` | **Load-bearing.** |
| `SWIFT_APPROACHABLE_CONCURRENCY` | `YES` | Idem. |
| `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY` | `YES` | Idem. |

Los tres últimos se copian tal cual del target de la app, y no es cosmético: si el módulo
nuevo tiene otro aislamiento de actor por defecto, el adapter cambia de semántica al cruzar
la frontera de módulo y la app deja de compilar **por concurrencia, no por el split**. El
error aparece lejos de su causa.

### Estático, no dinámico

Es la decisión con más consecuencias del diseño. El número que la POC publica para iOS
—**0,062 µs de piso de cruce**, la cifra más contundente de
[docs/cross-app-pending.md](../../cross-app-pending.md)— depende de que el `.a` quede
enlazado estáticamente dentro del binario de la app. Un framework dinámico mete indirección
de `dyld` en cada llamada al core: cambiaría esa cifra y dejaría mintiendo al cuadro de los
cuatro puentes. Estático además evita la fase de embeber y firmar.

El `CoreFinanciero.xcframework` pasa a la fase Frameworks de `CoreFinancieroKit` **y se
queda también en la de la app**: un framework estático no resuelve símbolos, el enlace final
lo hace el binario de la app, así que el `.a` tiene que estar en los dos lados.

## 6. La superficie pública

39 declaraciones pasan a `public`, más un `init` que hay que escribir:

- `protocol CoreFinanciero` y sus 9 métodos.
- `struct UniffiCoreFinanciero` y sus 9 métodos, más un **`public init()` escrito a mano**:
  hoy usa el memberwise implícito, que es `internal`, así que sin esto `AppContainer` no
  puede construirlo.
- `struct ContractMessages`: `init(source:)`, las dos sobrecargas de `userMessage`, y
  `static let fallback`.
- `extension DomainError { var contractName: String }`.
- `protocol ContractSource` (3 métodos) y `protocol MessageSource` (1 método).
- `struct BundleContractSource` y `struct BundleMessageSource`, con sus
  `init(bundle:) throws` y sus métodos.

Quedan `internal` a propósito los dos `enum LoadError` anidados: está verificado que nadie
los nombra desde fuera, y un `struct` público puede lanzar un error interno sin problema
porque los errores viajan como `any Error`.

El `core_financiero.swift` generado ya sale `public` de uniffi: no se toca, como siempre.

### Por qué no `@testable import CoreFinancieroKit`

Usarlo ahorraría la mitad de estos `public`, y aun así se descarta. `ENABLE_TESTABILITY`
solo está activo en la configuración **Debug**, y la Fase 7 midió el benchmark de iOS **en
Release sobre un iPhone 12**. Con `@testable` esa corrida dejaría de compilar y perderíamos
la única forma de reproducir los números publicados. Se paga la verbosidad para no romper
la reproducibilidad de la medición.

## 7. Los imports

12 archivos de la app y 9 de test ganan `import CoreFinancieroKit`:

**App:** `AppContainer.swift`, y en `UI/`: `Arithmetic/{View,ViewModel}`,
`Benchmark/{View,ViewModel}`, `Card/{View,ViewModel}`, `Components/Components`,
`Navigation/BancoApp`, `Transfer/{UiState,View,ViewModel}`.

**Tests:** `ArithmeticViewModelTest`, `BenchmarkViewModelTest`, `CardViewModelTest`,
`ContractMessagesTest`, `ContractTest`, `CoreSmokeTest`, `FakeCoreFinanciero`,
`FfiCostProbe`, `TransferViewModelTest`. Conservan su `@testable import ios_rust_test`.

`ContractFixtures.swift`, `MoneyFormatterTest.swift` y `ios_rust_testTests.swift` no lo
necesitan.

Dentro de `UniffiCoreFinanciero`, los 9 prefijos `ios_rust_test.add(...)` —que desambiguan
la función global del método homónimo del `struct`— pasan a `CoreFinancieroKit.add(...)`.
El comentario del archivo que explica el prefijo se actualiza con el nombre nuevo.

## 8. Cómo se ejecuta la cirugía

Con el gem **xcodeproj 1.27.0**, ya instalado. Está verificado que soporta
`objectVersion = 77` y los `PBXFileSystemSynchronizedRootGroup` de este proyecto: un
round-trip de abrir y re-guardar sobre una copia deja **12 líneas de diff cosmético** (agrega
`exceptions = ()` vacío en los grupos sincronizados, quita `packageProductDependencies = ()`
vacío en los targets). Ese ruido entra al diff del PR y es esperado.

El script Ruby vive en el scratchpad y **no se commitea**: no es re-ejecutable —una vez
aplicado, el target ya existe— y versionarlo sería ceremonia. Lo que queda versionado es el
`project.pbxproj` resultante y la descripción de la estructura de targets en `BUILD.md`,
que es lo que alguien necesita dentro de seis meses.

## 9. Verificación

**No hay test nuevo, y se dice explícito en vez de inventar uno.** Es un refactor sin cambio
de comportamiento: la red es la suite que ya existe, y el riesgo real —que el enlace estático
se rompa— lo cazan `CoreSmokeTest` y las 31 del contrato, que son justamente las que cruzan
el FFI.

La barra para cerrar el PR:

1. `xcodebuild test` **sobre el iPhone físico**, no simulador: el slice `aarch64-apple-ios`
   es un binario distinto del de simulador y es el que este cambio pone en riesgo. **54 en
   verde**, con el contrato 31/31.
2. `coreVersion()` en el pie de la app iOS muestra **el mismo string** que la app Android
   corriendo en el aparato conectado. Es el paso 1 del
   [runbook de demo](../../demo-runbook.md) y confirma que no se regeneró nada a medias.

No se re-mide el benchmark. Si alguien quiere confirmar que el framework estático no agregó
indirección, la corrida es `FfiCostProbe` en Release sobre el iPhone 12 y el número a igualar
es 0,062 µs de piso / 0,42 µs de `add`.

## 10. Riesgos, en orden de probabilidad

1. **El enlace del `.a` desde un framework estático.** Es el punto donde más probable es que
   pelee. Planes B en orden: dejar el xcframework enlazado solo por la app; si no, agregar
   `-force_load` en `OTHER_LDFLAGS` del target de la app. Lo caza `CoreSmokeTest` en la
   primera corrida.
2. **`core_financieroFFI` filtrándose al `.swiftmodule` de la app.** No debería: la API
   pública del kit es Swift puro (`Account`, `ValidCci`, `DomainError`, `String`). Si filtra,
   hay que propagar el `FRAMEWORK_SEARCH_PATHS` que resuelve el modulemap.
3. **Mismatch de aislamiento de actor** entre módulos. Mitigado copiando los tres ajustes de
   la sección 5; si igual aparece, el síntoma es un error de concurrencia en la app, no en el
   kit.
4. **El perfil de aprovisionamiento gratuito vence a los 7 días.** Puede pedir
   `-allowProvisioningUpdates` y confiar el certificado en el aparato. Los mensajes exactos
   están en [apps/ios/TESTING.md](../../../apps/ios/TESTING.md).

## 11. Documentos que cambian

| Archivo | Qué |
|---|---|
| `.gitignore` | `/apps/ios/ios-rust-test/Generated/` → `/apps/ios/CoreFinancieroKit/Generated/` |
| `apps/ios/BUILD.md` | El `mv` del paso de generación, el árbol de directorios, y la estructura de targets |
| `apps/ios/CONTEXT.md` | El árbol de la sección de estructura y la prohibición de editar generados |
| `apps/ios/README.md` | El diagrama Mermaid, que hoy no muestra frontera de módulo, y los comandos |
| `apps/ios/PENDING.md` | Cierra el ítem del target único **y corrige la premisa falsa de la sección 1** |

Los specs y planes de fases anteriores **no se reescriben**: son registro histórico de lo que
se decidió entonces.

`docs/cross-app-pending.md` no lista este ítem —vive en el PENDING de iOS— así que no se toca.

## 12. Commits

Conventional Commits en español, scope `ios`. Uno por tarea del plan, no uno por PR:

- `refactor(ios): nace el target CoreFinancieroKit con el borde FFI`
- `docs(ios): corregir la premisa del split y cerrar el ítem del target único`

Son dos y no tres: la mudanza, el target, los `public` y los `import` **no se pueden
partir en dos commits** sin dejar uno intermedio donde el proyecto no compila.
