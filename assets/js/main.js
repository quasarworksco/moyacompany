/* =========================================================
   Moya & Company — interacción del sitio
   ========================================================= */
(function () {
  "use strict";

  var STORE_KEY = "moya-lang";
  var DICT = window.MOYA_I18N || { es: {}, en: {} };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Idioma / Language ------------------------------------ */
  var current = "es";

  function detectLang() {
    var saved;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { saved = null; }
    if (saved === "es" || saved === "en") return saved;
    var nav = (navigator.language || "es").toLowerCase();
    return nav.indexOf("es") === 0 ? "es" : "en";
  }

  function t(key) {
    var pack = DICT[current] || {};
    return Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : null;
  }

  function applyLang(lang, animate) {
    current = DICT[lang] ? lang : "es";
    document.documentElement.lang = current;
    document.documentElement.setAttribute("data-lang", current);

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n"));
      if (value === null) return;
      var attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    // Toggle visual state
    var box = document.querySelector(".lang");
    if (box) box.classList.toggle("is-en", current === "en");
    document.querySelectorAll("[data-lang-set]").forEach(function (btn) {
      var on = btn.getAttribute("data-lang-set") === current;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    try { localStorage.setItem(STORE_KEY, current); } catch (e) {}

    if (animate && !reduced) {
      document.body.classList.remove("lang-swap");
      void document.body.offsetWidth; // reflow para reiniciar la animación
      document.body.classList.add("lang-swap");
      window.setTimeout(function () {
        document.body.classList.remove("lang-swap");
      }, 600);
    }
  }

  document.querySelectorAll("[data-lang-set]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.getAttribute("data-lang-set"), true);
    });
  });

  applyLang(detectLang(), false);

  /* ---------- 2. Splash screen ---------------------------------------- */
  var splash = document.getElementById("splash");
  if (splash) {
    document.body.classList.add("is-locked");
    var started = Date.now();
    var closed = false;

    var closeSplash = function () {
      if (closed) return;
      closed = true;
      var wait = Math.max(0, (reduced ? 350 : 1500) - (Date.now() - started));
      window.setTimeout(function () {
        splash.classList.add("is-hidden");
        document.body.classList.remove("is-locked");
        window.setTimeout(function () {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
        }, 900);
      }, wait);
    };

    if (document.readyState === "complete") closeSplash();
    else window.addEventListener("load", closeSplash);
    window.setTimeout(closeSplash, 4000); // red de seguridad
  }

  /* ---------- 3. Header + menú móvil ---------------------------------- */
  var header = document.getElementById("header");
  var nav = document.getElementById("nav");
  var burger = document.getElementById("burger");
  var fab = document.querySelector(".fab");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("is-stuck", y > 24);
    if (fab) fab.classList.toggle("is-on", y > 520);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function closeMenu() {
    if (!nav || !burger) return;
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }

  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ---------- 4. Reveal on scroll -------------------------------------- */
  var revealables = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduced) {
    revealables.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 5. Nav activo según sección ------------------------------ */
  var sections = ["services", "pricing", "benefits", "about", "careers", "contact"]
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        document.querySelectorAll(".nav a").forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { threshold: 0.35, rootMargin: "-30% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- 6. Marquee infinito -------------------------------------- */
  var track = document.getElementById("marqueeTrack");
  if (track) track.innerHTML += track.innerHTML;

  /* ---------- 7. Spotlight + tilt (solo desktop) ----------------------- */
  var fine = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  var spot = document.getElementById("spotlight");

  if (fine && !reduced && spot) {
    var sx = 0, sy = 0, tx = 0, ty = 0, raf = null;
    var loop = function () {
      sx += (tx - sx) * 0.12;
      sy += (ty - sy) * 0.12;
      spot.style.transform = "translate3d(" + sx + "px," + sy + "px,0)";
      raf = window.requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      spot.classList.add("is-on");
      if (!raf) loop();
    }, { passive: true });
  }

  if (fine && !reduced) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          "perspective(900px) rotateX(" + (-py * 6).toFixed(2) + "deg) rotateY(" +
          (px * 7).toFixed(2) + "deg) translateY(-6px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- 8. Formularios -> CRM ------------------------------------
     Van a Supabase por una función (recibir_contacto / recibir_postulacion):
     el sitio no tiene permiso de escribir en ninguna tabla, la función
     valida y decide. Si Supabase no está configurado o no responde, se
     cae al correo de siempre para no perder el mensaje. */
  var MAIL_TO = "veronica@moyacompanytx.com";
  var SB = window.MOYA_SUPABASE || {};

  function porCorreo(form, fields, subjectKey, messageKey) {
    var data = new FormData(form);
    var lines = fields.map(function (f) {
      return (t(f.key) || f.key) + ": " + ((data.get(f.name) || "").trim() || "-");
    });
    lines.push("", (t(messageKey) || "Message") + ":", (data.get("message") || "-"));
    window.location.href = "mailto:" + MAIL_TO +
      "?subject=" + encodeURIComponent((t(subjectKey) || "New message") + " — " + (data.get("name") || "")) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  function wireForm(formId, rpc, mapa, fields, subjectKey, messageKey) {
    var form = document.getElementById(formId);
    if (!form) return;
    var estado = form.querySelector(".form__estado");
    var boton = form.querySelector('button[type="submit"]');
    var etiqueta = boton ? boton.querySelector("span") : null;
    var textoBoton = etiqueta ? etiqueta.textContent : "";

    function decir(msg, mal) {
      if (!estado) return;
      estado.textContent = msg;
      estado.classList.toggle("is-mal", !!mal);
      estado.hidden = !msg;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      form.querySelectorAll("[required]").forEach(function (input) {
        var valido = input.value.trim() !== "" && input.checkValidity();
        var campo = input.closest(".field");
        if (campo) campo.classList.toggle("has-error", !valido);
        if (!valido && ok) { input.focus(); ok = false; }
      });
      if (!ok) return;

      var data = new FormData(form);
      if (!SB.url || !SB.anonKey) return porCorreo(form, fields, subjectKey, messageKey);

      var cuerpo = {};
      Object.keys(mapa).forEach(function (k) { cuerpo[k] = (data.get(mapa[k]) || "").trim(); });

      decir(t("form.enviando") || "Enviando…");
      if (boton) boton.disabled = true;
      if (etiqueta) etiqueta.textContent = t("form.enviando") || "Enviando…";

      fetch(SB.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + rpc, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SB.anonKey,
          "Authorization": "Bearer " + SB.anonKey
        },
        body: JSON.stringify({ p: cuerpo })
      }).then(function (r) {
        return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.message || j.hint || ""); });
      }).then(function () {
        form.reset();
        decir(t(formId === "careersForm" ? "join.ok" : "form.ok") || "¡Listo!");
      }).catch(function (err) {
        // El mensaje de la función es para la persona; cualquier otro fallo
        // (red, CORS) no debe dejarla sin forma de escribir.
        if (err && err.message) decir(err.message, true);
        else { decir(""); porCorreo(form, fields, subjectKey, messageKey); }
      }).then(function () {
        if (boton) boton.disabled = false;
        if (etiqueta) etiqueta.textContent = textoBoton;
      });
    });

    form.querySelectorAll("input,textarea").forEach(function (input) {
      input.addEventListener("input", function () {
        var campo = input.closest(".field");
        if (campo) campo.classList.remove("has-error");
      });
    });
  }

  wireForm("contactForm", "recibir_contacto",
    { nombre: "name", empresa: "company", email: "email", servicio: "service",
      mensaje: "message", trampa: "trampa" },
    [{ name: "name", key: "form.body.name" }, { name: "company", key: "form.body.company" },
     { name: "email", key: "form.body.email" }, { name: "service", key: "form.body.service" }],
    "form.subject", "form.body.message");

  wireForm("careersForm", "recibir_postulacion",
    { nombre: "name", telefono: "phone", email: "email", area: "area",
      experiencia: "experience", ingles: "english", cv: "cv",
      mensaje: "message", trampa: "trampa" },
    [{ name: "name", key: "join.body.name" }, { name: "phone", key: "join.body.phone" },
     { name: "email", key: "join.body.email" }, { name: "area", key: "join.body.area" },
     { name: "experience", key: "join.body.exp" }, { name: "english", key: "join.body.english" },
     { name: "cv", key: "join.body.cv" }],
    "join.subject", "join.body.message");

  /* ---------- 9. Servicio preseleccionado desde las tarjetas ----------- */
  var select = document.getElementById("serviceSelect");
  if (select) {
    document.querySelectorAll(".card").forEach(function (card) {
      var link = card.querySelector(".card__link");
      var title = card.querySelector(".card__title");
      if (!link || !title) return;
      link.addEventListener("click", function () {
        var name = title.textContent.trim();
        Array.prototype.forEach.call(select.options, function (opt) {
          if (opt.value.toLowerCase() === name.toLowerCase()) select.value = opt.value;
        });
      });
    });
  }

  /* ---------- 10. Año en el footer ------------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
