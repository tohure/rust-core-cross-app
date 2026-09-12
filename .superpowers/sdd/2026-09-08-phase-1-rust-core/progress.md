# SDD ledger — plan: docs/superpowers/plans/2026-09-08-phase-1-rust-core.md

Spec: docs/superpowers/specs/2026-09-08-phase-1-rust-core-design.md (leída; es la autoridad)
Rama: feat/phase-1-rust-core · BASE de rama: 598cbf2

## Preflight scan (2026-09-08)

### Pares de tareas que comparten archivo o interfaz

| Par | Produce → consume | Hallazgo |
|---|---|---|
| T1 → T8 | `comprobante`/`latencia_simulada_ms` en cases.json → asserts de transfer.rs | OK: TRF-9047-1065-10000/350 y TRF-9047-1065-350000/750 coinciden literalmente |
| T1 → T11 | version 2.1.0 + nombres de campo → lecturas del golden | OK verificado contra el cases.json real: `version`, `_clave_demo_hex`, `_nonce_demo_hex`, `cuentas_iniciales`; los casos inválidos traen `error` y los válidos `esperado` |
| T2 → T3..T11 | `ErrorDominio` + `nombre()` (9 variantes) | OK: cada tarea usa solo variantes declaradas |
| T2 → T10 | `ffi/src/lib.rs` (andamiaje) → fachada completa | OK: T10 lo reescribe entero, incluido `#![forbid(unsafe_code)]` |
| T3 → T4, T8 | `parsear_monto`/`redondear`/`formatear` `pub(crate)` | OK: mismo crate |
| T4 → T8 | `itf_redondeado` `pub(crate)` | OK |
| T3..T8 → T9 | API pública → `tests/properties.rs` (test de integración) | OK: lib.rs reexporta los 7 símbolos que importa |
| T10 → T11 | superficie FFI + `nombre()` → golden | OK: `nombre()` es inherente y pública |
| T10 → T12 | 9 funciones exportadas → smoke de bindings | OK: T10 exporta exactamente esas 9 |
| T2 → T12 | `[[bin]] uniffi-bindgen` + `features=["cli"]` + cdylib | OK: declarados en T2 |
| T11 → repo | `include_str!("../../../../contracts/cases.json")` | OK: desde `crates/ffi/tests/` resuelve a la raíz |
| T12 → T13 | T12 dice "Modify README.md", creado recién en T13 | Inversión de orden — ver Ruling 4 |
| T13 → todas | greps de verificación final | Defecto — ver Ruling 3 |

### Consistencia interna de cada tarea

| Tarea | ¿Su texto concuerda consigo mismo? |
|---|---|
| T1 | Sí, salvo el `float` del chequeo (Ruling 2) |
| T2 | Sí: el test cubre 6 de 9 variantes, compila; el paso 6 prueba la frontera |
| T3-T7 | Sí: tests ↔ implementación ↔ casos del contrato coinciden |
| T8 | Sí: orden de validaciones (MismaCuenta → cuentas → monto → saldo) consistente con tr-003..tr-006 |
| T9 | Sí: rango 1..400_000 centavos deja casos Ok contra saldo 5000.00 |
| T10-T13 | Sí, con la salvedad del nombre del crate (Ruling 1) |

### Rulings

Ruling 1: el crate puro se llama `domain`, no `core` — un paquete llamado `core` hace que
`--extern core` tape al `core` de la stdlib dentro de `ffi`, y `#[derive(thiserror::Error)]`
(que expande a `::core::fmt`) no compila; verificado con un workspace de prueba que falla
con `core` y pasa con `domain`. El plan afirmaba lo contrario en "Notas de ejecución".
Corregidos plan y spec; `core_financiero` (el cdylib) NO cambia. Si me equivoco: hay que
renombrar el directorio y los `use` en ffi y properties.rs — mecánico, sin efecto en la API.

Ruling 2: el chequeo del contrato de T1 usa `decimal.Decimal` y no `float` — la restricción
global de no usar punto flotante vale también para scripts de verificación. Si me equivoco:
ninguno, el resultado numérico es el mismo.

