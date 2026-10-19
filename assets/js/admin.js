/* =========================================================
   Panel de administración — Moya & Company
   ---------------------------------------------------------
   AVISO: este sitio es estático, así que el acceso se valida
   en el navegador. No es seguridad real — sirve como portero
   para que el panel no quede a la vista, pero cualquiera que
   mire el código puede saltárselo. No pongas datos sensibles.
   ========================================================= */
(function () {
  "use strict";

  var USER = "admin";
  var PASS_SHA256 = "02b056a8adcfba87743caf6724540cf6261fcc956fbc5a6c534ec41f0e782d9a";
  var KEY = "moya-admin";

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var tip = document.getElementById("tip");

  /* ---------- 1. Acceso ------------------------------------------------ */
  function sha256(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  function open() {
    gate.hidden = true;
    app.hidden = false;
    load();
  }

  function close() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    app.hidden = true;
    gate.hidden = false;
    document.getElementById("pass").value = "";
  }

  try {
    if (sessionStorage.getItem(KEY) === PASS_SHA256) open();
  } catch (e) {}

  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = document.getElementById("loginError");
    var user = document.getElementById("user").value.trim().toLowerCase();
    var pass = document.getElementById("pass").value;

    sha256(pass).then(function (hash) {
      if (user === USER && hash === PASS_SHA256) {
        err.hidden = true;
        try { sessionStorage.setItem(KEY, hash); } catch (e) {}
        open();
      } else {
        err.hidden = false;
        document.getElementById("pass").select();
      }
    });
  });

  document.getElementById("logout").addEventListener("click", close);
  document.getElementById("refresh").addEventListener("click", load);

  /* ---------- 2. Datos -------------------------------------------------- */
  var cfg = window.MOYA_SUPABASE || {};
  var nf = new Intl.NumberFormat("es-MX");

  function notice(html) {
    var el = document.getElementById("notice");
    el.innerHTML = html;
    el.hidden = !html;
  }

  function load() {
    if (!cfg.url || !cfg.anonKey) {
      notice("<b>Falta conectar la base de datos.</b> Rellena <code>url</code> y " +
             "<code>anonKey</code> en <code>assets/js/supabase-config.js</code> con los " +
             "datos del proyecto de Supabase. Mientras tanto el panel no tiene nada que mostrar.");
      return;
    }
    notice("");
    document.getElementById("stamp").textContent = "Cargando…";

    fetch(cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/moya_stats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.anonKey,
        "Authorization": "Bearer " + cfg.anonKey
      },
      body: "{}"
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (err) {
        document.getElementById("stamp").textContent = "—";
        notice("<b>No se pudieron cargar las métricas.</b> " + String(err.message) +
               ". Revisa que el proyecto de Supabase esté activo y que la función " +
               "<code>moya_stats</code> exista.");
      });
  }

  /* ---------- 3. Pintado ------------------------------------------------ */
  function setDelta(el, now, before) {
    if (before === 0) { el.textContent = now > 0 ? "sin dato previo" : ""; el.className = "kpi__delta"; return; }
    var pct = Math.round(((now - before) / before) * 100);
    el.textContent = (pct > 0 ? "+" : "") + pct + " % vs. periodo anterior";
    el.className = "kpi__delta " + (pct > 0 ? "is-up" : pct < 0 ? "is-down" : "");
  }

  function render(d) {
    var t = d.totales || {};
    [["hoy", t.hoy], ["dias7", t.dias7], ["dias30", t.dias30], ["sesiones30", t.sesiones30]]
      .forEach(function (p) {
        var el = document.querySelector('[data-k="' + p[0] + '"]');
        if (el) el.textContent = nf.format(p[1] || 0);
      });

    setDelta(document.querySelector('[data-k="hoy-d"]'), t.hoy || 0, t.ayer || 0);
    setDelta(document.querySelector('[data-k="dias7-d"]'), t.dias7 || 0, t.dias7_prev || 0);

    drawChart(d.serie || []);
    buildTable(d.serie || []);
    ranks("paginas", d.paginas);
    ranks("origenes", d.origenes);
    ranks("dispositivos", d.dispositivos);
    ranks("idiomas", (d.idiomas || []).map(function (r) {
      return { nombre: r.nombre === "es" ? "Español" : r.nombre === "en" ? "Inglés" : r.nombre,
               visitas: r.visitas };
    }));

    document.getElementById("stamp").textContent =
      "Actualizado " + new Date(d.generado_en || Date.now())
        .toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function ranks(id, rows) {
    var ul = document.getElementById(id);
    ul.innerHTML = "";
    if (!rows || !rows.length) {
      ul.innerHTML = '<li class="ranks__empty">Sin datos todavía.</li>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.visitas; }));
    rows.forEach(function (r) {
      var li = document.createElement("li");
      var top = document.createElement("div");
      top.className = "ranks__top";
      var name = document.createElement("span");
      name.className = "ranks__name";
      name.textContent = r.nombre;
      var val = document.createElement("span");
      val.className = "ranks__val";
      val.textContent = nf.format(r.visitas);
      top.append(name, val);
      var track = document.createElement("div");
      track.className = "ranks__track";
      var fill = document.createElement("div");
      fill.className = "ranks__fill";
      fill.style.width = Math.max(2, Math.round((r.visitas / max) * 100)) + "%";
      track.appendChild(fill);
      li.append(top, track);
      ul.appendChild(li);
    });
  }

  /* Columnas: 2px de aire entre barras, extremo redondeado de 4px,
     rejilla fina y etiqueta sólo en el día más alto. */
  function drawChart(serie) {
    var host = document.getElementById("chart");
    host.innerHTML = "";
    if (!serie.length) {
      host.innerHTML = '<p class="chart__empty">Sin visitas registradas todavía.</p>';
      return;
    }

    var W = 920, H = 260, padL = 42, padR = 12, padT = 18, padB = 28;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = Math.max.apply(null, serie.map(function (p) { return p.visitas; }));
    var top = niceMax(max);
    var band = plotW / serie.length;
    var bw = Math.min(24, Math.max(3, band - 2));          // 2px de aire entre columnas
    var y = function (v) { return padT + plotH - (top ? (v / top) * plotH : 0); };
    var peak = serie.reduce(function (a, b) { return b.visitas > a.visitas ? b : a; }, serie[0]);

    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
               'aria-label="Visitas por día en los últimos 30 días">'];

    [0, .25, .5, .75, 1].forEach(function (f) {
      var v = Math.round(top * f), yy = y(v);
      svg.push('<line class="grid" x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '"/>');
      svg.push('<text class="tick" x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + v + '</text>');
    });

    serie.forEach(function (p, i) {
      var x = padL + i * band + (band - bw) / 2;
      var h = Math.max(p.visitas > 0 ? 2 : 0, padT + plotH - y(p.visitas));
      var r = Math.min(4, bw / 2);
      svg.push('<g class="slot" tabindex="0" data-dia="' + p.dia + '" data-v="' + p.visitas + '">');
      svg.push('<rect class="hit" x="' + (padL + i * band) + '" y="' + padT + '" width="' + band + '" height="' + plotH + '"/>');
      if (h > 0) svg.push('<rect class="bar" x="' + x + '" y="' + (padT + plotH - h) + '" width="' + bw +
                          '" height="' + h + '" rx="' + r + '" ry="' + r + '"/>');
      svg.push('</g>');
    });

    if (peak.visitas > 0) {
      var pi = serie.indexOf(peak);
      svg.push('<text class="cap" x="' + (padL + pi * band + band / 2) + '" y="' + (y(peak.visitas) - 7) +
               '" text-anchor="middle">' + peak.visitas + '</text>');
    }

    [0, Math.floor(serie.length / 2), serie.length - 1].forEach(function (i) {
      svg.push('<text class="tick" x="' + (padL + i * band + band / 2) + '" y="' + (H - 8) +
               '" text-anchor="middle">' + fmtDay(serie[i].dia) + '</text>');
    });

    svg.push("</svg>");
    host.innerHTML = svg.join("");
    wireTips(host);
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var step = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / step) * step;
  }

  function fmtDay(iso) {
    var p = iso.split("-");
    return p[2] + "/" + p[1];
  }

  function wireTips(host) {
    host.querySelectorAll(".slot").forEach(function (slot) {
      function show(e) {
        var r = slot.getBoundingClientRect();
        tip.innerHTML = "<b>" + nf.format(slot.dataset.v) + "</b> " +
                        (slot.dataset.v === "1" ? "visita" : "visitas") + "<br>" +
                        new Date(slot.dataset.dia + "T12:00:00")
                          .toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
        tip.hidden = false;
        tip.style.left = (r.left + r.width / 2) + "px";
        tip.style.top = ((e && e.clientY ? e.clientY : r.top + 20)) + "px";
      }
      slot.addEventListener("mousemove", show);
      slot.addEventListener("focus", show);
      slot.addEventListener("mouseleave", function () { tip.hidden = true; });
      slot.addEventListener("blur", function () { tip.hidden = true; });
    });
  }

  function buildTable(serie) {
    var wrap = document.getElementById("tablewrap");
    var rows = serie.map(function (p) {
      return "<tr><td>" + new Date(p.dia + "T12:00:00")
        .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) +
        "</td><td>" + nf.format(p.visitas) + "</td></tr>";
    }).join("");
    wrap.innerHTML = "<table><thead><tr><th>Día</th><th>Visitas</th></tr></thead><tbody>" +
                     rows + "</tbody></table>";
  }

  document.getElementById("toggleTable").addEventListener("click", function () {
    var wrap = document.getElementById("tablewrap");
    var open = wrap.hidden;
    wrap.hidden = !open;
    this.setAttribute("aria-expanded", String(open));
    this.textContent = open ? "Ocultar tabla" : "Ver tabla";
  });
})();
