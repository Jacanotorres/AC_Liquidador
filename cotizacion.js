/* Cuentas de la cotización según lo que hace el concesionario en la operación. Sin DOM:
   window.Cotizacion en el navegador, module.exports en Node.

   · Somos vendedores (el cliente nos compra el carro): valor - descuento, más impuesto, SOAT, traspaso,
     tramitador y prenda. No hay retención. Resultado: lo que paga el cliente.
   · Somos compradores (el cliente nos vende el carro): del valor acordado se descuentan la retención en la
     fuente (un % del valor de Fasecolda, no del valor acordado), el impuesto que le corresponde al cliente,
     y la mitad del traspaso y la mitad del tramitador. Sin SOAT ni prenda. Resultado: lo que le pagamos. */
(function (raiz) {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const nombreMes = (m) => MESES[Number(m) - 1];
  const pct = (t) => (t * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 });

  /* Meses del impuesto que le tocan al cliente.
     · vendedor (el cliente compra): "" = año completo; si no, el mes elegido y los siguientes hasta diciembre.
     · comprador (el cliente vende): el mes elegido es el de la compra; el cliente paga de enero al mes anterior. */
  function mesesImpuesto(rol, mes) {
    const m = Number(mes) || 0;
    if (rol === "comprador") {
      if (!m) return { meses: 12, rango: "año completo" };
      const meses = m - 1;
      return { meses, rango: meses === 0 ? "ningún mes" : meses === 1 ? "enero" : `enero a ${nombreMes(meses)}` };
    }
    if (!m) return { meses: 12, rango: "año completo" };
    return { meses: 13 - m, rango: m === 12 ? "diciembre" : `${nombreMes(m)} a diciembre` };
  }

  /* p: { rol, precio, descuento, soat, traspaso, tramitador, prenda (0 si no aplica), fasecolda, tasaRetencion,
          mes, impuestoAnual, baseGravable, tarifa, nuevo }
     -> { filas: [{ etiqueta, valor | texto, fuerte }], total, totalTitulo, tituloDoc, notas, avisos, meses, rango, impuesto, retencion } */
  function calcular(p) {
    const rol = p.rol === "comprador" ? "comprador" : "vendedor";
    const precio = p.precio || 0;
    const { meses, rango } = mesesImpuesto(rol, p.mes);
    const parcial = meses !== 12;
    const impuesto = parcial ? Math.round(p.impuestoAnual * meses / 12) : p.impuestoAnual;
    const filas = [], notas = [], avisos = [];
    const fila = (etiqueta, valor, fuerte) => filas.push({ etiqueta, valor, fuerte: !!fuerte });
    const texto = (etiqueta, t) => filas.push({ etiqueta, texto: t });
    let total, totalTitulo, retencion = 0;
    const tituloDoc = rol === "comprador" ? "Liquidación de compra" : "Cotización";

    // Sin valor del vehículo: solo el impuesto
    if (!precio) {
      fila(p.nuevo ? "Base gravable (factura sin IVA)" : "Base gravable (avalúo del Ministerio)", p.baseGravable);
      texto("Tarifa", pct(p.tarifa) + " %");
      if (parcial) fila("Impuesto anual", p.impuestoAnual);
      if (rol === "comprador") {
        totalTitulo = `Impuesto a cargo del cliente (${rango}: ${meses} de 12 meses)`;
      } else {
        totalTitulo = parcial ? `Impuesto estimado (${rango}: ${meses} de 12 meses)` : "Impuesto vehicular anual estimado";
      }
      total = impuesto;
    } else if (rol === "vendedor") {
      const descuento = p.descuento || 0, conDescuento = precio - descuento;
      const papeles = impuesto + (p.soat || 0) + (p.traspaso || 0) + (p.tramitador || 0) + (p.prenda || 0);
      fila("Valor del vehículo", precio);
      if (descuento) fila("Descuento", -descuento);
      fila("Valor con descuento", conDescuento, true);
      fila(parcial ? `Impuesto departamento (${rango}: ${meses}/12)` : "Impuesto departamento", impuesto);
      if (p.soat) fila("SOAT", p.soat);
      if (p.traspaso) fila("Traspaso", p.traspaso);
      if (p.tramitador) fila("Tramitador", p.tramitador);
      if (p.prenda) fila("Prenda", p.prenda);
      fila("Total papeles", papeles, true);
      totalTitulo = "Valor final"; total = conDescuento + papeles;
      notas.push(`Impuesto anual estimado: base gravable ${COP.format(p.baseGravable)} por una tarifa del ${pct(p.tarifa)} %, es decir ${COP.format(p.impuestoAnual)}.`);
      if (parcial) notas.push(`Se cobra proporcional a ${meses} de 12 meses (${rango}): ${COP.format(p.impuestoAnual)} × ${meses} / 12 = ${COP.format(impuesto)}. En general la gobernación liquida el año completo; el cobro por meses es el valor que acuerdan las partes.`);
    } else {
      const tasa = p.tasaRetencion ?? 0.01;
      const fase = p.fasecolda || 0;
      retencion = Math.round(fase * tasa);
      const mitadTraspaso = Math.round((p.traspaso || 0) / 2), mitadTramitador = Math.round((p.tramitador || 0) / 2);
      fila("Valor acordado por el vehículo", precio);
      if (fase) fila(`Retención en la fuente (${pct(tasa)} % del valor de Fasecolda)`, -retencion);
      else { fila(`Retención en la fuente (${pct(tasa)} %): falta el valor de Fasecolda`, 0); avisos.push("Falta el valor de Fasecolda: la retención no se calculó."); }
      if (meses > 0) fila(`Impuesto vehicular (${rango}: ${meses}/12)`, -impuesto);
      if (mitadTraspaso) fila("Traspaso (la mitad)", -mitadTraspaso);
      if (mitadTramitador) fila("Tramitador (la mitad)", -mitadTramitador);
      const descuentos = retencion + (meses > 0 ? impuesto : 0) + mitadTraspaso + mitadTramitador;
      fila("Total descuentos", -descuentos, true);
      totalTitulo = "Valor a pagar al cliente"; total = precio - descuentos;
      if (fase) notas.push(`Retención en la fuente: ${pct(tasa)} % de ${COP.format(fase)} (valor de Fasecolda), no del valor acordado por el vehículo.`);
      notas.push(`Impuesto anual estimado: ${COP.format(p.impuestoAnual)}. Al cliente le corresponden ${meses} de 12 meses (${rango}): ${COP.format(p.impuestoAnual)} × ${meses} / 12 = ${COP.format(meses > 0 ? impuesto : 0)}.`);
      notas.push("El traspaso y el tramitador se reparten por mitades entre el cliente y el concesionario.");
    }
    return { rol, filas, total, totalTitulo, tituloDoc, notas, avisos, meses, rango, impuesto, retencion };
  }

  const api = { MESES, nombreMes, mesesImpuesto, calcular, COP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Cotizacion = api;
})(typeof window !== "undefined" ? window : globalThis);
