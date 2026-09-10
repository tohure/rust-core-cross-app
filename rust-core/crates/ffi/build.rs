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

    // Son dos archivos y ninguno sobra. Estando en una rama, `.git/HEAD` solo cambia al
    // cambiar de rama: al commitear sobre la rama ya activa git actualiza
    // `.git/refs/heads/<rama>`, no `HEAD`, así que vigilándolo solo a él el build script no
    // se re-ejecutaba y el SHA quedaba pegado en el del commit anterior (verificado). Con
    // HEAD desprendido es distinto —`.git/HEAD` guarda el SHA crudo y sí se reescribe en
    // cada commit— pero eso no cambia la conclusión: `.git/logs/HEAD`, el reflog, se
    // appendea en cada commit, checkout, reset y merge, con rama o sin ella. Vigilando los
    // dos, cualquier movimiento del HEAD invalida el caché.
    //
    // Estas dos rutas son relativas al directorio de ESTE paquete (`rust-core/crates/ffi`),
    // que es el cwd del build script, y controlan **solo la invalidación del caché**, no el
    // valor del SHA. Si el crate se moviera de nivel el SHA seguiría siendo correcto —
    // `git rev-parse` busca el `.git` hacia arriba desde donde corra, a cualquier
    // profundidad—; lo que se degradaría es la invalidación: SHA pegado, o rebuild en cada
    // compilación.
    //
    // El fallback `"sin-git"` viene de otro lado: de que `git` no esté disponible, o de que
    // el build corra fuera de un checkout —un tarball, un árbol copiado, un CI que exporta
    // el source—. Si en pantalla aparece `1.0.0+sin-git`, hay que ir a mirar cómo se
    // empaquetó el build, no a buscar un crate movido.
    println!("cargo:rerun-if-changed=../../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../../.git/logs/HEAD");
}
