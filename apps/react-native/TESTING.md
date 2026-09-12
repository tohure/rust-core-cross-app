# Qué se prueba en `apps/react-native`, y qué no

## Las suites

`pnpm test` corre **dos proyectos de Jest** en una sola invocación. La salida los distingue por
`displayName`.

| Proyecto | Entorno | Qué corre | Qué prueba |
|---|---|---|---|
| `napi` | Node | `__tests__/**` y `__benchmarks__/**` | El contrato contra el **core real**, por N-API **y por WASM**, y que la baseline de TypeScript diverge |
| `react-native` | preset de RN | `src/__tests__/**` y `example/__tests__/**` | Los hooks de las cuatro pantallas, los componentes compartidos y el formateador |

Los entornos son incompatibles y los dos hacen falta. El de React Native **mockea los módulos
nativos**: el contrato corriendo ahí cruzaría a un doble y no probaría nada. El de Node no puede
cargar componentes de React Native, que es lo que las pruebas de hooks necesitan. La separación
está explicada en [`jest.config.js`](jest.config.js).

```bash
cd apps/react-native
pnpm run napi:generate   # la primera vez, o después de tocar rust-core
pnpm run wasm:generate   # idem, para la ruta WASM
pnpm test
```

Salida esperada: **109 tests en verde**, 12 suites — 4 del proyecto `napi` y 8 del
`react-native`.

| Suite | Qué cubre |
|---|---|
| `__tests__/contract.napi.test.ts` | los 28 casos del contrato, por N-API |
| `__tests__/contract.wasm.test.ts` | los mismos 28, por WASM |
| `__tests__/core.napi.test.ts` | que el `cdylib` carga y las nueve funciones responden |
| `__benchmarks__/divergence.test.ts` | que la baseline de TypeScript **sigue divergiendo** del contrato |
| `example/__tests__/useArithmetic` · `useTransfer` · `useCard` · `useBenchmark` | las transiciones de estado de las cuatro pantallas, contra `FakeCore` |
| `example/__tests__/ContractMessages` · `money` | el mensaje de usuario y el formateador sobre el string |
| `example/__tests__/PrimaryButton` | el label sin transformar, y que los contenedores compartidos no se aplanen |
| `src/__tests__/jest-setup` | las dos guardias de la configuración de Jest bajo pnpm |

## El test de contrato: 28/28

`__tests__/contract.napi.test.ts` lee `contracts/cases.json` **v2.3.0** —la misma copia que leen
las otras cuatro bases de código— y compara con **igualdad exacta de strings** (`toBe`), nunca con
tolerancia numérica. Que eso pase en las cuatro plataformas *es* la demostración de la POC.

| Grupo | Casos | Qué verifica |
|---|---|---|
| `aritmetica` | 6 | Suma y resta decimal exacta |
| `cci` | 4 | Validación de CCI: banco, oficina, cuenta, dígito de control |
| `itf` | 5 | El impuesto, con `MidpointAwayFromZero` |
| `tarjeta` | 6 | Marca, enmascarado, y el cifrado ida y vuelta |
| `transferencia` | 7 | Comisión, total debitado, comprobante y saldos resultantes |

Más las 4 guardias que son `it`, dan los **32** de esa suite.

### Y los mismos 28 otra vez, por WASM

`__tests__/contract.wasm.test.ts` es **el mismo archivo con otro import**, y la duplicación es
deliberada: los dos runtimes tienen que poder fallar por separado. Si sólo rompe uno, el problema
está en ese flavour y no en el core — y eso se quiere leer de un vistazo, no deducir de un log.
Factorizarlo en una función parametrizada por runtime ahorraría líneas y costaría justo esa lectura.

**Éste es el artefacto que consumirá Angular en la Fase 5.** Probarlo acá es lo que hace que esa
fase arranque sin deuda: 28/28, contra los mismos vectores y con la misma igualdad exacta de
strings.

Dos diferencias con la ruta N-API, las dos en el arranque y ninguna en las comparaciones:

- El módulo WASM **se abre de forma asíncrona** (`uniffiInitAsync`), y el host tiene que decirle
  dónde está el `.wasm`. No hay default, porque el nombre del asset sólo lo sabe el entorno: un
  bundler reescribe la URL al copiarlo. El test le pasa los bytes leídos del archivo stageado.
