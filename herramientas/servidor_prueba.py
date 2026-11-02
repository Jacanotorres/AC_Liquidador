"""Servidor local de PRUEBA: sirve index.html y emula /rest/v1/rpc/<funcion> de Supabase
ejecutando las funciones SQL reales sobre un Postgres local (pgserver).

Requiere Python 3.12 con: pip install pgserver psycopg2-binary
Uso: python herramientas/servidor_prueba.py [puerto]   (abre http://localhost:8761/)
"""
import json, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pgserver, psycopg2
from psycopg2.extras import RealDictCursor

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8761
PGDATA = "/private/tmp/claude-501/pgdata-cotizador-test"

pg = pgserver.get_server(PGDATA, cleanup_mode="stop")
if "avaluo_vehiculos" not in pg.psql("select to_regclass('public.avaluo_vehiculos');"):
    pg.psql("create role anon nologin; create role authenticated nologin;")
    pg.psql(open(os.path.join(RAIZ, "supabase-base-gravable.sql")).read())
    csv = os.path.join(RAIZ, "datos", "avaluo_vehiculos_2026.csv")
    pg.psql(rf"""\copy public.avaluo_vehiculos (vigencia,tabla,categoria,id_origen,tipo,clase,marca,linea,cilindraje,cilindraje_cc,potencia_kw,tonelaje,pasajeros,es_respaldo,valor_aproximado,valores) from '{csv}' csv header""")
conn = psycopg2.connect(pg.get_uri())
conn.autocommit = True

TIPOS = {"p_vigencia": "int", "p_tabla": "smallint", "p_marca": "text", "p_vehiculo_id": "bigint",
         "p_anio_modelo": "int", "p_valor_factura": "bigint", "p_factor": "numeric"}
FUNCIONES = {"avaluo_marcas", "avaluo_lineas", "calcular_impuesto_vehicular"}


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, open(os.path.join(RAIZ, "index.html"), "rb").read(), "text/html; charset=utf-8")
        else:
            self._send(404, {"message": "no encontrado"})

    def do_POST(self):
        fn = self.path.rsplit("/", 1)[-1]
        if not self.path.startswith("/rest/v1/rpc/") or fn not in FUNCIONES:
            return self._send(404, {"message": "función no encontrada"})
        args = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        nombres = list(args)
        sql = f"select * from public.{fn}(" + ", ".join(f"{n} := %s::{TIPOS[n]}" for n in nombres) + ")"
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, [args[n] for n in nombres])
                filas = cur.fetchall()
        except psycopg2.Error as e:
            return self._send(400, {"message": (e.diag.message_primary or str(e))})
        if fn == "avaluo_marcas":                      # setof text -> lista de strings (como PostgREST)
            filas = [f["avaluo_marcas"] for f in filas]
        self._send(200, json.loads(json.dumps(filas, default=float)))

    def log_message(self, *a):
        pass


print(f"http://localhost:{PUERTO}/", flush=True)
ThreadingHTTPServer(("127.0.0.1", PUERTO), H).serve_forever()
