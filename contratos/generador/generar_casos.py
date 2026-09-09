#!/usr/bin/env python3
"""
Implementación de REFERENCIA para derivar contratos/casos.json v1.0.0.

QUÉ ES: una implementación independiente, en Python con Decimal, de los mismos
algoritmos que rust-core debe implementar. Se usó una sola vez para derivar los
valores esperados del contrato.

QUÉ NO ES: no es parte del build, no la consume ninguna app, y NO es fuente de
verdad. La fuente de verdad es casos.json, que queda congelado. Si algún día
este script y casos.json discrepan, gana casos.json.

POR QUÉ EXISTE: derivar los esperados con una implementación independiente de
Rust mantiene el contrato como contrato. Si Rust y este script coinciden, dos
implementaciones independientes llegaron al mismo string — eso es señal. Si se
hubieran generado corriendo el propio core, casos.json sería un snapshot de la
implementación y consagraría cualquier bug como "lo esperado".

DATOS DUMMY: las tasas, códigos de banco y montos son inventados para la POC.
No corresponden a productos reales del banco. Lo que la POC demuestra no es la
exactitud financiera sino que cuatro plataformas producen EL MISMO string.
"""
from decimal import Decimal, getcontext, ROUND_HALF_UP
import json

getcontext().prec = 50

DOS = Decimal("0.01")
# MidpointAwayFromZero de rust_decimal == ROUND_HALF_UP para positivos
def r2(x): return x.quantize(DOS, rounding=ROUND_HALF_UP)

# ---------------------------------------------------------------- dummy config
ALICUOTA_ITF = Decimal("0.00005")          # 0.005 %
BANCOS = {"002": "Banco Demo Uno", "011": "Banco Demo Dos", "009": "Banco Demo Tres"}
PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
PESOS_CCI = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]  # 18 posiciones

# ------------------------------------------------------------------ algoritmos
def digitos_control_cci(primeros18: str) -> str:
    """Dos dígitos de control sobre las 18 primeras posiciones.
    d19: mod 11 ponderado sobre las 18. d20: mod 11 ponderado sobre 18 + d19."""
    s = sum(int(d) * w for d, w in zip(primeros18, PESOS_CCI))
    d19 = (11 - (s % 11)) % 11
    if d19 > 9: d19 = 0
    s2 = sum(int(d) * w for d, w in zip(primeros18 + str(d19), PESOS_CCI + [2]))
    d20 = (11 - (s2 % 11)) % 11
    if d20 > 9: d20 = 0
    return f"{d19}{d20}"

def digito_ruc(primeros10: str) -> int:
    s = sum(int(d) * w for d, w in zip(primeros10, PESOS_RUC))
    resto = 11 - (s % 11)
    return {10: 0, 11: 1}.get(resto, resto)

def itf(monto: Decimal) -> Decimal:
    return r2(monto * ALICUOTA_ITF)

def tem_desde_tea(tea_pct: Decimal) -> Decimal:
    """Tasa efectiva mensual desde la TEA porcentual: (1+TEA)^(1/12) - 1."""
    tea = tea_pct / Decimal(100)
    return (Decimal(1) + tea) ** (Decimal(1) / Decimal(12)) - Decimal(1)

def cronograma(monto: Decimal, tea_pct: Decimal, n: int, seguro_pct: Decimal):
    """Método francés, cuota base constante. El seguro se calcula sobre el saldo
    del período anterior y se suma a la cuota. El descuadre por redondeo se
    ajusta en la ÚLTIMA cuota para que sum(capital) == monto exacto."""
    i = tem_desde_tea(tea_pct)
    seg = seguro_pct / Decimal(100)
    cuota_base = r2(monto * i / (Decimal(1) - (Decimal(1) + i) ** Decimal(-n)))

    cuotas, saldo, flujo = [], monto, [-monto]
    for k in range(1, n + 1):
        interes = r2(saldo * i)
        seguro = r2(saldo * seg)
        capital = cuota_base - interes
        if k == n:                       # última: absorbe el ajuste por redondeo
            capital = saldo
        capital = r2(capital)
        total = r2(capital + interes + seguro)
        saldo = r2(saldo - capital)
        flujo.append(total)
        cuotas.append({"numero": k, "capital": str(capital), "interes": str(interes),
                       "seguro": str(seguro), "cuota_total": str(total), "saldo": str(saldo)})

    assert saldo == Decimal("0.00"), f"saldo final {saldo} != 0"
    assert sum(Decimal(c["capital"]) for c in cuotas) == monto, "capitales != monto"
    return cuotas, r2(sum(Decimal(c["interes"]) for c in cuotas)), tcea(flujo)

