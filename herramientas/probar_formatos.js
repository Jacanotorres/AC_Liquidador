// Prueba del llenado de la plantilla con un .xlsx mínimo inventado (no usa tu plantilla real).
// Requiere: npm install jszip   (solo para esta prueba). Uso: node herramientas/probar_formatos.js
const assert = require("assert");
const JSZip = require("jszip");
const F = require(__dirname + "/../formatos.js");

async function plantillaMinima() {
  const z = new JSZip();
  z.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  z.file("xl/workbook.xml", '<?xml version="1.0"?><workbook xmlns="x" xmlns:r="r"><sheets><sheet name="Datos Basicos" sheetId="1" r:id="rId1"/><sheet name="Formato" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191028"/></workbook>');
  z.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/></Relationships>');
  const celdas = F.CAMPOS.map((c) => `<c r="${c.celda}" s="5" t="s"><v>0</v></c>`).join("");
  const filas = F.CAMPOS.map((c, i) => `<row r="${c.celda.slice(1)}">${`<c r="${c.celda}" s="5" t="s"><v>${i}</v></c>`}</row>`).join("");
  z.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>${filas}</sheetData></worksheet>`);
  z.file("xl/worksheets/sheet2.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="str"><f>+'Datos Basicos'!C3</f><v>VIEJO</v></c><c r="B1"><f>TODAY()</f><v>1</v></c><c r="C1" t="str"><f>'Datos Basicos'!C25</f><v>VIEJO</v></c></row></sheetData></worksheet>`);
  return z.generateAsync({ type: "uint8array" });
}

(async () => {
  const v = F.valoresDesdeTarjeta({ marca: "Toyota", linea: "Corolla", modelo: 2020, cilindraje_cc: 1798, placa: "abc-123", pasajeros: 5,
    propietario: { apellido1: "Gómez", apellido2: "Ruíz", nombre1: "Luis", nombre2: "Fernando", documento: "1.234.567" } });
  v.c_direccion = "Av 5 # 6 & <7>";
  const celdas = F.valoresPorCelda(v);
  assert.strictEqual(celdas.C15, "ABC123"); assert.strictEqual(celdas.C13, "ABC"); assert.strictEqual(celdas.C14, "123");
  assert.strictEqual(celdas.C20, "LUIS FERNANDO GÓMEZ RUÍZ"); assert.strictEqual(celdas.C25, "LUIS FERNANDO");
  assert.strictEqual(celdas.C26, "1234567"); assert.strictEqual(celdas.C31, ""); assert.strictEqual(celdas.C5, "2020");
  console.log("OK   valores: mayúsculas, placa partida, nombres y números solo con dígitos");

  const { bytes, faltantes, refrescadas } = await F.llenarPlantilla(JSZip, await plantillaMinima(), celdas);
  assert.deepStrictEqual(faltantes, []);
  const z = await JSZip.loadAsync(bytes);
  const hoja = await z.file("xl/worksheets/sheet1.xml").async("string");
  assert.ok(hoja.includes('<c r="C3" s="5" t="inlineStr"><is><t xml:space="preserve">TOYOTA</t></is></c>'));
  assert.ok(hoja.includes("AV 5 # 6 &amp; &lt;7&gt;"), "escapa & < >");
  assert.ok(/<c r="C31" s="5"\/>/.test(hoja), "un valor vacío limpia la celda (no deja datos viejos)");
  const f = await z.file("xl/worksheets/sheet2.xml").async("string");
  assert.ok(f.includes("<v>TOYOTA</v>") && f.includes("<v>LUIS FERNANDO</v>") && !f.includes("VIEJO"), "valores guardados de las fórmulas");
  assert.ok(f.includes("<f>TODAY()</f><v>1</v>"), "otras fórmulas no se tocan");
  assert.strictEqual(refrescadas, 2);
  assert.ok((await z.file("xl/workbook.xml").async("string")).includes('fullCalcOnLoad="1"'));
  console.log("OK   plantilla: celdas escritas, vacíos limpiados, caché de fórmulas y recálculo al abrir");

  await assert.rejects(() => F.llenarPlantilla(JSZip, new Uint8Array([1, 2, 3]), celdas));
  const sinHoja = new JSZip();
  sinHoja.file("xl/workbook.xml", '<workbook xmlns:r="r"><sheets><sheet name="Otra" sheetId="1" r:id="rId1"/></sheets></workbook>');
  sinHoja.file("xl/_rels/workbook.xml.rels", "<Relationships/>");
  const bytesSinHoja = await sinHoja.generateAsync({ type: "uint8array" });
  await assert.rejects(() => F.llenarPlantilla(JSZip, bytesSinHoja, celdas), /Datos Basicos/);
  console.log("OK   archivos inválidos o sin la hoja 'Datos Basicos' dan un error claro");
  console.log("\n3 pruebas pasaron");
})();
