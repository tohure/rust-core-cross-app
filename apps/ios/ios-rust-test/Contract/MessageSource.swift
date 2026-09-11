/// Los nueve mensajes de usuario, indexados por **nombre del contrato**
/// (`Longitud`, `DigitoControl`, …), no por el nombre de la variante en inglés.
///
/// Los mensajes NO cruzan el FFI: en Swift, `localizedDescription` de un `DomainError` es
/// `String(reflecting: self)`, o sea el volcado de debug del enum. Sin este archivo, las
/// cuatro apps mostrarían textos distintos en sus pantallas de error.
///
/// Es protocolo por lo mismo que `ContractSource`, y además porque así un segundo idioma
/// es otro archivo y no un cambio de código.
protocol MessageSource {
    func messages() -> [String: String]
}
