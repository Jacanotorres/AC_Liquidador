/* Coincidencia entre los datos leídos de la tarjeta de propiedad y las tablas del Ministerio.
   Funciones puras (sin DOM) para poder probarlas en Node: window.Tarjeta en el navegador,
   module.exports en Node. */
(function (raiz) {
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = (s) => norm(s).split(" ").filter(Boolean);

  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  // 1 si es igual; 0,8 si es casi igual (errores de ortografía del Ministerio o de lectura); 0 si no.
  function similitud(a, b) {
    if (a === b) return 1;
    const min = Math.min(a.length, b.length);
    if (min < 5) return 0;
    return lev(a, b) <= (min >= 9 ? 2 : 1) ? 0.8 : 0;
  }

  /* Decide en qué tabla del Ministerio buscar, o por qué no se puede cotizar. */
  function decidirTabla(d) {
    const clase = norm(d.clase), serv = norm(d.servicio), comb = norm(d.combustible), carr = norm(d.carroceria);
    if (serv && !serv.includes("PARTICULAR")) {
      return { bloqueo: `Servicio ${d.servicio}: este cotizador solo calcula vehículos particulares.` };
    }
    if (/MOTO|CUATRI|TRICICLO|MOTOCARRO/.test(clase)) return { bloqueo: "Las motos aún no tienen tarifa cargada en este cotizador." };
    if (/\b(BUS|BUSETA|MICROBUS|CAMION|VOLQUETA|TRACTOCAMION|AMBULANCIA|REMOLQUE)\b/.test(clase)) {
      return { bloqueo: `Clase ${d.clase}: este cotizador solo calcula automóviles, camionetas y camperos.` };
    }
    const hibrido = /HIBRID|(GASOLINA|DIESEL|ACPM).*ELECTRIC|ELECTRIC.*(GASOLINA|DIESEL|ACPM)/.test(comb);
    if (hibrido) return { tabla: 9 };
    if (/ELECTRIC/.test(comb)) return { tabla: 4 };
    if (/CAMIONETA|CAMPERO/.test(clase)) return { tabla: /DOBLE ?CABINA/.test(carr) ? 3 : 2 };
    return { tabla: 1 };
  }

  /* La marca de la tarjeta -> la marca exacta de la lista del Ministerio (o null). */
  function elegirMarca(marcas, marcaTarjeta) {
    const m = norm(marcaTarjeta);
    if (!m) return null;
    const lista = marcas.map((x) => [x, norm(x)]);
    const exacta = lista.find(([, n]) => n === m);
    if (exacta) return exacta[0];
    const parecida = lista.find(([, n]) => n.length >= 3 && m.length >= 3 && (n.startsWith(m) || m.startsWith(n)));
    if (parecida) return parecida[0];
    const casi = lista.find(([, n]) => similitud(n, m) > 0);
    return casi ? casi[0] : null;
  }

  /* Ordena las líneas de la marca por parecido con la tarjeta (nombre + cilindraje + año). */
  function rankearLineas(lineas, d, max = 5) {
    const q = tokens(d.linea);
    const cc = Number(d.cilindraje_cc) || null;
    const modelo = Number(d.modelo) || null;
    const RELLENO = new Set(["LINEA", "BASE", "ESTANDAR"]);

    const puntuadas = lineas.map((l) => {
      const esBase = /LINEA BASE ESTANDAR/.test(norm(l.linea));
      const lt = tokens(l.linea).filter((t) => !RELLENO.has(t));
      let coincide = 0;
      for (const t of q) coincide += Math.max(0, ...lt.map((x) => similitud(t, x)));
      const nombre = q.length ? coincide / q.length : 0;
      const sobran = lt.filter((x) => !q.some((t) => similitud(t, x) > 0)).length;

      let cil = 0;
      const ccCand = /^\d+$/.test(l.cilindraje || "") ? Number(l.cilindraje) : null;
      if (cc && ccCand) {
        const rel = Math.abs(ccCand - cc) / cc;
        cil = rel <= 0.006 ? 0.5 : rel <= 0.02 ? 0.35 : rel <= 0.06 ? 0.1 : -0.4;
      }
      // La línea no existía en el año modelo de la tarjeta.
      const minAnio = Math.min(...l.anios);
      const noExistia = modelo && modelo > 2001 && modelo < minAnio ? -1 : 0;

      const puntaje = nombre + cil - 0.04 * Math.min(sobran, 6) - (esBase ? 0.05 : 0) + noExistia;
      return { linea: l, puntaje: Math.round(puntaje * 1000) / 1000, nombre: Math.round(nombre * 100) / 100 };
    });
    puntuadas.sort((a, b) => b.puntaje - a.puntaje || String(a.linea.linea).localeCompare(String(b.linea.linea)));
    return puntuadas.slice(0, max);
  }

  /* Año modelo a usar en la tabla: el de la tarjeta, acotado a lo que existe. */
  function anioParaTabla(anios, modelo) {
    const m = Number(modelo);
    if (!m) return { anio: null };
    const max = Math.max(...anios), min = Math.min(...anios);
    if (anios.includes(m)) return { anio: m };
    if (m <= 2001) return { anio: 2001 };
    if (m > max) return { anio: max, aviso: `El modelo ${m} aún no está en la tabla del Ministerio; se usó el ${max}.` };
    return { anio: min, aviso: `Esta línea no tiene avalúo para el modelo ${m}; se usó el ${min}.` };
  }

  /* "1.395" / "1,395" / 1395 -> 1395 */
  function cilindrajeANumero(v) {
    const d = String(v ?? "").replace(/\D/g, "");
    return d ? Number(d) : null;
  }

  /* ---------- Interpretación del texto que devuelve el OCR ---------- */

  // Texto de una línea del OCR: mayúsculas, sin tildes y sin símbolos raros (deja . , / para el cilindraje).
  const limpiar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9.,/ ]+/g, " ").replace(/\s+/g, " ").trim();

  const A_LETRA = { 0: "O", 1: "I", 5: "S", 8: "B", 2: "Z", 6: "G" };
  const A_DIGITO = { O: "0", I: "1", S: "5", B: "8", Z: "2", G: "6", T: "7", A: "4", L: "1", Q: "0", D: "0" };

  /* Las placas de carro son 3 letras + 3 números (motos: 3 letras + 2 números + letra). El OCR confunde
     I/1, S/5, O/0, B/8: se corrige según la posición. Devuelve {placa, seguro}. */
  function normalizarPlaca(token) {
    const t = String(token ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (t.length !== 6) return { placa: t || null, seguro: false };
    const letras = [...t.slice(0, 3)].map((c) => (/\d/.test(c) ? A_LETRA[c] || c : c)).join("");
    const medio = [...t.slice(3, 5)].map((c) => (/[A-Z]/.test(c) ? A_DIGITO[c] || c : c)).join("");
    const ultimo = t[5];
    const esMoto = /[A-Z]/.test(ultimo) && !A_DIGITO[ultimo];   // última letra "de verdad": placa de moto
    const fin = esMoto ? ultimo : (/[A-Z]/.test(ultimo) ? A_DIGITO[ultimo] || ultimo : ultimo);
    const placa = letras + medio + fin;
    return { placa, seguro: /^[A-Z]{3}\d{2}[\dA-Z]$/.test(placa) };
  }

  const CLASES = ["AUTOMOVIL", "CAMIONETA", "CAMPERO", "MOTOCICLETA", "MOTOCARRO", "CUATRIMOTO", "MICROBUS",
    "BUSETA", "BUS", "CAMION", "VOLQUETA", "TRACTOCAMION", "MAQUINARIA"];
  const CARROCERIAS = [/DOBLE ?CABINA/, /HATCH ?BACK/, /WAGON/, /SEDAN/, /PICK ?UP/, /COUPE/, /CONVERTIBLE/, /FURGON/, /CAMPERO/, /MINIVAN/];

  /* texto (string del OCR) + marcas conocidas (las de las tablas del Ministerio)
     -> el mismo objeto de datos que usa la página. Nunca inventa: lo que no se lee queda en null. */
  function interpretarOCR(texto, marcas) {
    const lineas = String(texto ?? "").split(/\r?\n/).map(limpiar).filter(Boolean);
    const conocidas = marcas.map((m) => [m, norm(m).split(" ")]);
    const ANIO = /^(19[5-9]\d|20[0-3]\d)$/;
    const dudas = [];

    // 1) La línea de datos: [placa] MARCA LÍNEA... AÑO. Se ubica por una marca conocida seguida de un año.
    let datos = null;
    for (let i = 0; i < lineas.length && !datos; i++) {
      const tk = lineas[i].split(" ");
      for (let j = 0; j < tk.length && !datos; j++) {
        for (let k = 3; k >= 1; k--) {
          const trozo = tk.slice(j, j + k);
          if (trozo.length < k) continue;
          const unido = trozo.join(" ");
          const hit = conocidas.find(([, t]) => t.join(" ") === unido) ||
            (k === 1 && unido.length >= 5 ? conocidas.find(([, t]) => t.length === 1 && similitud(t[0], unido) > 0) : null);
          if (!hit) continue;
          const iAnio = tk.findIndex((t, x) => x >= j + k && ANIO.test(t));
          if (iAnio < 0) continue;
          datos = { i, marca: hit[0], linea: tk.slice(j + k, iAnio).join(" "), modelo: Number(tk[iAnio]),
            placaToken: j > 0 ? tk[j - 1] : null };
          break;
        }
      }
    }
    if (!datos) {
      const hayPistas = lineas.some((l) => /LICENCIA|TRANSITO|PLACA|MARCA/.test(l));
      return { es_tarjeta: hayPistas, placa: null, marca: null, linea: null, modelo: null, cilindraje_cc: null,
        clase: null, carroceria: null, combustible: null, servicio: null, pasajeros: null, color: null,
        organismo_transito: null, dudas: ["No se pudo leer la marca, la línea y el modelo"] };
    }

    // 2) Resto de campos: en las líneas siguientes (cilindraje/color/servicio, clase/carrocería/combustible).
    const abajo = lineas.slice(datos.i + 1, datos.i + 6);
    const todo = abajo.join(" | ");
    const tokensAbajo = abajo.flatMap((l) => l.split(" "));

    const ccTok = tokensAbajo.find((t) => /^(\d{1,2}[.,]\d{3}|\d{3,4})$/.test(t));
    const servicio = (todo.match(/PARTICULAR|PUBLICO|OFICIAL|DIPLOMATICO|ESPECIAL/) || [null])[0];
    const clase = CLASES.find((c) => tokensAbajo.some((t) => t === c || (c.length >= 9 && similitud(t, c) > 0)))
      || (todo.match(/MOTO/) ? "MOTOCICLETA" : null);
    const carroceria = (CARROCERIAS.map((r) => todo.match(r)).find(Boolean) || [null])[0];
    const comb = [...todo.matchAll(/GASOLINA|DIESEL|ACPM|ELECTRICO|HIBRIDO|GAS NATURAL|GNV/g)].map((m) => m[0]);
    const placa = normalizarPlaca(datos.placaToken);

    if (!placa.placa || !placa.seguro) dudas.push("la placa no se leyó bien: revísala");
    if (!ccTok) dudas.push("no se leyó el cilindraje");
    if (!servicio) dudas.push("no se leyó el servicio: confirma que sea particular");
    if (!clase) dudas.push("no se leyó la clase del vehículo");

    return {
      es_tarjeta: true, placa: placa.placa, marca: datos.marca, linea: datos.linea || null, modelo: datos.modelo,
      cilindraje_cc: ccTok ? cilindrajeANumero(ccTok) : null, clase, carroceria,
      combustible: comb.length ? [...new Set(comb)].join(" ") : null, servicio,
      pasajeros: null, color: null, organismo_transito: null, dudas,
    };
  }

  const api = { norm, decidirTabla, elegirMarca, rankearLineas, anioParaTabla, cilindrajeANumero,
    interpretarOCR, normalizarPlaca };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Tarjeta = api;
})(typeof window !== "undefined" ? window : globalThis);
