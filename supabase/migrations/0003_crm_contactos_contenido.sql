-- =========================================================
-- Moya & Company — CRM, segunda tanda
--   1. contactos: de ficha mínima a ficha de CRM
--   2. contenido digital: diseños, estados y comentarios
-- =========================================================

-- ---------------------------------------------------------
-- 1. CONTACTOS
-- ---------------------------------------------------------
alter table public.contactos
  add column if not exists updated_at    timestamptz not null default now(),
  add column if not exists telefono2     text,
  add column if not exists estado        text not null default 'prospecto',
  add column if not exists etiquetas     text[] not null default '{}'::text[],
  add column if not exists valor_mensual numeric(10,2),
  add column if not exists creado_por    uuid;

alter table public.contactos
  alter column creado_por set default auth.uid(),
  alter column origen     set default 'manual';

alter table public.contactos
  add constraint contactos_creado_por_fk
  foreign key (creado_por) references auth.users (id) on delete set null;

alter table public.contactos
  add constraint contactos_estado_ok
  check (estado in ('prospecto','cliente','pausado','perdido'));

create or replace function public.contacto_normaliza()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- tel_digitos es la clave con la que la función de llamadas cruza el número
  -- entrante (Twilio lo manda en E.164) contra la ficha del contacto.
  new.tel_digitos := nullif(regexp_replace(coalesce(new.telefono,''), '\D', '', 'g'), '');
  new.updated_at  := now();
  return new;
end;
$$;

create trigger contactos_normaliza
before insert or update on public.contactos
for each row execute function public.contacto_normaliza();

create index if not exists contactos_tel_digitos_idx on public.contactos (tel_digitos);
create index if not exists contactos_estado_idx      on public.contactos (estado);

-- La columna 'etiqueta' (singular) del esquema inicial queda sustituida por
-- 'etiquetas'. No se elimina aquí para no tocar datos; dejó de usarse.

-- ---------------------------------------------------------
-- 2. CONTENIDO DIGITAL
-- ---------------------------------------------------------
create table if not exists public.contenido (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  titulo             text not null,
  tipo               text not null default 'post',
  red                text not null default 'instagram',
  fecha_publicacion  date,
  estado             text not null default 'por_aprobar',
  copy               text,
  archivos           jsonb not null default '[]'::jsonb,
  creado_por         uuid default auth.uid() references auth.users (id) on delete set null,
  constraint contenido_titulo_ok   check (char_length(titulo) between 1 and 160),
  constraint contenido_copy_ok     check (copy is null or char_length(copy) <= 3000),
  constraint contenido_tipo_ok     check (tipo   in ('post','historia','reel','flyer','carrusel','otro')),
  constraint contenido_red_ok      check (red    in ('instagram','facebook','tiktok','linkedin','whatsapp','otra')),
  constraint contenido_estado_ok   check (estado in ('por_aprobar','cambios','aprobado','publicado')),
  constraint contenido_archivos_ok check (jsonb_typeof(archivos) = 'array')
);

create table if not exists public.contenido_comentarios (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  contenido_id uuid not null references public.contenido (id) on delete cascade,
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  autor        text,
  texto        text not null,
  constraint contenido_comentarios_texto_ok check (char_length(texto) between 1 and 2000)
);

create index if not exists contenido_comentarios_contenido_idx
  on public.contenido_comentarios (contenido_id, created_at);
create index if not exists contenido_estado_idx on public.contenido (estado, fecha_publicacion);

create or replace function public.toca_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger contenido_updated_at
before update on public.contenido
for each row execute function public.toca_updated_at();

alter table public.contenido             enable row level security;
alter table public.contenido_comentarios enable row level security;

create policy contenido_todo on public.contenido
  for all to authenticated
  using (puede('contenido')) with check (puede('contenido'));

create policy contenido_comentarios_todo on public.contenido_comentarios
  for all to authenticated
  using (puede('contenido')) with check (puede('contenido'));

-- ---------------------------------------------------------
-- 3. ALMACÉN DE DISEÑOS (privado)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contenido', 'contenido', false, 26214400,
        array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml',
              'application/pdf','video/mp4','video/quicktime'])
on conflict (id) do nothing;

-- El panel sube los diseños desde el navegador, así que aquí sí hacen falta
-- las cuatro operaciones, no sólo la lectura como en 'llamadas'.
create policy contenido_archivos_todo on storage.objects
  for all to authenticated
  using      (bucket_id = 'contenido' and puede('contenido'))
  with check (bucket_id = 'contenido' and puede('contenido'));

-- ---------------------------------------------------------
-- 4. PERMISOS
-- ---------------------------------------------------------
create or replace function public.alta_admin(correo text, nombre text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(correo) limit 1;
  if uid is null then
    raise exception 'No existe un usuario con el correo %. Crealo primero en Authentication > Users.', correo;
  end if;
  insert into public.admins (user_id, email, nombre, rol, permisos, activo)
  values (uid, lower(correo), nombre, 'admin',
          array['llamadas','contactos','contenido','metricas','admins'], true)
  on conflict (user_id) do update
    set rol = 'admin', activo = true, nombre = coalesce(excluded.nombre, public.admins.nombre);
  return uid;
end $function$;

update public.admins
   set permisos = array['llamadas','contactos','contenido','metricas','admins']
 where rol = 'admin';
