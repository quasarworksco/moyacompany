-- =========================================================
-- Ajustes del panel: las claves de Twilio, Groq y Autopilot se
-- cargan desde el panel en vez del SQL Editor.
--
-- integraciones sigue sin políticas: nadie la lee por la API.
-- Estas dos funciones son la única puerta, y sólo para rol admin:
--   integraciones_estado()   → qué claves están puestas, nunca su valor
--                              (de los SID y del número, los últimos 4)
--   guardar_integraciones(p) → escribe; '' o null deja la clave como está
-- Los secretos son de sólo escritura: una vez guardados, ni el panel
-- ni quien tenga la sesión de un admin puede volver a leerlos.
-- =========================================================

-- Sólo rol admin: un agente con permiso «llamadas» marca, pero no toca claves.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid())
      and activo
      and (acceso_hasta is null or acceso_hasta >= current_date)
      and rol = 'admin'
  );
$$;

revoke execute on function public.es_admin() from public, anon, authenticated;
grant  execute on function public.es_admin() to authenticated;

create or replace function public.integraciones_estado()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.es_admin() then null::jsonb else (
    select coalesce(jsonb_object_agg(k.clave, jsonb_build_object(
      'puesta', i.clave is not null,
      'final',  case when k.secreta or i.valor is null then null else right(i.valor, 4) end,
      'updated_at', i.updated_at
    )), '{}'::jsonb)
    from (values
      ('TWILIO_ACCOUNT_SID', false), ('TWILIO_AUTH_TOKEN', true),
      ('TWILIO_API_KEY_SID', false), ('TWILIO_API_KEY_SECRET', true),
      ('TWILIO_NUMERO', false),      ('GROQ_API_KEY', true),
      ('autopilot_cliente', false),  ('autopilot_clave', true)
    ) as k(clave, secreta)
    left join public.integraciones i on i.clave = k.clave
  ) end;
$$;

revoke execute on function public.integraciones_estado() from public, anon, authenticated;
grant  execute on function public.integraciones_estado() to authenticated;

create or replace function public.guardar_integraciones(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k text;
  v text;
  d text;
  guardadas text[] := '{}';
begin
  if not public.es_admin() then
    raise exception 'Sólo un administrador puede cambiar los ajustes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Solicitud inválida.';
  end if;

  for k, v in select key, btrim(value) from jsonb_each_text(p) loop
    if k not in ('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID',
                 'TWILIO_API_KEY_SECRET', 'TWILIO_NUMERO', 'GROQ_API_KEY',
                 'autopilot_cliente', 'autopilot_clave') then
      raise exception 'Clave desconocida: %', k;
    end if;
    continue when v is null or v = '';

    -- Errores de copiado comunes: se avisan antes de guardar
    if k = 'TWILIO_ACCOUNT_SID' and v !~ '^AC[0-9a-fA-F]{32}$' then
      raise exception 'El Account SID empieza con AC y tiene 34 caracteres.';
    elsif k = 'TWILIO_API_KEY_SID' and v !~ '^SK[0-9a-fA-F]{32}$' then
      raise exception 'El SID de la API Key empieza con SK y tiene 34 caracteres.';
    elsif k = 'TWILIO_AUTH_TOKEN' and v !~ '^[0-9a-fA-F]{32}$' then
      raise exception 'El Auth Token tiene 32 caracteres (letras a-f y números).';
    elsif k = 'TWILIO_API_KEY_SECRET' and v !~ '^[A-Za-z0-9]{32}$' then
      raise exception 'El Secret de la API Key tiene 32 caracteres.';
    elsif k = 'TWILIO_NUMERO' then
      d := regexp_replace(v, '\D', '', 'g');
      if length(d) = 10 then d := '1' || d; end if;
      if length(d) <> 11 or left(d, 1) <> '1' then
        raise exception 'El número debe ser de EE. UU.: +1 y 10 dígitos.';
      end if;
      v := '+' || d;
    elsif k = 'GROQ_API_KEY' and v !~ '^gsk_[A-Za-z0-9]{20,}$' then
      raise exception 'La clave de Groq empieza con gsk_.';
    elsif length(v) > 500 then
      raise exception 'El valor de % es demasiado largo.', k;
    end if;

    insert into public.integraciones (clave, valor) values (k, v)
    on conflict (clave) do update set valor = excluded.valor, updated_at = now();
    guardadas := guardadas || k;
  end loop;

  -- Otra cuenta de Twilio: la TwiML App guardada a mano ya no sirve, se recrea sola
  if 'TWILIO_ACCOUNT_SID' = any(guardadas) then
    delete from public.integraciones where clave = 'TWILIO_TWIML_APP_SID';
  end if;

  return to_jsonb(guardadas);
end;
$$;

revoke execute on function public.guardar_integraciones(jsonb) from public, anon, authenticated;
grant  execute on function public.guardar_integraciones(jsonb) to authenticated;