Ruling 3: el grep de `unwrap()`/`expect()` de T13 se reemplaza por un `awk` que corta cada
archivo en su `#[cfg(test)]` — el original filtraba la línea `#[cfg(test)]`, no el bloque, y
habría dado falso positivo con los `unwrap()` legítimos de los tests. Si me equivoco: el
chequeo podría dejar pasar un `unwrap()` escrito después del bloque de tests.

Ruling 4: T12 no escribe `rust-core/README.md` (todavía no existe); anota los comandos que
funcionaron en su reporte y T13 los copia al README. Si me equivoco: T13 tendría que
re-ejecutar los comandos de bindings para documentarlos.

## Progreso

Task 1: complete (commits b5bd5bd..9733dae, review clean — spec ✅, quality Approved)
Task 1: minor (deferred): `centavos(monto)` no fija el renderizado del entero (¿`-50` o `-0050`?) — contracts/README.md:118
Task 1: minor (deferred): "redondeado a 2 decimales por 100, sin decimales" se lee ambiguo — contracts/README.md:118
Task 1: minor (deferred): `latencia_simulada_ms` no documenta su tipo (entero sin signo, ms) — contracts/README.md:117
Task 1: minor (deferred): la regla de semver no cubre "agregar campos a un esperado existente" — contracts/README.md:165
Task 1: minor (deferred): el cuerpo del commit 9733dae omite los guiones de la fórmula del comprobante — historia, no se reescribe
Task 1: minor (deferred): CLAUDE.md:169 dice "v2.0.0 con 26 casos" y se puede leer como estado actual
Task 1: Ruling: los minors 1-4 se corrigen en la Task 13, en un commit `docs(contracts):` aparte del cierre de fase — son prosa normativa que leen las Fases 2 a 5, no valores esperados. Si me equivoco: la ambigüedad de padding llega a la Fase 4/5 y se descubre con un string distinto en pantalla.
Task 1: Ruling: el concern del implementador sobre cobertura estrecha (ambos casos válidos usan montos `.00`) se cubre en la Task 8 con una unitaria del comprobante para un monto con centavos ≠ 0, derivada de la fórmula normativa de contracts/README.md, SIN tocar cases.json. Si me equivoco: sobra un test unitario.
Task 1: Ruling: CLAUDE.md:169 se actualiza en la Task 13, que ya toca ese archivo. Si me equivoco: queda una línea histórica que se lee como estado actual.

## Cambio de regla del usuario (2026-09-08, durante la Task 2)

El usuario pidió, mientras corría la Task 2, que **todos los identificadores vayan en
inglés** (funciones, variables, interfaces, tipos, campos, constantes, nombres de test) y
que solo comentarios y docs queden en español. Contradecía `CLAUDE.md`, que mandaba lo
contrario ("lenguaje ubicuo, no traducible"). Manda el usuario.

Le pregunté el alcance porque había una frontera con consecuencias reales — `cases.json`
lo comparan cinco bases de código por igualdad exacta de strings. **Eligió: código en
inglés, contrato intacto en español.**

Ruling 5: `contracts/cases.json` no se toca (sigue v2.1.0, claves y nombres de error en
español) y el puente vive en un solo lugar: `DomainError::contract_name()` devuelve el
string del contrato. Costo si me equivoco: si después se quisiera el contrato en inglés,
es un major que obliga a tocar las cinco bases de código a la vez.

Ruling 6: las siglas `cci` e `itf` no se traducen (son nombres propios), pero llevan
prefijo en inglés: `validate_cci`, `calculate_itf`, `ITF_RATE`. Costo si me equivoco:
renombrar dos funciones y una constante.

Ruling 7: los mensajes de error al usuario (`#[error("...")]`) quedan en español —
son texto de UI, no identificadores. Costo si me equivoco: traducir nueve strings.

Ruling 8: reescribí el plan (29 bloques de código), agregué la tabla de mapeo a la spec y
corregí la regla de idioma en `CLAUDE.md`, en un commit aparte (c7533b0), antes de seguir.
El plan es de donde salen los briefs: dejarlo en español habría propagado la convención
vieja a las once tareas que faltan. Costo si me equivoco: el renombre masivo tocó texto que
no debía; mitigado protegiendo literales de string y comentarios, y verificado con greps.

