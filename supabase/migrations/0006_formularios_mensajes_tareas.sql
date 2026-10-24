-- =========================================================
-- Moya & Company — tercera tanda del CRM
--   1. mensajes      : lo que escribe la gente desde el sitio
--   2. postulantes   : el formulario de "¿quieres formar parte?"
--   3. tareas        : seguimientos, propios y los que saca la IA
--   4. dos funciones para que el sitio público escriba sin
--      darle permiso de INSERT a nadie
-- =========================================================

-- ---------------------------------------------------------
-- 1. MENSAJES
-- ---------------------------------------------------------
create table if not exists public.mensajes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  contacto_id uuid references public.contactos (id) on delete cascade,
  canal       text not null default 'formulario',
  asunto      text,
  texto       text not null,
  leido       boolean not null default false,
  constraint mensajes_canal_ok check (canal in ('formulario','email','whatsapp','llamada','otro')),
  constraint mensajes_texto_ok check (char_length(texto) between 1 and 4000)
);

create index if not exists mensajes_contacto_idx on public.mensajes (contacto_id, created_at desc);
create index if not exists mensajes_nuevos_idx   on public.mensajes (created_at desc) where not leido;

-- ---------------------------------------------------------
-- 2. POSTULANTES
-- ---------------------------------------------------------
create table if not exists public.postulantes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  nombre      text not null,
  email       text,
  telefono    text,
  tel_digitos text,
  area        text,
  experiencia text,
  ingles      text,
  cv          text,
  mensaje     text,
  estado      text not null default 'nuevo',
  notas       text,
  constraint postulantes_nombre_ok  check (char_length(nombre) between 2 and 120),
  constraint postulantes_estado_ok  check (estado in ('nuevo','revisado','entrevista','descartado','contratado')),
  constraint postulantes_mensaje_ok check (mensaje is null or char_length(mensaje) <= 4000)
);

create index if not exists postulantes_estado_idx on public.postulantes (estado, created_at desc);

create trigger postulantes_updated_at
before update on public.postulantes
for each row execute function public.toca_updated_at();

-- ---------------------------------------------------------
-- 3. TAREAS
-- ---------------------------------------------------------
create table if not exists public.tareas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  titulo      text not null,
  detalle     text,
  vence       date,
  hecha       boolean not null default false,
  hecha_at    timestamptz,
  contacto_id uuid references public.contactos (id) on delete cascade,
  llamada_id  uuid references public.llamadas  (id) on delete set null,
  creada_por  uuid default auth.uid() references auth.users (id) on delete set null,
  constraint tareas_titulo_ok  check (char_length(titulo) between 1 and 200),
  constraint tareas_detalle_ok check (detalle is null or char_length(detalle) <= 2000)
);

create index if not exists tareas_pendientes_idx on public.tareas (vence, created_at) where not hecha;
create index if not exists tareas_contacto_idx   on public.tareas (contacto_id, created_at desc);

create trigger tareas_updated_at
before update on public.tareas
for each row execute function public.toca_updated_at();

-- ---------------------------------------------------------
-- RLS: las tres cuelgan del módulo de contactos
-- ---------------------------------------------------------
alter table public.mensajes    enable row level security;
alter table public.postulantes enable row level security;
alter table public.tareas      enable row level security;

create policy mensajes_todo on public.mensajes
  for all to authenticated using (puede('contactos')) with check (puede('contactos'));
create policy postulantes_todo on public.postulantes
  for all to authenticated using (puede('contactos')) with check (puede('contactos'));
create policy tareas_todo on public.tareas
  for all to authenticated using (puede('contactos')) with check (puede('contactos'));

