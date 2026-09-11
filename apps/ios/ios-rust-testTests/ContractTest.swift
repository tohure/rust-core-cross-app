import Foundation
import Testing
@testable import ios_rust_test

/// Espejo Swift de `rust-core/crates/ffi/tests/contract.rs` y de `ContractTest.kt`.
///
/// Que este test pase **es** la demostración de la POC: los mismos 28 casos producen los
/// mismos strings en Rust, Kotlin y Swift.
///
/// Comparaciones con `==` sobre `String`, nunca numéricas con tolerancia.
@Suite("Contrato v2.3.0")
struct ContractTest {
    private var contract: ContractFile { ContractFixtures.contract }

    // ── Guardias ──────────────────────────────────────────────────────────────

    @Test("guardia: el contrato es la versión y la moneda esperadas")
    func theContractIsTheExpectedVersion() {
        #expect(contract.version == "2.3.0")
        #expect(contract.currency == "PEN")
    }

    @Test("guardia: cada grupo tiene la cantidad de casos esperada")
    func eachGroupHasTheExpectedNumberOfCases() {
        #expect(contract.arithmetic.count == 6)
        #expect(contract.cci.count == 4)
        #expect(contract.itf.count == 5)
        #expect(contract.card.count == 6)
        #expect(contract.transfer.count == 7)
        #expect(contract.initialAccounts.count == 2)
    }

    @Test("guardia: las claves de primer nivel son exactamente las conocidas")
    func theTopLevelKeysAreExactlyTheKnownOnes() throws {
        let raw = try JSONSerialization.jsonObject(with: try ContractFixtures.data("cases"))
        let root = try #require(raw as? [String: Any])
        let known: Set<String> = [
            "version", "moneda", "_nota", "_alicuota_itf",
            "_clave_demo_hex", "_nonce_demo_hex",
            "aritmetica", "cuentas_iniciales", "transferencia", "cci", "itf", "tarjeta",
        ]
        let actual = Set(root.keys)
        #expect(actual.subtracting(known).isEmpty, "cases.json trae claves desconocidas")
        #expect(known.subtracting(actual).isEmpty, "a cases.json le faltan claves")
    }

    @Test("guardia: las nueve variantes de DomainError tienen nombre de contrato distinto")
    func theNineVariantsHaveNineDistinctContractNames() {
        let all: [DomainError] = [
            .Length(field: "cci", expected: 20, received: 18),
            .CheckDigit,
            .UnknownBank(code: "002"),
            .InvalidAmount(detail: "cero"),
            .AccountNotFound(id: "x"),
            .SameAccount,
            .InsufficientFunds(available: "0.00", required: "1.00"),
            .Encryption(detail: "nonce"),
            .OutOfRange(field: "monto"),
        ]
        let names = Set(all.map(\.contractName))
        #expect(names.count == 9)
        // Todo nombre de error que aparece en cases.json tiene que ser uno de los nueve.
        let used = Set(
            contract.transfer.compactMap(\.error)
                + contract.cci.compactMap(\.error)
                + contract.card.compactMap(\.error)
        )
        #expect(used.subtracting(names).isEmpty, "cases.json usa un error que el core no tiene")
    }

    @Test("guardia: el messages.es.json del bundle cubre las nueve variantes")
    func theBundledMessagesCoverTheNineVariants() throws {
        // La única guardia que Rust no puede dar: Rust lee el archivo fuente con
        // `include_str!` y esta app lee lo que copió la Run Script Phase. Un asset viejo
        // o truncado dejaría a Rust en verde y a la pantalla de error mostrando otra cosa.
        let source = try BundleMessageSource(bundle: Bundle(for: BundleToken.self))
        let table = source.messages()
        let names = [
            "Longitud", "DigitoControl", "BancoDesconocido", "MontoInvalido",
            "CuentaNoEncontrada", "MismaCuenta", "SaldoInsuficiente", "Cifrado", "FueraDeRango",
        ]
        for name in names {
            #expect(table[name] != nil, "messages.es.json no tiene el mensaje de `\(name)`")
        }
        #expect(table.count == 9)
    }

