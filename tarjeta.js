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

  const api = { norm, decidirTabla, elegirMarca, rankearLineas, anioParaTabla, cilindrajeANumero };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Tarjeta = api;
})(typeof window !== "undefined" ? window : globalThis);
