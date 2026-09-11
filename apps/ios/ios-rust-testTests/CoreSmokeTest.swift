import Testing
@testable import ios_rust_test

/// La prueba mínima de que el XCFramework linkea y Swift resuelve los símbolos del `.a`.
///
/// `coreVersion()` es la única función del core que no lanza, así que es la que menos
/// supuestos mete: si devuelve el string, el puente entero funciona.
@Suite("El puente al núcleo")
struct CoreSmokeTest {
    @Test("coreVersion() cruza el FFI y trae el SHA del build")
    func coreVersionCrossesTheBoundary() {
        let version = coreVersion()
        #expect(!version.isEmpty)
        // El formato es "<version>+<sha corto>", inyectado por build.rs desde git.
        #expect(version.contains("+"))
    }
}
