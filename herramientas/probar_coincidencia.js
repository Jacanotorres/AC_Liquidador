const T = require(__dirname + "/../tarjeta.js");
const U="https://sqncxdtjmpqvfyzsvild.supabase.co", K="sb_publishable_MrzfQ_36vC77_R7zrJwicQ_A4Ja6l_e";
const rpc = (fn,a)=>fetch(`${U}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:K,"Content-Type":"application/json"},body:JSON.stringify(a)}).then(r=>r.json());
const casos = [
  { n:"Jetta de la foto", d:{marca:"VOLKSWAGEN",linea:"JETTA COMFORTLINE",modelo:2019,cilindraje_cc:1395,clase:"AUTOMOVIL",carroceria:"SEDAN",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Corolla XEI", d:{marca:"TOYOTA",linea:"COROLLA XEI",modelo:2020,cilindraje_cc:1798,clase:"AUTOMOVIL",carroceria:"SEDAN",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Spark GT", d:{marca:"CHEVROLET",linea:"SPARK GT",modelo:2018,cilindraje_cc:1206,clase:"AUTOMOVIL",carroceria:"HATCH BACK",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Vitara (camioneta)", d:{marca:"SUZUKI",linea:"VITARA",modelo:2023,cilindraje_cc:1373,clase:"CAMIONETA",carroceria:"WAGON",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Marca con guion", d:{marca:"MERCEDES-BENZ",linea:"C 200",modelo:2017,cilindraje_cc:1991,clase:"AUTOMOVIL",carroceria:"SEDAN",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Taxi (servicio público)", d:{marca:"CHEVROLET",linea:"SAIL",modelo:2019,cilindraje_cc:1400,clase:"AUTOMOVIL",combustible:"GASOLINA",servicio:"PUBLICO"} },
  { n:"Moto", d:{marca:"YAMAHA",linea:"FZ",modelo:2020,cilindraje_cc:150,clase:"MOTOCICLETA",combustible:"GASOLINA",servicio:"PARTICULAR"} },
  { n:"Eléctrico", d:{marca:"BYD",linea:"SEAGULL",modelo:2024,cilindraje_cc:null,clase:"AUTOMOVIL",combustible:"ELECTRICO",servicio:"PARTICULAR"} },
  { n:"Doble cabina", d:{marca:"TOYOTA",linea:"HILUX",modelo:2021,cilindraje_cc:2755,clase:"CAMIONETA",carroceria:"DOBLE CABINA",combustible:"DIESEL",servicio:"PARTICULAR"} },
];
(async()=>{
  console.log("cilindrajeANumero('1.395') =", T.cilindrajeANumero("1.395"));
  for (const c of casos) {
    const t = T.decidirTabla(c.d);
    console.log(`\n## ${c.n} -> ${t.bloqueo ? "BLOQUEO: "+t.bloqueo : "tabla "+t.tabla}`);
    if (t.bloqueo) continue;
    const marcas = await rpc("avaluo_marcas",{p_vigencia:2026,p_tabla:t.tabla});
    const marca = T.elegirMarca(marcas, c.d.marca);
    console.log("   marca:", marca);
    if (!marca) continue;
    const lineas = await rpc("avaluo_lineas",{p_vigencia:2026,p_tabla:t.tabla,p_marca:marca});
    const top = T.rankearLineas(lineas, c.d, 4);
    for (const r of top) {
      const imp = await rpc("calcular_impuesto_vehicular",{p_vehiculo_id:r.linea.id,p_anio_modelo:T.anioParaTabla(r.linea.anios,c.d.modelo).anio});
      console.log(`   ${String(r.puntaje).padStart(6)} | ${r.linea.linea} · ${r.linea.cilindraje} | base ${imp[0]?.base_gravable?.toLocaleString("es-CO")} | imp ${imp[0]?.impuesto?.toLocaleString("es-CO")}`);
    }
  }
})();
