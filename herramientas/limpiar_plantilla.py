"""Deja una copia de la plantilla de Excel lista para incluirla en la aplicación, sin datos de personas.

Uso: python herramientas/limpiar_plantilla.py "Documentos Compra De Vehiculos.xlsx" plantillas/documentos-compra.xlsx

Qué hace (solo con la biblioteca estándar, editando el .xlsx por dentro para no perder logos ni estilos):
  1. Vacía los datos de ejemplo de la hoja "Datos Basicos" (vehículo, propietario y comprador: C3:C40).
     Las celdas de la empresa (C42:C44) se conservan.
  2. Borra el valor guardado de todas las fórmulas de las hojas de formatos (traían los datos del ejemplo);
     Excel los recalcula al abrir.
  3. Vacía del archivo de textos compartidos los textos que solo usaban esos datos de ejemplo.
  4. Cambia el autor y el último autor de las propiedades del documento.
  5. Verifica que ningún dato personal de ejemplo (propietario, comprador, cédulas, teléfonos) quede en el archivo.
"""
import re
import sys
import zipfile

origen, destino = sys.argv[1], sys.argv[2]
AUTOR = "AC Studio"

z = zipfile.ZipFile(origen)
partes = {n: z.read(n) for n in z.namelist()}
infos = {i.filename: i for i in z.infolist()}
txt = lambda n: partes[n].decode("utf-8")

# Hoja "Datos Basicos"
wb = txt("xl/workbook.xml")
rid = re.search(r'<sheet\b[^>]*name="Datos Basicos"[^>]*r:id="([^"]+)"', wb).group(1)
destino_hoja = re.search(r'<Relationship\b[^>]*Id="%s"[^>]*Target="([^"]+)"' % rid, txt("xl/_rels/workbook.xml.rels")).group(1)
hoja = "xl/" + re.sub(r"^/?(xl/)?", "", destino_hoja)

# Textos compartidos
ss = txt("xl/sharedStrings.xml")
sis = re.findall(r"<si>.*?</si>|<si/>", ss, re.S)
valor_si = lambda i: re.sub(r"<[^>]+>", "", sis[i])

# 1) Vaciar C3:C40 de Datos Basicos y recordar los valores de ejemplo
xml = txt(hoja)
ejemplos, idx_ejemplo = set(), set()
personales = set()   # lo que de verdad no debe quedar: propietario/comprador (filas 20-40) y cualquier número largo
for fila in range(3, 41):
    m = re.search(r'<c r="C%d"([^>]*?)(?:/>|>([\s\S]*?)</c>)' % fila, xml)
    if not m:
        continue
    attrs, cuerpo = m.group(1), m.group(2) or ""
    v = re.search(r"<v>([^<]*)</v>", cuerpo)
    if v:
        dato = valor_si(int(v.group(1))) if 't="s"' in attrs else v.group(1)
        if 't="s"' in attrs:
            idx_ejemplo.add(int(v.group(1)))
        ejemplos.add(dato)
        if fila >= 20 or re.search(r"\d{7,}", dato):
            personales.add(dato)
    nuevos = re.sub(r'\s+t="[^"]*"', "", attrs).rstrip("/")
    xml = xml.replace(m.group(0), '<c r="C%d"%s/>' % (fila, nuevos), 1)
partes[hoja] = xml.encode("utf-8")

# 2) Valores guardados de las fórmulas, en todas las hojas
nombres_hojas = [n for n in partes if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)]
borrados = 0
for n in nombres_hojas:
    s = txt(n)
    def sin_valor(m):
        global borrados
        borrados += 1
        attrs = re.sub(r'\s+t="[^"]*"', "", m.group(1))
        return '<c r="%s"%s>%s</c>' % (m.group(0).split('"')[1], attrs, m.group(2))
    s = re.sub(r'<c r="[A-Z]+\d+"([^>]*)>(<f[^>]*?(?:/>|>[\s\S]*?</f>))<v>[\s\S]*?</v></c>', sin_valor, s)
    partes[n] = s.encode("utf-8")

# 3) Textos compartidos que ya no usa ninguna celda y eran de los datos de ejemplo
usados = set()
for n in nombres_hojas:
    usados |= {int(i) for i in re.findall(r't="s"[^>]*><v>(\d+)</v>', txt(n))}
for i in idx_ejemplo - usados:
    sis[i] = "<si><t></t></si>"
if idx_ejemplo - usados:
    it = iter(sis)
    partes["xl/sharedStrings.xml"] = re.sub(r"<si>.*?</si>|<si/>", lambda m: next(it), ss, flags=re.S).encode("utf-8")

# 4) Propiedades del documento
core = txt("docProps/core.xml")
core = re.sub(r"(<dc:creator>)[^<]*(</dc:creator>)", r"\g<1>%s\g<2>" % AUTOR, core)
core = re.sub(r"(<cp:lastModifiedBy>)[^<]*(</cp:lastModifiedBy>)", r"\g<1>%s\g<2>" % AUTOR, core)
partes["docProps/core.xml"] = core.encode("utf-8")

# Que Excel recalcule todo al abrir
wb2 = re.sub(r"<calcPr\b([^>]*?)/>", lambda m: m.group(0) if "fullCalcOnLoad" in m.group(0) else '<calcPr%s fullCalcOnLoad="1"/>' % m.group(1), wb)
partes["xl/workbook.xml"] = wb2.encode("utf-8")

# 5) Verificación: ningún dato de ejemplo debe quedar en el archivo
todo = "\n".join(p.decode("utf-8", "ignore") for n, p in partes.items() if n.endswith((".xml", ".rels")))
rastros = sorted(e for e in personales if len(e) >= 4 and e in todo)
print(f"valores de ejemplo vaciados: {len(ejemplos)} (personales verificados: {len(personales)}) | fórmulas con valor guardado borrado: {borrados} | textos compartidos vaciados: {len(idx_ejemplo - usados)}")
print("autor ahora:", re.search(r"<dc:creator>([^<]*)", partes["docProps/core.xml"].decode()).group(1))
if rastros:
    print("OJO, quedan estos valores de ejemplo en el archivo:", rastros)
    sys.exit(1)
print("verificación: no queda ningún dato personal de ejemplo en el archivo")

with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as out:
    for n in z.namelist():                      # mismo orden que el original
        i = zipfile.ZipInfo(n, date_time=infos[n].date_time)
        i.compress_type = zipfile.ZIP_DEFLATED
        out.writestr(i, partes[n])
print("escrito:", destino)
