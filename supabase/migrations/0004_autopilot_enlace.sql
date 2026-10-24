-- =========================================================
-- Social Media Autopilot de DGP en el panel
-- El widget oficial (adv.dgp-link.com/autopilot.js) necesita un par
-- cliente/clave que emite DGP. No puede ir en el repositorio porque el
-- sitio es público, así que se guarda en integraciones y el panel lo
-- pide con esta función, que entrega ESE par y nada más: las claves de
-- Twilio y Groq siguen siendo sólo para el servidor.
--
-- Para activarlo, cuando DGP entregue los datos:
--   insert into public.integraciones (clave, valor) values
--     ('autopilot_cliente', 'ID-QUE-DA-DGP'),
--     ('autopilot_clave',   'CLAVE-QUE-DA-DGP')
--   on conflict (clave) do update set valor = excluded.valor, updated_at = now();
-- =========================================================
create or replace function public.autopilot_enlace()
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select case when public.puede('contenido')
    then coalesce((select jsonb_object_agg(clave, valor)
                     from public.integraciones
                    where clave in ('autopilot_cliente','autopilot_clave')), '{}'::jsonb)
    else '{}'::jsonb end;
$$;

-- EXECUTE se concede a PUBLIC por omisión y anon hereda de PUBLIC:
-- revocarle sólo a anon no bastaría.
revoke execute on function public.autopilot_enlace() from public, anon, authenticated;
grant  execute on function public.autopilot_enlace() to authenticated;
