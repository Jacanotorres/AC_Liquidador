-- Base gravable del impuesto vehicular (tablas del Ministerio de Transporte) para el cotizador.
-- Fuente 2026: Resolución 20253040048935 del 26-11-2025, anexos 1 a 9 (valores en miles de pesos;
-- aquí se guardan en PESOS). Cada año se agrega una vigencia nueva sin cambiar el esquema.
-- Ejecutar UNA vez: Dashboard -> SQL Editor -> New query -> pegar -> Run.
-- Después cargar avaluo_vehiculos_2026.csv en public.avaluo_vehiculos (Table Editor -> Import).

create table public.avaluo_vehiculos (
  id bigint generated always as identity primary key,
  vigencia int not null,                     -- año fiscal de la resolución, ej. 2026
  tabla smallint not null check (tabla between 1 and 9),
  categoria text not null,                   -- automoviles, camionetas_camperos, doble_cabina, electricos,
                                             -- motos, pasajeros, carga, ambulancias, hibridos
  id_origen text,                            -- ID de la tabla del Ministerio (a veces vacío)
  tipo text not null,
  clase text not null,
  marca text not null,
  linea text not null,
  cilindraje text,                           -- tal cual el Ministerio; en eléctricos viene en kW
  cilindraje_cc int,                         -- solo si es numérico
  potencia_kw numeric,                       -- solo eléctricos y motos eléctricas
  tonelaje numeric,                          -- carga
  pasajeros int,
  es_respaldo boolean not null default false,-- fila "LINEAS Y CILINDRAJES NO INCLUIDOS ANTERIORES A AÑO BASE"
  valor_aproximado boolean not null default false, -- el PDF trae algún valor redondeado (1E+06) en esta fila
  valores jsonb not null                     -- {"2001":..., "2002":..., "2025":...} en pesos; "2001" = 2001 y anteriores
);

create index avaluo_vehiculos_busqueda
  on public.avaluo_vehiculos (vigencia, tabla, marca, linea)
  where not es_respaldo;

-- Tarifas por rango de avalúo. Hoy solo están cargadas las de vehículos particulares 2026
-- (Decreto 1457 de 2025, Ministerio de Hacienda). Motos, servicio público, carga, etc. tienen
-- reglas propias: no se cargan hasta confirmarlas.
create table public.tarifas_impuesto_vehicular (
  id bigint generated always as identity primary key,
  vigencia int not null,
  grupo text not null,                       -- 'particular'
  desde numeric not null,                    -- exclusivo, en pesos
  hasta numeric,                             -- inclusivo; null = sin tope
  tarifa numeric not null check (tarifa > 0 and tarifa < 1)
);

insert into public.tarifas_impuesto_vehicular (vigencia, grupo, desde, hasta, tarifa) values
  (2026, 'particular',          0,  57349000, 0.015),
  (2026, 'particular',   57349000, 129032000, 0.025),
  (2026, 'particular',  129032000,      null, 0.035);

alter table public.avaluo_vehiculos enable row level security;
alter table public.tarifas_impuesto_vehicular enable row level security;

create policy "Cualquiera consulta los avaluos"
  on public.avaluo_vehiculos for select
  to anon, authenticated
  using (true);

create policy "Cualquiera consulta las tarifas"
  on public.tarifas_impuesto_vehicular for select
  to anon, authenticated
  using (true);

grant select on public.avaluo_vehiculos, public.tarifas_impuesto_vehicular to anon, authenticated;

-- Escritura: solo con la service_role key o desde el SQL Editor (no hay políticas de insert/update).

-- Listas desplegables del cotizador -------------------------------------------------------------

create or replace function public.avaluo_marcas(p_vigencia int, p_tabla smallint)
returns setof text
language sql stable
as $$
  select distinct marca from public.avaluo_vehiculos
  where vigencia = p_vigencia and tabla = p_tabla and not es_respaldo
  order by marca;
$$;

create or replace function public.avaluo_lineas(p_vigencia int, p_tabla smallint, p_marca text)
returns table (id bigint, linea text, cilindraje text, anios int[])
language sql stable
as $$
  select v.id, v.linea, v.cilindraje,
         (select array_agg(k::int order by k::int) from jsonb_object_keys(v.valores) k)
  from public.avaluo_vehiculos v
  where v.vigencia = p_vigencia and v.tabla = p_tabla and v.marca = p_marca and not v.es_respaldo
  order by v.linea, v.cilindraje;
$$;

-- Cálculo ----------------------------------------------------------------------------------------
-- p_valor_factura: para vehículos NUEVOS la base es el valor de la factura sin IVA, no la tabla.
-- p_factor: ajuste de la base (ej. 0.45 San Andrés, 0.5 internados temporalmente).
-- Con vigencia 2026, "2001" también cubre los años modelo anteriores a 2001.
create or replace function public.calcular_impuesto_vehicular(
  p_vehiculo_id bigint,
  p_anio_modelo int,
  p_valor_factura bigint default null,
  p_factor numeric default 1
)
returns table (base_gravable bigint, tarifa numeric, impuesto bigint)
language plpgsql stable
as $$
declare
  v public.avaluo_vehiculos;
  v_base bigint;
  v_grupo text;
  v_tarifa numeric;
begin
  select * into v from public.avaluo_vehiculos where id = p_vehiculo_id;
  if not found then
    raise exception 'Vehículo % no existe', p_vehiculo_id;
  end if;

  if p_valor_factura is not null then
    v_base := p_valor_factura;
  else
    v_base := (v.valores ->> (greatest(p_anio_modelo, 2001))::text)::bigint;
    if v_base is null then
      raise exception 'Sin avalúo para el año modelo % en este vehículo', p_anio_modelo;
    end if;
  end if;
  v_base := round(v_base * p_factor);

  v_grupo := case when v.tabla in (1, 2, 3, 4, 9) then 'particular' end;
  select r.tarifa into v_tarifa
  from public.tarifas_impuesto_vehicular r
  where r.vigencia = v.vigencia and r.grupo = v_grupo
    and v_base > r.desde and (r.hasta is null or v_base <= r.hasta);
  if v_tarifa is null then
    raise exception 'No hay tarifa cargada para la categoría % (vigencia %)', v.categoria, v.vigencia;
  end if;

  return query select v_base, v_tarifa, round(v_base * v_tarifa)::bigint;
end;
$$;

grant execute on function public.avaluo_marcas(int, smallint) to anon, authenticated;
grant execute on function public.avaluo_lineas(int, smallint, text) to anon, authenticated;
grant execute on function public.calcular_impuesto_vehicular(bigint, int, bigint, numeric) to anon, authenticated;
