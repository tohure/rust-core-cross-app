use std::process::Command;

/// Inyecta el SHA de git en compilación. `core_version()` devuelve versión + SHA para
/// que cuatro strings idénticos en pantalla sean evidencia de que las cuatro apps corren
/// el mismo build — un semver escrito a mano no probaría nada.
///
/// Esto es I/O en **tiempo de compilación**, no en runtime: la regla de funciones puras
/// es sobre la API pública.
fn main() {
    let sha = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "sin-git".to_string());

    println!("cargo:rustc-env=GIT_SHA={sha}");
    println!("cargo:rerun-if-changed=../../../.git/HEAD");
}
