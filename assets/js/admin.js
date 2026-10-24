/* =========================================================
   Panel de administración — Moya & Company
   Acceso con correo y contraseña (Supabase Auth).
   El permiso se verifica en la base con puede(modulo): el
   navegador no decide nada, sólo pinta lo que la base deja.
   ========================================================= */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';

const cfg = window.MOYA_SUPABASE || {};
const sb = createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'moya-panel' }
});

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('es-MX');
/* Los módulos son los que la base conoce en puede(); 'resumen' no es un
   módulo: es la portada, y enseña sólo lo que cada módulo permita. */
const MODULOS = ['metricas', 'llamadas', 'contactos', 'contenido'];
const VISTAS = ['resumen', ...MODULOS, 'redes'];
const permisos = { metricas: false, llamadas: false, contactos: false, contenido: false };
let sesion = null;

/* ---------- utilidades ---------- */
function aviso(html, tipo = 'info') {
  const el = $('notice');
  el.className = 'notice' + (tipo === 'error' ? ' notice--error' : '');
  el.innerHTML = html;
  el.hidden = !html;
}
const fechaCorta = (iso) => new Date(iso).toLocaleString('es-MX',
  { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function duracion(s) {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}
const escapar = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 1. Sesión ---------- */
async function arranque() {
  if (!cfg.url || !cfg.anonKey) {
    $('cargando').textContent = 'Falta configurar la conexión con Supabase.';
    return;
  }
  const { data } = await sb.auth.getSession();
  await aplicarSesion(data.session);
  sb.auth.onAuthStateChange((_e, s) => { if (!s) mostrarAcceso(); });
}

async function aplicarSesion(s) {
  sesion = s;
  if (!s) return mostrarAcceso();

  // La base decide: si no hay fila en admins, puede() devuelve false para todo.
  const respuestas = await Promise.all(MODULOS.map((m) => sb.rpc('puede', { modulo: m })));
  MODULOS.forEach((m, i) => { permisos[m] = respuestas[i].data === true; });
  permisos.resumen = MODULOS.some((m) => permisos[m]);
  permisos.redes = permisos.contenido;   // las redes cuelgan del módulo de contenido

  if (!permisos.resumen) {
    await sb.auth.signOut();
    return mostrarAcceso('Tu cuenta no tiene acceso al panel. Pide que te den de alta.');
  }

  $('cargando').hidden = true;
  $('gate').hidden = true;
  $('app').hidden = false;
  $('quien').textContent = s.user.email;

  document.querySelectorAll('.tab').forEach((t) => {
    t.hidden = !permisos[t.dataset.vista];
  });
  irA(VISTAS.find((v) => permisos[v]));
}

function mostrarAcceso(mensaje) {
  $('cargando').hidden = true;
  $('app').hidden = true;
  $('gate').hidden = false;
  if (mensaje) { $('loginError').textContent = mensaje; $('loginError').hidden = false; }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('loginError'), btn = $('loginBtn');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
  const { data, error } = await sb.auth.signInWithPassword({
    email: $('email').value.trim(), password: $('pass').value
  });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) {
    err.textContent = /invalid login/i.test(error.message)
      ? 'Correo o contraseña incorrectos.' : error.message;
    err.hidden = false;
    return;
  }
  $('pass').value = '';
  await aplicarSesion(data.session);
});

$('olvide').addEventListener('click', async () => {
  const correo = $('email').value.trim();
  const err = $('loginError');
  if (!correo) { err.textContent = 'Escribe tu correo y vuelve a tocar.'; err.hidden = false; return; }
  await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.href });
  err.textContent = 'Si el correo existe, te llegará un enlace para cambiar la contraseña.';
  err.hidden = false;
});

$('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

/* ---------- 2. Navegación ---------- */
function irA(vista) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.vista === vista));
  VISTAS.forEach((v) => { $('vista-' + v).hidden = v !== vista; });
  aviso('');
  if (vista === 'resumen')   cargarResumen();
  if (vista === 'metricas')  cargarMetricas();
  if (vista === 'llamadas')  { cargarLlamadas(); comprobarLinea(); }
  if (vista === 'contactos') cargarContactos();
  if (vista === 'contenido') cargarContenido();
  if (vista === 'redes')     cargarRedes();
}
$('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) irA(t.dataset.vista);
});

/* ---------- 3. Métricas ---------- */
async function cargarMetricas() {
  $('stamp').textContent = 'Cargando…';
  const { data, error } = await sb.rpc('moya_stats');
  if (error) { $('stamp').textContent = '—'; return aviso('<b>No se pudieron cargar las métricas.</b> ' + escapar(error.message), 'error'); }
  pintarMetricas(data);
}
$('refresh').addEventListener('click', cargarMetricas);

function delta(el, ahora, antes) {
  if (!antes) { el.textContent = ahora > 0 ? 'sin dato previo' : ''; el.className = 'kpi__delta'; return; }
  const pct = Math.round(((ahora - antes) / antes) * 100);
  el.textContent = (pct > 0 ? '+' : '') + pct + ' % vs. periodo anterior';
  el.className = 'kpi__delta ' + (pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : '');
}

function pintarMetricas(d) {
  const t = d.totales || {};
  [['hoy', t.hoy], ['dias7', t.dias7], ['dias30', t.dias30], ['sesiones30', t.sesiones30]]
    .forEach(([k, v]) => { const el = document.querySelector(`[data-k="${k}"]`); if (el) el.textContent = nf.format(v || 0); });
  delta(document.querySelector('[data-k="hoy-d"]'), t.hoy || 0, t.ayer || 0);
  delta(document.querySelector('[data-k="dias7-d"]'), t.dias7 || 0, t.dias7_prev || 0);
  grafica(d.serie || []);
  tabla(d.serie || []);
  ranking('paginas', d.paginas);
  ranking('origenes', d.origenes);
  ranking('dispositivos', d.dispositivos);
  ranking('idiomas', (d.idiomas || []).map((r) =>
    ({ nombre: r.nombre === 'es' ? 'Español' : r.nombre === 'en' ? 'Inglés' : r.nombre, visitas: r.visitas })));
  $('stamp').textContent = 'Actualizado ' + fechaCorta(d.generado_en || Date.now());
}

