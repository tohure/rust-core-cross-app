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

    // Son dos archivos y ninguno sobra. `.git/HEAD` solo cambia al cambiar de rama: al
    // commitear sobre la rama ya activa git actualiza `.git/refs/heads/<rama>`, no `HEAD`,
    // así que vigilándolo solo a él el build script no se re-ejecutaba y el SHA quedaba
    // pegado en el del commit anterior (verificado). `.git/logs/HEAD` es el reflog: se le
    // appendea una línea en cada commit, checkout, reset y merge, que es justo lo que
    // faltaba. Ambos juntos cubren mover el HEAD por cualquier vía.
    //
    // Las rutas son relativas al directorio de ESTE paquete (`rust-core/crates/ffi`), que
    // es el cwd del build script. Si el crate se mueve de nivel dejan de resolver al `.git`
    // del repo y el modo de falla es silencioso: no hay error de build, `core_version()`
    // simplemente devuelve `<semver>+sin-git`.
    println!("cargo:rerun-if-changed=../../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../../.git/logs/HEAD");
}
