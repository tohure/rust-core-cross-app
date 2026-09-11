/// De dónde salen los datos del contrato que la app necesita en producción.
///
/// Existe como protocolo por una razón propia de iOS: producción lee de `Bundle.main` y
/// los tests de `Bundle(for:)`. El mismo código tiene que leer de dos bundles distintos.
protocol ContractSource {
    /// Las dos cuentas de `cuentas_iniciales`. Son datos del contrato, no de la app:
    /// hardcodearlas las haría divergir entre las cuatro plataformas.
    func initialAccounts() -> [Account]

    /// La clave y el nonce de demo, de `_clave_demo_hex` y `_nonce_demo_hex`.
    ///
    /// **El nonce es FIJO a propósito**, para que las cuatro plataformas produzcan el mismo
    /// hex y se pueda comparar en la demo. En producción, reutilizar un nonce con
    /// ChaCha20-Poly1305 es catastrófico; ver `contracts/README.md`.
    func demoKeyHex() -> String
    func demoNonceHex() -> String
}
