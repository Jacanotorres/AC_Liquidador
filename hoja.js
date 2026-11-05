/* Lee una hoja de la plantilla de Excel (columnas, filas, celdas combinadas, estilos, bordes, textos con
   formato, imágenes) y la convierte en páginas con instrucciones de dibujo ("ops"). Esas mismas páginas se
   dibujan en un PDF (jsPDF) y en la vista previa (canvas), así que lo que se ve es lo que se descarga.

   Funciones sin DOM: window.Hoja en el navegador, module.exports en Node. No usa librerías de Excel:
   lee el XML del .xlsx directamente (igual que formatos.js). Unidades: puntos (pt), como el PDF. */
(function (raiz) {
  const PX = 0.75;                                   // 1 px de Excel = 0,75 pt
  const EMU = 1 / 12700;                             // 1 EMU = 1/12700 pt
  const PAPELES = { 1: [612, 792], 3: [792, 1224], 5: [612, 1008], 8: [841.89, 1190.55], 9: [595.28, 841.89] };
  const PALETA = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "000000", "FFFFFF", "FF0000",
    "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF", "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
    "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF", "000080", "FF00FF", "FFFF00", "00FFFF", "800080",
    "800000", "008080", "0000FF", "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99", "3366FF", "33CCCC",
    "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696", "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333"];

  /* ---------- utilidades ---------- */
  const attr = (tag, n) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(tag || ""); return m ? m[1] : null; };
  const desescapar = (t) => String(t).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\r\n?/g, "\n");                       // saltos de línea de Windows -> \n
  const colANum = (l) => [...l].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  const numACol = (n) => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const partirRef = (ref) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return m ? { col: colANum(m[1]), fila: Number(m[2]) } : null; };
  const anchoColPx = (w) => Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
  const hex = (c) => "#" + c.slice(-6).toLowerCase();

  /* ---------- estilos ---------- */
  function colorDe(tag, tema, paleta) {
    if (!tag) return null;
    const rgb = attr(tag, "rgb"), ind = attr(tag, "indexed"), th = attr(tag, "theme");
    if (rgb) return hex(rgb);
    if (ind !== null) { const i = Number(ind); return i >= 64 ? "#000000" : hex(paleta[i] || "000000"); }
    if (th !== null) return hex(tema[Number(th)] || "000000");
    return null;
  }

  function leerEstilos(xml, temaXml) {
    const tema = [];
    if (temaXml) {
      const orden = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
      for (const n of orden) {
        const m = new RegExp(`<a:${n}>(?:<a:sysClr[^>]*lastClr="(\\w+)"|<a:srgbClr val="(\\w+)")`).exec(temaXml);
        tema.push(m ? (m[1] || m[2]) : "000000");
      }
    }
    const paleta = PALETA.slice();
    const ic = /<indexedColors>([\s\S]*?)<\/indexedColors>/.exec(xml);
    if (ic) [...ic[1].matchAll(/<rgbColor rgb="(\w+)"/g)].forEach((m, i) => { paleta[i] = m[1]; });

    const bloque = (n) => { const m = new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`).exec(xml); return m ? m[1] : ""; };
    const fuentes = (bloque("fonts").match(/<font>[\s\S]*?<\/font>|<font\/>/g) || []).map((f) => ({
      fam: (attr((/<name [^>]*>/.exec(f) || [""])[0], "val") || "Arial"),
      tam: Number(attr((/<sz [^>]*>/.exec(f) || [""])[0], "val")) || 10,
      b: /<b\/>|<b val="1"\/>/.test(f), i: /<i\/>|<i val="1"\/>/.test(f), u: /<u\/>|<u val=/.test(f),
      color: colorDe((/<color [^>]*>/.exec(f) || [""])[0], tema, paleta) || "#000000",
    }));
    const rellenos = (bloque("fills").match(/<fill>[\s\S]*?<\/fill>/g) || []).map((f) => {
      if (!/patternType="solid"/.test(f)) return null;
      const c = colorDe((/<fgColor [^>]*>/.exec(f) || [""])[0], tema, paleta);
      return c && c !== "#ffffff" ? c : null;               // el blanco es el fondo de la hoja
    });
    const lado = (b, n) => {
      const m = new RegExp(`<${n}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${n}>)`).exec(b);
      const estilo = m && attr(m[1], "style");
      return estilo ? { estilo, color: colorDe((/<color [^>]*>/.exec(m[2] || "") || [""])[0], tema, paleta) || "#000000" } : null;
    };
    const bordes = (bloque("borders").match(/<border\b[\s\S]*?<\/border>|<border\/>/g) || []).map((b) => ({
      l: lado(b, "left"), r: lado(b, "right"), t: lado(b, "top"), b: lado(b, "bottom") }));
    const fmts = Object.fromEntries([...xml.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [m[1], desescapar(m[2])]));
    const xfs = (bloque("cellXfs").match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || []).map((x) => {
      const al = (/<alignment\b[^>]*>/.exec(x) || [""])[0];
      return {
        fuente: fuentes[Number(attr(x, "fontId"))] || fuentes[0], relleno: rellenos[Number(attr(x, "fillId"))] || null,
        borde: bordes[Number(attr(x, "borderId"))] || {}, numFmt: Number(attr(x, "numFmtId")) || 0,
        h: attr(al, "horizontal") || "general", v: attr(al, "vertical") || "bottom", wrap: attr(al, "wrapText") === "1",
        rot: Number(attr(al, "textRotation")) || 0, indent: Number(attr(al, "indent")) || 0,
      };
    });
    return { xfs, fuentes, fmts, tema, paleta };
  }

  /* ---------- textos compartidos (con formato por tramos) ---------- */
  function leerTextos(xml, est) {
    if (!xml) return [];
    return (xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map((si) => {
      if (!/<r>/.test(si)) return { texto: desescapar((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")) };
      const tramos = [...si.matchAll(/<r>([\s\S]*?)<\/r>/g)].map((r) => {
        const pr = (/<rPr>([\s\S]*?)<\/rPr>/.exec(r[1]) || [, ""])[1];
        const o = {};
        if (/<b\/>|<b val="1"\/>/.test(pr)) o.b = true;
        if (/<i\/>|<i val="1"\/>/.test(pr)) o.i = true;
        if (/<u\/>|<u val=/.test(pr)) o.u = true;
        const sz = attr((/<sz [^>]*>/.exec(pr) || [""])[0], "val"); if (sz) o.tam = Number(sz);
        const col = colorDe((/<color [^>]*>/.exec(pr) || [""])[0], est.tema, est.paleta); if (col) o.color = col;
        const nm = attr((/<rFont [^>]*>/.exec(pr) || [""])[0], "val"); if (nm) o.fam = nm;
        return { texto: desescapar((/<t[^>]*>([\s\S]*?)<\/t>/.exec(r[1]) || [, ""])[1]), o };
      });
      return { texto: tramos.map((t) => t.texto).join(""), tramos };
    });
  }

  /* ---------- libro y hoja ---------- */
  async function leerLibro(JSZip, bytes) {
    const zip = await JSZip.loadAsync(bytes);
    const txt = async (n) => (zip.file(n) ? zip.file(n).async("string") : null);
    const wb = await txt("xl/workbook.xml"), rels = await txt("xl/_rels/workbook.xml.rels");
    if (!wb || !rels) throw new Error("El archivo no es un Excel (.xlsx) válido.");
    const hojas = {};
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const rid = attr(m[0], "r:id");
      const destino = attr((new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels) || [""])[0], "Target");
      if (destino) hojas[desescapar(attr(m[0], "name"))] = "xl/" + destino.replace(/^\/?(xl\/)?/, "");
    }
    const est = leerEstilos(await txt("xl/styles.xml"), await txt("xl/theme/theme1.xml"));
    return { zip, hojas, est, textos: leerTextos(await txt("xl/sharedStrings.xml"), est), txt };
  }

  async function leerHoja(libro, nombre) {
    const ruta = libro.hojas[nombre];
    if (!ruta) throw new Error(`La plantilla no tiene la hoja "${nombre}".`);
    const xml = await libro.txt(ruta);
    const fmt = /<sheetFormatPr\b[^>]*>/.exec(xml)[0];
    const h = {
      nombre, defFila: Number(attr(fmt, "defaultRowHeight")) || 15, defCol: Number(attr(fmt, "defaultColWidth")) || 9.14,
      cols: [], filas: {}, celdas: {}, merges: [], saltos: [], imagenes: [],
    };
    for (const c of xml.matchAll(/<col\b[^>]*>/g)) {
      h.cols.push({ min: Number(attr(c[0], "min")), max: Number(attr(c[0], "max")), w: Number(attr(c[0], "width")), oculta: attr(c[0], "hidden") === "1" });
    }
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const n = Number(attr(r[1], "r"));
      h.filas[n] = { ht: attr(r[1], "ht") !== null ? Number(attr(r[1], "ht")) : null, custom: attr(r[1], "customHeight") === "1", oculta: attr(r[1], "hidden") === "1" };
      for (const c of (r[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r"), p = partirRef(ref); if (!p) continue;
        const cuerpo = c[2] || "", t = attr(c[1], "t") || "n", v = (/<v>([\s\S]*?)<\/v>/.exec(cuerpo) || [, null])[1];
        const celda = { ...p, ref, estilo: Number(attr(c[1], "s")) || 0, tipo: t };
        const f = /<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/.exec(cuerpo);
        if (f) celda.f = desescapar(f[1] || "");
        if (t === "s" && v !== null) celda.valor = libro.textos[Number(v)] || { texto: "" };
        else if (t === "inlineStr") celda.valor = { texto: desescapar((/<t[^>]*>([\s\S]*?)<\/t>/.exec(cuerpo) || [, ""])[1]) };
        else if (v !== null) celda.valor = t === "n" ? Number(v) : { texto: desescapar(v) };
        h.celdas[ref] = celda;
      }
    }
    for (const m of xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) h.merges.push({ c1: colANum(m[1]), f1: Number(m[2]), c2: colANum(m[3]), f2: Number(m[4]) });
    for (const b of xml.matchAll(/<rowBreaks[\s\S]*?<\/rowBreaks>/g)) for (const x of b[0].matchAll(/<brk id="(\d+)"/g)) h.saltos.push(Number(x[1]));
    const ps = (/<pageSetup\b[^>]*>/.exec(xml) || [""])[0], pm = (/<pageMargins\b[^>]*>/.exec(xml) || [""])[0];
    h.pagina = {
      horizontal: attr(ps, "orientation") === "landscape", escala: Number(attr(ps, "scale")) || 100, papel: Number(attr(ps, "paperSize")) || 1,
      m: { l: Number(attr(pm, "left")) || 0.7, r: Number(attr(pm, "right")) || 0.7, t: Number(attr(pm, "top")) || 0.75, b: Number(attr(pm, "bottom")) || 0.75 },
    };
    // imágenes (drawing)
    const rutaRels = ruta.replace(/worksheets\//, "worksheets/_rels/") + ".rels";
    const rels = await libro.txt(rutaRels), dib = /<drawing r:id="(\w+)"/.exec(xml);
    if (rels && dib) {
      const dt = attr((new RegExp(`<Relationship\\b[^>]*\\bId="${dib[1]}"[^>]*>`).exec(rels) || [""])[0], "Target");
      const rd = "xl/drawings/" + dt.replace(/^\.\.\/drawings\//, "");
      const dxml = await libro.txt(rd), drels = await libro.txt(rd.replace("drawings/", "drawings/_rels/") + ".rels") || "";
      const medio = (rid) => { const t = attr((new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(drels) || [""])[0], "Target"); return t ? "xl/media/" + t.replace(/^\.\.\/media\//, "") : null; };
      const punto = (b, n) => { const m = new RegExp(`<xdr:${n}><xdr:col>(\\d+)</xdr:col><xdr:colOff>(-?\\d+)</xdr:colOff><xdr:row>(\\d+)</xdr:row><xdr:rowOff>(-?\\d+)</xdr:rowOff></xdr:${n}>`).exec(b); return m ? { c: +m[1], co: +m[2], f: +m[3], fo: +m[4] } : null; };
      for (const a of dxml.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
        const rid = (/r:embed="(\w+)"/.exec(a[0]) || [])[1];
        if (rid) h.imagenes.push({ desde: punto(a[0], "from"), hasta: punto(a[0], "to"), media: medio(rid) });
      }
    }
    return h;
  }

  /* ---------- valores de las celdas (con fórmulas) ---------- */
  const serialDe = (d) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
  const fechaDe = (serial) => { const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

  /* contexto: { datos: { C3: "TOYOTA", ... } valores de "Datos Basicos", base: modelo de esa hoja, hoy: Date } */
  function valorDe(h, ref, ctx, prof = 0) {
    const c = h.celdas[ref];
    if (!c) return "";
    if (c.f && prof < 8) {
      const f = c.f.replace(/^\+/, "").trim();
      let m = /^'Datos Basicos'!\$?([A-Z]+)\$?(\d+)$/.exec(f);
      if (m) {
        const r = `${m[1]}${m[2]}`;
        if (r in ctx.datos) return ctx.datos[r];
        const b = ctx.base && ctx.base.celdas[r];
        return b && b.valor !== undefined ? (typeof b.valor === "number" ? b.valor : b.valor.texto) : "";
      }
      if (/^TODAY\(\)$/i.test(f)) return serialDe(ctx.hoy || new Date());
      m = /^\$?([A-Z]+)\$?(\d+)$/.exec(f);
      if (m) return valorDe(h, `${m[1]}${m[2]}`, ctx, prof + 1);
    }
    if (c.valor === undefined) return "";
    return typeof c.valor === "number" ? c.valor : c.valor.texto;
  }

  function formatear(v, numFmt) {
    if (typeof v !== "number") return String(v ?? "");
    if (numFmt === 14 || numFmt === 15 || numFmt === 164) return fechaDe(v);
    if (numFmt === 3 || numFmt === 4 || numFmt === 168 || numFmt === 165 || numFmt === 166) {
      const dec = numFmt === 3 ? 0 : 2;
      return (numFmt >= 165 ? "$ " : "") + v.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  }

  /* ---------- texto con tramos: partir en palabras y ajustar a líneas ---------- */
  const FAM = (n) => (/times|serif/i.test(n) && !/sans/i.test(n) ? "times" : /courier|mono/i.test(n) ? "courier" : "helvetica");
  const LINEA = 1.2, ASCENSO = 0.92;

  function fuenteDe(est, extra) {
    const f = est.fuente, o = extra || {};
    return { fam: FAM(o.fam || f.fam), tam: o.tam || f.tam, b: o.b ?? f.b, i: o.i ?? f.i, u: o.u ?? f.u, color: o.color || f.color };
  }

  function partes(celdaTexto, est, valorNumerico) {
    const tramos = celdaTexto && celdaTexto.tramos ? celdaTexto.tramos : [{ texto: celdaTexto ? celdaTexto.texto : "", o: {} }];
    const toks = [];
    for (const t of tramos) {
      const f = fuenteDe(est, t.o);
      for (const p of String(t.texto).split(/(\n|[ \t\u00a0]+)/)) {          // el espacio duro (U+00A0) cuenta como espacio
        if (p === "") continue;
        toks.push(p === "\n" ? { salto: true, f } : { s: /^[ \t\u00a0]+$/.test(p) ? " " : p, esp: /^[ \t\u00a0]+$/.test(p), f });
      }
    }
    return toks;
  }

  function ajustar(toks, anchoMax, medir, envolver) {
    const lineas = []; let cur = { t: [], w: 0 };
    const cerrar = () => {
      while (cur.t.length && cur.t[cur.t.length - 1].esp) { cur.w -= cur.t.pop().w; }
      cur.tam = Math.max(0, ...cur.t.map((x) => x.f.tam)); lineas.push(cur); cur = { t: [], w: 0 };
    };
    for (const tk of toks) {
      if (tk.salto) { if (envolver) { cur.tam = cur.tam || tk.f.tam; cerrar(); } continue; }
      tk.w = medir(tk.s, tk.f);
      if (envolver && !tk.esp && cur.w + tk.w > anchoMax && cur.t.some((x) => !x.esp)) cerrar();
      if (envolver && tk.esp && !cur.t.length) continue;      // sin espacios al inicio de una línea nueva
      cur.t.push(tk); cur.w += tk.w;
    }
    cerrar();
    for (const l of lineas) if (!l.tam) l.tam = (toks[0] && toks[0].f.tam) || 10;
    return lineas;
  }

  /* ---------- armar las páginas ---------- */
  /* opciones: { datos, base, hoy, medir(s, fuente)->ancho pt, imagenes: { "xl/media/image6.emf": dataURL }, mediaPorRuta(ruta)->dataURL } */
  function armarPaginas(h, est, opc) {
    const ctx = { datos: opc.datos || {}, base: opc.base, hoy: opc.hoy };
    const medir = opc.medir;
    // columnas
    let maxC = 1, maxF = 1;
    for (const c of Object.values(h.celdas)) { maxC = Math.max(maxC, c.col); maxF = Math.max(maxF, c.fila); }
    for (const m of h.merges) { maxC = Math.max(maxC, m.c2); maxF = Math.max(maxF, m.f2); }
    for (const i of h.imagenes) { if (i.hasta) { maxC = Math.max(maxC, i.hasta.c + 1); maxF = Math.max(maxF, i.hasta.f + 1); } }
    const ancho = [0];
    for (let c = 1; c <= maxC; c++) {
      const d = h.cols.find((k) => c >= k.min && c <= k.max);
      ancho[c] = d ? (d.oculta ? 0 : anchoColPx(d.w) * PX) : anchoColPx(h.defCol) * PX;
    }
    const x = [0]; for (let c = 1; c <= maxC; c++) x[c] = x[c - 1] + ancho[c];
    // fusiones
    const ancla = {}, cubierta = new Set(), fusionDe = {};
    for (const m of h.merges) {
      ancla[`${numACol(m.c1)}${m.f1}`] = m;
      for (let f = m.f1; f <= m.f2; f++) for (let c = m.c1; c <= m.c2; c++) fusionDe[`${numACol(c)}${f}`] = m;
      for (let f = m.f1; f <= m.f2; f++) for (let c = m.c1; c <= m.c2; c++) if (f !== m.f1 || c !== m.c1) cubierta.add(`${numACol(c)}${f}`);
    }
    const rectCelda = (c1, f1, c2, f2, yTop) => ({ x: x[c1 - 1], w: x[c2] - x[c1 - 1], y: yTop[f1 - 1], h: yTop[f2] - yTop[f1 - 1] });

    // alturas de fila (se agranda la que necesite más por texto ajustado y sin altura fija)
    const alto = [0];
    for (let f = 1; f <= maxF; f++) {
      const r = h.filas[f] || {};
      alto[f] = r.oculta ? 0 : (r.ht !== null && r.ht !== undefined ? r.ht : h.defFila);
    }
    const contenido = (c) => { const v = valorDe(h, c.ref, ctx); return v !== "" && v !== null && v !== undefined; };
    const textoDe = (c) => {
      const e = est.xfs[c.estilo] || est.xfs[0];
      if (c.valor && typeof c.valor === "object" && c.valor.tramos && !c.f) return { txt: c.valor, e };
      const v = valorDe(h, c.ref, ctx);
      return { txt: { texto: formatear(v, e.numFmt) }, e };
    };
    for (const c of Object.values(h.celdas)) {
      const r = h.filas[c.fila] || {};
      if (r.custom || cubierta.has(c.ref) || ancla[c.ref] || !contenido(c)) continue;
      const { txt, e } = textoDe(c);
      if (!e.wrap || e.rot) continue;
      const lin = ajustar(partes(txt, e), ancho[c.col] - 4, medir, true);
      const necesita = lin.reduce((s, l) => s + l.tam * LINEA, 0) + 3;
      if (necesita > alto[c.fila]) alto[c.fila] = necesita;
    }
    const y = [0]; for (let f = 1; f <= maxF; f++) y[f] = y[f - 1] + alto[f];

    // generar ops en coordenadas de hoja (sin escala)
    const ops = [];
    const borde = (e, lado) => e.borde && e.borde[lado];
    const GROSOR = { hair: 0.25, thin: 0.6, medium: 1.5, thick: 2.2, dotted: 0.6, dashed: 0.6, double: 1.5 };
    for (const c of Object.values(h.celdas)) {
      const m = ancla[c.ref];
      const rc = m ? rectCelda(m.c1, m.f1, m.c2, m.f2, y) : rectCelda(c.col, c.fila, c.col, c.fila, y);
      const e = est.xfs[c.estilo] || est.xfs[0];
      if (e.relleno && rc.w > 0 && rc.h > 0) ops.push({ t: "rect", x: rc.x, y: rc.y, w: rc.w, h: rc.h, color: e.relleno });
      const r1 = rectCelda(c.col, c.fila, c.col, c.fila, y);
      for (const [lado, p] of [["l", [r1.x, r1.y, r1.x, r1.y + r1.h]], ["r", [r1.x + r1.w, r1.y, r1.x + r1.w, r1.y + r1.h]],
        ["t", [r1.x, r1.y, r1.x + r1.w, r1.y]], ["b", [r1.x, r1.y + r1.h, r1.x + r1.w, r1.y + r1.h]]]) {
        // en una celda combinada solo se ve el contorno: los bordes interiores no se dibujan
        const mf = fusionDe[c.ref];
        if (mf && !((lado === "l" && c.col === mf.c1) || (lado === "r" && c.col === mf.c2) || (lado === "t" && c.fila === mf.f1) || (lado === "b" && c.fila === mf.f2))) continue;
        const b = borde(e, lado);
        if (b && (r1.w > 0 || lado === "l" || lado === "r") && (r1.h > 0 || lado === "t" || lado === "b")) ops.push({ t: "linea", x1: p[0], y1: p[1], x2: p[2], y2: p[3], w: GROSOR[b.estilo] || 0.6, color: b.color });
      }
    }
    // textos
    for (const c of Object.values(h.celdas)) {
      if (cubierta.has(c.ref) || !contenido(c)) continue;
      const m = ancla[c.ref];
      const rc = m ? rectCelda(m.c1, m.f1, m.c2, m.f2, y) : rectCelda(c.col, c.fila, c.col, c.fila, y);
      if (rc.w <= 0 || rc.h <= 0) continue;
      const { txt, e } = textoDe(c);
      const esNum = typeof valorDe(h, c.ref, ctx) === "number";
      const hz = e.h === "general" ? (esNum ? "right" : "left") : e.h;
      const PAD = 2;
      const toks = partes(txt, e);
      if (!toks.length) continue;
      if (e.rot === 90 || e.rot === 255) {                                    // texto vertical, de abajo hacia arriba
        const lin = ajustar(toks, 1e9, medir, false)[0];
        const tam = lin.tam;
        const cx = e.h === "left" || e.h === "general" || true ? rc.x + rc.w / 2 + tam * 0.35 : rc.x + rc.w / 2;
        let yy = hz === "right" ? rc.y + PAD + lin.w : hz === "center" ? rc.y + (rc.h + lin.w) / 2 : rc.y + rc.h - PAD;
        for (const tk of lin.t) { if (!tk.esp) ops.push({ t: "texto", x: cx, y: yy, s: tk.s, f: tk.f, ang: 90 }); yy -= tk.w; }
        continue;
      }
      // zona disponible: si no ajusta, el texto puede salir hacia celdas vecinas vacías
      let zx = rc.x, zw = rc.w;
      if (!e.wrap) {
        let cc = (m ? m.c2 : c.col) + 1;
        if (hz === "left") { while (cc <= maxC && !(h.celdas[`${numACol(cc)}${c.fila}`] && contenido(h.celdas[`${numACol(cc)}${c.fila}`])) && !cubierta.has(`${numACol(cc)}${c.fila}`)) { zw += ancho[cc]; cc++; } }
      }
      const lineas = ajustar(toks, zw - 2 * PAD, medir, e.wrap);
      const H = lineas.reduce((s, l) => s + l.tam * LINEA, 0);
      let yy = e.v === "top" ? rc.y + 1.5 : e.v === "center" ? rc.y + (rc.h - H) / 2 : rc.y + rc.h - H - 1.5;
      for (const l of lineas) {
        const lh = l.tam * LINEA;
        if (e.wrap && (yy + lh > rc.y + rc.h + 0.5 || yy < rc.y - 0.5)) { yy += lh; continue; }   // lo que no cabe se corta, como en Excel
        let xx = hz === "center" ? zx + (zw - l.w) / 2 : hz === "right" ? zx + zw - PAD - l.w : zx + PAD;
        for (const tk of l.t) {
          const invisible = tk.f.color === "#ffffff" && !e.relleno;       // texto blanco sobre fondo blanco: Excel no lo muestra
          if (invisible) { xx += tk.w; continue; }
          if (!tk.esp) {
            ops.push({ t: "texto", x: xx, y: yy + l.tam * ASCENSO, s: tk.s, f: tk.f, ang: 0, ancho: tk.w });
            if (tk.f.u) ops.push({ t: "linea", x1: xx, y1: yy + l.tam * ASCENSO + 1, x2: xx + tk.w, y2: yy + l.tam * ASCENSO + 1, w: Math.max(0.4, tk.f.tam * 0.06), color: tk.f.color });
          } else if (tk.f.u) ops.push({ t: "linea", x1: xx, y1: yy + l.tam * ASCENSO + 1, x2: xx + tk.w, y2: yy + l.tam * ASCENSO + 1, w: Math.max(0.4, tk.f.tam * 0.06), color: tk.f.color });
          xx += tk.w;
        }
        yy += lh;
      }
    }
    // imágenes
    for (const im of h.imagenes) {
      const src = (opc.imagenes && opc.imagenes[im.media]) || (opc.mediaPorRuta && opc.mediaPorRuta(im.media));
      if (!src || !im.desde || !im.hasta) continue;
      const x1 = x[im.desde.c] + im.desde.co * EMU, y1 = y[im.desde.f] + im.desde.fo * EMU;
      const x2 = x[im.hasta.c] + im.hasta.co * EMU, y2 = y[im.hasta.f] + im.hasta.fo * EMU;
      ops.push({ t: "img", x: x1, y: y1, w: x2 - x1, h: y2 - y1, src, orden: 1 });
    }

    // límites reales de lo que se dibuja (las columnas y filas vacías con formato no se imprimen)
    let xMax = 0, yMax = 0;
    for (const o of ops) {
      if (o.t === "linea") { xMax = Math.max(xMax, o.x1, o.x2); yMax = Math.max(yMax, o.y1, o.y2); }
      else if (o.t === "texto") { xMax = Math.max(xMax, o.x + (o.ancho || 0)); yMax = Math.max(yMax, o.y); }
      else { xMax = Math.max(xMax, o.x + o.w); yMax = Math.max(yMax, o.y + o.h); }
    }
    let cLim = 1; while (cLim < maxC && x[cLim] < xMax - 0.5) cLim++;
    let fLim = 1; while (fLim < maxF && y[fLim] < yMax - 0.5) fLim++;
    maxC = cLim; maxF = fLim;

    // paginar
    const [pw0, ph0] = PAPELES[h.pagina.papel] || PAPELES[1];
    const [pw, ph] = h.pagina.horizontal ? [Math.max(pw0, ph0), Math.min(pw0, ph0)] : [Math.min(pw0, ph0), Math.max(pw0, ph0)];
    const mg = { l: h.pagina.m.l * 72, r: h.pagina.m.r * 72, t: h.pagina.m.t * 72, b: h.pagina.m.b * 72 };
    const dispW = pw - mg.l - mg.r, dispH = ph - mg.t - mg.b;
    let esc = h.pagina.escala / 100;
    if (x[maxC] * esc > dispW) esc = dispW / x[maxC];                         // que no se corte por el ancho
    // filas por página
    const cortes = []; let ini = 1;
    while (ini <= maxF) {
      let fin = ini, acum = 0;
      while (fin <= maxF && (acum + alto[fin]) * esc <= dispH + 0.01 && !(fin > ini && h.saltos.includes(fin - 1))) { acum += alto[fin]; fin++; }
      if (fin === ini) fin = ini + 1;
      cortes.push([ini, fin - 1]); ini = fin;
    }
    const paginas = cortes.map(([f1, f2]) => {
      const y0 = y[f1 - 1], y1 = y[f2];
      const P = (v) => v * esc;
      const out = [];
      for (const o of ops) {
        if (o.t === "linea") {
          if (Math.min(o.y1, o.y2) >= y0 - 0.01 && Math.max(o.y1, o.y2) <= y1 + 0.01) out.push({ ...o, x1: mg.l + P(o.x1), x2: mg.l + P(o.x2), y1: mg.t + P(o.y1 - y0), y2: mg.t + P(o.y2 - y0), w: P(o.w) });
        } else if (o.t === "rect") {
          if (o.y >= y0 - 0.01 && o.y + o.h <= y1 + 0.01) out.push({ ...o, x: mg.l + P(o.x), y: mg.t + P(o.y - y0), w: P(o.w), h: P(o.h) });
        } else if (o.t === "texto") {
          const yy = o.ang ? o.y : o.y - o.f.tam * ASCENSO;
          if (yy >= y0 - 0.5 && yy < y1) out.push({ ...o, x: mg.l + P(o.x), y: mg.t + P(o.y - y0), f: { ...o.f, tam: P(o.f.tam) }, ancho: o.ancho ? P(o.ancho) : undefined });
        } else if (o.t === "img") {
          if (o.y >= y0 - 0.5 && o.y < y1) out.push({ ...o, x: mg.l + P(o.x), y: mg.t + P(o.y - y0), w: P(o.w), h: P(o.h) });
        }
      }
      out.sort((a, b) => (a.orden || 0) - (b.orden || 0));
      return { ancho: pw, alto: ph, ops: out };
    });
    return { paginas, escala: esc, anchoHoja: x[maxC], altoHoja: y[maxF] };
  }

  const api = { leerLibro, leerHoja, armarPaginas, valorDe, formatear, colANum, numACol, ASCENSO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Hoja = api;
})(typeof window !== "undefined" ? window : globalThis);
