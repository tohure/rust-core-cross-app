# Qué se prueba en `apps/react-native`, y qué no

## Las suites

`pnpm test` corre **dos proyectos de Jest** en una sola invocación. La salida los distingue por
`displayName`.

| Proyecto | Entorno | Qué corre | Qué prueba |
|---|---|---|---|
| `napi` | Node | `__tests__/**` | El contrato contra el **core real**, por N-API **y por WASM** |
| `react-native` | preset de RN | `src/__tests__/**` | La infraestructura de test, y más adelante los hooks |

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

Salida esperada: **67 tests en verde**, 4 suites.

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

### Guardia 4: la sostiene `tsc`, y está verificada por mutación en los dos sentidos

[`src/contractName.ts`](src/contractName.ts) traduce cada variante de `DomainError` al nombre en
español del contrato con una tabla cerrada por
`satisfies Record<DomainError['tag'], string>`.

Quitando `SameAccount` de la tabla, `pnpm exec tsc --noEmit` dice:

```
error TS1360: Type '{ … }' does not satisfy the expected type 'Record<DomainError_Tags, string>'.
  Property '[DomainError_Tags.SameAccount]' is missing in type '{ … }'
  but required in type 'Record<DomainError_Tags, string>'.
```

Y agregando una clave mal escrita:

```
error TS2561: Object literal may only specify known properties, but 'OutOfRangeee' does not exist
in type 'Record<DomainError_Tags, string>'. Did you mean to write 'OutOfRange'?
```

Los dos sentidos importan: una décima variante en el core rompe el build nombrando la que falta,
y un nombre mal tipeado no compila. Un `switch` con `default: never` sólo cazaba el primero.

**`contractName` no depende de ningún flavour en runtime.** Importa `DomainError` con `import
type`, que babel borra, así que la misma función atiende JSI, N-API y WASM. Eso no es un detalle
de estilo: importar el enum en runtime arrastra React Native al proyecto `napi`, que corre en
Node, y ahí muere con `Cannot use import statement outside a module`.

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
