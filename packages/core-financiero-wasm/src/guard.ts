import type { DomainError } from '../generated/core_financiero';
import type { ContractTag } from '@banco/contract';

/**
 * **La guardia 4, para el flavour WASM.** Mismo mecanismo que `apps/react-native/src/guard.ts`
 * (Task 3): la tabla `CONTRACT_NAMES` vive en `@banco/contract`, un paquete neutral que no puede
 * conocer el `DomainError` generado de ningún flavour, así que la equivalencia se aserta acá,
 * del lado que sí lo conoce.
 *
 * Es **bidireccional a propósito**: `Equal` exige que cada unión extienda a la otra. Una
 * variante de más en el core deja `CONTRACT_NAMES` incompleta; una de menos la deja con una
 * clave que ya no existe. Las dos rompen `tsc` en vez de pasar en verde.
 *
 * Este archivo no exporta nada en runtime: existe sólo para que el compilador lo mire.
 *
 * **`DomainError['tag']` es un `enum` de TypeScript, no una unión de literales de string.** Un
 * miembro de un string enum SÍ es asignable a su literal equivalente (`DomainError_Tags.Length`
 * a `'Length'`), pero no al revés: TypeScript rechaza un literal plano donde espera ese enum
 * nominal. Sin `` `${...}` ``, la mitad `[ContractTag] extends [DomainError['tag']]` de `Equal`
 * falla siempre — con la tabla completa y correcta incluida —, y la guardia no protegería nada
 * porque nunca podría estar en verde. La plantilla de string fuerza la unión del enum a sus
 * literales subyacentes antes de comparar; `Equal` en sí queda intacto. Mismo hallazgo que en
 * `apps/react-native/TESTING.md`, verificado ahí por mutación en los dos sentidos.
 */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Si esto deja de compilar, el core cambió sus variantes y hay que actualizar
// `packages/contract/src/tags.ts`.
const _guardia: Equal<`${DomainError['tag']}`, ContractTag> = true;
void _guardia;
