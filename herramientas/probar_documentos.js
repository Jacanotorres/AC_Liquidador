// Pruebas de los documentos (FUN, compraventa y mandato): lectura de la plantilla, páginas, textos, PDF y
// Excel individual. Usa datos inventados. Requiere: npm install jszip jspdf. Uso: node herramientas/probar_documentos.js
const assert = require("assert"), fs = require("fs"), path = require("path");
const JSZip = require("jszip"), { jsPDF } = require("jspdf");
const R = path.join(__dirname, "..");
const Hoja = require(path.join(R, "hoja.js")), Dibujo = require(path.join(R, "dibujo.js")), F = require(path.join(R, "formatos.js"));
const DOCS = [
  { id: "fun", hoja: "FunVed-Comp", paginas: 2, imagenes: 8, textos: ["TOYOTA", "COROLLA XEI", "ABC", "123", "GOMEZ", "PEREZ", "1234567", "2ZR1234567"] },
  { id: "compraventa", hoja: "COMPRA VENTA", paginas: 1, imagenes: 0, textos: ["TOYOTA", "ABC123", "LUIS", "ANA", "PEREZ", "987654321"] },
  { id: "mandato", hoja: "Contrato de Mandato Vend", paginas: 1, imagenes: 0, textos: ["ABC123", "1234567", "LUIS"] },
];

(async () => {
  const bytes = fs.readFileSync(path.join(R, "plantillas", "documentos-compra.xlsx"));
  const libro = await Hoja.leerLibro(JSZip, bytes);
  const base = await Hoja.leerHoja(libro, "Datos Basicos");
  const medir = Dibujo.crearMedidor(jsPDF);
  const imagenes = {};
  for (const ruta of Object.keys(libro.zip.files).filter((n) => /^xl\/media\/.+\.png$/i.test(n))) imagenes[ruta] = "data:image/png;base64," + (await libro.zip.file(ruta).async("base64"));
  imagenes["xl/media/image6.emf"] = "data:image/png;base64," + fs.readFileSync(path.join(R, "assets", "logo-runt.png")).toString("base64");

  const v = F.valoresDesdeTarjeta({ marca: "TOYOTA", linea: "COROLLA XEI", modelo: 2020, cilindraje_cc: 1798, motor: "2ZR1234567", placa: "ABC123", pasajeros: 5,
    propietario: { apellido1: "GOMEZ", apellido2: "RUIZ", nombre1: "LUIS", nombre2: "FERNANDO", documento: "1234567" } });
  Object.assign(v, { c_apellido1: "PEREZ", c_apellido2: "SOTO", c_nombre1: "ANA", c_cedula: "987654321" });
  const celdas = F.valoresPorCelda(v);
  const lleno = (await F.llenarPlantilla(JSZip, bytes, celdas)).bytes;

  for (const d of DOCS) {
    const h = await Hoja.leerHoja(libro, d.hoja);
    const r = Hoja.armarPaginas(h, libro.est, { datos: celdas, base, hoy: new Date(), medir, imagenes });
    assert.strictEqual(r.paginas.length, d.paginas, `${d.id}: páginas`);
    const textos = r.paginas.flatMap((p) => p.ops.filter((o) => o.t === "texto").map((o) => o.s)).join(" ");
    for (const t of d.textos) assert.ok(textos.includes(t), `${d.id}: debe aparecer "${t}"`);
    for (const p of r.paginas) for (const o of p.ops) {
      const xs = o.t === "linea" ? [o.x1, o.x2] : [o.x, o.x + (o.w || 0)], ys = o.t === "linea" ? [o.y1, o.y2] : [o.y - (o.t === "texto" ? 0 : 0), o.y + (o.h || 0)];
      assert.ok(Math.min(...xs) >= -1 && Math.max(...xs) <= p.ancho + 1, `${d.id}: algo se sale de la página por el ancho`);
      assert.ok(Math.min(...ys) >= -1 && Math.max(...ys) <= p.alto + 1, `${d.id}: algo se sale de la página por el alto`);
      if (o.t === "texto") assert.notStrictEqual(o.f.color, "#ffffff", `${d.id}: no se dibuja texto blanco (invisible en Excel)`);
    }
    if (d.id === "fun") assert.ok(r.paginas.flatMap((p) => p.ops).filter((o) => o.t === "img").length >= 13, "fun: logos, casillas y tabla");
    const pdf = Dibujo.aPDF(jsPDF, r.paginas);
    assert.strictEqual(pdf.getNumberOfPages(), d.paginas);
    assert.ok(pdf.output("arraybuffer").byteLength > 1500);
    console.log(`OK   ${d.id}: ${r.paginas.length} página(s), ${Math.round(r.escala * 100)}% de escala, PDF generado`);

    // Excel individual: la hoja elegida + "Datos Basicos" oculta, sin relaciones rotas
    const z = await JSZip.loadAsync(await F.soloHoja(JSZip, lleno, d.hoja));
    const wb = await z.file("xl/workbook.xml").async("string");
    const hojas = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*\/>/g)].map((m) => m[1]);
    assert.deepStrictEqual(hojas, ["Datos Basicos", d.hoja], `${d.id}: hojas del Excel`);
    assert.ok(/name="Datos Basicos"[^>]*state="hidden"/.test(wb), "Datos Basicos oculta");
    const nombres = Object.keys(z.files).filter((n) => !z.files[n].dir);
    assert.strictEqual(nombres.filter((n) => n.startsWith("xl/media/")).length, d.imagenes, `${d.id}: imágenes`);
    assert.ok(!z.file("xl/calcChain.xml"));
    const ct = await z.file("[Content_Types].xml").async("string");
    for (const m of ct.matchAll(/<Override\b[^>]*PartName="\/([^"]+)"/g)) assert.ok(z.file(m[1]), `${d.id}: Override sin parte ${m[1]}`);
    for (const n of nombres.filter((x) => x.endsWith(".rels"))) {
      const base0 = n.replace(/(^|\/)_rels\/[^/]*\.rels$/, "$1");
      for (const m of (await z.file(n).async("string")).matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*>/g)) {
        if (/TargetMode="External"/.test(m[0])) continue;
        assert.ok(z.file(m[1].startsWith("/") ? m[1].slice(1) : path.posix.normalize(base0 + m[1])), `${d.id}: relación rota ${n} -> ${m[1]}`);
      }
    }
    console.log(`OK   ${d.id}: Excel individual (${hojas.join(" + ")}), ${d.imagenes} imágenes, paquete consistente`);
  }

  // Campos vacíos: no deben aparecer ceros donde van nombres (en Excel una celda vacía vale 0).
  const vacio = F.valoresPorCelda({});
  for (const d of DOCS.slice(1)) {
    const h = await Hoja.leerHoja(libro, d.hoja);
    const r = Hoja.armarPaginas(h, libro.est, { datos: vacio, base, hoy: new Date(), medir, imagenes });
    const ceros = r.paginas.flatMap((p) => p.ops.filter((o) => o.t === "texto" && o.s === "0"));
    assert.strictEqual(ceros.length, 0, `${d.id}: no debe mostrar "0" por campos vacíos`);
  }
  console.log("OK   campos vacíos: no aparecen ceros");
  console.log("\n7 pruebas pasaron");
})().catch((e) => { console.error(e); process.exit(1); });
