/* Dibuja las páginas que arma hoja.js: en un PDF (jsPDF) o en un canvas para la vista previa.
   Las dos salidas usan las mismas instrucciones, así que se ven igual.
   Sin DOM salvo aCanvas: window.Dibujo en el navegador, module.exports en Node. */
(function (raiz) {
  // Las fuentes estándar del PDF solo cubren Latin-1: se cambian comillas y rayas "tipográficas".
  const limpio = (s) => String(s ?? "").replace(/\u00a0/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-")
    .replace(/[^\u0009\u000A -ÿ]/g, "?");
  const estiloPDF = (f) => (f.b && f.i ? "bolditalic" : f.b ? "bold" : f.i ? "italic" : "normal");
  const tipoImg = (src) => (/^data:image\/jpe?g/i.test(src) ? "JPEG" : "PNG");

  /* Medidor de texto con las mismas fuentes del PDF: se usa al armar las páginas. */
  function crearMedidor(jsPDF) {
    const doc = new jsPDF({ unit: "pt" });
    return (s, f) => { doc.setFont(f.fam, estiloPDF(f)); doc.setFontSize(f.tam); return doc.getTextWidth(limpio(s)); };
  }

  /* Varias hojas (cada una con sus páginas) -> un PDF. */
  function aPDF(jsPDF, paginas) {
    const p0 = paginas[0], horizontal = p0.ancho > p0.alto;
    const doc = new jsPDF({ unit: "pt", format: [Math.min(p0.ancho, p0.alto), Math.max(p0.ancho, p0.alto)], orientation: horizontal ? "landscape" : "portrait", compress: true });
    paginas.forEach((pg, i) => {
      if (i) doc.addPage([Math.min(pg.ancho, pg.alto), Math.max(pg.ancho, pg.alto)], pg.ancho > pg.alto ? "landscape" : "portrait");
      for (const o of pg.ops) {
        if (o.t === "rect") { doc.setFillColor(o.color); doc.rect(o.x, o.y, o.w, o.h, "F"); }
        else if (o.t === "linea") { doc.setDrawColor(o.color); doc.setLineWidth(Math.max(0.15, o.w)); doc.line(o.x1, o.y1, o.x2, o.y2); }
        else if (o.t === "texto") {
          doc.setFont(o.f.fam, estiloPDF(o.f)); doc.setFontSize(o.f.tam); doc.setTextColor(o.f.color);
          doc.text(limpio(o.s), o.x, o.y, o.ang ? { angle: o.ang } : undefined);
        } else if (o.t === "img") doc.addImage(o.src, tipoImg(o.src), o.x, o.y, o.w, o.h, undefined, "FAST");
      }
    });
    return doc;
  }

  /* Carga las imágenes de las páginas (navegador) y devuelve un mapa src -> Image. */
  function cargarImagenes(paginas) {
    const srcs = [...new Set(paginas.flatMap((p) => p.ops.filter((o) => o.t === "img").map((o) => o.src)))];
    return Promise.all(srcs.map((s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([s, i]); i.onerror = () => ok([s, null]); i.src = s; })))
      .then((x) => Object.fromEntries(x));
  }

  /* Una página en un canvas. k = píxeles por punto. */
  function aCanvas(canvas, pg, imagenes, k) {
    canvas.width = Math.round(pg.ancho * k); canvas.height = Math.round(pg.alto * k);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(k, k);
    for (const o of pg.ops) {
      if (o.t === "rect") { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h); }
      else if (o.t === "linea") { ctx.strokeStyle = o.color; ctx.lineWidth = Math.max(0.15, o.w); ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); }
      else if (o.t === "texto") {
        ctx.fillStyle = o.f.color; ctx.textBaseline = "alphabetic";
        ctx.font = `${o.f.i ? "italic " : ""}${o.f.b ? "bold " : ""}${o.f.tam}px ${o.f.fam === "times" ? '"Times New Roman", Times, serif' : o.f.fam === "courier" ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif'}`;
        ctx.save(); ctx.translate(o.x, o.y); if (o.ang) ctx.rotate((-o.ang * Math.PI) / 180);
        ctx.fillText(limpio(o.s), 0, 0); ctx.restore();
      } else if (o.t === "img") { const im = imagenes && imagenes[o.src]; if (im) ctx.drawImage(im, o.x, o.y, o.w, o.h); }
    }
    ctx.restore();
    return canvas;
  }

  const api = { crearMedidor, aPDF, aCanvas, cargarImagenes, limpio };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Dibujo = api;
})(typeof window !== "undefined" ? window : globalThis);
