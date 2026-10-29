-- =========================================================
-- Equipo: miembros con su propio usuario, permisos y número
-- Los miembros se crean, editan y borran desde el panel (pestaña
-- Equipo) a través de la función «equipo», que es la única con
-- permiso para tocar auth.users. Aquí sólo lo que guarda la base.
-- =========================================================

-- Su línea de Twilio: llama con ese número y le suenan sólo a él/ella
alter table public.admins add column if not exists numero text;
create unique index if not exists admins_numero_idx on public.admins (numero) where numero is not null;

-- Contraseña puesta por un administrador: la cambia al entrar
alter table public.admins add column if not exists debe_cambiar boolean not null default false;

alter table public.admins drop constraint if exists admins_rol_ok;
alter table public.admins add constraint admins_rol_ok check (rol in ('admin', 'agente'));

-- El panel lo llama después de que el miembro cambia su contraseña.
create or replace function public.ya_cambie_contrasena()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.admins set debe_cambiar = false where user_id = (select auth.uid());
$$;

revoke execute on function public.ya_cambie_contrasena() from public, anon, authenticated;
grant  execute on function public.ya_cambie_contrasena() to authenticated;

-- ---------------------------------------------------------
-- Cuenta principal: la de Moya (veronica@moyacompanytx.com).
-- Sólo ella administra el Equipo y los Ajustes; nadie puede
-- quitarle el rol, desactivarla ni borrarla.
-- ---------------------------------------------------------
alter table public.admins add column if not exists principal boolean not null default false;
create unique index if not exists admins_una_principal_idx on public.admins (principal) where principal;

update public.admins set principal = true, rol = 'admin', activo = true, acceso_hasta = null
 where lower(email) = 'veronica@moyacompanytx.com';

create or replace function public.es_principal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where user_id = (select auth.uid()) and principal and activo
  );
$$;

revoke execute on function public.es_principal() from public, anon, authenticated;
grant  execute on function public.es_principal() to authenticated;

-- Ajustes (claves de Twilio, Groq y Autopilot): sólo la cuenta principal
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.es_principal(); $$;

-- La fila de cada miembro la escribe sólo la función «equipo»
-- (service_role); por la API nadie la cambia, ni siquiera un admin.
drop policy if exists admins_write on public.admins;