-- ---------------------------------------------------------
-- 4. LA PUERTA DEL SITIO PÚBLICO
-- anon no tiene INSERT en ninguna tabla: escribe a través de estas dos
-- funciones, que validan, normalizan, evitan duplicados y frenan robots.
-- ---------------------------------------------------------
create or replace function public.recibir_contacto(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre   text := nullif(btrim(p->>'nombre'), '');
  v_empresa  text := nullif(btrim(p->>'empresa'), '');
  v_email    text := lower(nullif(btrim(p->>'email'), ''));
  v_telefono text := nullif(btrim(p->>'telefono'), '');
  v_servicio text := nullif(btrim(p->>'servicio'), '');
  v_texto    text := nullif(btrim(p->>'mensaje'), '');
  v_dig      text := nullif(regexp_replace(coalesce(p->>'telefono',''), '\D', '', 'g'), '');
  v_id       uuid;
begin
  -- Campo trampa: los robots rellenan todo, las personas no ven este campo.
  if nullif(btrim(coalesce(p->>'trampa','')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if v_nombre is null or char_length(v_nombre) > 120 then
    raise exception 'Falta el nombre.' using errcode = '22023';
  end if;
  if v_texto is null or char_length(v_texto) > 4000 then
    raise exception 'Falta el mensaje.' using errcode = '22023';
  end if;
  if v_email is null and v_dig is null then
    raise exception 'Hace falta un correo o un teléfono.' using errcode = '22023';
  end if;
  if v_email is not null and (char_length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;

  -- Freno de inundación: si llegan más de 60 en una hora, algo no es humano.
  if (select count(*) from public.mensajes where created_at > now() - interval '1 hour') > 60 then
    raise exception 'Demasiados envíos, inténtalo más tarde.' using errcode = '53400';
  end if;

  select c.id into v_id from public.contactos c
   where (v_dig is not null and c.tel_digitos = v_dig)
      or (v_email is not null and lower(c.email) = v_email)
   order by c.created_at limit 1;

  if v_id is null then
    insert into public.contactos (nombre, empresa, email, telefono, origen, estado, etiquetas)
    values (v_nombre, v_empresa, v_email, v_telefono, 'formulario', 'prospecto',
            case when v_servicio is null then '{}'::text[] else array[v_servicio] end)
    returning id into v_id;
  else
    update public.contactos set
      empresa   = coalesce(empresa, v_empresa),
      email     = coalesce(email, v_email),
      telefono  = coalesce(telefono, v_telefono),
      etiquetas = case when v_servicio is null or v_servicio = any(etiquetas)
                       then etiquetas else etiquetas || v_servicio end
    where id = v_id;
  end if;

  if (select count(*) from public.mensajes
       where contacto_id = v_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos varios mensajes tuyos; te respondemos pronto.' using errcode = '53400';
  end if;

  insert into public.mensajes (contacto_id, canal, asunto, texto)
  values (v_id, 'formulario', coalesce(v_servicio, 'Contacto desde el sitio'), v_texto);

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.recibir_postulacion(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := nullif(btrim(p->>'nombre'), '');
  v_email  text := lower(nullif(btrim(p->>'email'), ''));
  v_tel    text := nullif(btrim(p->>'telefono'), '');
  v_dig    text := nullif(regexp_replace(coalesce(p->>'telefono',''), '\D', '', 'g'), '');
  v_cv     text := nullif(btrim(p->>'cv'), '');
begin
  if nullif(btrim(coalesce(p->>'trampa','')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;
  if v_nombre is null or char_length(v_nombre) > 120 then
    raise exception 'Falta el nombre.' using errcode = '22023';
  end if;
  if v_email is null or char_length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if v_cv is not null and (char_length(v_cv) > 500 or v_cv !~* '^https?://') then
    raise exception 'El enlace del CV no es válido.' using errcode = '22023';
  end if;
  if (select count(*) from public.postulantes where created_at > now() - interval '1 hour') > 40 then
    raise exception 'Demasiados envíos, inténtalo más tarde.' using errcode = '53400';
  end if;
  if (select count(*) from public.postulantes
       where lower(email) = v_email and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Ya recibimos tu postulación.' using errcode = '53400';
  end if;

  insert into public.postulantes (nombre, email, telefono, tel_digitos, area, experiencia, ingles, cv, mensaje)
  values (v_nombre, v_email, v_tel, v_dig,
          left(nullif(btrim(p->>'area'), ''), 80),
          left(nullif(btrim(p->>'experiencia'), ''), 80),
          left(nullif(btrim(p->>'ingles'), ''), 80),
          v_cv,
          left(nullif(btrim(p->>'mensaje'), ''), 4000));

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.recibir_contacto(jsonb)    from public;
revoke execute on function public.recibir_postulacion(jsonb) from public;
grant  execute on function public.recibir_contacto(jsonb)    to anon, authenticated;
grant  execute on function public.recibir_postulacion(jsonb) to anon, authenticated;
