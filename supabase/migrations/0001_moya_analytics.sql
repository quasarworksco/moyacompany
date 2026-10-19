-- =========================================================
-- Métricas del sitio Moya & Company
-- Tabla de visitas + función de agregados para el panel /admin
-- =========================================================

create table if not exists public.moya_pageviews (
  id          bigint generated always as identity primary key,
  created_at  timestamptz  not null default now(),
  path        text         not null default '/',
  referrer    text         not null default 'directo',
  lang        text         not null default 'es',
  device      text         not null default 'escritorio',
  session_id  text         not null default 'anon'
);

create index if not exists moya_pageviews_created_at_idx
  on public.moya_pageviews (created_at desc);

alter table public.moya_pageviews enable row level security;

-- El sitio público sólo puede insertar visitas. No puede leerlas.
drop policy if exists moya_pageviews_insert_anon on public.moya_pageviews;
create policy moya_pageviews_insert_anon
  on public.moya_pageviews for insert to anon, authenticated
  with check (true);

-- Agregados para el panel. SECURITY DEFINER: devuelve totales,
-- nunca las filas individuales.
create or replace function public.moya_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with base as (
    select * from public.moya_pageviews
  ),
  dias as (
    select generate_series(
      (current_date - interval '29 days')::date, current_date, interval '1 day'
    )::date as dia
  )
  select jsonb_build_object(
    'generado_en', now(),
    'totales', jsonb_build_object(
      'hoy',        (select count(*) from base where created_at >= current_date),
      'ayer',       (select count(*) from base
                      where created_at >= current_date - interval '1 day'
                        and created_at <  current_date),
      'dias7',      (select count(*) from base where created_at >= current_date - interval '6 days'),
      'dias7_prev', (select count(*) from base
                      where created_at >= current_date - interval '13 days'
                        and created_at <  current_date - interval '6 days'),
      'dias30',     (select count(*) from base where created_at >= current_date - interval '29 days'),
      'total',      (select count(*) from base),
      'sesiones30', (select count(distinct session_id) from base
                      where created_at >= current_date - interval '29 days'),
      'sesiones_hoy',(select count(distinct session_id) from base where created_at >= current_date)
    ),
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', to_char(d.dia, 'YYYY-MM-DD'),
               'visitas', coalesce(v.n, 0)
             ) order by d.dia), '[]'::jsonb)
      from dias d
      left join (
        select created_at::date as dia, count(*) as n
        from base where created_at >= current_date - interval '29 days'
        group by 1
      ) v on v.dia = d.dia
    ),
    'paginas', (
      select coalesce(jsonb_agg(x order by x->>'visitas' desc), '[]'::jsonb) from (
        select jsonb_build_object('nombre', path, 'visitas', count(*)) as x
        from base where created_at >= current_date - interval '29 days'
        group by path order by count(*) desc limit 8
      ) t
    ),
    'dispositivos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('nombre', device, 'visitas', count(*)) as x
        from base where created_at >= current_date - interval '29 days'
        group by device order by count(*) desc
      ) t
    ),
    'idiomas', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('nombre', lang, 'visitas', count(*)) as x
        from base where created_at >= current_date - interval '29 days'
        group by lang order by count(*) desc
      ) t
    ),
    'origenes', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('nombre', referrer, 'visitas', count(*)) as x
        from base where created_at >= current_date - interval '29 days'
        group by referrer order by count(*) desc limit 8
      ) t
    )
  );
$$;

revoke all on function public.moya_stats() from public;
grant execute on function public.moya_stats() to anon, authenticated;
