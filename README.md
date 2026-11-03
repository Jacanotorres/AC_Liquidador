# AC Liquidador — cotizador de impuesto vehicular

Página para concesionarios que calcula el impuesto vehicular anual de un carro con la base
gravable oficial del Ministerio de Transporte. No consulta portales de gobernaciones: usa las
tablas del Ministerio guardadas en Supabase y las tarifas del decreto de Hacienda.

## Archivos

| Ruta | Qué es |
|---|---|
| `index.html` | La página (un solo archivo, sin librerías). Configurar `CONFIG` al inicio del script. |
| `supabase-base-gravable.sql` | Tablas, políticas (solo lectura pública) y funciones `avaluo_marcas`, `avaluo_lineas`, `calcular_impuesto_vehicular`. |
| `datos/avaluo_vehiculos_2026.csv` | 16.090 líneas de vehículo con avalúos por año modelo, en pesos. |
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
