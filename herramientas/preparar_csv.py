"""Une los CSV de las tablas 1 a 9 en un solo archivo listo para cargar a Supabase.

Uso: python preparar_csv.py <carpeta_con_tablaN_*.csv> <salida.csv> [vigencia]

Cada fila de salida es una línea de vehículo; los valores por año modelo van en una
columna JSON en PESOS (el Ministerio los publica en miles de pesos).
"""
import csv, glob, json, os, re, sys

carpeta, salida = sys.argv[1], sys.argv[2]
VIGENCIA = int(sys.argv[3]) if len(sys.argv) > 3 else 2026

CATEGORIA = {1: "automoviles", 2: "camionetas_camperos", 3: "doble_cabina", 4: "electricos",
             5: "motos", 6: "pasajeros", 7: "carga", 8: "ambulancias", 9: "hibridos"}
ANIOS = ["2001_y_anteriores"] + [str(y) for y in range(2002, 2026)]
COLS = ["vigencia", "tabla", "categoria", "id_origen", "tipo", "clase", "marca", "linea",
        "cilindraje", "cilindraje_cc", "potencia_kw", "tonelaje", "pasajeros",
        "es_respaldo", "valor_aproximado", "valores"]


def numero(txt):
    """'1,2' -> 1.2 ; '480 kg' -> 0.48 ; no numérico -> None."""
    txt = (txt or "").strip().lower()
    m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(kg)?", txt)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    return v / 1000 if m.group(2) else v


def pesos(celda):
    """Valor en miles de pesos (a veces '1E+06' por un defecto del PDF) -> (pesos, aproximado)."""
    celda = celda.strip()
    return int(round(float(celda))) * 1000, bool(re.search(r"e\+", celda, re.I))


filas = 0
with open(salida, "w", newline="", encoding="utf-8") as out:
    w = csv.writer(out)
    w.writerow(COLS)
    for f in sorted(glob.glob(os.path.join(carpeta, "tabla*_2026.csv"))):
        tabla = int(re.search(r"tabla(\d)_", os.path.basename(f)).group(1))
        for r in csv.DictReader(open(f, encoding="utf-8")):
            valores, aprox = {}, False
            for col in ANIOS:
                if r[col] != "":
                    valores[col[:4]], a = pesos(r[col])
                    aprox = aprox or a
            if not valores:
                continue
            cil = r["cilindraje"].strip()
            kw = re.fullmatch(r"([\d.,]+)\s*kw", cil, re.I)
            cc = int(cil) if re.fullmatch(r"\d+", cil) else None
            w.writerow([
                VIGENCIA, tabla, CATEGORIA[tabla], r["id"], r["tipo"], r["clase"], r["marca"],
                r["linea"], cil, cc if cc is not None else "",
                numero(kw.group(1)) if kw else "",
                numero(r["tonelaje"]) if numero(r["tonelaje"]) is not None else "",
                int(r["pasajeros"]) if r["pasajeros"].isdigit() else "",
                "NO INCLUIDOS" in r["linea"].upper(), aprox,
                json.dumps(valores, separators=(",", ":")),
            ])
            filas += 1
print("filas escritas:", filas, "->", salida)
