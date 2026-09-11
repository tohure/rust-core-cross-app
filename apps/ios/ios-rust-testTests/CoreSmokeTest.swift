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

/// Verifica que el adapter real, y no solo las funciones globales, hable con el núcleo.
///
/// Cierra el hueco que Android dejó anotado en su `PENDING.md`: allá nada verificaba de
/// forma automatizada que el adapter real convirtiera un error del core, porque el test de
/// contrato llama a las funciones de uniffi directamente. Aquí sí.
@Suite("El adapter llama al núcleo de verdad")
struct UniffiCoreFinancieroTest {
    private let core = UniffiCoreFinanciero()

    @Test("reexporta coreVersion() sin tocarlo")
    func versionMatchesTheGlobalFunction() {
        #expect(core.coreVersion() == coreVersion())
    }

    @Test("propaga el DomainError tal cual, sin traducirlo")
    func propagatesTheDomainErrorVerbatim() {
        do {
            _ = try core.validateCci(cci: "002191001234567890")  // cci-004: Longitud
            Issue.record("se esperaba Longitud y no lanzó")
        } catch let e as DomainError {
            #expect(e.contractName == "Longitud")
        } catch {
            Issue.record("lanzó algo que no es DomainError: \(error)")
        }
    }
}