function ranking(id, filas) {
  const ul = $(id);
  ul.innerHTML = '';
  if (!filas || !filas.length) { ul.innerHTML = '<li class="ranks__empty">Sin datos todavía.</li>'; return; }
  const max = Math.max(...filas.map((r) => r.visitas));
  filas.forEach((r) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="ranks__top"><span class="ranks__name">${escapar(r.nombre)}</span>` +
      `<span class="ranks__val">${nf.format(r.visitas)}</span></div>` +
      `<div class="ranks__track"><div class="ranks__fill" style="width:${Math.max(2, Math.round(r.visitas / max * 100))}%"></div></div>`;
    ul.appendChild(li);
  });
}

/* Columnas: 2px de aire, extremo redondeado de 4px, rejilla fina
   y etiqueta sólo en el día más alto. */
function grafica(serie) {
  const host = $('chart');
  host.innerHTML = '';
  if (!serie.length) { host.innerHTML = '<p class="chart__empty">Sin visitas registradas todavía.</p>'; return; }
  const W = 920, H = 260, padL = 42, padR = 12, padT = 18, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const top = techo(Math.max(...serie.map((p) => p.visitas)));
  const band = plotW / serie.length;
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v) => padT + plotH - (top ? (v / top) * plotH : 0);
  const pico = serie.reduce((a, b) => (b.visitas > a.visitas ? b : a), serie[0]);
  const s = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por día en los últimos 30 días">`];
  [0, .25, .5, .75, 1].forEach((f) => {
    const v = Math.round(top * f), yy = y(v);
    s.push(`<line class="grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>`);
    s.push(`<text class="tick" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${v}</text>`);
  });
  serie.forEach((p, i) => {
    const x = padL + i * band + (band - bw) / 2;
    const h = Math.max(p.visitas > 0 ? 2 : 0, padT + plotH - y(p.visitas));
    const r = Math.min(4, bw / 2);
    s.push(`<g class="slot" tabindex="0" data-dia="${p.dia}" data-v="${p.visitas}">`);
    s.push(`<rect class="hit" x="${padL + i * band}" y="${padT}" width="${band}" height="${plotH}"/>`);
    if (h > 0) s.push(`<rect class="bar" x="${x}" y="${padT + plotH - h}" width="${bw}" height="${h}" rx="${r}" ry="${r}"/>`);
    s.push('</g>');
  });
  if (pico.visitas > 0) {
    const pi = serie.indexOf(pico);
    s.push(`<text class="cap" x="${padL + pi * band + band / 2}" y="${y(pico.visitas) - 7}" text-anchor="middle">${pico.visitas}</text>`);
  }
  [0, Math.floor(serie.length / 2), serie.length - 1].forEach((i) => {
    const d = serie[i].dia.split('-');
    s.push(`<text class="tick" x="${padL + i * band + band / 2}" y="${H - 8}" text-anchor="middle">${d[2]}/${d[1]}</text>`);
  });
  s.push('</svg>');
  host.innerHTML = s.join('');
  tooltips(host);
}
function techo(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}
function tooltips(host) {
  const tip = $('tip');
  host.querySelectorAll('.slot').forEach((slot) => {
    const ver = (e) => {
      const r = slot.getBoundingClientRect();
      tip.innerHTML = `<b>${nf.format(slot.dataset.v)}</b> ${slot.dataset.v === '1' ? 'visita' : 'visitas'}<br>` +
        new Date(slot.dataset.dia + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
      tip.hidden = false;
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = (e && e.clientY ? e.clientY : r.top + 20) + 'px';
    };
    slot.addEventListener('mousemove', ver);
    slot.addEventListener('focus', ver);
    slot.addEventListener('mouseleave', () => { tip.hidden = true; });
    slot.addEventListener('blur', () => { tip.hidden = true; });
  });
}
function tabla(serie) {
  $('tablewrap').innerHTML = '<table><thead><tr><th>Día</th><th>Visitas</th></tr></thead><tbody>' +
    serie.map((p) => `<tr><td>${new Date(p.dia + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td>${nf.format(p.visitas)}</td></tr>`).join('') +
    '</tbody></table>';
}
$('toggleTable').addEventListener('click', function () {
  const w = $('tablewrap'), abrir = w.hidden;
  w.hidden = !abrir;
  this.setAttribute('aria-expanded', String(abrir));
  this.textContent = abrir ? 'Ocultar tabla' : 'Ver tabla';
});

/* Cuando la función responde 4xx, supabase-js lo envuelve en FunctionsHttpError
   y el mensaje útil queda en el cuerpo de la respuesta. */
async function motivo(error, data) {
  if (data?.error) return data.error;
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const cuerpo = await error.context.json();
      if (cuerpo?.error) return cuerpo.error;
    } catch (_) { /* la respuesta no era JSON */ }
  }
  return error?.message || 'Error desconocido.';
}

/* ---------- 4. Llamadas ---------- */
const ESTADOS = {
  completada: ['Completada', 'ok'], sin_respuesta: ['Sin respuesta', 'av'], ocupado: ['Ocupado', 'av'],
  fallida: ['Fallida', 'mal'], cancelada: ['Cancelada', 'av'], en_curso: ['En curso', 'ok'],
  sonando: ['Sonando', 'av'], iniciando: ['Iniciando', 'av']
};
const IA_ESTADO = {
  listo: 'Resumen listo', pendiente: 'En cola', procesando: 'Procesando…',
  error: 'Error al procesar', sin_grabacion: 'Sin grabación'
};
let llamadas = [], elegida = null;

async function cargarLlamadas() {
  const ul = $('listaLlamadas');
  ul.innerHTML = '<li class="lista__cargando">Cargando…</li>';
  const { data, error } = await sb.from('llamadas')
    .select('*, contactos(nombre,empresa)').order('created_at', { ascending: false }).limit(100);
  if (error) { ul.innerHTML = ''; return aviso('<b>No se pudieron cargar las llamadas.</b> ' + escapar(error.message), 'error'); }
  llamadas = data || [];
  pintarLista();
}
$('recargarLlamadas').addEventListener('click', cargarLlamadas);
$('filtroLlamadas').addEventListener('change', pintarLista);

function pintarLista() {
  const f = $('filtroLlamadas').value;
  const ul = $('listaLlamadas');
  const vis = llamadas.filter((l) =>
    !f ? true : f === 'sin_respuesta' ? l.estado === 'sin_respuesta' : l.direccion === f);
  if (!vis.length) {
    ul.innerHTML = '<li class="lista__vacio">Todavía no hay llamadas.</li>';
    return;
  }
  ul.innerHTML = vis.map((l) => {
    const [txt, cl] = ESTADOS[l.estado] || [l.estado, 'av'];
    const quien = l.contactos?.nombre || l.numero || 'Desconocido';
    return `<li><button class="fila ${elegida === l.id ? 'is-on' : ''}" type="button" data-id="${l.id}">
      <span class="fila__dir fila__dir--${l.direccion}" aria-hidden="true"></span>
      <span class="fila__cuerpo">
        <span class="fila__top"><b>${escapar(quien)}</b><span class="fila__hora">${fechaCorta(l.created_at)}</span></span>
        <span class="fila__bajo">
          <span class="pill pill--${cl}">${txt}</span>
          <span>${duracion(l.duracion_seg)}</span>
          ${l.ia_estado === 'listo' ? '<span class="pill pill--ia">IA</span>' : ''}
        </span>
      </span></button></li>`;
  }).join('');
  ul.querySelectorAll('.fila').forEach((b) =>
    b.addEventListener('click', () => verLlamada(b.dataset.id)));
}

