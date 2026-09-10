use crate::error::DomainError;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};

fn error(detail: &str) -> DomainError {
    DomainError::Encryption {
        detail: detail.to_string(),
    }
}

/// El nonce entra como parámetro y **no** se genera acá: generarlo pediría entropía del
/// sistema (una syscall), lo que rompería la pureza, y haría la salida no determinista,
/// o sea no comparable entre plataformas — que es justo lo que el contrato prueba.
///
/// ⚠️ Reutilizar el par (clave, nonce) es catastrófico en producción. Acá es a propósito.
fn prepare(key_hex: &str, nonce_hex: &str) -> Result<(ChaCha20Poly1305, Vec<u8>), DomainError> {
    let key = hex::decode(key_hex.trim()).map_err(|_| error("la clave no es hex válido"))?;
    let nonce = hex::decode(nonce_hex.trim()).map_err(|_| error("el nonce no es hex válido"))?;
    let key: &Key = key
        .as_slice()
        .try_into()
        .map_err(|_| error("la clave debe tener 32 bytes"))?;
    if nonce.len() != 12 {
        return Err(error("el nonce debe tener 12 bytes"));
    }
    Ok((ChaCha20Poly1305::new(key), nonce))
}

pub fn encrypt(text: &str, key_hex: &str, nonce_hex: &str) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex)?;
    let nonce: &Nonce = nonce
        .as_slice()
        .try_into()
        .map_err(|_| error("nonce inválido"))?;
    let output = cipher
        .encrypt(nonce, text.as_bytes())
        .map_err(|_| error("no se pudo cifrar"))?;
    Ok(hex::encode(output))
}

pub fn decrypt(
    ciphertext_hex: &str,
    key_hex: &str,
    nonce_hex: &str,
) -> Result<String, DomainError> {
    let (cipher, nonce) = prepare(key_hex, nonce_hex)?;
    let nonce: &Nonce = nonce
        .as_slice()
        .try_into()
        .map_err(|_| error("nonce inválido"))?;
    let bytes =
        hex::decode(ciphertext_hex.trim()).map_err(|_| error("el cifrado no es hex válido"))?;
    let plain = cipher
        .decrypt(nonce, bytes.as_slice())
        .map_err(|_| error("no se pudo descifrar: clave, nonce o tag incorrectos"))?;
    String::from_utf8(plain).map_err(|_| error("el texto descifrado no es UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const NONCE: &str = "000102030405060708090a0b";

    // Vectores del grupo `tarjeta` de contracts/cases.json. Se derivaron con la
    // stdlib de Node 22, o sea son independientes de Rust: que Rust los reproduzca
    // es evidencia real, no un snapshot de si mismo.
    #[test]
    fn reproduces_the_contract_vectors() {
        assert_eq!(
            encrypt("4111111111111111", KEY, NONCE).unwrap(),
            "bdca39311826947186b20ec2a92c3f521aacff902e37d519bcd2754fc7c7c0dd"
        );
        assert_eq!(
            encrypt("5555555555554444", KEY, NONCE).unwrap(),
            "bcce3d351c22907582b60ac6ac293a57e26c8e6007abc9a2b0c323bf74184036"
        );
        assert_eq!(
            encrypt("378282246310005", KEY, NONCE).unwrap(),
            "bacc30321125977481b00ec3a82d3b43191141e9da8b2ad948e1c7b3a8ee5e"
        );
    }

    #[test]
    fn roundtrip_returns_the_original() {
        let ciphertext = encrypt("4111111111111111", KEY, NONCE).unwrap();
        assert_eq!(
            decrypt(&ciphertext, KEY, NONCE).unwrap(),
            "4111111111111111"
        );
    }

    #[test]
    fn a_wrong_length_key_errors_without_panicking() {
        assert_eq!(
            encrypt("x", "0001", NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
    }

    #[test]
    fn invalid_hex_errors_without_panicking() {
        assert_eq!(
            encrypt("x", "zzzz", NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
        assert_eq!(
            decrypt("zzzz", KEY, NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
    }

    /// Un nonce de largo distinto de 12 bytes tiene que salir por `Err`, no por un
    /// pánico: el nonce entra por el FFI desde la app, así que un `panic!` acá sería un
    /// crash de la app del banco con una entrada que el usuario controla. La afirmación
    /// de seguridad de la fase ("el core no panica con entrada arbitraria") descansa en
    /// esta rama, y hasta ahora ningún test la ejercitaba.
    #[test]
    fn a_wrong_length_nonce_errors_without_panicking() {
        assert_eq!(
            encrypt("x", KEY, "0001").unwrap_err().contract_name(),
            "Cifrado"
        );
        assert_eq!(
            decrypt("00", KEY, "0001").unwrap_err().contract_name(),
            "Cifrado"
        );
    }

    /// Un ciphertext más corto que el tag de Poly1305 (16 bytes) es el borde donde una
    /// implementación descuidada haría un slice fuera de rango. `aead` devuelve `Err`;
    /// este test lo fija para que un cambio de versión que lo convierta en pánico se vea.
    #[test]
    fn a_ciphertext_shorter_than_the_tag_errors_without_panicking() {
        assert_eq!(
            decrypt("00112233", KEY, NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
        assert_eq!(
            decrypt("", KEY, NONCE).unwrap_err().contract_name(),
            "Cifrado"
        );
    }

    #[test]
    fn a_tampered_tag_does_not_decrypt() {
        let mut ciphertext = encrypt("4111111111111111", KEY, NONCE).unwrap();
        ciphertext.replace_range(0..1, "0");
        assert!(decrypt(&ciphertext, KEY, NONCE).is_err());
    }
}
