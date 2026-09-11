/// ⚠️ **EL ÚNICO ARCHIVO DE ESTA APP QUE PUEDE MENCIONAR `Double`.**
///
/// Es la única excepción permitida a "cero lógica de negocio fuera de `rust-core`", y
/// existe **para exhibir la divergencia de centavos del punto flotante**, no para calcular
/// nada que la app use. Es el contraejemplo de las pantallas de Aritmética y Benchmark.
///
/// **No lo copies, no lo extiendas y no lo llames desde ninguna otra pantalla.** Si te
/// encuentras necesitando aritmética sobre montos en Swift fuera de aquí, el cálculo está
/// en el lugar equivocado: pídeselo al core.
///
/// Vive en producción y no en el bundle de test porque las pantallas tienen que pintarlo:
/// el día de la demo nadie corre los tests.
enum NativeBaseline {
    static func add(_ a: String, _ b: String) -> String {
        guard let x = Double(a), let y = Double(b) else { return "—" }
        return "\(x + y)"
    }

    static func subtract(_ a: String, _ b: String) -> String {
        guard let x = Double(a), let y = Double(b) else { return "—" }
        return "\(x - y)"
    }
}
