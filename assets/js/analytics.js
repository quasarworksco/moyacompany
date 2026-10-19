/* =========================================================
   Registro de visitas — Moya & Company
   Sin cookies y sin datos personales: sólo página, idioma,
   tipo de dispositivo, origen y un id de sesión temporal.
   Si no hay configuración de Supabase, no hace nada.
   ========================================================= */
(function () {
  "use strict";

  var cfg = window.MOYA_SUPABASE || {};
  if (!cfg.url || !cfg.anonKey) return;

  function sessionId() {
    try {
      var id = sessionStorage.getItem("moya-sid");
      if (!id) {
        id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        sessionStorage.setItem("moya-sid", id);
      }
      return id;
    } catch (e) {
      return "anon";
    }
  }

  function device() {
    var w = window.innerWidth || screen.width || 0;
    if (w < 640) return "movil";
    if (w < 1024) return "tablet";
    return "escritorio";
  }

  function referrer() {
    try {
      if (!document.referrer) return "directo";
      var h = new URL(document.referrer).hostname.replace(/^www\./, "");
      return h === location.hostname.replace(/^www\./, "") ? "interno" : h;
    } catch (e) {
      return "directo";
    }
  }

  var payload = {
    path: location.pathname.replace(/\/index\.html$/, "/") || "/",
    referrer: referrer(),
    lang: (document.documentElement.lang || "es").slice(0, 2),
    device: device(),
    session_id: sessionId()
  };

  var url = cfg.url.replace(/\/+$/, "") + "/rest/v1/moya_pageviews";
  var body = JSON.stringify(payload);

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": cfg.anonKey,
      "Authorization": "Bearer " + cfg.anonKey,
      "Prefer": "return=minimal"
    },
    body: body,
    keepalive: true
  }).catch(function () { /* una visita perdida nunca debe romper la página */ });
})();