def tcea(flujo) -> Decimal:
    """TIR mensual por Newton-Raphson sobre el flujo real, anualizada.
    Tolerancia 1e-10, máx 100 iteraciones (igual que rust-core/CONTEXT.md)."""
    x = Decimal("0.01")
    for _ in range(100):
        van = sum(cf / (Decimal(1) + x) ** Decimal(t) for t, cf in enumerate(flujo))
        d = sum(-Decimal(t) * cf / (Decimal(1) + x) ** Decimal(t + 1)
                for t, cf in enumerate(flujo))
        if d == 0: raise ValueError("derivada nula")
        nx = x - van / d
        if abs(nx - x) < Decimal("1e-10"):
            x = nx; break
        x = nx
    anual = ((Decimal(1) + x) ** Decimal(12) - Decimal(1)) * Decimal(100)
    return r2(anual)

# ----------------------------------------------------------------------- casos
def caso_cci(banco, oficina, cuenta, cid, romper=None):
    p18 = banco + oficina + cuenta
    cci = p18 + digitos_control_cci(p18)
    if romper == "control":                       # invalida el último dígito
        cci = cci[:19] + str((int(cci[19]) + 1) % 10)
    elif romper == "longitud":
        cci = cci[:18]
    valido = romper is None
    c = {"id": cid, "entrada": cci, "valido": valido}
    if valido:
        c["esperado"] = {"codigo_banco": banco, "nombre_banco": BANCOS[banco],
                         "oficina": oficina, "cuenta": cuenta}
    else:
        c["error"] = "DigitoControl" if romper == "control" else "Longitud"
    return c

def main():
    casos = {
        "version": "1.0.0",
        "moneda": "PEN",
        "_nota": ("Datos DUMMY para la POC. Tasas, codigos de banco y montos son "
                  "inventados y no corresponden a productos reales. Lo que se "
                  "demuestra es que las 4 plataformas producen el MISMO string, "
                  "no la exactitud financiera."),
        "_alicuota_itf": str(ALICUOTA_ITF),
        "cci": [], "ruc": [], "itf": [], "cronograma": [],
    }

    casos["cci"] = [
        caso_cci("002", "191", "001234567890", "cci-001"),
        caso_cci("011", "220", "009876543210", "cci-002"),
        caso_cci("002", "191", "001234567890", "cci-003", romper="control"),
        caso_cci("002", "191", "001234567890", "cci-004", romper="longitud"),
    ]

    for cid, base in [("ruc-001", "2010012345"), ("ruc-002", "1023456789")]:
        ruc = base + str(digito_ruc(base))
        casos["ruc"].append({"id": cid, "entrada": ruc, "valido": True})
    malo = "2010012345" + str((digito_ruc("2010012345") + 1) % 10)
    casos["ruc"].append({"id": "ruc-003", "entrada": malo, "valido": False,
                         "error": "DigitoControl"})
    casos["ruc"].append({"id": "ruc-004", "entrada": "201001234", "valido": False,
                         "error": "Longitud"})

    for cid, m in [("itf-001", "1000.00"), ("itf-002", "3500.00"),
                   ("itf-003", "150.00"), ("itf-004", "87654.32")]:
        casos["itf"].append({"id": cid, "entrada": m, "esperado": str(itf(Decimal(m)))})

    escenarios = [
        ("cred-001", "15000.00", "18.50", 24, "0.05"),   # base
        ("cred-002", "10000.00", "22.00", 12, "0.00"),   # sin seguro, plazo corto
        ("cred-003", "37500.55", "15.75", 48, "0.03"),   # monto con centavos, plazo largo
    ]
    for cid, monto, tea, n, seg in escenarios:
        cuotas, total_int, t = cronograma(Decimal(monto), Decimal(tea), n, Decimal(seg))
        casos["cronograma"].append({
            "id": cid,
            "entrada": {"monto": monto, "tea": tea, "cuotas": n, "seguro": seg},
            "esperado": {
                "tcea": str(t),
                "total_intereses": str(total_int),
                "primera_cuota": cuotas[0]["cuota_total"],
                "ultima_cuota": cuotas[-1]["cuota_total"],
                "cuotas": cuotas,
            },
        })

    print(json.dumps(casos, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
