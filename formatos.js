/* Llena la plantilla de formatos (plantillas/documentos-compra.xlsx) a partir de los datos de la tarjeta.

   Las hojas de formatos (traspaso, compraventa, mandatos, consignaciones) toman todo de la hoja
   "Datos Basicos" con fórmulas, así que basta con llenar esa hoja. Se edita el XML del .xlsx directamente
   (no con una librería de Excel) para no tocar nada más: logos, imágenes, combinaciones y estilos quedan
   igual. Funciones sin DOM: window.Formatos en el navegador, module.exports en Node. */
(function (raiz) {
  const HOJA = "Datos Basicos";

  /* Celda de "Datos Basicos" <- campo. `auto` = se calcula de otros campos al generar el archivo.
     `conservar` = si el campo queda vacío no se escribe la celda y se mantiene lo que traiga la plantilla. */
  const CAMPOS = [
    { id: "marca", celda: "C3", etiqueta: "Marca", grupo: "vehiculo" },
    { id: "linea", celda: "C4", etiqueta: "Línea", grupo: "vehiculo" },
    { id: "modelo", celda: "C5", etiqueta: "Modelo", grupo: "vehiculo", tipo: "digitos" },
    { id: "clase", celda: "C6", etiqueta: "Clase", grupo: "vehiculo" },
    { id: "carroceria", celda: "C7", etiqueta: "Carrocería", grupo: "vehiculo" },
    { id: "cilindraje", celda: "C8", etiqueta: "Cilindraje", grupo: "vehiculo", tipo: "digitos" },
    { id: "motor", celda: "C9", etiqueta: "Motor", grupo: "vehiculo", revisar: true },
    { id: "vin", celda: "C10", etiqueta: "VIN", grupo: "vehiculo", revisar: true },
    { id: "chasis", celda: "C11", etiqueta: "Chasis", grupo: "vehiculo", revisar: true },
    { id: "color", celda: "C12", etiqueta: "Color", grupo: "vehiculo" },
    { id: "letras_placa", celda: "C13", auto: true },
    { id: "numero_placa", celda: "C14", auto: true },
    { id: "placa", celda: "C15", etiqueta: "Placa", grupo: "vehiculo", revisar: true },
    { id: "capacidad", celda: "C16", etiqueta: "Capacidad (pasajeros)", grupo: "vehiculo", tipo: "digitos" },
    { id: "potencia", celda: "C17", etiqueta: "Potencia", grupo: "vehiculo" },
    { id: "ciudad_matricula", celda: "C18", etiqueta: "Ciudad de matrícula", grupo: "vehiculo" },

    { id: "p_nombre_completo", celda: "C20", auto: true },
    { id: "p_apellido1", celda: "C21", etiqueta: "Primer apellido", grupo: "propietario" },
    { id: "p_apellido2", celda: "C22", etiqueta: "Segundo apellido", grupo: "propietario" },
    { id: "p_nombre1", celda: "C23", etiqueta: "Primer nombre", grupo: "propietario" },
    { id: "p_nombre2", celda: "C24", etiqueta: "Segundo nombre", grupo: "propietario" },
    { id: "p_nombres", celda: "C25", auto: true },
    { id: "p_cedula", celda: "C26", etiqueta: "Cédula", grupo: "propietario", tipo: "digitos", revisar: true },
    { id: "p_direccion", celda: "C27", etiqueta: "Dirección", grupo: "propietario" },
    { id: "p_telefono", celda: "C28", etiqueta: "Teléfono", grupo: "propietario", tipo: "digitos" },
    { id: "p_ciudad", celda: "C29", etiqueta: "Ciudad", grupo: "propietario" },

    { id: "c_nombre_completo", celda: "C31", auto: true },
    { id: "c_apellido1", celda: "C32", etiqueta: "Primer apellido", grupo: "comprador" },
    { id: "c_apellido2", celda: "C33", etiqueta: "Segundo apellido", grupo: "comprador" },
    { id: "c_nombre1", celda: "C34", etiqueta: "Primer nombre", grupo: "comprador" },
    { id: "c_nombre2", celda: "C35", etiqueta: "Segundo nombre", grupo: "comprador" },
    { id: "c_nombres", celda: "C36", auto: true },
    { id: "c_cedula", celda: "C37", etiqueta: "Cédula", grupo: "comprador", tipo: "digitos" },
    { id: "c_direccion", celda: "C38", etiqueta: "Dirección", grupo: "comprador" },
    { id: "c_telefono", celda: "C39", etiqueta: "Teléfono", grupo: "comprador", tipo: "digitos" },
    { id: "c_ciudad", celda: "C40", etiqueta: "Ciudad", grupo: "comprador" },

    { id: "e_nombre", celda: "C42", etiqueta: "Nombre de la empresa", grupo: "empresa", conservar: true },
    { id: "e_representante", celda: "C43", etiqueta: "Representante legal", grupo: "empresa", conservar: true },
    { id: "e_nit", celda: "C44", etiqueta: "NIT", grupo: "empresa", conservar: true },
  ];

  const unir = (...p) => p.map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");

  /* Datos leídos de la tarjeta -> valores iniciales de los campos editables. */
  function valoresDesdeTarjeta(d) {
    const p = d.propietario || {};
    return {
      marca: d.marca, linea: d.linea, modelo: d.modelo, clase: d.clase, carroceria: d.carroceria,
      cilindraje: d.cilindraje_cc, motor: d.motor, vin: d.vin, chasis: d.chasis || d.vin, color: d.color,
      placa: d.placa, capacidad: d.pasajeros, ciudad_matricula: d.ciudad_matricula,
      p_apellido1: p.apellido1, p_apellido2: p.apellido2, p_nombre1: p.nombre1, p_nombre2: p.nombre2,
      p_cedula: p.documento,
    };
  }

  /* Valores de los campos (id -> texto) -> valores por celda ("C3" -> "VOLKSWAGEN"), con los campos
     calculados, todo en mayúsculas ("TODO DILIGENCIADO EN MAYUSCULA") y números solo con dígitos. */
  function valoresPorCelda(v) {
    const t = {};
    for (const c of CAMPOS) {
      if (c.auto) continue;
      let x = String(v[c.id] ?? "").trim().toUpperCase().replace(/\s+/g, " ");
      if (c.tipo === "digitos") x = x.replace(/\D/g, "");
      t[c.id] = x;
    }
    const placa = t.placa.replace(/[^A-Z0-9]/g, "");
    t.placa = placa;
    t.letras_placa = placa.slice(0, 3);
    t.numero_placa = placa.slice(3);
    for (const [pre, nom] of [["p", "p_nombre_completo"], ["c", "c_nombre_completo"]]) {
      t[`${pre}_nombres`] = unir(t[`${pre}_nombre1`], t[`${pre}_nombre2`]);
      t[nom] = unir(t[`${pre}_nombres`], t[`${pre}_apellido1`], t[`${pre}_apellido2`]);
    }
    const celdas = {};
    for (const c of CAMPOS) {
      if (c.conservar && !t[c.id]) continue;     // vacío: se deja lo que traiga la plantilla
      celdas[c.celda] = t[c.id];
    }
    return celdas;
  }

  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function ponerCelda(xml, ref, valor) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(xml)) return null;
    return xml.replace(re, (_, attrs) => {
      const a = attrs.replace(/\s+t="[^"]*"/, "").replace(/\/$/, "");
      // Un campo vacío se escribe como texto vacío (no como celda vacía): así las fórmulas que lo leen muestran
      // un espacio en blanco y no un "0".
      return `<c r="${ref}"${a} t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
    });
  }

  /* Las hojas de formatos guardan el último valor calculado de cada fórmula. Para las referencias simples
     ('Datos Basicos'!C13) se actualiza ese valor, así se ve bien aunque el visor no recalcule. */
  function refrescarCache(xml, celdas, buscar) {
    const re = /<c r="([A-Z]+\d+)"([^>]*)>(<f>\+?'Datos Basicos'!\$?([A-Z]+)\$?(\d+)<\/f>)(?:<v>[\s\S]*?<\/v>|<v\/>)?<\/c>/g;
    let n = 0;
    const salida = xml.replace(re, (todo, ref, attrs, f, col, fila) => {
      const clave = `${col}${fila}`;
      // Lo que no se escribe (p. ej. la empresa) se toma tal cual de la plantilla.
      const valor = clave in celdas ? celdas[clave] : (buscar ? buscar(clave) : null);
      if (valor === null || valor === undefined) return todo;
      n++;
      const a = attrs.replace(/\s+t="[^"]*"/, "");
      return `<c r="${ref}"${a} t="str">${f}<v>${esc(valor)}</v></c>`;
    });
    return { xml: salida, n };
  }

  const desescapar = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

  /* Valor de texto de una celda de la hoja (resuelve textos compartidos y en línea). */
  function leerCelda(xml, textos, ref) {
    const m = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
    if (!m || !m[2]) return "";
    const v = /<v>([^<]*)<\/v>/.exec(m[2]);
    if (/t="s"/.test(m[1]) && v) return textos[Number(v[1])] ?? "";
    if (/t="inlineStr"/.test(m[1])) return desescapar((m[2].match(/<t[^>]*>([^<]*)<\/t>/) || [, ""])[1]);
    return v ? desescapar(v[1]) : "";
  }

  /* bytes del .xlsx + valores por celda -> bytes del .xlsx llenado. JSZip se pasa como parámetro. */
  async function llenarPlantilla(JSZip, bytes, celdas) {
    const zip = await JSZip.loadAsync(bytes);
    const wb = zip.file("xl/workbook.xml");
    const rels = zip.file("xl/_rels/workbook.xml.rels");
    if (!wb || !rels) throw new Error("El archivo no es un Excel (.xlsx) válido.");
    const wbXml = await wb.async("string");
    const tag = wbXml.match(/<sheet\b[^>]*\bname="Datos Basicos"[^>]*>/);
    const rid = tag && tag[0].match(/r:id="([^"]+)"/);
    if (!rid) throw new Error(`La plantilla no tiene la hoja "${HOJA}". Elige el archivo "Documentos Compra De Vehiculos.xlsx".`);
    const relTag = (await rels.async("string")).match(new RegExp(`<Relationship\\b[^>]*\\bId="${rid[1]}"[^>]*>`));
    const destino = relTag && relTag[0].match(/Target="([^"]+)"/);
    if (!destino) throw new Error("No se encontró la hoja de datos dentro de la plantilla.");
    const ruta = "xl/" + destino[1].replace(/^\/?(xl\/)?/, "");

    let xml = await zip.file(ruta).async("string");
    const faltantes = [];
    for (const [ref, valor] of Object.entries(celdas)) {
      const nuevo = ponerCelda(xml, ref, valor);
      if (nuevo === null) faltantes.push(ref); else xml = nuevo;
    }
    zip.file(ruta, xml);

    // Valores guardados de las hojas de formatos
    const ssFile = zip.file("xl/sharedStrings.xml");
    const textos = ssFile ? ((await ssFile.async("string")).match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map((x) => desescapar(x.replace(/<[^>]+>/g, ""))) : [];
    const buscar = (ref) => leerCelda(xml, textos, ref);
    let refrescadas = 0;
    for (const nombre of Object.keys(zip.files)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(nombre) || nombre === ruta) continue;
      const orig = await zip.file(nombre).async("string");
      const { xml: nuevo, n } = refrescarCache(orig, celdas, buscar);
      if (n) { zip.file(nombre, nuevo); refrescadas += n; }
    }

    // Que Excel recalcule todo al abrir
    const calc = /<calcPr\b[^>]*\/>/.exec(wbXml);
    const wbNuevo = calc
      ? wbXml.replace(calc[0], calc[0].includes("fullCalcOnLoad") ? calc[0] : calc[0].replace("/>", ' fullCalcOnLoad="1"/>'))
      : wbXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", wbNuevo);

    const salida = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return { bytes: salida, faltantes, refrescadas };
  }


  /* Deja un Excel con un solo documento: la hoja elegida (visible) y "Datos Basicos" (oculta, para que las
     fórmulas sigan vivas). Quita las demás hojas con sus imágenes y el índice de cálculo. */
  async function soloHoja(JSZip, bytes, nombreHoja) {
    const zip = await JSZip.loadAsync(bytes);
    const leer = async (n) => (zip.file(n) ? zip.file(n).async("string") : null);
    let wb = await leer("xl/workbook.xml"), rels = await leer("xl/_rels/workbook.xml.rels"), ct = await leer("[Content_Types].xml");
    if (!wb || !rels || !ct) throw new Error("El archivo no es un Excel (.xlsx) válido.");
    const attrDe = (tag, n) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
    const hojas = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => {
      const rid = attrDe(m[0], "r:id");
      const destino = attrDe((new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*/>`).exec(rels) || [""])[0], "Target");
      return { tag: m[0], nombre: attrDe(m[0], "name"), rid, ruta: destino ? "xl/" + destino.replace(/^\/?(xl\/)?/, "") : null };
    });
    const elegida = hojas.find((h) => h.nombre === nombreHoja), datos = hojas.find((h) => h.nombre === HOJA);
    if (!elegida || !datos) throw new Error(`La plantilla no tiene la hoja "${elegida ? HOJA : nombreHoja}".`);
    const quitar = hojas.filter((h) => h !== elegida && h !== datos);

    // libro: sin las otras hojas, con la de datos oculta y la elegida activa; sin rangos con nombre (eran de otras hojas)
    for (const h of quitar) wb = wb.replace(h.tag, "");
    wb = wb.replace(datos.tag, /\bstate=/.test(datos.tag) ? datos.tag.replace(/\bstate="[^"]*"/, 'state="hidden"') : datos.tag.replace(/\/>$/, ' state="hidden"/>'));
    wb = wb.replace(/<definedNames>[\s\S]*?<\/definedNames>/, "");
    const quedan = [...wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => attrDe(m[0], "name"));
    const activa = quedan.indexOf(nombreHoja);
    wb = /\bactiveTab="/.test(wb) ? wb.replace(/\bactiveTab="\d+"/, `activeTab="${activa}"`) : wb.replace(/<workbookView\b/, `<workbookView activeTab="${activa}"`);
    wb = wb.replace(/\bfirstSheet="\d+"/, `firstSheet="${activa}"`);
    zip.file("xl/workbook.xml", wb);

    // relaciones y tipos de contenido
    const quitarPartes = new Set(["xl/calcChain.xml"]);
    for (const h of quitar) { rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${h.rid}"[^>]*/>`), ""); quitarPartes.add(h.ruta); }
    rels = rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, "");
    zip.file("xl/_rels/workbook.xml.rels", rels);

    // dibujos e imágenes: solo los de las hojas que quedan
    const dependencias = async (ruta) => {
      const relRuta = ruta.replace(/(worksheets|drawings)\//, "$1/_rels/") + ".rels";
      const x = await leer(relRuta); if (!x) return { rels: [], destinos: [] };
      return { rels: [relRuta], destinos: [...x.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]) };
    };
    const conservar = new Set();
    for (const h of [elegida, datos]) {
      const d = await dependencias(h.ruta); d.rels.forEach((r) => conservar.add(r));
      for (const t of d.destinos.filter((t) => /drawings\//.test(t))) {
        const dr = "xl/drawings/" + t.replace(/^\.\.\/drawings\//, ""); conservar.add(dr);
        const dd = await dependencias(dr); dd.rels.forEach((r) => conservar.add(r));
        dd.destinos.forEach((m) => conservar.add("xl/media/" + m.replace(/^\.\.\/media\//, "")));
      }
    }
    for (const n of Object.keys(zip.files)) {
      if (zip.files[n].dir) continue;
      const esHojaQuitada = quitarPartes.has(n) || [...quitarPartes].some((q) => q && n === q.replace(/(worksheets)\//, "$1/_rels/") + ".rels");
      const esAdjunto = /^xl\/(drawings|media)\//.test(n) || /^xl\/worksheets\/_rels\//.test(n) || /^xl\/drawings\/_rels\//.test(n);
      if (esHojaQuitada || (esAdjunto && !conservar.has(n))) { zip.remove(n); ct = ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`), ""); }
    }
    zip.file("[Content_Types].xml", ct);

    // la hoja elegida queda seleccionada; ninguna otra
    for (const h of [elegida, datos]) {
      let x = await leer(h.ruta);
      x = x.replace(/\s+tabSelected="1"/g, "");
      if (h === elegida) x = x.replace(/<sheetView\b/, '<sheetView tabSelected="1"');
      zip.file(h.ruta, x);
    }

    // propiedades: lista de hojas
    const app = await leer("docProps/app.xml");
    if (app) {
      const nombres = quedan.map((n) => `<vt:lpstr>${n}</vt:lpstr>`).join("");
      zip.file("docProps/app.xml", app
        .replace(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/, `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas de cálculo</vt:lpstr></vt:variant><vt:variant><vt:i4>${quedan.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`)
        .replace(/<TitlesOfParts>[\s\S]*?<\/TitlesOfParts>/, `<TitlesOfParts><vt:vector size="${quedan.length}" baseType="lpstr">${nombres}</vt:vector></TitlesOfParts>`));
    }
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }

  const api = { CAMPOS, HOJA, valoresDesdeTarjeta, valoresPorCelda, llenarPlantilla, soloHoja };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Formatos = api;
})(typeof window !== "undefined" ? window : globalThis);
