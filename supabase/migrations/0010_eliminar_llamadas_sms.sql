-- =========================================================
-- Eliminar del registro, desde Llamadas
-- La fila de llamadas ya se podía borrar (llamadas_todo es FOR ALL).
-- Faltaba borrar su grabación del almacén y borrar los SMS.
-- =========================================================
drop policy if exists llamadas_audio_borrar on storage.objects;
create policy llamadas_audio_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'llamadas' and public.puede('llamadas'));

drop policy if exists mensajes_sms_borrar on public.mensajes;
create policy mensajes_sms_borrar on public.mensajes
  for delete to authenticated
  using (canal = 'sms' and puede('llamadas'));