Ruling 9: `contracts/README.md` conserva su prosa y su pseudocódigo en español (documenta
el contrato, cuyas claves son españolas), pero sus referencias a funciones del core
(`ejecutar_transferencia`) quedan obsoletas: se actualizan a los nombres en inglés en el
commit `docs(contracts):` que ya tenía programado la Task 13. Costo si me equivoco: queda
una referencia a un nombre de función que no existe.

Task 2: renombre despachado al mismo implementador (agente ac32ac7), brief regenerado.

Task 2: complete (commits 9733dae..5b2ca9b, review clean — spec ✅, quality Approved)
Task 2: ⚠️ del revisor resuelto por el controlador: agregué `#[uniffi::export]` a domain/src/lib.rs,
  `cargo build -p domain` falló con `cannot find module or crate 'uniffi'`, revertí y volvió a compilar.
  La frontera la hace cumplir el compilador, verificado en el repo real.
Task 2: minor (deferred): el test cubre 6 de 9 variantes; UnknownBank, Encryption y OutOfRange
  las ejercitan las Tasks 5, 7 y 6/8 respectivamente — confirmar ahí.
Task 2: minor (deferred): el commit 3674915 quedó con dos trailers Co-Authored-By; no se reescribe historia.

Task 3: complete (commits 5b2ca9b..38abfcd, review clean — spec ✅, quality Approved)
Task 3: minor (deferred): ningún test ejercita el camino OutOfRange (desbordamiento de Decimal)
Task 3: minor (deferred): ningún test distingue MidpointAwayFromZero de banker's rounding — lo cubre la Task 4 (0.175 → 0.18)
Task 3: minor (deferred): `format!("{field}: {e}")` embebe el Display en inglés de rust_decimal dentro de un mensaje en español
Task 3: Ruling: el test de desbordamiento se agrega en la Task 9, donde la spec (D5) dice que un proptest cubre OutOfRange — el plan de esa tarea no lo incluía. Costo si me equivoco: un test de más en el archivo equivocado.
Task 3: Ruling: el fragmento en inglés de rust_decimal en `detail` se deja como está — es diagnóstico, y CLAUDE.md pone el mapeo a mensaje de usuario en la capa de UI. Queda para que lo triage el review final. Costo si me equivoco: un consumidor muestra un string mezclado.

Task 4: review 1 — spec ❌ / quality Needs fixes. Hallazgo Important (plan-mandated): el test
  `rounds_half_away_from_zero_not_to_even` y su comentario afirmaban que itf-002 (0.175) distingue
  MidpointAwayFromZero de banker's rounding. Falso: banker's redondea al dígito PAR y entre 0.17 y
  0.18 el par es el 8, así que ambas dan 0.18. Ninguno de los cuatro casos itf discriminaba.
