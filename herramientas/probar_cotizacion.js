// Pruebas de las cuentas de la cotización (los dos roles del concesionario). Cifras inventadas.
// Uso: node herramientas/probar_cotizacion.js
const assert = require("assert"), path = require("path");
const C = require(path.join(__dirname, "..", "cotizacion.js"));

const base = { impuestoAnual: 1650750, baseGravable: 66030000, tarifa: 0.025, nuevo: false };
const fila = (r, inicio) => r.filas.find((f) => f.etiqueta.startsWith(inicio));
const sinFila = (r, inicio) => assert.ok(!r.filas.some((f) => f.etiqueta.startsWith(inicio)), `no debe haber "${inicio}"`);

// ---- Somos vendedores: el cliente compra
let r = C.calcular({ ...base, rol: "vendedor", precio: 72800000, descuento: 1800000, soat: 1097000, traspaso: 180000, tramitador: 180000, prenda: 280000, mes: "10" });
assert.strictEqual(r.impuesto, 412688); assert.strictEqual(r.total, 73149688); assert.strictEqual(r.totalTitulo, "Valor final");
assert.strictEqual(fila(r, "Total papeles").valor, 2149688); assert.strictEqual(fila(r, "Descuento").valor, -1800000);
sinFila(r, "Retención");
console.log("OK   vendedor (el cliente compra): valor - descuento + impuesto + SOAT + traspaso + tramitador + prenda = $73.149.688");

r = C.calcular({ ...base, rol: "vendedor", precio: 71000000, soat: 0, traspaso: 180000, tramitador: 180000, prenda: 0, mes: "" });
assert.strictEqual(r.impuesto, 1650750); assert.strictEqual(r.total, 71000000 + 1650750 + 360000);
console.log("OK   vendedor, año completo y sin SOAT ni prenda");

// ---- Somos compradores: el cliente vende
r = C.calcular({ ...base, rol: "comprador", precio: 71000000, fasecolda: 80000000, tasaRetencion: 0.01, traspaso: 180000, tramitador: 180000, mes: "10" });
assert.strictEqual(r.retencion, 800000, "1 % del valor de Fasecolda, no del valor acordado");
assert.strictEqual(r.meses, 9); assert.strictEqual(r.rango, "enero a septiembre"); assert.strictEqual(r.impuesto, 1238063);
assert.strictEqual(fila(r, "Traspaso").valor, -90000); assert.strictEqual(fila(r, "Tramitador").valor, -90000);
assert.strictEqual(fila(r, "Total descuentos").valor, -(800000 + 1238063 + 180000));
assert.strictEqual(r.total, 71000000 - 800000 - 1238063 - 180000); assert.strictEqual(r.total, 68781937);
assert.strictEqual(r.totalTitulo, "Valor a pagar al cliente"); assert.strictEqual(r.tituloDoc, "Liquidación de compra");
console.log("OK   comprador (el cliente vende): valor - 1 % de Fasecolda - impuesto proporcional - mitades = $68.781.937");

const alterno = C.calcular({ ...base, rol: "comprador", precio: 71000000, fasecolda: 80000000, soat: 1097000, prenda: 280000, descuento: 1800000, traspaso: 180000, tramitador: 180000, mes: "10" });
assert.strictEqual(alterno.total, r.total, "el comprador ignora SOAT, prenda y descuento");
sinFila(alterno, "SOAT"); sinFila(alterno, "Prenda"); sinFila(alterno, "Descuento");
console.log("OK   comprador: SOAT, prenda y descuento no entran en la cuenta");

const otroFase = C.calcular({ ...base, rol: "comprador", precio: 50000000, fasecolda: 120000000, traspaso: 0, tramitador: 0, mes: "1" });
assert.strictEqual(otroFase.retencion, 1200000, "la retención no depende del valor acordado");
assert.strictEqual(otroFase.meses, 0); sinFila(otroFase, "Impuesto vehicular");
assert.strictEqual(otroFase.total, 50000000 - 1200000);
console.log("OK   comprador: la retención sigue a Fasecolda y en enero el cliente no paga impuesto");

const sinFase = C.calcular({ ...base, rol: "comprador", precio: 71000000, fasecolda: 0, traspaso: 180000, tramitador: 180000, mes: "10" });
assert.strictEqual(sinFase.retencion, 0); assert.ok(sinFase.avisos.length, "avisa que falta Fasecolda");
console.log("OK   comprador sin valor de Fasecolda: avisa y no inventa la retención");

// ---- Meses del impuesto
assert.deepStrictEqual(C.mesesImpuesto("vendedor", "10"), { meses: 3, rango: "octubre a diciembre" });
assert.deepStrictEqual(C.mesesImpuesto("vendedor", "12"), { meses: 1, rango: "diciembre" });
assert.deepStrictEqual(C.mesesImpuesto("comprador", "2"), { meses: 1, rango: "enero" });
assert.deepStrictEqual(C.mesesImpuesto("comprador", "12"), { meses: 11, rango: "enero a noviembre" });
// el cliente comprador y el cliente vendedor se reparten el año completo
for (let m = 1; m <= 12; m++) assert.strictEqual(C.mesesImpuesto("vendedor", m).meses + C.mesesImpuesto("comprador", m).meses, 12);
console.log("OK   los meses del impuesto se reparten el año completo entre vendedor y comprador");

// ---- Sin valor del vehículo: solo impuesto
r = C.calcular({ ...base, rol: "comprador", precio: 0, mes: "10" });
assert.strictEqual(r.total, 1238063); assert.ok(/a cargo del cliente/.test(r.totalTitulo));
r = C.calcular({ ...base, rol: "vendedor", precio: 0, mes: "" });
assert.strictEqual(r.total, 1650750);
console.log("OK   sin valor del vehículo muestra solo el impuesto");
console.log("\n8 pruebas pasaron");
