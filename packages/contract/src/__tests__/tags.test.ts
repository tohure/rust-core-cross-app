// No hay `@types/jest`: sin este import explícito, `tsc --noEmit` falla con TS2593 porque
// `describe`/`expect`/`it` no existen como globals sin los tipos ambiente.
import { describe, expect, it } from '@jest/globals';
import { CONTRACT_NAMES } from '../tags';
import { loadMessages } from '../testing';

describe('CONTRACT_NAMES', () => {
  it('cubre exactamente los mismos nombres que messages.es.json', () => {
    // Hallazgos I1+I4 del review de la Task 2: tres de los nueve valores de la tabla
    // (`BancoDesconocido`, `Cifrado`, `FueraDeRango`) no aparecen en `cases.json`, así que el
    // test de contrato nunca los ejercita, y la guardia 4 de las Tasks 3/4 aserta las CLAVES de
    // `CONTRACT_NAMES` contra `DomainError['tag']`, no sus valores. Un typo en cualquiera de los
    // tres pasaba todos los gates en verde. Esta equivalencia cierra ese agujero: si un valor de
    // la tabla no coincide con ningún nombre real de `messages.es.json` (o sobra/falta uno),
    // este test se pone rojo.
    const { mensajes } = loadMessages();
    const namesInTable = Object.values(CONTRACT_NAMES).slice().sort();
    const namesInMessages = Object.keys(mensajes).sort();
    expect(namesInTable).toEqual(namesInMessages);
  });
});
