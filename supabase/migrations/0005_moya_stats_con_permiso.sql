-- moya_stats() era ejecutable por cualquier cuenta autenticada, tuviera o no
-- fila en admins. El tráfico del sitio no es secreto de estado, pero no hay
-- razón para que una cuenta de Auth suelta lo lea: ahora pasa por puede(),
-- como el resto del panel, y devuelve null a quien no tiene el módulo.
create or replace function public.moya_stats()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select case when not public.puede('metricas') then null::jsonb else (
    with base as (select * from public.moya_pageviews),
    dias as (select generate_series((current_date - interval '29 days')::date, current_date, interval '1 day')::date as dia)
    select jsonb_build_object(
      'generado_en', now(),
      'totales', jsonb_build_object(
        'hoy', (select count(*) from base where created_at >= current_date),
        'ayer', (select count(*) from base where created_at >= current_date - interval '1 day' and created_at < current_date),
        'dias7', (select count(*) from base where created_at >= current_date - interval '6 days'),
        'dias7_prev', (select count(*) from base where created_at >= current_date - interval '13 days' and created_at < current_date - interval '6 days'),
        'dias30', (select count(*) from base where created_at >= current_date - interval '29 days'),
        'total', (select count(*) from base),
        'sesiones30', (select count(distinct session_id) from base where created_at >= current_date - interval '29 days'),
        'sesiones_hoy', (select count(distinct session_id) from base where created_at >= current_date)
      ),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', to_char(d.dia,'YYYY-MM-DD'), 'visitas', coalesce(v.n,0)) order by d.dia), '[]'::jsonb)
                from dias d left join (select created_at::date as dia, count(*) as n from base where created_at >= current_date - interval '29 days' group by 1) v on v.dia = d.dia),
      'paginas', (select coalesce(jsonb_agg(x order by (x->>'visitas')::int desc), '[]'::jsonb) from (select jsonb_build_object('nombre', path, 'visitas', count(*)) as x from base where created_at >= current_date - interval '29 days' group by path order by count(*) desc limit 8) t),
      'dispositivos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select jsonb_build_object('nombre', device, 'visitas', count(*)) as x from base where created_at >= current_date - interval '29 days' group by device order by count(*) desc) t),
      'idiomas', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select jsonb_build_object('nombre', lang, 'visitas', count(*)) as x from base where created_at >= current_date - interval '29 days' group by lang order by count(*) desc) t),
      'origenes', (select coalesce(jsonb_agg(x order by (x->>'visitas')::int desc), '[]'::jsonb) from (select jsonb_build_object('nombre', referrer, 'visitas', count(*)) as x from base where created_at >= current_date - interval '29 days' group by referrer order by count(*) desc limit 8) t)
    )
  ) end;
$function$;
