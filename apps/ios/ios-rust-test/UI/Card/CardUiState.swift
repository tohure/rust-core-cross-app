struct CardUiState {
    // Bloque de arriba: validar y cifrar.
    var number = ""
    var brand = ""
    var masked = ""
    var cipherHex = ""
    /// La vuelta completa. **No es decoración**: sin esto, el hex es indistinguible de un hash.
    var decrypted = ""
    var encryptError: String?

    // Bloque de abajo: descifrar un hex de otra plataforma. Independiente del de arriba.
    var pastedHex = ""
    var recovered = ""
    var decryptError: String?
}
