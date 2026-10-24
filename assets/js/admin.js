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
const permisos = { metricas: false, llamadas: false };
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
  const [m, l] = await Promise.all([
    sb.rpc('puede', { modulo: 'metricas' }),
    sb.rpc('puede', { modulo: 'llamadas' })
  ]);
  permisos.metricas = m.data === true;
  permisos.llamadas = l.data === true;

  if (!permisos.metricas && !permisos.llamadas) {
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
  const primera = permisos.metricas ? 'metricas' : 'llamadas';
  irA(primera);
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
  $('vista-metricas').hidden = vista !== 'metricas';
  $('vista-llamadas').hidden = vista !== 'llamadas';
  aviso('');
  if (vista === 'metricas') cargarMetricas();
  if (vista === 'llamadas') { cargarLlamadas(); comprobarLinea(); }
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
    $('abrirMarcador').disabled = true;
    return null;
  }
  lineaOk = true;
  el.innerHTML = `<span class="pill pill--ok">Línea conectada</span> ${escapar(data.numero || '')}`;
  $('abrirMarcador').disabled = false;
  return data;
}

$('abrirMarcador').addEventListener('click', () => {
  const m = $('marcador');
  m.hidden = !m.hidden;
  if (!m.hidden) $('numeroLlamar').focus();
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
        $('btnColgar').hidden = true;
        setTimeout(cargarLlamadas, 4000);   // da tiempo a que Twilio avise el fin
      });
    } else {
      device.updateToken(datos.token);
    }
    conexion = await device.connect({ params: { To: numero, llamada: fila.id } });
    est.textContent = 'Llamando a ' + numero + '…';
    $('btnColgar').hidden = false;
  } catch (e) {
    est.textContent = e.message;
  }
});

$('btnColgar').addEventListener('click', () => {
  if (device) device.disconnectAll();
  $('btnColgar').hidden = true;
});

arranque();