Task 4: Ruling: la afirmación falsa también vivía en `contracts/README.md:81-82`, que es normativo
  para las cuatro plataformas. Se corrige, y se agrega al contrato el caso que sí discrimina —
  itf-005: 2500.00 → 0.125 → "0.13" (banker's daría 0.12) — subiendo cases.json a v2.2.0 en su
  propio commit con la justificación aritmética. Sin ese caso el golden no puede cazar el error de
  redondeo que dice cazar, que es la evidencia central de la POC. Costo si me equivoco: un caso de
  más en un contrato de datos dummy, trivial de sacar.
Task 4: fix round 1 despachado al mismo implementador (agente a46bc79), en dos commits separados
  (contrato / core), como exige CLAUDE.md.
Task 4: plan y spec alineados por el controlador en d18774b (v2.2.0, 27 casos, comentario del test).
Task 4: fix round 1/5 (1 addressed, 0 open; commits 54751fc..091ec16 — itf-005 en el contrato v2.2.0,
  contracts/README.md corregido, comentario del test corregido, dos commits separados como manda CLAUDE.md)
Task 4: complete (commits 38abfcd..091ec16, review clean tras el fix)
Task 4: el controlador verificó el cuerpo del commit de contrato (ffcf5e5) que el re-review no podía ver:
  lleva la justificación aritmética completa de itf-002 y itf-005.

Task 5: review 1 — spec ✅ / quality Needs fixes. Hallazgo Important (plan-mandated): con 20 caracteres
  y uno no numérico, el error salía `Length { expected: 20, received: 20 }` → "se esperaban 20 dígitos,
  llegaron 20", contradictorio. El dígito de control y el orden de validaciones: verificados a mano por
  el revisor contra contracts/README.md (recalculó d19/d20 de cci-001 y cci-002).
Task 5: Ruling: `received` pasa a contar dígitos ASCII en vez de caracteres. El contrato no fija ese
  campo (compara por nombre de error), así que es libre de mejorar, y el mensaje lo ven las cuatro apps.
  No se toca el enum, ni el contrato, ni el caso cci-004 (18 dígitos sigue dando 18). Costo si me
  equivoco: un mensaje distinto en un borde que ningún caso del contrato ejercita.
Task 5: Ruling: NO se aplica el mismo cambio a `card.rs` (Task 6) sin pensarlo: ahí contar dígitos
  produciría el mismo mensaje contradictorio para "4111-1111-1111-1111" (16 dígitos vs expected 16).
  Queda como riesgo nombrado en el review de la Task 6, sin pre-juzgarlo. Costo si me equivoco: el
  mensaje de tarjeta queda menos informativo que el de cci.
Task 5: minor (deferred): `weights_20` se reconstruye en cada llamada (optimización fuera de alcance).
Task 5: fix round 1 despachado al mismo implementador (agente a4edaae).
Task 5: fix round 1/5 (2 addressed, 1 nuevo abierto; commits 33b78ae..2e7d788). El re-review encontró
  que contar dígitos traslada la contradicción: "00219100123456789047z" (21 caracteres, 20 dígitos)
  volvía a decir "se esperaban 20 dígitos, llegaron 20". Mi Ruling anterior estaba mal.
Task 5: Ruling (corrige el anterior): la causa real es que el mensaje compara dígitos contra
  caracteres. Se hace explícita la unidad — "llegaron {received} caracteres" — y `received` vuelve a
  contar caracteres. Ningún criterio de conteo solo podía arreglarlo, porque `Length` cubre dos fallas
  distintas. Toca el mensaje compartido en error.rs (y el espejo del enum de ffi en la Task 10).
  Costo si me equivoco: un mensaje de error más largo en las cuatro apps.
Task 5: fix round 2/5 (1 addressed, 0 open; commits 2e7d788..2780884). El re-review enumeró las seis
  clases de entrada inválida y todas producen ahora un mensaje honesto.
Task 5: complete (commits 091ec16..2780884, review clean tras dos rondas)
Task 5: observación para la Task 6 (fuera de alcance allá): el mensaje de `Length` es compartido y en
  `card.rs` `expected` será TYPICAL_LENGTH = 16 aunque el rango real es 13-19, así que una tarjeta de
  14 caracteres con una letra dirá "se esperaban 16 dígitos, llegaron 14 caracteres" — se lee como
  problema de longitud cuando 14 estaría dentro del rango. Va como riesgo nombrado al review de la
  Task 6, sin pre-juzgarlo.

Task 6: complete (commits c61eab9..ddd0824, spec ✅, quality Approved con un Important plan-mandated)
Task 6: Ruling: se conserva `expected: TYPICAL_LENGTH = 16` en el error de longitud de tarjeta, pese a
  que el rango real es 13-19 y el mensaje puede leerse como problema de longitud. La forma del enum la
  fija la superficie FFI que consumen las cuatro apps, y para un RANGO ningún número único es honesto:
  cambiar 16 por 13 mueve el problema, no lo resuelve. El contrato compara por `contract_name()`, que
  no se ve afectado, y CLAUDE.md pone el mapeo a mensaje de usuario en la capa de UI. Queda para que
  lo triage el review final. Costo si me equivoco: un mensaje diagnóstico confuso en un borde que
  ningún caso del contrato ejercita.
Task 6: minor (deferred): sin test para la rama OutOfRange (prefijo desconocido que pasa Luhn) ni para
  los bordes de 13 y 19 dígitos válidos.
Task 6: minor (deferred): el commit ddd0824 lleva trailer "Claude Sonnet 5" en vez de "Claude Opus 5";
  los subagentes Sonnet siguen su propia guía de atribución. No se reescribe historia.
Task 6: el cambio de `sum % 10 == 0` a `sum.is_multiple_of(10)` (exigido por clippy -D warnings) fue
  verificado equivalente por el revisor.

Task 7: complete (commits ddd0824..373447a, review clean — spec ✅, quality Approved)
Task 7: ⚠️ resuelto por el controlador: `Encryption → "Cifrado"` no tiene caso golden porque el contrato
  no trae ningún vector de fallo de cifrado; el mapeo queda por convención con las otras ocho variantes.
  No es un hueco a arreglar: inventar un caso de error de cifrado sería inventar contrato.
Task 7: los tres vectores derivados con Node 22 reproducen carácter por carácter en Rust — verificado
  por el revisor contra cases.json, y con la clave y el nonce de demo.
Task 7: minor (deferred): sin test para nonce de largo incorrecto ni para ciphertext más corto que el
  tag (el revisor verificó leyendo aead 0.6.1 que devuelve Err, no pánico).
Task 7: minor (deferred): `prepare` devuelve Vec<u8> y obliga a un segundo `try_into` inalcanzable en
  encrypt y decrypt (plan-mandated).

Task 8: review 1 — spec ✅ / quality Approved con un Important plan-mandated. El revisor (Opus)
  recalculó a mano tr-001, tr-002 y el caso extra de 100.55, y el invariante de conservación del
  dinero sobre los tres: todo coincide dígito a dígito con el contrato.
Task 8: Ruling: se reemplaza `does_not_mutate_the_input_accounts`, que no puede fallar (la firma toma
  Vec<Account> por valor, así que asertar sobre el vector de entrada es cierto para cualquier
  implementación). El rubro llama defecto a un test que no aserta nada y tiene razón. El reemplazo
  cubre además `holder`, que el contrato incluye en esperado.cuentas y ningún test asertaba, y una
  tercera cuenta no involucrada. Costo si me equivoco: un test más largo que el original.
Task 8: el test extra pedido por el Ruling de la Task 1 (comprobante con centavos ≠ 0) existe y su
  valor es correcto: "100.55" → "TRF-9047-1065-10055", latencia 350.
Task 8: minor (deferred): `accounts.clone()` evitable; el invariante de conservación del dinero no
  está asertado explícitamente (lo cubre el proptest de la Task 9); el cuerpo del commit dice v2.1.0.
Task 8: fix round 1 despachado al mismo implementador (agente a37a89c).
Task 8: fix round 1/5 (3 addressed, 0 open; commits 7a5138e..2f5897f). El re-review construyó tres
  implementaciones defectuosas plausibles y verificó que el test nuevo las caza a las tres.
Task 8: complete (commits 373447a..2f5897f, review clean tras el fix)
Task 8: minor (deferred): typo "aseraba" en un comentario de transfer.rs:228.

Task 9: complete (commits 8e6694e..51c4fcf, review clean — spec ✅, quality Approved)
Task 9: el Ruling de la Task 3 quedó cumplido: `OutOfRange` era una variante huérfana y ahora la
  ejercitan dos casos deterministas (Decimal::MAX + MAX, Decimal::MIN - MAX). El implementador eligió
  determinista sobre proptest porque el borde es un punto fijo conocido; el revisor lo validó.
Task 9: riesgo de proptest vacuo evaluado y descartado con número: el 100% de los casos generados
  llega a las aserciones de conservación del dinero (el saldo fijo de 5000.00 nunca es insuficiente
  para un monto máximo de ~4000.19).

Task 10: DONE_WITH_CONCERNS. El implementador encontró un defecto real del plan y de la spec (D6):
  `cargo:rerun-if-changed=.git/HEAD` no dispara al commitear sobre la rama activa —eso actualiza
  `refs/heads/<rama>`— así que el SHA de `core_version()` se queda pegado. Verificado empíricamente:
  quedó en 1.0.0+51c4fcf con HEAD en fd93b7e.
Task 10: Ruling: es correctitud, no pulido, así que se arregla antes de la review (la skill dice que
  los concerns de correctitud se atienden antes de revisar). Se vigilan los dos archivos: `.git/HEAD`
  cubre el cambio de rama y `.git/logs/HEAD` —el reflog— cada commit, checkout, reset y merge. Autoricé
  explícitamente desviarse del build.rs verbatim del brief porque el brief estaba equivocado.
  Costo si me equivoco: una línea de más en build.rs. Plan y spec (D6) corregidos por el controlador.
Task 10: el implementador verificó la fachada más allá de cargo test: generó bindings Kotlin reales
  contra el .dylib y confirmó las 9 funciones, los 5 records y las 9 variantes con sus campos, con
  Vec<Account> cruzando como List<Account>.
Task 10: review 1 — spec ✅ / quality Approved, con dos Important. El revisor (Opus) hizo el diff
  mecánico dominio↔ffi (9 variantes, 9 mensajes, 9 contract_name, 17 campos de 5 Records, 19
  asignaciones sin cruzar) y regeneró los bindings Kotlin él mismo para confirmar que todo cruza.
  También reprodujo la verificación del reflog sobre un movimiento de HEAD que el implementador no vio.
Task 10: Ruling (hallazgo 1, el importante): `contract_name()` NO cruza el FFI, así que cada app va a
  necesitar su propio mapeo de los nueve nombres del contrato. Decido que **cada app lo dueña, en su
  test golden, no en producción**. Razones: uniffi no toma un tipo de error como parámetro de entrada,
  así que exportarlo pide contorsiones; ponerle nombres en español al enum de ffi contradice la regla
  de idioma del usuario; y la divergencia NO sería silenciosa, porque el golden de cada app compara
  contra cases.json y falla ruidosamente. Se documenta en rust-core/README.md (Task 13). Costo si me
  equivoco: nueve líneas de mapeo repetidas en cuatro tests golden, y la tentación de que alguien las
  ponga en producción.
Task 10: fix round 1 despachado: comentario del build.rs invertido (el SHA no depende de las rutas de
  rerun-if-changed), test que compara los nueve contract_name() de dominio y ffi (la guardia que hace
  vivible la duplicación de D2), y reforzar el test de versión que hoy pasa con "sin-git".
Task 10: minor (deferred): los tests del crate no ejercen las conversiones de Record (las cubre la
  Task 11); los mensajes en español de #[error] no llegan a las apps —uniffi arma el message desde los
  campos—, coherente con la regla 5 de CLAUDE.md; y `core_version()` congela el SHA de CADA artefacto,
  así que "cuatro strings idénticos" exige regenerar los cuatro desde el mismo HEAD antes de la demo
  (va al README de la Task 13).
Task 10: fix round 1/5 (3 addressed, 0 open; commits 0299cbc..a88cc3d). El implementador verificó las
  dos guardias nuevas POR MUTACIÓN: renombrar "Cifrado" solo en ffi ahora falla nombrando la variante,
  y con git inexistente el test de versión falla con "fue 1.0.0+sin-git" (antes pasaba en verde).
Task 10: complete (commits 51c4fcf..a88cc3d, review clean tras el fix)

Task 11: DONE_WITH_CONCERNS. El golden pasa 27/27 sin tocar ningún valor esperado (cases.json sigue en
  su commit ffcf5e5 de la Task 4). El implementador verificó la cobertura instrumentando cada loop y
  diffeando los ids ejercitados contra los que declara el contrato, y rompió el test a propósito para
  probar que corre de verdad (falla con left: "0.05" / right: "NO-DEBE-PASAR", donde el left es el
  valor que devolvió el core).
Task 11: Ruling: se agrega una guardia de conteo por grupo (6/4/5/6/6, total 27), autorizando la
  desviación del código verbatim del brief. Un grupo vaciado pasaría en verde —un `for` sobre cero
  elementos no aserta nada—, que es la misma clase de fallo que motivó mover el golden dentro de `ffi`.
  Pesa más porque las otras tres plataformas van a espejar este archivo. La fricción de actualizar el
  número al agregar un caso es deliberada. Costo si me equivoco: hay que tocar un número más cada vez
  que el contrato crece, en cuatro repos.
Task 11: Ruling: NO se asertan `_alicuota_itf` ni `moneda` directamente (C3). Leer un número JSON en
  Rust sale por f64 y la regla de no usar punto flotante vale también en los tests; la alícuota ya
  está cubierta de hecho, porque si cambiara fallarían los cinco casos de `itf`. Costo si me equivoco:
  un cambio de alícuota que además ajustara los cinco esperados pasaría sin ruido.
Task 11: fix round 1 (C1 resuelto; commits f1186f9..a37e360). Verificado por mutación en las dos ramas:
  vaciando `cci` la guardia falla y en la MISMA salida se ve `golden_cci ... ok`, o sea el test de CCI
  pasando en verde sin comparar un solo string. Esa corrida es la demostración del concern.
Task 11: Ruling: se cierra también C5 (un GRUPO nuevo que ningún golden_* lea pasaría en verde) con una
  aserción sobre el conjunto de claves de primer nivel. Misma familia que C1, un escalón arriba, ocho
  líneas, y cerrarlo acá evita repetir el agujero en las tres plataformas que van a espejar el archivo.
  Costo si me equivoco: agregar cualquier clave al contrato obliga a tocar este test en cuatro repos.
Task 11: review 1 — spec ✅ / quality Approved, sin Critical ni Important. El revisor (Opus) enumeró
  las once formas en que un golden puede mentir y verificó cuáles están cerradas; comprobó la cobertura
  27/27 y que ningún campo de `esperado` queda sin comparar, leyendo el contrato él mismo; y contrastó
  los números de línea de los anexos de mutación contra los estados intermedios del archivo.
Task 11: Ruling: se aplican tres Minor ahora en vez de diferirlos — contador de casos ejercitados por
  `golden_*` (hoy borrar un golden_* deja todo en verde), nombre del campo en los mensajes de fallo, y
  aserción sobre las claves de cada `esperado`. Razón: este archivo lo espejan Kotlin, Swift y
  TypeScript, así que lo que no se arregle acá se paga cuatro veces, y el diagnóstico en las otras
  plataformas no tiene el file:line del panic de Rust. Costo si me equivoco: un archivo más largo.
Task 11: CORRECCIÓN de mi Ruling anterior sobre C3: dije que asertar `_alicuota_itf` obligaba a leer un
  número JSON y que "en Rust sale por f64". Es falso: en el contrato la alícuota es el string
  "0.00005", igual que `moneda`. La decisión de no asertarla sigue en pie por otro motivo (ya está
  cubierta de hecho: si cambiara, fallarían los cinco casos de itf), pero el motivo escrito estaba mal
  y en un proyecto cuya tesis es "ningún float toca un monto" esa es justo la justificación que no
  conviene dejar asentada.
Task 11: fix round 2 (todos addressed, 0 open; commits 40e18f3..5b05db9)
Task 11: complete (commits a88cc3d..5b05db9, review clean)
Task 11: Ruling: se acepta un hueco residual conocido — borrar una función `golden_*` entera no lo caza
  nada, porque el contador se borra con ella. La alternativa (cuerpos en una tabla de punteros a
  función) colapsaría los cinco nombres de test, y el nombre del test es lo que se lee cuando algo
  falla en Kotlin o Swift, donde no hay file:line del panic. Borrar un test es además un acto visible
  en review. Queda documentado en el archivo y va al README de la Task 13. Costo si me equivoco: una
  plataforma podría omitir un grupo entero y pasar en verde.

Task 12: complete (sin commits — la tarea no produce cambios commiteables; target/ está en .gitignore).
  9/9 funciones cruzaron en Kotlin y en Swift, más los 5 Records, las 9 variantes con sus campos y
  Vec<Account> como List<Account>/[Account]. Sin Double/Float en la API generada.
Task 12: HALLAZGO para la Fase 3, verificado por el controlador: uniffi 0.32 nombra el modulemap
  `core_financieroFFI.modulemap`, y `xcodebuild -create-xcframework` exige `module.modulemap` en el
  directorio de headers. Sin renombrarlo el XCFramework compila pero el `import` no resuelve — es el
  síntoma exacto del hallazgo A1 del review de CONTEXT. Cuesta un `cp`, siempre que quede escrito.
Task 12: Ruling: ese hallazgo se documenta en rust-core/README.md Y en apps/ios/CONTEXT.md (Task 13),
  aunque apps/ios está fuera del alcance de la Fase 1. Un hallazgo que vive solo en un reporte de
  sesión no existe: quien construya el XCFramework en la Fase 3 no va a leer este directorio. Costo si
  me equivoco: tres líneas en un CONTEXT de otra fase.
Task 12: concern registrado: el smoke prueba que la API CRUZA, no que EJECUTA — no se compiló Kotlin ni
  Swift ni se cargó el .dylib. Un fallo de carga en runtime sigue siendo posible en la Fase 2.

Task 13: review 1 — spec ❌ / quality Needs fixes. El revisor (Opus) corrió LOS QUINCE comandos del
  README y todos producen lo que promete, al byte (tamaños de los bindings Swift y del .dylib
  reproducidos exactos). Los tres gates de CLAUDE.md están cumplidos y las cinco decisiones
  documentadas. Los defectos son de coherencia entre documentos.
Task 13: Ruling (hallazgo 1, el serio): `rust-core/CONTEXT.md` documenta el pipeline de iOS sobre
  `libcore_financiero.a`, que el Cargo.toml de la fase NUNCA produce — `crate-type` es
  ["cdylib","lib"], sin staticlib. Se arregla haciendo verdadera la documentación: se agrega
  "staticlib" al crate-type y se verifica empíricamente que la build emite el .a. Es exactamente la
  clase de aterrizaje forzoso que la Task 12 existió para descubrir. Costo si me equivoco: un artefacto
  de más en cada build de release.
Task 13: Ruling: los nombres viejos (`ErrorDominio`, `version_core()`) se corrigen también en los
  CUATRO CONTEXT de apps, no solo en CLAUDE.md — son la spec de entrada de las fases 2 a 5, y
  `version_core()` es el requisito de paridad en pantalla que las cuatro apps deben implementar. Con
  el matiz de que el binding se llama `coreVersion()` en Kotlin, Swift y TS. Costo si me equivoco:
  se tocó texto de CONTEXT de fases futuras, acotado a nombres.
Task 13: Ruling: el hallazgo del modulemap se lleva al bloque de comandos canónico de
  rust-core/CONTEXT.md, que es a donde CLAUDE.md y el README mandan a buscar los comandos de
  exportación. Estaba escrito en los dos lugares donde nadie lo iba a copiar.
Task 13: el concern C1 del implementador era falso (CLAUDE.md ya no dice que los identificadores vayan
  en español; se reemplazó en c7533b0). Los residuos reales eran otros.
Task 13: fix round 1/5 (4 Important + 3 Minor addressed, 1 nuevo abierto; commits 8e53189..f2bb1f7).
  El re-review verificó ejecutando: el .a se produce (69 281 640 bytes), el .dylib no se movió
  (442 784 exactos), los bindings salen byte-idénticos, y quedan CERO identificadores viejos en los
  cinco archivos. El implementador además corrió uniffi-bindgen contra el .a: el comando del CONTEXT
  que antes no podía funcionar ahora está verificado.
Task 13: hallazgo nuevo — `apps/ios/CONTEXT.md` promete tres archivos en Generated/include y el bloque
  canónico produce dos, porque `cp` no mueve el original. Misma clase que los anteriores: una
  instrucción de verificación no verificada contra el comando real. Fix round 2 despachado.
Task 13: fix round 2/5 (3 addressed, 0 open; commits f2bb1f7..4631249). El conteo real de
  Generated/include es DOS, verificado por simulación independiente del revisor y del implementador.
Task 13: complete (commits 5b05db9..4631249, review clean tras dos rondas)
Task 13: minor (deferred): typo "a proposito" sin tilde en rust-core/CONTEXT.md:256.
