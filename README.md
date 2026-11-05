# AC Liquidador — cotizador de impuesto vehicular

Página para concesionarios que calcula el impuesto vehicular anual de un carro con la base
gravable oficial del Ministerio de Transporte. No consulta portales de gobernaciones: usa las
tablas del Ministerio guardadas en Supabase y las tarifas del decreto de Hacienda.

## Cómo se usa (3 pasos)

1. **Vehículo.** Sube la foto de la tarjeta de propiedad (frente y reverso, tocando o arrastrando) o elige
   el vehículo a mano. Si la línea no es única, se muestran las opciones del Ministerio con su avalúo
   para elegir la versión exacta.
2. **Cotización.** Elige la operación (somos vendedores o somos compradores), escribe los valores y los
   trámites: la cotización se calcula sola mientras escribes. Se descarga en PDF. Ver "Los dos roles".
3. **Documentos.** Elige el documento (FUN, compraventa o contrato de mandato), mira la vista previa y
   descárgalo en Excel o en PDF. Cada uno sale por separado y se llena solo. Se ve cuántos campos faltan por
   grupo.

Arriba, un resumen con el vehículo y el valor final queda a la vista en todos los pasos; "Empezar de
nuevo" borra la operación. En el celular, el valor final queda fijo abajo mientras se arma la cotización.

## Archivos

| Ruta | Qué es |
|---|---|
| `index.html` | La página y su lógica. Configurar `CONFIG` al inicio del script. |
| `cotizacion.js` | Cuentas de la cotización para cada rol del concesionario (sin pantalla, se prueba en Node). |
| `tarjeta.js` | Lee la tarjeta de propiedad (OCR) y la busca en las tablas del Ministerio. |
| `formatos.js` | Llena la hoja Datos Basicos y deja un Excel por documento. |
| `hoja.js`, `dibujo.js` | Leen una hoja de la plantilla y la dibujan en PDF y en la vista previa. |
| `assets/` | Logo, íconos y `logo-runt.png` (copia en PNG del logo de RUNT del FUN). |
| `supabase-base-gravable.sql` | Tablas, políticas (solo lectura pública) y funciones `avaluo_marcas`, `avaluo_lineas`, `calcular_impuesto_vehicular`. |
| `datos/avaluo_vehiculos_2026.csv` | 16.090 líneas de vehículo con avalúos por año modelo, en pesos. |
| `plantillas/documentos-compra.xlsx` | Plantilla integrada de los formatos (hoy se usan FUN, compraventa y mandato), sin datos de personas. |
| `herramientas/extraer_tabla.py` | PDF de un anexo del Ministerio → CSV (requiere `pdfplumber`). |
| `herramientas/preparar_csv.py` | Une los CSV de las tablas 1 a 9 en el CSV de carga. |
| `herramientas/servidor_prueba.py` | Servidor local que imita Supabase sobre Postgres, para probar sin credenciales. |

## Puesta en marcha

1. Supabase → SQL Editor: pegar y ejecutar `supabase-base-gravable.sql`.
2. Table Editor → `avaluo_vehiculos` → Import: cargar `datos/avaluo_vehiculos_2026.csv`.
3. En `index.html`, completar `CONFIG`: `supabaseUrl`, `supabaseKey` (llave pública) y `concesionario`.
4. Publicar `index.html` en cualquier hosting estático.

## Cotización desde la foto de la tarjeta de propiedad