async function verLlamada(id) {
  elegida = id;
  pintarLista();
  const l = llamadas.find((x) => x.id === id);
  if (!l) return;
  const det = $('detalle');
  const ia = l.ia || {};
  const quien = l.contactos?.nombre || l.numero || 'Desconocido';
  const bloque = (titulo, cuerpo) => cuerpo ? `<div class="det__bloque"><h3>${titulo}</h3>${cuerpo}</div>` : '';
  const lista = (arr) => arr?.length ? '<ul class="det__lista">' + arr.map((x) => `<li>${escapar(x)}</li>`).join('') + '</ul>' : '';

  det.innerHTML = `
    <header class="det__head">
      <div>
        <h2 class="det__titulo">${escapar(quien)}</h2>
        <p class="det__sub">${l.direccion === 'entrante' ? 'Entrante' : 'Saliente'} ·
           ${fechaCorta(l.created_at)} · ${duracion(l.duracion_seg)}
           ${l.contactos?.empresa ? ' · ' + escapar(l.contactos.empresa) : ''}</p>
      </div>
      <span class="pill pill--${(ESTADOS[l.estado] || ['', 'av'])[1]}">${(ESTADOS[l.estado] || [l.estado])[0]}</span>
    </header>
    <div class="det__audio" id="detAudio">${l.grabacion_path ? 'Cargando grabación…' : '<p class="det__nada">Esta llamada no tiene grabación.</p>'}</div>
    <div class="det__ia">
      <div class="det__iahead">
        <span class="pill pill--${l.ia_estado === 'listo' ? 'ok' : l.ia_estado === 'error' ? 'mal' : 'av'}">${IA_ESTADO[l.ia_estado] || l.ia_estado}</span>
        ${l.grabacion_path ? '<button class="abtn abtn--ghost abtn--sm" type="button" id="reprocesar">Procesar de nuevo</button>' : ''}
      </div>
      ${l.ia_error ? `<p class="det__error">${escapar(l.ia_error)}</p>` : ''}
      ${bloque('Resumen', ia.resumen ? `<p>${escapar(ia.resumen)}</p>` : '')}
      ${bloque('Qué necesita', ia.necesita ? `<p>${escapar(ia.necesita)}</p>` : '')}
      ${ia.tipo || ia.servicio || ia.temperatura ? `<div class="det__tags">
          ${ia.tipo ? `<span class="pill">${escapar(ia.tipo)}</span>` : ''}
          ${ia.servicio ? `<span class="pill">${escapar(ia.servicio)}</span>` : ''}
          ${ia.temperatura ? `<span class="pill pill--${ia.temperatura === 'caliente' ? 'mal' : ia.temperatura === 'tibio' ? 'av' : 'ok'}">${escapar(ia.temperatura)}</span>` : ''}
        </div>` : ''}
      ${bloque('Datos que dio', ia.datos?.length ? '<dl class="det__datos">' +
        ia.datos.map((d) => `<div><dt>${escapar(d.campo)}</dt><dd>${escapar(d.valor)}</dd></div>`).join('') + '</dl>' : '')}
      ${bloque('Documentos pendientes', lista(ia.documentos_pendientes))}
      ${bloque('Próximos pasos', lista(ia.proximos_pasos))}
      ${bloque('Tareas', ia.tareas?.length ? '<ul class="det__lista">' +
        ia.tareas.map((t) => `<li>${escapar(t.titulo)} <span class="det__dias">${t.en_dias === 0 ? 'hoy' : 'en ' + t.en_dias + ' día(s)'}</span></li>`).join('') + '</ul>' : '')}
      ${bloque('Transcripción', l.transcripcion ? `<details class="det__trans"><summary>Ver transcripción completa</summary><p>${escapar(l.transcripcion)}</p></details>` : '')}
    </div>`;

  if (l.grabacion_path) {
    const { data, error } = await sb.storage.from('llamadas').createSignedUrl(l.grabacion_path, 3600);
    $('detAudio').innerHTML = error || !data
      ? '<p class="det__nada">No se pudo abrir la grabación.</p>'
      : `<audio controls preload="none" src="${data.signedUrl}"></audio>`;
  }
  const btn = $('reprocesar');
  if (btn) btn.addEventListener('click', () => reprocesar(l.id, btn));
}

async function reprocesar(id, btn) {
  btn.disabled = true; btn.textContent = 'Procesando…';
  const { data, error } = await sb.functions.invoke('llamadas', { body: { accion: 'procesar', llamada_id: id } });
  btn.disabled = false; btn.textContent = 'Procesar de nuevo';
  if (error || data?.error) {
    return aviso('<b>No se pudo procesar.</b> ' + escapar(await motivo(error, data)), 'error');
  }
  await cargarLlamadas();
  verLlamada(id);
}

/* ---------- 5. Marcador (Twilio Voice) ---------- */
let device = null, conexion = null, lineaOk = false;

async function comprobarLinea() {
  const el = $('lineaEstado');
  const { data, error } = await sb.functions.invoke('llamadas', { body: { accion: 'token' } });
  if (error || data?.error) {
    lineaOk = false;
    const msg = await motivo(error, data);
    el.innerHTML = `<span class="pill pill--av">Línea no conectada</span> ${escapar(msg)}`;
    $('btnLlamar').disabled = true;
    return null;
  }
  lineaOk = true;
  el.innerHTML = `<span class="pill pill--ok">Línea conectada</span> ${escapar(data.numero || '')}`;
  $('btnLlamar').disabled = false;
  return data;
}

/* El teclado escribe en la pantalla; con una llamada en curso manda el tono
   (DTMF), que es lo que esperan los menús automáticos del otro lado. */
const teclado = $('teclado');
let pulsadaLarga = null;

function marcarTecla(d) {
  if (conexion) { try { conexion.sendDigits(d); } catch (_) { /* la llamada ya colgó */ } return; }
  const inp = $('numeroLlamar');
  inp.value += d;
  inp.focus();
}

teclado.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.tecla');
  if (!t || !t.dataset.largo) return;
  pulsadaLarga = setTimeout(() => {
    pulsadaLarga = 'hecha';
    marcarTecla(t.dataset.largo);
  }, 550);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
  teclado.addEventListener(ev, () => {
    if (typeof pulsadaLarga === 'number') clearTimeout(pulsadaLarga);
    if (pulsadaLarga !== 'hecha') pulsadaLarga = null;
  }));

teclado.addEventListener('click', (e) => {
  const t = e.target.closest('.tecla');
  if (!t) return;
  if (pulsadaLarga === 'hecha') { pulsadaLarga = null; return; }  // ya insertó el '+'
  marcarTecla(t.dataset.d);
});

$('btnBorrar').addEventListener('click', () => {
  const inp = $('numeroLlamar');
  inp.value = inp.value.slice(0, -1);
  inp.focus();
});

async function cargarSdkTwilio() {
  if (window.Twilio?.Device) return;
  await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://sdk.twilio.com/js/voice/releases/2.11.2/twilio.min.js';
    s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el marcador.'));
    document.head.appendChild(s);
  });
}

$('btnLlamar').addEventListener('click', async () => {
  const est = $('marcadorEstado');
  const numero = $('numeroLlamar').value.trim();
  if (!numero) { est.textContent = 'Escribe un número.'; return; }
  est.textContent = 'Preparando la línea…';
  try {
    const datos = await comprobarLinea();
    if (!datos) { est.textContent = 'La línea no está conectada.'; return; }
    await cargarSdkTwilio();

    const modo = $('modoGrabacion').value;
    const con_aviso = modo === 'aviso' ? true : modo === 'sin_aviso' ? false : null;
    const { data: fila, error } = await sb.from('llamadas')
      .insert({ direccion: 'saliente', canal: 'telefono', numero, estado: 'iniciando', con_aviso })
      .select('id').single();
    if (error) { est.textContent = 'No se pudo registrar la llamada: ' + error.message; return; }

    if (!device) {
      device = new window.Twilio.Device(datos.token, { codecPreferences: ['opus', 'pcmu'] });
      device.on('error', (e) => { est.textContent = 'Error de la línea: ' + e.message; });
      device.on('disconnect', () => {
        est.textContent = 'Llamada terminada.';
        conexion = null;
        $('btnColgar').hidden = true;
        $('btnLlamar').hidden = false;
        setTimeout(cargarLlamadas, 4000);   // da tiempo a que Twilio avise el fin
      });
    } else {
      device.updateToken(datos.token);
    }
    conexion = await device.connect({ params: { To: numero, llamada: fila.id } });
    est.textContent = 'Llamando a ' + numero + '…';
    $('btnColgar').hidden = false;
    $('btnLlamar').hidden = true;
  } catch (e) {
    est.textContent = e.message;
  }
});

