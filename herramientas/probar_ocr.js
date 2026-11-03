// Pruebas del intérprete de texto del OCR con textos de ejemplo (inventados, sin datos de personas).
// Uso: node herramientas/probar_ocr.js
const assert = require("assert");
const T = require(__dirname + "/../tarjeta.js");
const marcas = ["TOYOTA", "CHEVROLET", "VOLKSWAGEN", "MERCEDES BENZ", "RENAULT", "FORD"];

const casos = [
  { n: "Carro con ruido y placa mal leída (A8C123 -> ABC123)", texto: `REPUBLICA DE COLOMBIA
LICENCIA DE TRÁNSITO No. 1234567
PLACA MARCA LÍNEA MODELO
A8C123 TOYOTA COROLLA XEI 2020
1.798 BLANCO PARTICULAR
AUTOMOVIL SEDAN GASOLINA 5`,
    esperado: { placa: "ABC123", marca: "TOYOTA", linea: "COROLLA XEI", modelo: 2020, cilindraje_cc: 1798, clase: "AUTOMOVIL", carroceria: "SEDAN", combustible: "GASOLINA", servicio: "PARTICULAR" } },
  { n: "Basura antes de la placa y marca de dos palabras", texto: `LICENCIA DE TRANSITO
MARCA LINEA
CU XYZ987 MERCEDES BENZ C 200 2017 —-
1991 GRIS PARTICULAR
AUTOMOVIL SEDAN GASOLINA`,
    esperado: { placa: "XYZ987", marca: "MERCEDES BENZ", linea: "C 200", modelo: 2017, cilindraje_cc: 1991 } },
  { n: "Camioneta doble cabina diésel", texto: `LICENCIA DE TRANSITO
PLACA MARCA LINEA MODELO
FFF123 FORD RANGER XLT 2021
3.200 NEGRO PARTICULAR
CAMIONETA DOBLE CABINA DIESEL 5`,
    esperado: { marca: "FORD", linea: "RANGER XLT", modelo: 2021, cilindraje_cc: 3200, clase: "CAMIONETA", carroceria: "DOBLE CABINA", combustible: "DIESEL" } },
  { n: "Servicio público", texto: `LICENCIA DE TRANSITO
PLACA MARCA LINEA MODELO
TZX123 CHEVROLET SAIL 2019
1400 AMARILLO PUBLICO
AUTOMOVIL SEDAN GASOLINA 5`,
    esperado: { servicio: "PUBLICO", marca: "CHEVROLET" } },
  { n: "Marca mal leída por una letra (VOLKSWAGAN)", texto: `LICENCIA DE TRANSITO
ABC123 VOLKSWAGAN JETTA 2019
1395 GRIS PARTICULAR`,
    esperado: { marca: "VOLKSWAGEN", linea: "JETTA" } },
];

let ok = 0;
for (const c of casos) {
  const d = T.interpretarOCR(c.texto, marcas);
  for (const [k, v] of Object.entries(c.esperado)) assert.strictEqual(d[k], v, `${c.n}: ${k} = ${JSON.stringify(d[k])}, se esperaba ${JSON.stringify(v)}`);
  ok++; console.log("OK  ", c.n);
}

// Lo que no es una tarjeta, o no se puede leer, no inventa nada.
const nada = T.interpretarOCR("hola mundo\nfoto de un gato", marcas);
assert.strictEqual(nada.es_tarjeta, false); assert.strictEqual(nada.marca, null); ok++; console.log("OK   texto sin relación: es_tarjeta=false");
const sinMarca = T.interpretarOCR("LICENCIA DE TRANSITO\nPLACA MARCA LINEA\nABC123 MARCAINVENTADA X 2020", marcas);
assert.strictEqual(sinMarca.es_tarjeta, true); assert.strictEqual(sinMarca.marca, null); assert.ok(sinMarca.dudas.length); ok++; console.log("OK   marca desconocida: queda en null con dudas");

// Placas
for (const [entrada, salida] of [["J15144", "JIS144"], ["A8C123", "ABC123"], ["XYZ12E", "XYZ12E"]]) assert.strictEqual(T.normalizarPlaca(entrada).placa, salida);
assert.strictEqual(T.normalizarPlaca("ZZZ98").seguro, false); ok++; console.log("OK   placas");
console.log(`\n${ok} pruebas pasaron`);
