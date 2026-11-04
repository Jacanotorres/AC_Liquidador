// Comprueba que la plantilla integrada (plantillas/documentos-compra.xlsx) no trae datos de personas
// y que se llena bien. Requiere: npm install jszip. Uso: node herramientas/probar_plantilla.js
const assert = require("assert"), fs = require("fs"), path = require("path");
const JSZip = require("jszip");
const F = require(path.join(__dirname, "..", "formatos.js"));

(async () => {
  const bytes = fs.readFileSync(path.join(__dirname, "..", "plantillas", "documentos-compra.xlsx"));
  const z = await JSZip.loadAsync(bytes);
  const texto = async (n) => z.file(n).async("string");

  // 1) La hoja de datos está vacía (salvo la empresa, C42:C44)
  const hoja = await texto("xl/worksheets/sheet1.xml");
  for (let i = 3; i <= 40; i++) {
    const m = new RegExp(`<c r="C${i}"[^>]*?(/>|>([\\s\\S]*?)</c>)`).exec(hoja);
    assert.ok(m, `existe C${i}`);
    assert.ok(!m[2] || !/<v>/.test(m[2]), `C${i} debe estar vacía`);
  }
  console.log("OK   Datos Basicos: C3:C40 vacías (listas para llenar)");

  // 2) Ninguna fórmula trae un valor guardado de un ejemplo anterior
  let conValor = 0;
  for (const n of Object.keys(z.files).filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) {
    conValor += ((await texto(n)).match(/<f[^>]*?(?:\/>|>[\s\S]*?<\/f>)<v>/g) || []).length;
  }
  assert.strictEqual(conValor, 0);
  console.log("OK   fórmulas sin valores guardados de ejemplos anteriores");

  // 3) Propiedades del documento sin nombres de personas
  assert.ok(/<dc:creator>AC Studio<\/dc:creator>/.test(await texto("docProps/core.xml")));
  assert.ok(/<cp:lastModifiedBy>AC Studio<\/cp:lastModifiedBy>/.test(await texto("docProps/core.xml")));
  console.log("OK   propiedades del documento: autor AC Studio");

  // 4) Se llena sin celdas faltantes y conserva las imágenes de los formularios
  const v = F.valoresDesdeTarjeta({ marca: "Toyota", linea: "Corolla", modelo: 2020, placa: "abc123", propietario: { apellido1: "Gomez", apellido2: "Ruiz", nombre1: "Luis", documento: "123" } });
  const r = await F.llenarPlantilla(JSZip, bytes, F.valoresPorCelda(v));
  assert.deepStrictEqual(r.faltantes, []);
  assert.ok(r.refrescadas >= 100, "se actualizan los valores de los formatos");
  const salida = await JSZip.loadAsync(r.bytes);
  assert.strictEqual(Object.keys(salida.files).filter((n) => n.startsWith("xl/media/")).length, Object.keys(z.files).filter((n) => n.startsWith("xl/media/")).length);
  console.log(`OK   se llena sin celdas faltantes (${r.refrescadas} valores de formatos actualizados) y conserva las imágenes`);
  console.log("\n4 pruebas pasaron");
})();