$('btnColgar').addEventListener('click', () => {
  if (device) device.disconnectAll();
  conexion = null;
  $('btnColgar').hidden = true;
  $('btnLlamar').hidden = false;
});


/* =========================================================
   6. Contactos y prospectos
   ========================================================= */
const C_ESTADOS = {
  prospecto: ['Prospecto', 'av'], cliente: ['Cliente', 'ok'],
  pausado: ['Pausado', ''], perdido: ['Perdido', 'mal']
};
const C_ORIGENES = ['manual', 'formulario', 'llamada', 'referido', 'redes', 'otro'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

let contactos = [], contactoElegido = null;

async function cargarContactos() {
  const ul = $('listaContactos');
  ul.innerHTML = '<li class="lista__cargando">Cargando…</li>';
  const { data, error } = await sb.from('contactos')
    .select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) { ul.innerHTML = ''; return aviso('<b>No se pudieron cargar los contactos.</b> ' + escapar(error.message), 'error'); }
  contactos = data || [];
  resumenContactos();
  pintarContactos();
  if (contactoElegido && contactos.some((c) => c.id === contactoElegido)) verContacto(contactoElegido);
}
$('recargarContactos').addEventListener('click', cargarContactos);
$('filtroContactos').addEventListener('change', pintarContactos);
$('buscaContacto').addEventListener('input', pintarContactos);
$('nuevoContacto').addEventListener('click', () => { contactoElegido = null; pintarContactos(); fichaContacto(null); });

function resumenContactos() {
  const cuenta = (e) => contactos.filter((c) => c.estado === e).length;
  const valor = contactos.filter((c) => c.estado === 'cliente')
    .reduce((a, c) => a + Number(c.valor_mensual || 0), 0);
  const poner = (k, v) => { const el = document.querySelector(`[data-c="${k}"]`); if (el) el.textContent = v; };
  poner('total', nf.format(contactos.length));
  poner('prospecto', nf.format(cuenta('prospecto')));
  poner('cliente', nf.format(cuenta('cliente')));
  poner('valor', money.format(valor));
  $('contactosResumen').textContent = contactos.length
    ? `${contactos.length} ficha(s) · se actualiza al guardar`
    : 'Todavía no hay contactos registrados.';
}