La página lee la tarjeta con una foto y arma la cotización: valor, descuento, impuesto, SOAT,
traspaso, tramitador y prenda. **Es gratis y no necesita llaves ni servidores:** el OCR
([Tesseract.js](https://github.com/naptha/tesseract.js)) corre en el navegador de quien cotiza, la foto no
sale del dispositivo y no se guarda. La primera vez descarga el lector (unos 15 MB, desde jsDelivr) y luego
queda en caché.

- `tarjeta.js` interpreta el texto leído: ubica la marca con las de las tablas del Ministerio, toma la
  línea, el modelo, el cilindraje, la clase, el combustible y el servicio, y corrige la placa según su
  formato (3 letras + 3 números). No inventa: lo que no se lee queda vacío y se avisa.
- Siempre se muestran los datos leídos y varias opciones de línea con su avalúo para que la persona
  confirme. La **placa** es el dato menos fiable del OCR: se puede editar y no entra en el cálculo.
- Con buena luz, sin reflejos y la tarjeta ocupando buena parte de la foto, la lectura mejora mucho.
- Si el OCR no sirve para una foto, el vehículo se elige a mano (marca, línea, año).
- Pruebas: `node herramientas/probar_ocr.js` (intérprete de texto) y
  `node herramientas/probar_coincidencia.js` (coincidencia con tu Supabase).
- Traspaso, tramitador y prenda vienen precargados con valores de ejemplo (`CONFIG.tramites`); en
  pantalla se pueden cambiar y el navegador los recuerda. El SOAT se digita por cotización.

## Documentos de compra (FUN, compraventa y contrato de mandato)

Los formatos vienen **integrados**: `plantillas/documentos-compra.xlsx` se incluye con la aplicación. En el
paso 3 hay una tarjeta por documento, cada una con **Vista previa**, **Excel** y **PDF**. No hay que subir
ningún archivo. Por ahora están estos tres; los otros formatos de la plantilla (mandato jurídico, doble
dueño, consignaciones) quedaron fuera a propósito.

- **Vista previa:** muestra las páginas tal como saldrán, antes de descargar.
- **PDF:** se dibuja directamente desde la hoja de la plantilla (columnas, celdas combinadas, bordes,
  negritas y subrayados, logos e imágenes), con las medidas de impresión del Excel (por ejemplo el FUN en
  horizontal a 75 % y 2 páginas). No pasa por Excel, así que puede haber pequeñas diferencias con lo que
  imprimiría Excel.
- **Excel:** un archivo con solo ese documento. Trae además la hoja "Datos Basicos" oculta para que las
  fórmulas sigan vivas: si cambias un dato ahí, el documento se actualiza.

Cómo se llenan: sube la foto de la tarjeta (frente y reverso), completa lo que no está en ella (dirección,
teléfono y ciudad del propietario; datos del comprador) y revisa los campos con borde ámbar (placa, motor,
VIN, chasis, cédula): vienen del OCR, que los confunde, sobre todo con fotos pequeñas. En "Datos de la
empresa" se pueden poner el nombre, el representante y el NIT; vacíos, se usan los de la plantilla.

Detalles técnicos:

- `formatos.js` llena la hoja **Datos Basicos** editando el XML (sin librería de Excel, para no perder
  imágenes ni estilos) y `soloHoja` deja un Excel con un solo documento. Un campo vacío se escribe como texto
  vacío, no como celda vacía, porque en Excel una fórmula que apunta a una celda vacía muestra "0".
- `hoja.js` lee una hoja (anchos, alturas, combinadas, estilos, textos con formato, imágenes), calcula las
  fórmulas (referencias a Datos Basicos y a la misma hoja, y `TODAY()`) y arma las páginas. `dibujo.js` las
  pinta en un PDF (jsPDF) y en la vista previa (canvas) con las mismas instrucciones.
- El logo de RUNT del FUN viene en un formato (EMF) que los navegadores no dibujan: se usa una copia en PNG,
  `assets/logo-runt.png`, extraída de ese mismo archivo.
- Para agregar otro documento: sumar una entrada a `DOCUMENTOS` en `index.html` con el nombre de su hoja.
- La página debe servirse desde un servidor web (no con doble clic en `index.html`); al publicar, subir también
  `plantillas/`, `assets/`, `hoja.js` y `dibujo.js`.

### Actualizar o cambiar los formatos

La plantilla integrada no tiene datos de personas: `herramientas/limpiar_plantilla.py` la prepara a partir
de tu Excel (vacía los datos de ejemplo, los valores guardados de las fórmulas y los metadatos del autor, y
verifica que no quede rastro):

```bash
python herramientas/limpiar_plantilla.py "Documentos Compra De Vehiculos.xlsx" plantillas/documentos-compra.xlsx
```

La hoja "Datos Basicos" debe conservar su estructura (los datos del vehículo, el propietario y el comprador
en C3:C40). Si cambias de lugar alguno, hay que ajustar `CAMPOS` en `formatos.js`. La plantilla actual trae
los datos de la empresa de ejemplo (C42:C44, incluido un NIT de relleno): reemplázalos en Excel o escríbelos
en la página.

## Los dos roles de la cotización

| | Somos vendedores (el cliente compra) | Somos compradores (el cliente vende) |
|---|---|---|
| Parte del | valor del vehículo menos el descuento | valor acordado por el vehículo |
| Se suma | impuesto, SOAT, traspaso, tramitador y prenda (si aplica) | nada |
| Se resta | nada | retención en la fuente, impuesto del cliente, mitad del traspaso y mitad del tramitador |
| Resultado | "Valor final" que paga el cliente | "Valor a pagar al cliente"; el PDF sale como "Liquidación de compra" |

- **Retención en la fuente:** `CONFIG.retencion` (1 %) sobre el **valor de Fasecolda**, no sobre el valor
  acordado. Ese valor se escribe a mano; si falta, la cotización lo avisa y no inventa la retención.
- **Meses del impuesto:** si vendemos, el cliente paga desde el mes elegido hasta diciembre; si compramos, el
  mes elegido es el de la compra y el cliente paga de enero al mes anterior (así los dos clientes se reparten
  los 12 meses). Es una convención; confírmala con tu contador.
- SOAT, prenda y descuento solo existen cuando somos vendedores. El rol elegido se recuerda en el navegador.

## PDF de la cotización

El botón "Descargar cotización en PDF" (paso 2) genera un PDF A4 con el logo, el vehículo, el detalle de
valores, el total y las notas, con lo mismo que se ve en pantalla (usa jsPDF, cargado desde jsDelivr).

## Probar en local

```bash
pip install pgserver psycopg2-binary   # Python 3.12
python herramientas/servidor_prueba.py  # http://localhost:8761/
```

## Actualización anual

El Ministerio publica la resolución en noviembre (la de 2027 debería salir a fines de noviembre de 2026).

1. Bajar los anexos 1 a 9 de la nueva resolución.
2. `python herramientas/extraer_tabla.py anexoN.pdf tablaN_<nombre>_<año>.csv` por cada anexo.
3. `python herramientas/preparar_csv.py <carpeta> salida.csv <vigencia>` (revisar que `ANIOS` y los
   nombres `tabla*_2026.csv` del script cubran el nuevo año).
4. Cargar el CSV y agregar las tarifas de la vigencia en `tarifas_impuesto_vehicular`
   (Decreto de Hacienda de diciembre). Cambiar `vigencia` en `CONFIG`.

## Alcance y límites

- Solo vehículos particulares (tablas 1 a 4 y 9). Motos, servicio público, carga y ambulancias
  tienen tarifas propias que no están cargadas; la función falla en vez de inventarlas.
- Vehículos nuevos: la base es la factura sin IVA, no la tabla.
- Es un estimado. La liquidación oficial la hace la gobernación o secretaría de hacienda del
  lugar de matrícula (descuentos, intereses, tasas).
- El PDF del Ministerio parte algunos nombres de marca (p. ej. "MESSERSCHMIT T"); se dejaron tal cual.
- Fuentes 2026: Resolución 20253040048935 de 2025 (Mintransporte) y Decreto 1457 de 2025 (Hacienda).

## Pruebas

```bash
node herramientas/probar_ocr.js            # lectura e interpretación de la tarjeta (datos inventados)
node herramientas/probar_coincidencia.js   # coincidencia con las tablas del Ministerio (usa tu Supabase)
node herramientas/probar_cotizacion.js     # cuentas de los dos roles (vendedor y comprador)
npm install jszip jspdf                    # solo para las tres siguientes
node herramientas/probar_formatos.js       # llenado del Excel con una plantilla mínima inventada
node herramientas/probar_plantilla.js      # la plantilla integrada no trae datos de personas y se llena bien
node herramientas/probar_documentos.js     # los 3 documentos: páginas, textos, PDF y Excel individual
```
