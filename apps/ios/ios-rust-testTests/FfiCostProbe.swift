import CoreFinancieroKit
import Foundation
import Testing
@testable import ios_rust_test

/// SONDA DE MEDICIÓN — apagada por defecto, y no es un test.
///
/// Mide el costo del cruce FFI. No aserta nada: es una medición no determinista que no tiene
/// sentido correr en cada suite, así que sin `PROBE=1` en el entorno queda *skipped*. El
/// comando completo está en [TESTING.md](../TESTING.md).
///
/// **Vive en el repositorio a propósito.** La medición del iPad se tomó con un archivo
/// temporal que se borró después, y repetirla en el iPhone obligó a reescribirlo: una sonda
/// reescrita no mide lo mismo que la original —hay que volver a discutir el reloj, la forma del
/// percentil, si el `try?` se traga algo—. El código de una medición que hay que poder repetir
/// **es parte de la medición**. Android llegó a la misma conclusión con `FfiCostProbe.kt`.
///
/// Usa el mismo reloj y la misma forma que `BenchmarkViewModel.measure()`: muestras en enteros
/// de nanosegundos, percentiles sobre el array ordenado.
@Suite("Sonda del costo del cruce FFI")
struct FfiCostProbe {
    private static let isOn = ProcessInfo.processInfo.environment["PROBE"] == "1"
    private static let runs = Int(ProcessInfo.processInfo.environment["PROBE_RUNS"] ?? "") ?? 20_000
    private static let warmup = Int(ProcessInfo.processInfo.environment["PROBE_WARMUP"] ?? "") ?? 2_000

    @Test("mide el piso del cruce y el costo por argumento", .enabled(if: isOn))
    func measureTheCostOfCrossing() {
        // La configuración del build es LA variable, igual que `debuggable` en Android: hay
        // que poder leerla al lado del número, no deducirla del comando que se tipeó.
        #if DEBUG
        let configuration = "Debug"
        #else
        let configuration = "Release"
        #endif
        print("=== artefacto \(coreVersion()) · \(configuration) · warmup=\(Self.warmup) runs=\(Self.runs) ===")

        // Una llamada de prueba FUERA del bucle: `measure` usa `try?`, así que un puente roto
        // mediría el tiempo de lanzar la excepción y saldría un número rápido y plausible en
        // vez de un error. Es el defecto que PENDING.md le anota a la pantalla de Benchmark.
        #expect(try! add(a: "0.1", b: "0.2") == "0.30")

        // El piso del INSTRUMENTO, no del cruce: un cuerpo vacío. Todo lo que quede cerca de
        // este número está midiendo el reloj, no la llamada. `ContinuousClock` en iOS va sobre
        // `mach_absolute_time`, cuya base son ~41,67 ns por tick en los Ax/Mx.
        report("(reloj, cuerpo vacío)") { }
        report("coreVersion()") { _ = coreVersion() }
        report("validateCard(\"41111\")") { _ = try? validateCard(number: "41111") }
        report("add(\"0.1\", \"0.2\")") { _ = try? add(a: "0.1", b: "0.2") }
        report("NativeBaseline.add") { _ = NativeBaseline.add("0.1", "0.2") }

        // Por lotes, porque los dos de arriba caen DEBAJO de la resolución del reloj: 0,08 µs
        // son dos ticks, y un tick es el piso del instrumento. Cronometrar 1.000 llamadas y
        // dividir es el mismo recurso que usa la app Angular contra el `performance.now()`
        // cuantizado del navegador. Acá da la media, no el percentil: un lote promedia adentro.
        batched("coreVersion() x1000") { _ = coreVersion() }
        batched("add x1000") { _ = try? add(a: "0.1", b: "0.2") }
        batched("NativeBaseline.add x1000") { _ = NativeBaseline.add("0.1", "0.2") }
    }

    /// Cronometra lotes de `batch` llamadas y divide. Devuelve la media por llamada, no un
    /// percentil: adentro del lote las llamadas ya se promediaron entre sí.
    private func batched(_ label: String, batch: Int = 1000, _ body: () -> Void) {
        for _ in 0..<Self.warmup { body() }
        var perCall: [Double] = []
        for _ in 0..<(Self.runs / batch) {
            let start = ContinuousClock.now
            for _ in 0..<batch { body() }
            let e = (ContinuousClock.now - start).components
            let ns = Double(e.seconds * 1_000_000_000 + e.attoseconds / 1_000_000_000)
            perCall.append(ns / Double(batch) / 1000)
        }
        perCall.sort()
        let median = perCall[perCall.count / 2]
        print(String(format: "%-24s media=%8.3f us  (lotes de %d)", (label as NSString).utf8String!, median, batch))
    }

    private func report(_ label: String, _ body: () -> Void) {
        for _ in 0..<Self.warmup { body() }
        var samples: [Int64] = []
        samples.reserveCapacity(Self.runs)
        for _ in 0..<Self.runs {
            let start = ContinuousClock.now
            body()
            let e = (ContinuousClock.now - start).components
            samples.append(e.seconds * 1_000_000_000 + e.attoseconds / 1_000_000_000)
        }
        samples.sort()
        func at(_ p: Double) -> Double {
            Double(samples[min(max(Int(Double(Self.runs) * p), 0), Self.runs - 1)]) / 1000
        }
        print(String(format: "%-24s p50=%8.2f us  p95=%8.2f us", (label as NSString).utf8String!, at(0.50), at(0.95)))
    }
}
