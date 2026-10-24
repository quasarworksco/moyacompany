-- =========================================================
-- CRM Moya & Company — base inicial
-- Acceso con correo y contraseña (Supabase Auth) + sección de llamadas
-- Modelado sobre el CRM de AVA, adaptado a Moya.
-- Ejecutar en el proyecto NUEVO de Moya, nunca sobre AVA.
-- =========================================================

-- ---------- 1. Quién entra al panel y qué puede ver ----------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nombre      text,
  rol         text not null default 'agente',          -- 'admin' | 'agente'
  permisos    text[] not null default '{}'::text[],    -- 'llamadas', 'metricas', 'contactos'
  activo      boolean not null default true,
  acceso_hasta date,
  created_at  timestamptz not null default now()
);
comment on table public.admins is
  'Personas con acceso al panel. rol=admin puede todo; agente solo los módulos de permisos.';

alter table public.admins enable row level security;

-- ¿El usuario de la sesión puede entrar a este módulo?
create or replace function public.puede(modulo text)
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
      and (rol = 'admin' or modulo = any(permisos))
  );
$$;

-- Cada quien ve su propia ficha; los admin ven todas.
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated
  using (user_id = (select auth.uid()) or public.puede('admins'));

drop policy if exists admins_write on public.admins;
create policy admins_write on public.admins for all to authenticated
  using (public.puede('admins')) with check (public.puede('admins'));

-- ---------- 2. Contactos (núcleo mínimo del CRM) ----------
create table if not exists public.contactos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  nombre       text,
  telefono     text,
  tel_digitos  text generated always as (right(regexp_replace(coalesce(telefono,''), '\D', '', 'g'), 10)) stored,
  email        text,
  empresa      text,
  region       text,                                   -- 'TX', 'FL'… decide el aviso de grabación
  origen       text,                                   -- 'llamada', 'web', 'referido'
  etiqueta     text,                                   -- 'prospecto', 'cliente'
  notas        text
);
create index if not exists contactos_tel_idx on public.contactos (tel_digitos);
alter table public.contactos enable row level security;

drop policy if exists contactos_todo on public.contactos;
create policy contactos_todo on public.contactos for all to authenticated
  using (public.puede('contactos')) with check (public.puede('contactos'));

-- ---------- 3. Llamadas ----------
create table if not exists public.llamadas (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  direccion      text not null default 'saliente',     -- 'entrante' | 'saliente'
  canal          text not null default 'telefono',
  numero         text,
  contacto_id    uuid references public.contactos (id) on delete set null,
  usuario        uuid default auth.uid() references auth.users (id) on delete set null,
  estado         text not null default 'completada',   -- iniciando|sonando|en_curso|completada|sin_respuesta|ocupado|fallida|cancelada
  inicio         timestamptz default now(),
  duracion_seg   integer,
  proveedor_id   text,                                 -- CallSid de Twilio
  grabacion_path text,                                 -- ruta en el bucket 'llamadas'
  con_aviso      boolean,                              -- true: se avisa | false: sin aviso | null: no se graba
  transcripcion  text,
  ia             jsonb,                                -- resumen y datos extraídos
  ia_estado      text not null default 'sin_grabacion',-- sin_grabacion|pendiente|procesando|listo|error
  ia_error       text,
  notas          text
);
create index if not exists llamadas_created_idx on public.llamadas (created_at desc);
create index if not exists llamadas_contacto_idx on public.llamadas (contacto_id);
alter table public.llamadas enable row level security;

drop policy if exists llamadas_todo on public.llamadas;
create policy llamadas_todo on public.llamadas for all to authenticated
  using (public.puede('llamadas')) with check (public.puede('llamadas'));

-- ---------- 4. Grabaciones: bucket privado ----------
insert into storage.buckets (id, name, public)
values ('llamadas', 'llamadas', false)
on conflict (id) do nothing;

drop policy if exists llamadas_audio_leer on storage.objects;
create policy llamadas_audio_leer on storage.objects for select to authenticated
  using (bucket_id = 'llamadas' and public.puede('llamadas'));

-- ---------- 5. Claves de integración (Twilio, Groq) ----------
-- Se guardan en la base para poder rotarlas sin redesplegar la función.
-- Sólo la función (service_role) las lee; nadie más.
create table if not exists public.integraciones (
  clave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
);
alter table public.integraciones enable row level security;   -- sin políticas: nadie por API

create or replace function public.claves_integracion()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb) from public.integraciones $$;

revoke all on function public.claves_integracion() from public, anon, authenticated;

-- puede(): sólo con sesión iniciada. El revoke a PUBLIC es necesario:
-- anon hereda de PUBLIC, así que revocarle a anon por separado no basta.
revoke execute on function public.puede(text) from public, anon, authenticated;
grant  execute on function public.puede(text) to authenticated;

-- ---------- 6. Alta del primer administrador ----------
-- Al crear el usuario en Authentication → Users, esto le da acceso total.
create or replace function public.alta_admin(correo text, nombre text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(correo) limit 1;
  if uid is null then
    raise exception 'No existe un usuario con el correo %. Créalo primero en Authentication → Users.', correo;
  end if;
  insert into public.admins (user_id, email, nombre, rol, permisos, activo)
  values (uid, lower(correo), nombre, 'admin', array['llamadas','contactos','metricas','admins'], true)
  on conflict (user_id) do update
    set rol = 'admin', activo = true, nombre = coalesce(excluded.nombre, public.admins.nombre);
  return uid;
end $$;

revoke all on function public.alta_admin(text, text) from public, anon, authenticated;

-- Supabase crea rls_auto_enable() si activaste «Enable automatic RLS».
-- La dispara un event trigger del sistema; nadie debe poder invocarla por API.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
