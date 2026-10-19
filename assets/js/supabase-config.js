/* =========================================================
   Conexión a Supabase — métricas del sitio
   ---------------------------------------------------------
   Proyecto: dgp-linkshop (compartido). Las métricas viven en
   los objetos con prefijo moya_ y no tocan nada de linkshop.

   Esta clave es PÚBLICA por diseño: va en el código del sitio
   y está limitada por las políticas de la base de datos.
   Sólo permite registrar una visita y leer totales agregados;
   nunca leer filas ni tocar otras tablas.
   ========================================================= */
window.MOYA_SUPABASE = {
  url: "https://oubyfnzvtbfhduiynqia.supabase.co",
  anonKey: "sb_publishable_uEdzJpKC1p55rT4MkWlPwQ_d5R8J5E1"
};