function pintarContactos() {
  const q = $('buscaContacto').value.trim().toLowerCase();
  const f = $('filtroContactos').value;
  const ul = $('listaContactos');
  const vis = contactos.filter((c) => {
    if (f && c.estado !== f) return false;
    if (!q) return true;
    return [c.nombre, c.empresa, c.email, c.telefono, c.tel_digitos, (c.etiquetas || []).join(' ')]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
  if (!vis.length) {
    ul.innerHTML = `<li class="lista__vacio">${contactos.length ? 'Ningún contacto coincide con la búsqueda.' : 'Todavía no hay contactos. Toca «Nuevo contacto».'}</li>`;
    return;
  }
  ul.innerHTML = vis.map((c) => {
    const [txt, cl] = C_ESTADOS[c.estado] || [c.estado, ''];
    return `<li><button class="fila ${contactoElegido === c.id ? 'is-on' : ''}" type="button" data-id="${c.id}">
      <span class="fila__ini" aria-hidden="true">${escapar(inicial(c.nombre || c.empresa || '?'))}</span>
      <span class="fila__cuerpo">
        <span class="fila__top"><b>${escapar(c.nombre || 'Sin nombre')}</b>
          <span class="pill ${cl ? 'pill--' + cl : ''}">${txt}</span></span>
        <span class="fila__bajo">
          ${c.empresa ? escapar(c.empresa) + ' · ' : ''}${escapar(c.telefono || c.email || '—')}
        </span>
      </span></button></li>`;
  }).join('');
  ul.querySelectorAll('.fila').forEach((b) =>
    b.addEventListener('click', () => verContacto(b.dataset.id)));
}
const inicial = (s) => String(s).trim().charAt(0).toUpperCase() || '?';

function verContacto(id) {
  contactoElegido = id;
  pintarContactos();
  fichaContacto(contactos.find((c) => c.id === id) || null);
}

/* La ficha es el formulario: ver y editar son la misma pantalla, para no
   duplicar campos ni abrir ventanas encima. */
function fichaContacto(c) {
  const nuevo = !c;
  c = c || { estado: 'prospecto', origen: 'manual', etiquetas: [] };
  const opc = (valor, actual, texto) =>
    `<option value="${valor}" ${valor === actual ? 'selected' : ''}>${texto}</option>`;

  $('fichaContacto').innerHTML = `
    <form class="ficha" id="formContacto" novalidate>
      <header class="det__head">
        <div>
          <h2 class="det__titulo">${nuevo ? 'Nuevo contacto' : escapar(c.nombre || 'Sin nombre')}</h2>
          <p class="det__sub">${nuevo ? 'Rellena lo que tengas; sólo el nombre es obligatorio.'
            : 'Dado de alta ' + fechaCorta(c.created_at)}</p>
        </div>
        ${nuevo ? '' : `<span class="pill pill--${(C_ESTADOS[c.estado] || ['', ''])[1]}">${(C_ESTADOS[c.estado] || [c.estado])[0]}</span>`}
      </header>

      <div class="ficha__rejilla">
        <label class="afield ficha__ancho"><span>Nombre</span>
          <input id="cNombre" required value="${escapar(c.nombre || '')}" placeholder="Nombre y apellido" /></label>
        <label class="afield"><span>Empresa</span>
          <input id="cEmpresa" value="${escapar(c.empresa || '')}" /></label>
        <label class="afield"><span>Estado</span>
          <select id="cEstado">${Object.entries(C_ESTADOS).map(([k, v]) => opc(k, c.estado, v[0])).join('')}</select></label>
        <label class="afield"><span>Teléfono</span>
          <input id="cTel" type="tel" value="${escapar(c.telefono || '')}" placeholder="+1 713 382 7990" /></label>
        <label class="afield"><span>Teléfono alterno</span>
          <input id="cTel2" type="tel" value="${escapar(c.telefono2 || '')}" /></label>
        <label class="afield"><span>Correo</span>
          <input id="cEmail" type="email" autocapitalize="none" spellcheck="false" value="${escapar(c.email || '')}" /></label>
        <label class="afield"><span>Ciudad o zona</span>
          <input id="cRegion" value="${escapar(c.region || '')}" placeholder="Houston, TX" /></label>
        <label class="afield"><span>Cómo llegó</span>
          <select id="cOrigen">${C_ORIGENES.map((o) => opc(o, c.origen || 'manual', o[0].toUpperCase() + o.slice(1))).join('')}</select></label>
        <label class="afield"><span>Ingreso mensual (USD)</span>
          <input id="cValor" type="number" min="0" step="0.01" value="${c.valor_mensual ?? ''}" /></label>
        <label class="afield ficha__ancho"><span>Etiquetas (separadas por coma)</span>
          <input id="cEtiquetas" value="${escapar((c.etiquetas || []).join(', '))}" placeholder="bookkeeping, payroll" /></label>
        <label class="afield ficha__ancho"><span>Notas</span>
          <textarea id="cNotas" rows="4" placeholder="Lo que haya que recordar de este contacto.">${escapar(c.notas || '')}</textarea></label>
      </div>

      <p class="ficha__estado" id="cEstadoMsg"></p>
      <div class="ficha__botones">
        <button class="abtn abtn--primary" type="submit" id="cGuardar">${nuevo ? 'Crear contacto' : 'Guardar cambios'}</button>
        ${nuevo ? '<button class="abtn abtn--ghost" type="button" id="cCancelar">Cancelar</button>'
                : '<button class="abtn abtn--ghost" type="button" id="cBorrar">Eliminar</button>'}
      </div>
    </form>
    ${nuevo ? '' : '<div class="ficha__llamadas" id="cLlamadas"></div>'}`;

  $('formContacto').addEventListener('submit', (e) => { e.preventDefault(); guardarContacto(nuevo ? null : c.id); });
  if (nuevo) $('cCancelar').addEventListener('click', () => { contactoElegido = null; pintarContactos(); fichaContacto0(); });
  else {
    $('cBorrar').addEventListener('click', () => borrarContacto(c.id, c.nombre));
    llamadasDelContacto(c.id);
  }
}
function fichaContacto0() {
  $('fichaContacto').innerHTML = '<p class="detalle__vacio">Elige un contacto, o crea uno nuevo.</p>';
}

function leerContacto() {
  const v = (id) => $(id).value.trim();
  const valor = v('cValor');
  return {
    nombre: v('cNombre'), empresa: v('cEmpresa') || null, telefono: v('cTel') || null,
    telefono2: v('cTel2') || null, email: v('cEmail') || null, region: v('cRegion') || null,
    estado: $('cEstado').value, origen: $('cOrigen').value,
    valor_mensual: valor === '' ? null : Number(valor),
    etiquetas: v('cEtiquetas').split(',').map((s) => s.trim()).filter(Boolean),
    notas: v('cNotas') || null
  };
}

async function guardarContacto(id) {
  const msg = $('cEstadoMsg'), btn = $('cGuardar');
  const fila = leerContacto();
  if (!fila.nombre) { msg.textContent = 'El nombre hace falta.'; $('cNombre').focus(); return; }
  btn.disabled = true; msg.textContent = 'Guardando…';
  const q = id
    ? sb.from('contactos').update(fila).eq('id', id).select('id').single()
    : sb.from('contactos').insert(fila).select('id').single();
  const { data, error } = await q;
  btn.disabled = false;
  if (error) { msg.textContent = 'No se pudo guardar: ' + error.message; return; }
  contactoElegido = data.id;
  msg.textContent = 'Guardado.';
  await cargarContactos();
}

async function borrarContacto(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre || 'este contacto'}? No se puede deshacer.`)) return;
  const { error } = await sb.from('contactos').delete().eq('id', id);
  if (error) return aviso('<b>No se pudo eliminar.</b> ' + escapar(error.message), 'error');
  contactoElegido = null;
  fichaContacto0();
  await cargarContactos();
}

/* Las llamadas del contacto son de sólo lectura aquí: el detalle completo
   (grabación y resumen) vive en su propia pestaña. */
async function llamadasDelContacto(id) {
  const host = $('cLlamadas');
  if (!host || !permisos.llamadas) return;
  const { data, error } = await sb.from('llamadas')
    .select('id,created_at,direccion,estado,duracion_seg')
    .eq('contacto_id', id).order('created_at', { ascending: false }).limit(8);
  if (error || !data?.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<h3 class="ficha__h3">Llamadas con este contacto</h3>
    <ul class="ficha__llam">${data.map((l) => {
      const [txt, cl] = ESTADOS[l.estado] || [l.estado, 'av'];
      return `<li><span>${l.direccion === 'entrante' ? 'Entrante' : 'Saliente'}</span>
        <span>${fechaCorta(l.created_at)}</span>
        <span>${duracion(l.duracion_seg)}</span>
        <span class="pill pill--${cl}">${txt}</span></li>`;
    }).join('')}</ul>`;
}

/* =========================================================
   7. Contenido digital
   Los diseños viven en un bucket privado; en pantalla se abren
   con enlaces firmados que caducan en una hora.
   ========================================================= */
const D_ESTADOS = {
  por_aprobar: ['Por aprobar', 'av'], cambios: ['Cambios pedidos', 'mal'],
  aprobado: ['Aprobado', 'ok'], publicado: ['Publicado', 'ia']
};
const D_REDES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', otra: 'Otra' };
const D_TIPOS = { post: 'Post', historia: 'Historia', reel: 'Reel', flyer: 'Flyer', carrusel: 'Carrusel', otro: 'Otro' };
const MAX_ARCHIVO = 25 * 1024 * 1024;

let contenidos = [], contenidoElegido = null;
const firmas = new Map();   // path -> url firmada

async function firmar(paths) {
  const faltan = paths.filter((p) => p && !firmas.has(p));
  if (faltan.length) {
    const { data } = await sb.storage.from('contenido').createSignedUrls(faltan, 3600);
    (data || []).forEach((r) => { if (r.path && r.signedUrl) firmas.set(r.path, r.signedUrl); });
  }
  return paths.map((p) => firmas.get(p) || null);
}

async function cargarContenido() {
  const host = $('galeria');
  host.innerHTML = '<p class="galeria__aviso">Cargando…</p>';
  const { data, error } = await sb.from('contenido').select('*')
    .order('created_at', { ascending: false }).limit(200);
  if (error) { host.innerHTML = ''; return aviso('<b>No se pudo cargar el contenido.</b> ' + escapar(error.message), 'error'); }
  contenidos = data || [];
  await pintarGaleria();
  if (contenidoElegido && contenidos.some((d) => d.id === contenidoElegido)) verContenido(contenidoElegido);
}
$('recargarContenido').addEventListener('click', cargarContenido);
$('filtroContenido').addEventListener('change', pintarGaleria);
$('nuevoContenido').addEventListener('click', () => { contenidoElegido = null; pintarGaleria(); formContenido(); });

const esImagen = (a) => /^image\//.test(a?.mime || '');

async function pintarGaleria() {
  const f = $('filtroContenido').value;
  const host = $('galeria');
  const vis = contenidos.filter((d) => !f || d.estado === f);
  const porEstado = (e) => contenidos.filter((d) => d.estado === e).length;
  $('contenidoResumen').textContent = contenidos.length
    ? `${contenidos.length} pieza(s) · ${porEstado('por_aprobar')} por aprobar · ${porEstado('aprobado')} aprobadas`
    : 'Todavía no hay diseños cargados.';

  if (!vis.length) {
    host.innerHTML = `<p class="galeria__aviso">${contenidos.length
      ? 'Ninguna pieza en ese estado.' : 'Todavía no hay diseños. Toca «Subir diseño».'}</p>`;
    return;
  }

  const portadas = vis.map((d) => (d.archivos || []).find(esImagen)?.path || null);
  const urls = await firmar(portadas.filter(Boolean));
  const mapa = new Map();
  portadas.filter(Boolean).forEach((p, i) => mapa.set(p, urls[i]));

  host.innerHTML = vis.map((d, i) => {
    const [txt, cl] = D_ESTADOS[d.estado] || [d.estado, ''];
    const url = portadas[i] ? mapa.get(portadas[i]) : null;
    const n = (d.archivos || []).length;
    return `<button class="pieza ${contenidoElegido === d.id ? 'is-on' : ''}" type="button" data-id="${d.id}">
      <span class="pieza__lienzo">${url
        ? `<img src="${url}" alt="" loading="lazy" />`
        : `<span class="pieza__sin">${n ? n + ' archivo(s)' : 'Sin archivos'}</span>`}
        <span class="pill pill--${cl} pieza__estado">${txt}</span>
      </span>
      <span class="pieza__pie">
        <b>${escapar(d.titulo)}</b>
        <span>${D_REDES[d.red] || d.red} · ${D_TIPOS[d.tipo] || d.tipo}${
          d.fecha_publicacion ? ' · ' + diaCorto(d.fecha_publicacion) : ''}</span>
      </span></button>`;
  }).join('');
  host.querySelectorAll('.pieza').forEach((b) =>
    b.addEventListener('click', () => verContenido(b.dataset.id)));
}
const diaCorto = (d) => new Date(d + 'T12:00:00')
  .toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

/* ---------- alta y edición ---------- */
function formContenido(d) {
  const nuevo = !d;
  d = d || { tipo: 'post', red: 'instagram', estado: 'por_aprobar' };
  const opc = (k, actual, texto) => `<option value="${k}" ${k === actual ? 'selected' : ''}>${texto}</option>`;
  $('fichaContenido').innerHTML = `
    <form class="ficha" id="formContenido" novalidate>
      <header class="det__head">
        <div>
          <h2 class="det__titulo">${nuevo ? 'Subir diseño' : 'Editar pieza'}</h2>
          <p class="det__sub">${nuevo ? 'Puedes subir imágenes, PDF o video (hasta 25 MB cada uno).'
            : 'Los archivos ya cargados se mantienen.'}</p>
        </div>
      </header>
      <div class="ficha__rejilla">
        <label class="afield ficha__ancho"><span>Título</span>
          <input id="dTitulo" required maxlength="160" value="${escapar(d.titulo || '')}" placeholder="Promo de septiembre" /></label>
        <label class="afield"><span>Red</span>
          <select id="dRed">${Object.entries(D_REDES).map(([k, v]) => opc(k, d.red, v)).join('')}</select></label>
        <label class="afield"><span>Formato</span>
          <select id="dTipo">${Object.entries(D_TIPOS).map(([k, v]) => opc(k, d.tipo, v)).join('')}</select></label>
        <label class="afield"><span>Fecha de publicación</span>
          <input id="dFecha" type="date" value="${d.fecha_publicacion || ''}" /></label>
        <label class="afield"><span>Estado</span>
          <select id="dEstado">${Object.entries(D_ESTADOS).map(([k, v]) => opc(k, d.estado, v[0])).join('')}</select></label>
        <label class="afield ficha__ancho"><span>Copy / texto de la publicación</span>
          <textarea id="dCopy" rows="5" maxlength="3000" placeholder="El texto que acompaña al diseño.">${escapar(d.copy || '')}</textarea></label>
        <label class="afield ficha__ancho"><span>Archivos</span>
          <input id="dArchivos" type="file" multiple
                 accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,video/mp4,video/quicktime" /></label>
      </div>
      <p class="ficha__estado" id="dEstadoMsg"></p>
      <div class="ficha__botones">
        <button class="abtn abtn--primary" type="submit" id="dGuardar">${nuevo ? 'Crear y subir' : 'Guardar cambios'}</button>
        <button class="abtn abtn--ghost" type="button" id="dCancelar">Cancelar</button>
      </div>
    </form>`;
  $('formContenido').addEventListener('submit', (e) => { e.preventDefault(); guardarContenido(nuevo ? null : d); });
  $('dCancelar').addEventListener('click', () => {
    if (nuevo) { contenidoElegido = null; pintarGaleria(); fichaContenido0(); }
    else verContenido(d.id);
  });
}
function fichaContenido0() {
  $('fichaContenido').innerHTML = '<p class="detalle__vacio">Elige un diseño para verlo, comentarlo y aprobarlo.</p>';
}

const nombreSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'archivo';

async function subirArchivos(id, archivos, msg) {
  const nuevos = [];
  for (let i = 0; i < archivos.length; i++) {
    const f = archivos[i];
    if (f.size > MAX_ARCHIVO) { nuevos.push({ error: `${f.name} pesa más de 25 MB.` }); continue; }
    msg.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
    const path = `${id}/${Date.now()}-${nombreSeguro(f.name)}`;
    const { error } = await sb.storage.from('contenido')
      .upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) nuevos.push({ error: `${f.name}: ${error.message}` });
    else nuevos.push({ path, nombre: f.name, mime: f.type || '', tamano: f.size });
  }
  return nuevos;
}

