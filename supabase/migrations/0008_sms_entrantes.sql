-- =========================================================
-- SMS que llegan al número de Twilio de Moya
-- Entran como mensajes del CRM, en la ficha del contacto (o de
-- uno nuevo si el número no es de nadie). Sólo se reciben:
-- enviar exige el registro A2P 10DLC en Twilio.
-- =========================================================
alter table public.mensajes drop constraint if exists mensajes_canal_ok;
alter table public.mensajes add constraint mensajes_canal_ok
  check (canal in ('formulario','email','whatsapp','llamada','sms','otro'));

-- MessageSid de Twilio: si Twilio reintenta el webhook, el SMS no se duplica
alter table public.mensajes add column if not exists proveedor_id text;
create unique index if not exists mensajes_proveedor_idx
  on public.mensajes (proveedor_id) where proveedor_id is not null;