- El `.wasm` que sirve es el que `--and-generate` **stagea**, no el que deja cargo. Ver
  [BUILD.md](BUILD.md#construir-el-wasm).

**El modo de fallar que este test habría tenido, y por qué no lo tiene.** Un error lanzado por el
módulo wasm **no es instancia** de la clase del módulo JSI. Si `contractName` se hubiera escrito
con `DomainError.instanceOf(e)`, habría devuelto `false` y roto los **ocho** casos que esperan
error. Discriminar por la presencia de `tag` es lo que hace que el mismo mapeo sirva en los tres
flavours sin parametrizar nada y sin escribir una segunda copia.

Si alguna vez falla con un error de mapeo, comparar los valores de `DomainError_Tags` entre
`src/generated/` y `src/generated-wasm/` **antes que ninguna otra cosa**: si difieren, el problema
es de generación y no del mapeo. Y si falla **sólo** el grupo de `tarjeta`, el sospechoso es el
manejo de bytes en la frontera wasm, no la criptografía — el core es el mismo binario lógico.

**Ningún valor esperado se corrigió para que pasara.** Si un caso falla, el sospechoso es el
código. Corregir un valor esperado va siempre en su propio commit, con la justificación
aritmética en el mensaje.

### Por qué el grupo `aritmetica` sirve para la demo

Los seis casos **divergen bajo IEEE-754**, verificado con el Node de este repo:

| Caso | Operación | JavaScript (IEEE-754) | El core (Decimal) |
|---|---|---|---|
| ar-001 | `0.1 + 0.2` | `0.30000000000000004` | `0.30` |
| ar-002 | `0.7 + 0.1` | `0.7999999999999999` | `0.80` |
| ar-003 | `1000000.10 + 0.20` | `1000000.2999999999` | `1000000.30` |
| ar-004 | `1.00 - 0.90` | `0.09999999999999998` | `0.10` |
| ar-005 | `100.00 - 99.99` | `0.010000000000005116` | `0.01` |
| ar-006 | `82.35 - 12.34` | `70.00999999999999` | `70.01` |

Si alguno dejara de diverger, deja de servir para la demo y hay que reemplazarlo.

### El único campo que se compara como número

`simulatedLatencyMs`, en `transferencia`. Son milisegundos, no dinero. Todo lo demás —montos,
saldos, comisiones, totales— cruza la frontera como `String` y se compara como `String`.

### Dos casos que valen por sí solos

- **`itf-005`** (`"2500.00"` → `"0.13"`) es el **único** que distingue `MidpointAwayFromZero` de
  banker's rounding. Si falla sólo ése, el redondeo está mal; los otros cuatro no lo distinguen.
- **`tr-007`** (`"0.001"` → `MontoInvalido`) es la guardia de escala. Sin esa puerta, el redondeo
  al formatear movía la suma de saldos y el invariante de conservación del dinero dejaba de valer.

## Las cinco guardias

Existen porque un test de contrato puede pasar **sin haber comparado nada**. Las cuatro primeras
son `it`; la quinta la sostiene el compilador.

| # | Qué protege | Cómo |
|---|---|---|
| 1 | Que el contrato sea la versión esperada | `version === '2.3.0'`, `moneda === 'PEN'` |
| 2 | Que ningún grupo esté **incompleto** | conteo exacto por grupo |
| 3 | Que no aparezcan ni desaparezcan claves de primer nivel | igualdad de `Object.keys().sort()` |
| 4 | Que las nueve variantes de `DomainError` tengan nombre de contrato | `tsc`, no un assert |
| 5 | Que `messages.es.json` cubra las nueve | igualdad de claves |

### Guardia 2: su motivo acá **no** es el mismo que en Rust y en Swift

En Rust y en Swift está verificado por mutación que un grupo vaciado a `[]` genera cero casos y
**el test reporta éxito** — queda en verde sin comparar un solo string. Allá la guardia de conteo
es la única red.

**En Jest no.** Verificado, no supuesto:

```
Error: `.each` called with an empty Array of table data.
```

Así que acá la guardia 2 no protege contra un grupo **vacío** —de eso ya se encarga Jest— sino
contra uno **incompleto**: cinco casos donde debería haber seis pasarían en verde sin que nada
avise.

### Guardia 4: ya no la sostiene un `satisfies` local, la sostiene `src/guard.ts`

La tabla (`CONTRACT_NAMES`) se mudó a `@banco/contract` — la necesitan también el paquete WASM y
Angular, y dos copias se desincronizan. Un paquete neutral no puede importar el `DomainError`
generado (dependería de un flavour), así que ya no puede llevar el
`satisfies Record<DomainError['tag'], string>` que tenía acá. La equivalencia se aserta del otro
lado, donde sí se conoce el tipo real: [`src/guard.ts`](src/guard.ts), que no exporta nada en
runtime — existe sólo para que `tsc` lo mire.

```ts
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _guardia: Equal<`${DomainError['tag']}`, ContractTag> = true;
```

**El detalle que alguien va a querer "simplificar" sin entenderlo: la plantilla de string
`` `${...}` `` no es cosmética.** `DomainError['tag']` no es una unión de literales de string, es
una unión de miembros de un `enum` de TypeScript (`DomainError_Tags`, generado igual en los tres
flavours — JSI, N-API y WASM). Un miembro de un string enum **sí** es asignable a su literal
equivalente (`DomainError_Tags.Length` → `'Length'`), pero **no al revés**: TypeScript rechaza un
literal plano donde espera ese enum nominal. Sin la plantilla, la mitad
`[ContractTag] extends [DomainError['tag']]` de `Equal` falla **siempre**, con la tabla completa y
correcta incluida, y la guardia no protegería nada porque nunca podría estar en verde. Se
verificó con un archivo de debug temporal separando las dos mitades del `extends`: la dirección
`enum → literal` pasa, la dirección `literal → enum` no. La plantilla fuerza el enum a sus
literales subyacentes antes de comparar; la forma de `Equal` queda intacta.

**Precisión fina: la guardia sigue a la unión de clases exportada (`DomainError`), no al `enum`
(`DomainError_Tags`) por sí solo.** El tipo `DomainError` se arma como
`InstanceType<(typeof DomainError)['Length' | 'CheckDigit' | ...]>` — una unión de **claves de
string escritas a mano** sobre el objeto de clases, no `keyof typeof DomainError_Tags`. Agregarle
un miembro al `enum` sin agregar la clase correspondiente a esa unión **no** dispara la guardia;
agregar la clase (y por lo tanto una variante nueva a `DomainError['tag']`) sí. En la práctica no
hay hueco: `ubrn generate` emite el `enum`, la interfaz, la clase y la entrada en la unión juntos
en cada regeneración, nunca por separado. Verificado con dos mutaciones sobre
`src/generated/core_financiero.ts` (revertidas con un backup, `diff` confirmó archivo idéntico):

- **Sólo el `enum`** (agregar `ExtraSoloEnum = 'ExtraSoloEnum'` a `DomainError_Tags`, sin tocar la
  clase ni la unión de claves): `pnpm exec tsc --noEmit` → **`EXIT: 0`**, limpio. La guardia no lo
  vio.
- **La unión real** (agregar la interfaz, la clase `Extra_`, su entrada en `Object.freeze` y la
  clave `'Extra'` a la unión de `DomainError`, como emitiría `uniffi` de verdad):
  ```
  src/guard.ts(27,7): error TS2322: Type 'true' is not assignable to type 'never'.
  ```
  Rompe, nombrando `_guardia`.

**Verificado también por mutación en los dos sentidos sobre la tabla**, en
`packages/contract/src/tags.ts` (revertidas, `git diff` vacío después):

- **Agregar una décima clave** a `CONTRACT_NAMES`:
  ```
  src/guard.ts(27,7): error TS2322: Type 'true' is not assignable to type 'never'.
  ```
- **Borrar una clave existente** (`Encryption`):
  ```
  src/guard.ts(27,7): error TS2322: Type 'true' is not assignable to type 'never'.
  ```

Las cuatro mutaciones —dos sobre la tabla, dos sobre el `DomainError` generado— rompen `tsc`
nombrando `_guardia`, salvo la que toca sólo el `enum` sin tocar la unión de clases, que es
exactamente lo que se espera dado cómo se define `DomainError['tag']`. Un `switch` con
`default: never` sólo hubiera cazado la mitad que falta una clave, nunca la que sobra.

**`contractName` no depende de ningún flavour en runtime.** Vive en `@banco/contract` e importa
`ContractTag` sólo como tipo; `src/guard.ts` importa `DomainError` con `import type`, que babel
borra, así que nada de esto arrastra un flavour concreto a runtime. Eso no es un detalle de
estilo: importar el enum en runtime arrastra React Native al proyecto `napi`, que corre en Node, y
ahí muere con `Cannot use import statement outside a module`.

Y discrimina por la **presencia de `tag`**, no con `DomainError.instanceOf(e)`. `instanceOf`
compara contra la clase de **su propio módulo**, y esta fase lo rompe en dos sitios: los tests de
hooks lanzan dobles de prueba —objetos planos con `tag`, que no son instancias de nada— y el test
de contrato por WASM recibe errores del módulo wasm, que no son instancias de la clase del módulo
JSI.

## Qué **NO** prueba nada de esto

Esto es lo más importante de este archivo.

**Ninguna de estas dos rutas cruza JSI.** N-API entra al mismo `cdylib` de Rust por la puerta de
addons nativos de Node; el turbo module es C++ atado al runtime de Hermes, y Jest no puede
cargarlo. O sea que un `pnpm test` entero en verde **no dice nada** sobre si la app funciona en un
aparato.

Lo que prueba el cruce de JSI es el **smoke manual** documentado en
[`BUILD.md`](BUILD.md#el-smoke-jsi): `coreVersion()` en pantalla, en Android y en iOS, con el
mismo string. Es manual y no una suite porque **React Native no tiene corredor de tests en
dispositivo** — Jest mockea los nativos, y lo único que cruzaría de verdad sería un e2e con
Detox, una pila entera que esta POC no necesita.

Es una diferencia real con las otras dos apps, y conviene decirla en la demo si alguien pregunta:
Android tiene `connectedAndroidTest` y iOS tiene XCTest sobre aparato, los dos cruzando la
frontera de verdad. Acá el cruce se verifica a ojo, una vez, y lo que queda automatizado son las
rutas del host.

Tampoco se prueban: red, persistencia, concurrencia ni I/O. En el core son funciones puras; en la
app están fuera de alcance.