async function guardarContenido(original) {
  const msg = $('dEstadoMsg'), btn = $('dGuardar');
  const v = (id) => $(id).value.trim();
  const fila = {
    titulo: v('dTitulo'), red: $('dRed').value, tipo: $('dTipo').value,
    estado: $('dEstado').value, fecha_publicacion: v('dFecha') || null,
    copy: v('dCopy') || null
  };
  if (!fila.titulo) { msg.textContent = 'Hace falta un título.'; $('dTitulo').focus(); return; }
  btn.disabled = true; msg.textContent = 'Guardando…';

  const q = original
    ? sb.from('contenido').update(fila).eq('id', original.id).select('id,archivos').single()
    : sb.from('contenido').insert(fila).select('id,archivos').single();
  const { data, error } = await q;
  if (error) { btn.disabled = false; msg.textContent = 'No se pudo guardar: ' + error.message; return; }

  const elegidos = Array.from($('dArchivos').files || []);
  if (elegidos.length) {
    const subidos = await subirArchivos(data.id, elegidos, msg);
    const fallos = subidos.filter((a) => a.error).map((a) => a.error);
    const ok = subidos.filter((a) => a.path);
    if (ok.length) {
      const { error: e2 } = await sb.from('contenido')
        .update({ archivos: (data.archivos || []).concat(ok) }).eq('id', data.id);
      if (e2) fallos.push('No se pudo anotar los archivos: ' + e2.message);
    }
    if (fallos.length) aviso('<b>Algunos archivos no se subieron.</b><br>' + fallos.map(escapar).join('<br>'), 'error');
  }
  btn.disabled = false;
  contenidoElegido = data.id;
  await cargarContenido();
}

