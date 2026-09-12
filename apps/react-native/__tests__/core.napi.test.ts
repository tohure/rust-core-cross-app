// La ruta N-API: Jest corre en Node y no puede cargar el turbo module, que es C++ atado a JSI.
// N-API entra al **mismo** cdylib de Rust por la puerta de addons nativos de Node, así que los
// tests del host cruzan a Rust de verdad en vez de ir contra un doble. Es lo que permite que los
// 28 casos de `contracts/cases.json` se verifiquen sin un aparato conectado.
import { describe, expect, it } from '@jest/globals';
import { coreVersion } from '../src/generated-napi/core_financiero';

describe('el core responde por N-API', () => {
  it('coreVersion() devuelve semver + SHA corto', () => {
    const v = coreVersion();
    // No alcanza con que haya un '+': '1.0.0+sin-git' también lo tiene, y ése es justamente el
    // string degradado que `build.rs` existe para evitar. El SHA tiene que ser hex de verdad.
    expect(v).toMatch(/^\d+\.\d+\.\d+\+[0-9a-f]{7,}$/);
  });
});
