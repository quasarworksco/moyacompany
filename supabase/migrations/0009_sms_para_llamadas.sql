-- =========================================================
-- Los SMS se leen en la sección Llamadas: quien tiene permiso de
-- llamadas los ve y los marca como leídos, aunque no tenga el de
-- contactos. Sólo los SMS; el resto de mensajes sigue igual.
-- =========================================================
drop policy if exists mensajes_sms_leer on public.mensajes;
create policy mensajes_sms_leer on public.mensajes
  for select to authenticated
  using (canal = 'sms' and puede('llamadas'));

drop policy if exists mensajes_sms_marcar on public.mensajes;
create policy mensajes_sms_marcar on public.mensajes
  for update to authenticated
  using (canal = 'sms' and puede('llamadas'))
  with check (canal = 'sms' and puede('llamadas'));