    // ── Los 28 casos ──────────────────────────────────────────────────────────

    @Test("aritmetica", arguments: ContractFixtures.contract.arithmetic)
    func arithmetic(_ c: ArithmeticCase) throws {
        let actual =
            switch c.op {
            case "sumar": try add(a: c.a, b: c.b)
            case "restar": try subtract(a: c.a, b: c.b)
            default: throw ContractFixtures.FixtureError.missing("op desconocida: \(c.op)")
            }
        #expect(actual == c.expected)
    }

    @Test("itf", arguments: ContractFixtures.contract.itf)
    func itf(_ c: ItfCase) throws {
        #expect(try calculateItf(amount: c.input) == c.expected)
    }

    @Test("cci", arguments: ContractFixtures.contract.cci)
    func cci(_ c: CciCase) throws {
        if c.valid {
            let expected = try #require(c.expected)
            let actual = try validateCci(cci: c.input)
            #expect(actual.bankCode == expected.bankCode)
            #expect(actual.bankName == expected.bankName)
            #expect(actual.branch == expected.branch)
            #expect(actual.account == expected.account)
        } else {
            let expected = try #require(c.error)
            do {
                _ = try validateCci(cci: c.input)
                Issue.record("\(c.id): se esperaba \(expected) y no lanzó")
            } catch let e as DomainError {
                #expect(e.contractName == expected)
            }
        }
    }

    @Test("tarjeta", arguments: ContractFixtures.contract.card)
    func card(_ c: CardCase) throws {
        if c.valid {
            let expected = try #require(c.expected)
            let actual = try validateCard(number: c.input)
            #expect(actual.brand == expected.brand)
            #expect(actual.masked == expected.masked)

            // El cifrado usa nonce FIJO a propósito: es lo que hace que las cuatro
            // plataformas produzcan el mismo hex y se pueda comparar en la demo.
            let hex = try encrypt(
                text: c.input,
                keyHex: contract.demoKeyHex,
                nonceHex: contract.demoNonceHex
            )
            #expect(hex == expected.cipherHex)

            // La vuelta completa: sin esto, el hex es indistinguible de un hash.
            let back = try decrypt(
                ciphertextHex: hex,
                keyHex: contract.demoKeyHex,
                nonceHex: contract.demoNonceHex
            )
            #expect(back == c.input)
        } else {
            let expected = try #require(c.error)
            do {
                _ = try validateCard(number: c.input)
                Issue.record("\(c.id): se esperaba \(expected) y no lanzó")
            } catch let e as DomainError {
                #expect(e.contractName == expected)
            }
        }
    }

    @Test("transferencia", arguments: ContractFixtures.contract.transfer)
    func transfer(_ c: TransferCase) throws {
        // Cada caso arranca de las cuentas iniciales: tr-001 y tr-002 parten los dos de
        // 5000.00 / 1200.50, así que el estado NO se arrastra entre casos.
        let accounts = contract.initialAccounts.map {
            Account(id: $0.id, holder: $0.holder, balance: $0.balance)
        }
        let request = TransferRequest(
            origin: c.input.origin,
            destination: c.input.destination,
            amount: c.input.amount
        )

        if c.valid {
            let expected = try #require(c.expected)
            let result = try executeTransfer(accounts: accounts, request: request)
            #expect(result.itfFee == expected.itfFee)
            #expect(result.totalDebited == expected.totalDebited)
            #expect(result.receipt == expected.receipt)
            #expect(result.simulatedLatencyMs == expected.simulatedLatencyMs)
            #expect(result.accounts.count == expected.accounts.count)
            for (actual, want) in zip(result.accounts, expected.accounts) {
                #expect(actual.id == want.id)
                #expect(actual.holder == want.holder)
                #expect(actual.balance == want.balance)
            }
        } else {
            let expected = try #require(c.error)
            do {
                _ = try executeTransfer(accounts: accounts, request: request)
                Issue.record("\(c.id): se esperaba \(expected) y no lanzó")
            } catch let e as DomainError {
                #expect(e.contractName == expected)
            }
        }
    }

    private final class BundleToken {}
}