/* ---------- detalle ---------- */
async function verContenido(id) {
  contenidoElegido = id;
  await pintarGaleria();
  const d = contenidos.find((x) => x.id === id);
  if (!d) return;
  const [txt, cl] = D_ESTADOS[d.estado] || [d.estado, ''];
  const archivos = d.archivos || [];
  const urls = await firmar(archivos.map((a) => a.path));

  $('fichaContenido').innerHTML = `
    <header class="det__head">
      <div>
        <h2 class="det__titulo">${escapar(d.titulo)}</h2>
        <p class="det__sub">${D_REDES[d.red] || d.red} · ${D_TIPOS[d.tipo] || d.tipo}
          ${d.fecha_publicacion ? ' · publica el ' + diaCorto(d.fecha_publicacion) : ''}
          · creado ${fechaCorta(d.created_at)}</p>
      </div>
      <span class="pill pill--${cl}">${txt}</span>
    </header>

    <div class="estados" id="dCambiaEstado" role="group" aria-label="Cambiar estado">
      ${Object.entries(D_ESTADOS).map(([k, v]) =>
        `<button class="estado ${k === d.estado ? 'is-on' : ''}" type="button" data-estado="${k}">${v[0]}</button>`).join('')}
    </div>

    <div class="archivos">
      ${archivos.length ? archivos.map((a, i) => {
        const u = urls[i];
        if (!u) return `<div class="archivo archivo--mal">${escapar(a.nombre)}<span>no se pudo abrir</span></div>`;
        if (esImagen(a)) return `<a class="archivo" href="${u}" target="_blank" rel="noopener">
            <img src="${u}" alt="${escapar(a.nombre)}" loading="lazy" /></a>`;
        if (/^video\//.test(a.mime)) return `<video class="archivo" controls preload="none" src="${u}"></video>`;
        return `<a class="archivo archivo--doc" href="${u}" target="_blank" rel="noopener">
            <span>${escapar(a.nombre)}</span><span>Abrir</span></a>`;
      }).join('') : '<p class="det__nada">Esta pieza no tiene archivos todavía.</p>'}
    </div>

    ${d.copy ? `<div class="det__bloque"><h3>Copy</h3><p class="copy">${escapar(d.copy)}</p>
      <button class="abtn abtn--ghost abtn--sm" type="button" id="dCopiar">Copiar texto</button></div>` : ''}

    <div class="det__bloque">
      <h3>Comentarios</h3>
      <ul class="charla" id="dCharla"><li class="ranks__empty">Cargando…</li></ul>
      <form class="charla__form" id="dComentar">
        <input id="dTexto" maxlength="2000" placeholder="Escribe un comentario o un cambio a pedir…" />
        <button class="abtn abtn--primary abtn--sm" type="submit">Enviar</button>
      </form>
    </div>

    <div class="ficha__botones">
      <button class="abtn abtn--ghost" type="button" id="dEditar">Editar</button>
      <button class="abtn abtn--ghost" type="button" id="dBorrar">Eliminar</button>
    </div>`;

  $('dCambiaEstado').addEventListener('click', (e) => {
    const b = e.target.closest('.estado');
    if (b && b.dataset.estado !== d.estado) cambiarEstado(d.id, b.dataset.estado);
  });
  $('dEditar').addEventListener('click', () => formContenido(d));
  $('dBorrar').addEventListener('click', () => borrarContenido(d));
  const cop = $('dCopiar');
  if (cop) cop.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(d.copy); cop.textContent = 'Copiado'; }
    catch (_) { cop.textContent = 'No se pudo copiar'; }
    setTimeout(() => { cop.textContent = 'Copiar texto'; }, 2000);
  });
  $('dComentar').addEventListener('submit', (e) => { e.preventDefault(); comentar(d.id); });
  cargarComentarios(d.id);
}

async function cambiarEstado(id, estado) {
  const { error } = await sb.from('contenido').update({ estado }).eq('id', id);
  if (error) return aviso('<b>No se pudo cambiar el estado.</b> ' + escapar(error.message), 'error');
  await cargarContenido();
}

async function borrarContenido(d) {
  if (!confirm(`¿Eliminar «${d.titulo}» y sus archivos? No se puede deshacer.`)) return;
  const paths = (d.archivos || []).map((a) => a.path).filter(Boolean);
  if (paths.length) await sb.storage.from('contenido').remove(paths);
  const { error } = await sb.from('contenido').delete().eq('id', d.id);
  if (error) return aviso('<b>No se pudo eliminar.</b> ' + escapar(error.message), 'error');
  paths.forEach((p) => firmas.delete(p));
  contenidoElegido = null;
  fichaContenido0();
  await cargarContenido();
}

async function cargarComentarios(id) {
  const ul = $('dCharla');
  if (!ul) return;
  const { data, error } = await sb.from('contenido_comentarios')
    .select('*').eq('contenido_id', id).order('created_at', { ascending: true });
  if (error) { ul.innerHTML = '<li class="ranks__empty">No se pudieron cargar los comentarios.</li>'; return; }
  ul.innerHTML = data.length ? data.map((c) => `<li>
      <span class="charla__quien">${escapar(c.autor || 'Alguien del equipo')}
        <span>${fechaCorta(c.created_at)}</span></span>
      <p>${escapar(c.texto)}</p></li>`).join('')
    : '<li class="ranks__empty">Sin comentarios todavía.</li>';
  ul.scrollTop = ul.scrollHeight;
}

async function comentar(id) {
  const input = $('dTexto');
  const texto = input.value.trim();
  if (!texto) return;
  input.disabled = true;
  const { error } = await sb.from('contenido_comentarios')
    .insert({ contenido_id: id, texto, autor: sesion?.user?.email || null });
  input.disabled = false;
  if (error) return aviso('<b>No se pudo comentar.</b> ' + escapar(error.message), 'error');
  input.value = '';
  input.focus();
  cargarComentarios(id);
}

/* =========================================================
   8. Resumen — la portada del panel
   Junta en una pantalla lo que ya vive en las otras secciones;
   cada bloque aparece sólo si la base deja ver ese módulo.
   ========================================================= */
const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString();
const hoyISO = () => new Date().toISOString().slice(0, 10);

$('atajos').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'recargarResumen') cargarResumen();
  else if (b.dataset.ir) { irA(b.dataset.ir); if (b.dataset.luego) setTimeout(() => $(b.dataset.luego)?.click(), 350); }
});

