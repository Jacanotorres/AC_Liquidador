import csv, sys, re, pdfplumber

src, dst = sys.argv[1], sys.argv[2]
YEARS = ["2001_y_anteriores"] + [str(y) for y in range(2002, 2026)]
HEAD = ["id", "tipo", "clase", "marca", "linea", "cilindraje", "tonelaje", "pasajeros"] + YEARS

def clean(c):
    return re.sub(r"\s+", " ", c).strip() if c else ""

rows, skipped = [], []
with pdfplumber.open(src) as pdf:
    for n, page in enumerate(pdf.pages, 1):
        for table in page.extract_tables():
            for r in table:
                r = [clean(c) for c in r]
                if not r or r[0] == "ID" or "AÑO MODELO" in " ".join(r) or "CAPACIDAD" in " ".join(r):
                    continue
                if len(r) != len(HEAD) or not r[1] or not (r[0].isdigit() or r[0] == ""):
                    skipped.append((n, r)); continue
                rows.append(r)

with open(dst, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(HEAD); w.writerows(rows)
print("filas:", len(rows), "descartadas:", len(skipped))
for s in skipped[:10]: print(s)