async function cargarResumen() {
  const nombre = (sesion?.user?.email || '').split('@')[0].replace(/[._-]+/g, ' ');
  $('saludo').textContent = nombre
    ? `Hola, ${nombre.charAt(0).toUpperCase() + nombre.slice(1)}`
    : 'Resumen';
  $('hoyFecha').textContent = new Date().toLocaleDateString('es-MX',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  $('atajos').innerHTML =
    (permisos.contactos ? '<button class="abtn abtn--ghost" type="button" data-ir="contactos" data-luego="nuevoContacto">Nuevo contacto</button>' : '') +
    (permisos.contenido ? '<button class="abtn abtn--ghost" type="button" data-ir="contenido" data-luego="nuevoContenido">Subir diseño</button>' : '') +
    (permisos.llamadas ? '<button class="abtn abtn--primary" type="button" data-ir="llamadas">Llamar</button>' : '') +
    '<button class="abtn abtn--ghost" type="button" id="recargarResumen">Actualizar</button>';

  $('resumenKpis').innerHTML = '<article class="kpi"><p class="kpi__label">Cargando…</p><p class="kpi__value">—</p></article>';
  $('resumenBloques').innerHTML = '';

  const hace7 = diasAtras(7);
  const nada = { data: null, count: null };
  const [stats, llamadas7, ultimasLlam, prosp7, ultimosCont, porAprobar, agenda] = await Promise.all([
    permisos.metricas  ? sb.rpc('moya_stats') : nada,
    permisos.llamadas  ? sb.from('llamadas').select('id', { count: 'exact', head: true }).gte('created_at', hace7) : nada,
    permisos.llamadas  ? sb.from('llamadas').select('id,created_at,direccion,estado,numero,duracion_seg,ia_estado,contactos(nombre)')
                           .order('created_at', { ascending: false }).limit(5) : nada,
    permisos.contactos ? sb.from('contactos').select('id', { count: 'exact', head: true }).gte('created_at', hace7) : nada,
    permisos.contactos ? sb.from('contactos').select('id,nombre,empresa,estado,created_at')
                           .order('created_at', { ascending: false }).limit(5) : nada,
    permisos.contenido ? sb.from('contenido').select('id', { count: 'exact', head: true }).eq('estado', 'por_aprobar') : nada,
    permisos.contenido ? sb.from('contenido').select('id,titulo,red,tipo,estado,fecha_publicacion')
                           .gte('fecha_publicacion', hoyISO()).order('fecha_publicacion', { ascending: true }).limit(5) : nada
  ]);

  /* ---- indicadores ---- */
  const t = stats.data?.totales || {};
  const tarjetas = [];
  if (permisos.metricas) tarjetas.push(['Visitas hoy', nf.format(t.hoy || 0), 'Del sitio público']);
  if (permisos.llamadas) tarjetas.push(['Llamadas · 7 días', nf.format(llamadas7.count || 0), 'Entrantes y salientes']);
  if (permisos.contactos) tarjetas.push(['Contactos nuevos · 7 días', nf.format(prosp7.count || 0), 'Altas en la cartera']);
  if (permisos.contenido) tarjetas.push(['Diseños por aprobar', nf.format(porAprobar.count || 0), 'Esperan tu visto bueno']);
  $('resumenKpis').innerHTML = tarjetas.map(([l, v, p]) =>
    `<article class="kpi"><p class="kpi__label">${l}</p><p class="kpi__value">${v}</p>
     <p class="kpi__delta">${p}</p></article>`).join('');

  /* ---- bloques ---- */
  const bloques = [];

  if (permisos.llamadas) {
    const filas = ultimasLlam.data || [];
    bloques.push(caja('Últimas llamadas', 'llamadas', filas.length
      ? filas.map((l) => {
          const [txt, cl] = ESTADOS[l.estado] || [l.estado, 'av'];
          return linea(
            `${escapar(l.contactos?.nombre || l.numero || 'Desconocido')}`,
            `${l.direccion === 'entrante' ? 'Entrante' : 'Saliente'} · ${fechaCorta(l.created_at)} · ${duracion(l.duracion_seg)}`,
            `<span class="pill pill--${cl}">${txt}</span>${l.ia_estado === 'listo' ? '<span class="pill pill--ia">IA</span>' : ''}`);
        }).join('')
      : vacio('Todavía no hay llamadas.')));
  }

  if (permisos.contenido) {
    const filas = agenda.data || [];
    bloques.push(caja('Próximas publicaciones', 'contenido', filas.length
      ? filas.map((d) => {
          const [txt, cl] = D_ESTADOS[d.estado] || [d.estado, ''];
          return linea(escapar(d.titulo),
            `${D_REDES[d.red] || d.red} · ${D_TIPOS[d.tipo] || d.tipo}` +
              (d.fecha_publicacion ? ' · ' + diaCorto(d.fecha_publicacion) : ''),
            `<span class="pill pill--${cl}">${txt}</span>`);
        }).join('')
      : vacio('No hay nada programado de hoy en adelante.')));
  }

  if (permisos.contactos) {
    const filas = ultimosCont.data || [];
    bloques.push(caja('Contactos recientes', 'contactos', filas.length
      ? filas.map((c) => {
          const [txt, cl] = C_ESTADOS[c.estado] || [c.estado, ''];
          return linea(escapar(c.nombre || 'Sin nombre'),
            `${c.empresa ? escapar(c.empresa) + ' · ' : ''}alta ${fechaCorta(c.created_at)}`,
            `<span class="pill ${cl ? 'pill--' + cl : ''}">${txt}</span>`);
        }).join('')
      : vacio('Todavía no hay contactos.')));
  }

  if (permisos.metricas) {
    const serie = (stats.data?.serie || []).slice(-30);
    bloques.push(caja('Visitas · 30 días', 'metricas',
      serie.some((d) => d.visitas > 0)
        ? `<div class="chispa">${chispa(serie)}</div>
           <p class="chispa__pie">${nf.format(t.dias30 || 0)} visitas en 30 días ·
             ${nf.format(t.sesiones30 || 0)} visitantes</p>`
        : vacio('Sin visitas registradas todavía.')));
  }

  $('resumenBloques').innerHTML = bloques.join('');
  $('resumenBloques').querySelectorAll('[data-ir]').forEach((b) =>
    b.addEventListener('click', () => irA(b.dataset.ir)));
  $('resumenPie').textContent = 'Todo lo de esta pantalla sale de las demás secciones; se actualiza al abrirla.';
}

const caja = (titulo, ir, cuerpo) => `<section class="panel">
  <header class="panel__head">
    <h2 class="panel__title">${titulo}</h2>
    <button class="abtn abtn--ghost abtn--sm" type="button" data-ir="${ir}">Ver todo</button>
  </header>${cuerpo}</section>`;
const linea = (titulo, sub, extra) => `<div class="renglon">
  <div class="renglon__txt"><b>${titulo}</b><span>${sub}</span></div>
  <div class="renglon__pills">${extra || ''}</div></div>`;
const vacio = (txt) => `<p class="renglon__vacio">${txt}</p>`;

/* Chispa: la misma rejilla de la gráfica grande, sin ejes ni etiquetas. */
function chispa(serie) {
  const W = 320, H = 68;
  const top = Math.max(1, ...serie.map((p) => p.visitas));
  const band = W / serie.length;
  const bw = Math.min(10, Math.max(2, band - 2));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas de los últimos 30 días">` +
    serie.map((p, i) => {
      const h = p.visitas > 0 ? Math.max(2, (p.visitas / top) * (H - 4)) : 0;
      if (!h) return '';
      const x = i * band + (band - bw) / 2;
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}"
        height="${h.toFixed(1)}" rx="${Math.min(3, bw / 2)}"/>`;
    }).join('') + '</svg>';
}

/* =========================================================
   9. Redes — Social Media Autopilot de DGP
   El widget oficial se monta con un par cliente/clave que
   emite DGP. No vive en el repositorio: se guarda en
   integraciones y sólo lo lee quien entra al panel.
   ========================================================= */
const AUTOPILOT_JS = 'https://adv.dgp-link.com/autopilot.js';
let redesMontado = false;

async function cargarRedes() {
  if (redesMontado) return;
  const host = $('autopilot');
  host.innerHTML = '<div class="panel"><p class="detalle__vacio">Cargando…</p></div>';

  const { data, error } = await sb.rpc('autopilot_enlace');
  const cliente = data?.autopilot_cliente, clave = data?.autopilot_clave;

  if (error || !cliente || !clave) {
    host.innerHTML = `<section class="panel pendiente">
      <h2 class="panel__title">Todavía no está activado</h2>
      <p>El Social Media Autopilot lo enciende DGP Global Group. Cuando el plan esté
         contratado, DGP entrega dos datos y la sección aparece sola aquí, sin tocar el sitio.</p>
      <ol class="pendiente__pasos">
        <li>DGP crea la cuenta de Autopilot y conecta la página de Facebook y el Instagram.</li>
        <li>Se guardan <code>autopilot_cliente</code> y <code>autopilot_clave</code>
            en la tabla <code>integraciones</code> de Supabase.</li>
        <li>Al volver a entrar, aquí se ve el calendario, lo publicado y el botón de pausa.</li>
      </ol>
      <p class="pendiente__pie">Mientras tanto, los diseños se cargan en
         <b>Contenido</b> y desde ahí pasan al plan.</p>
    </section>`;
    return;
  }

  const caja = document.createElement('div');
  caja.id = 'dgp-autopilot';
  caja.dataset.cliente = cliente;
  caja.dataset.clave = clave;
  caja.dataset.lang = 'es';
  host.innerHTML = '';
  host.appendChild(caja);

  const s = document.createElement('script');
  s.src = AUTOPILOT_JS;
  s.defer = true;
  s.onerror = () => {
    host.innerHTML = '<section class="panel pendiente"><h2 class="panel__title">No se pudo cargar</h2>' +
      '<p>El widget de DGP no respondió. Vuelve a intentarlo en un rato.</p></section>';
    redesMontado = false;
  };
  document.head.appendChild(s);
  redesMontado = true;
}

arranque();
