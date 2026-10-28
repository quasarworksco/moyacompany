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
const VISTAS = ['resumen', ...MODULOS, 'redes', 'ajustes'];
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
  const [respuestas, admin] = await Promise.all([
    Promise.all(MODULOS.map((m) => sb.rpc('puede', { modulo: m }))), sb.rpc('es_admin')]);
  MODULOS.forEach((m, i) => { permisos[m] = respuestas[i].data === true; });
  permisos.ajustes = admin.data === true;   // las claves sólo las toca el rol admin
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
  $('quienMovil').textContent = s.user.email;

  document.querySelectorAll('.tab[data-vista], .mas__item[data-vista]').forEach((t) => {
    t.hidden = !permisos[t.dataset.vista];
  });
  irA(VISTAS.find((v) => permisos[v]));
  if (permisos.llamadas) iniciarLinea().catch(() => null);   // para que suenen las entrantes
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

const salir = async () => { await sb.auth.signOut(); location.reload(); };
$('logout').addEventListener('click', salir);
$('logoutMovil').addEventListener('click', salir);

/* ---------- 2. Navegación ---------- */
const EXTRAS = ['metricas', 'redes', 'ajustes'];   // en el móvil van en «Más»
function irA(vista) {
  cerrarHoja();
  cerrarMas();
  document.querySelectorAll('.tab[data-vista]').forEach((t) => t.classList.toggle('is-on', t.dataset.vista === vista));
  $('btnMas').classList.toggle('is-on', EXTRAS.includes(vista));
  if (esMovil()) window.scrollTo(0, 0);
  VISTAS.forEach((v) => { $('vista-' + v).hidden = v !== vista; });
  aviso('');
  if (vista === 'resumen')   cargarResumen();
  if (vista === 'metricas')  cargarMetricas();
  if (vista === 'llamadas')  { cargarLlamadas(); cargarSms(); iniciarLinea().catch(() => null); }
  if (vista === 'contactos') cargarContactos();
  if (vista === 'contenido') cargarContenido();
  if (vista === 'redes')     cargarRedes();
  if (vista === 'ajustes')   cargarAjustes();
}
$('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  if (t.id === 'btnMas') abrirMas();
  else irA(t.dataset.vista);
});

/* ---------- 2b. Móvil como app ----------
   Menú «Más» con lo que no cabe en la barra de abajo, y el detalle de
   llamadas, SMS, contactos y diseños a pantalla completa con «Volver».
   El botón atrás del teléfono también cierra el detalle. */
const esMovil = () => matchMedia('(max-width:700px)').matches;

function abrirMas() {
  $('menuMas').hidden = false;
  $('btnMas').setAttribute('aria-expanded', 'true');
}
function cerrarMas() {
  $('menuMas').hidden = true;
  $('btnMas').setAttribute('aria-expanded', 'false');
}
$('menuMas').addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar-mas]')) return cerrarMas();
  const item = e.target.closest('.mas__item[data-vista]');
  if (item) irA(item.dataset.vista);
});

const HOJAS = ['detalle', 'fichaContacto', 'fichaContenido'];
let hojaEnHistoria = false;
function abrirHoja(el) {
  HOJAS.forEach((id) => { if ($(id) !== el) $(id).classList.remove('is-abierta'); });
  el.classList.add('is-abierta');
  if (!esMovil()) return;
  el.scrollTop = 0;
  $('hojaBarra').hidden = false;
  if (!hojaEnHistoria) { history.pushState({ hoja: true }, ''); hojaEnHistoria = true; }
}
function cerrarHoja() {
  HOJAS.forEach((id) => $(id).classList.remove('is-abierta'));
  $('hojaBarra').hidden = true;
  if (hojaEnHistoria) { hojaEnHistoria = false; history.back(); }
}
$('hojaVolver').addEventListener('click', cerrarHoja);
window.addEventListener('popstate', () => {
  if (!hojaEnHistoria) return;
  hojaEnHistoria = false;           // el atrás del teléfono ya sacó la entrada
  cerrarHoja();
});
// La hoja se abre sola cuando el detalle se llena, y se cierra cuando vuelve a quedar vacío.
HOJAS.forEach((id) => new MutationObserver(() => {
  const el = $(id);
  if (el.querySelector(':scope > .detalle__vacio')) { if (el.classList.contains('is-abierta')) cerrarHoja(); }
  else abrirHoja(el);
}).observe($(id), { childList: true }));

/* Llamadas en el móvil: Teclado o Recientes, como el teléfono. */
function modoLlamadas(modo) {
  document.querySelectorAll('#modoLlamadas .segmento').forEach((b) => {
    const on = b.dataset.modo === modo;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('llamadasCuerpo').classList.toggle('ver-marcador', modo === 'marcador');
  $('llamadasCuerpo').classList.toggle('ver-bandeja', modo === 'bandeja');
}
$('modoLlamadas').addEventListener('click', (e) => {
  const b = e.target.closest('.segmento');
  if (b) modoLlamadas(b.dataset.modo);
});

/* ---------- 3. Métricas ---------- */
async function cargarMetricas() {
  $('stamp').textContent = 'Cargando…';
  const { data, error } = await sb.rpc('moya_stats');
  if (error || !data) {
    $('stamp').textContent = '—';
    return aviso('<b>No se pudieron cargar las métricas.</b> ' +
      escapar(error ? error.message : 'Tu cuenta no tiene acceso a este módulo.'), 'error');
  }
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
  llamadas = (data || []).filter((l) => !enEspera.has(l.id));
  pintarLista();
}
$('recargarLlamadas').addEventListener('click', () => { cargarLlamadas(); cargarSms(); });
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
  if (smsElegido) { smsElegido = null; pintarSms(); }
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
    <div class="det__acciones det__acciones--fila">
      ${permisos.contactos ? (l.contacto_id
        ? '<button class="abtn abtn--ghost abtn--sm" type="button" id="verFicha">Ver su ficha</button>'
        : (l.numero ? '<button class="abtn abtn--primary abtn--sm" type="button" id="crearDeLlamada">Crear contacto con este número</button>' : '')) : ''}
      ${['iniciando', 'sonando', 'en_curso'].includes(l.estado) ? ''
        : '<button class="abtn abtn--ghost abtn--sm det__eliminar" type="button" id="llamadaEliminar">Eliminar</button>'}
    </div>
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
      ${bloque('Tareas que detectó la IA', ia.tareas?.length ? '<ul class="det__lista det__lista--tareas">' +
        ia.tareas.map((t, i) => `<li><span>${escapar(t.titulo)}
          <span class="det__dias">${t.en_dias === 0 ? 'hoy' : 'en ' + t.en_dias + ' día(s)'}</span></span>
          ${permisos.contactos ? `<button class="abtn abtn--ghost abtn--sm" type="button" data-tarea="${i}">Guardar</button>` : ''}</li>`).join('') + '</ul>' : '')}
      ${bloque('Transcripción', l.transcripcion ? `<details class="det__trans"><summary>Ver transcripción completa</summary><p>${escapar(l.transcripcion)}</p></details>` : '')}
    </div>`;
  alDetalle();

  if (l.grabacion_path) {
    const { data, error } = await sb.storage.from('llamadas').createSignedUrl(l.grabacion_path, 3600);
    $('detAudio').innerHTML = error || !data
      ? '<p class="det__nada">No se pudo abrir la grabación.</p>'
      : `<audio controls preload="none" src="${data.signedUrl}"></audio>`;
  }
  const btn = $('reprocesar');
  if (btn) btn.addEventListener('click', () => reprocesar(l.id, btn));

  const ficha = $('verFicha');
  if (ficha) ficha.addEventListener('click', () => { irA('contactos'); setTimeout(() => verContacto(l.contacto_id), 250); });

  const crear = $('crearDeLlamada');
  if (crear) crear.addEventListener('click', () => contactoDesdeLlamada(l, crear));
  const quitar = $('llamadaEliminar');
  if (quitar) quitar.addEventListener('click', () => eliminarLlamada(l));

  // Las tareas que saca la IA no sirven de nada si sólo se leen.
  det.querySelectorAll('[data-tarea]').forEach((b) =>
    b.addEventListener('click', () => guardarTareaIA(l, ia.tareas[Number(b.dataset.tarea)], b)));
}

/* Un número desconocido que llamó es un prospecto: la ficha se crea con lo
   que la IA ya entendió de la conversación, no en blanco. */
async function contactoDesdeLlamada(l, btn) {
  btn.disabled = true; btn.textContent = 'Creando…';
  const ia = l.ia || {};
  const { data, error } = await sb.from('contactos').insert({
    nombre: ia.nombre || l.numero,
    empresa: ia.empresa || null,
    telefono: l.numero,
    origen: 'llamada',
    estado: ia.tipo === 'cliente' ? 'cliente' : 'prospecto',
    etiquetas: ia.servicio ? [ia.servicio] : [],
    notas: ia.resumen || null
  }).select('id').single();
  btn.disabled = false; btn.textContent = 'Crear contacto con este número';
  if (error) return aviso('<b>No se pudo crear el contacto.</b> ' + escapar(error.message), 'error');

  await sb.from('llamadas').update({ contacto_id: data.id }).eq('id', l.id);
  await cargarLlamadas();
  irA('contactos');
  setTimeout(() => verContacto(data.id), 250);
}

async function guardarTareaIA(l, tarea, btn) {
  if (!tarea) return;
  btn.disabled = true;
  const dias = Number(tarea.en_dias);
  const vence = Number.isFinite(dias)
    ? new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10) : null;
  const { error } = await sb.from('tareas').insert({
    titulo: tarea.titulo, vence, contacto_id: l.contacto_id || null, llamada_id: l.id
  });
  btn.textContent = error ? 'No se pudo' : 'Guardada';
  if (error) { btn.disabled = false; aviso('<b>No se pudo guardar.</b> ' + escapar(error.message), 'error'); }
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
/* Cuando se marca desde la ficha de un contacto, la llamada nace vinculada. */
let paraLlamar = null;

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

/* El SDK de voz vive en el propio sitio: Twilio no publica la versión 2 en un CDN. */
const SDK_TWILIO = '../assets/js/vendor/twilio-voice-2.18.5.min.js';
async function cargarSdkTwilio() {
  if (window.Twilio?.Device) return;
  await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = SDK_TWILIO;
    s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el marcador.'));
    document.head.appendChild(s);
  });
}

/* La línea se abre al entrar al panel y queda registrada mientras siga
   abierto: así suenan aquí las llamadas que entran al número de Moya. */
let abriendo = null;
function iniciarLinea() {
  if (!abriendo) abriendo = abrirLinea().finally(() => { abriendo = null; });
  return abriendo;
}
async function abrirLinea() {
  const datos = await comprobarLinea();
  if (!datos) return null;
  await cargarSdkTwilio();
  if (device) { device.updateToken(datos.token); return datos; }
  device = new window.Twilio.Device(datos.token, { codecPreferences: ['opus', 'pcmu'], closeProtection: true });
  device.on('error', (e) => { $('marcadorEstado').textContent = 'Error de la línea: ' + e.message; });
  device.on('tokenWillExpire', () => { iniciarLinea().catch(() => null); });
  device.on('incoming', llamadaEntrante);
  await device.register();
  return datos;
}

/* ---------- Panel de llamada en curso ----------
   Flota abajo en cualquier sección: suena una entrante, se marca una
   saliente o se está hablando. Muestra quién es, el tiempo y los botones. */
const PANEL_BTNS = ['btnContestar', 'btnBuzon', 'btnSilenciar', 'btnColgarPanel'];
let reloj = null;
function panelLlamada(quien, estado, botones, sonando = false) {
  $('plQuien').textContent = quien;
  $('plEstado').textContent = estado;
  PANEL_BTNS.forEach((b) => { $(b).hidden = !botones.includes(b); });
  $('panelLlamada').classList.toggle('is-sonando', sonando);
  $('panelLlamada').hidden = false;
}
function cerrarPanel() {
  clearInterval(reloj);
  reloj = null;
  $('panelLlamada').hidden = true;
  $('btnSilenciar').setAttribute('aria-pressed', 'false');
  $('btnSilenciar').textContent = 'Silenciar';
}

/* El nombre del contacto si el número está en la cartera; si no, el número. */
async function nombreDe(numero) {
  const d = soloDigitos(numero).slice(-10);
  if (d.length !== 10 || !permisos.contactos) return null;
  const { data } = await sb.from('contactos').select('nombre,empresa').eq('tel_digitos', d).limit(1);
  const c = (data || [])[0];
  return c?.nombre ? c.nombre + (c.empresa ? ' (' + c.empresa + ')' : '') : null;
}

/* Una llamada, saliente o entrante, avisa en la llamada misma cuándo se
   conecta y cuándo termina. */
function seguirLlamada(call, quien) {
  conexion = call;
  const fin = () => {
    if (conexion !== call) return;
    conexion = null;
    paraLlamar = null;
    cerrarPanel();
    $('marcadorEstado').textContent = 'Llamada terminada.';
    $('btnColgar').hidden = true;
    $('btnLlamar').hidden = false;
    setTimeout(() => { cargarLlamadas(); }, 4000);   // da tiempo a que Twilio avise el fin
  };
  call.on('accept', () => {
    const desde = Date.now();
    const tic = () => {
      const t = Math.floor((Date.now() - desde) / 1000);
      $('plEstado').textContent = 'En llamada · ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    };
    panelLlamada($('plQuien').textContent, 'En llamada · 0:00', ['btnSilenciar', 'btnColgarPanel']);
    clearInterval(reloj);
    reloj = setInterval(tic, 1000);
    $('marcadorEstado').textContent = 'En llamada.';
  });
  ['disconnect', 'cancel', 'reject', 'error'].forEach((ev) => call.on(ev, fin));
  panelLlamada(quien, 'Llamando…', ['btnColgarPanel']);
}

/* ---------- Llamada entrante ---------- */
let entrante = null;
async function llamadaEntrante(call) {
  if (conexion) { call.ignore(); return; }   // ya en otra llamada: sigue sonando a los demás o va al buzón
  entrante = call;
  const desde = call.parameters?.From || '';
  panelLlamada(desde, 'Llamada entrante', ['btnContestar', 'btnBuzon'], true);
  const termina = () => { if (entrante === call) { entrante = null; if (conexion !== call) cerrarPanel(); } };
  ['cancel', 'disconnect', 'reject'].forEach((ev) => call.on(ev, termina));
  const nombre = await nombreDe(desde);
  if (nombre && entrante === call) $('plQuien').textContent = nombre + ' · ' + desde;
}

$('btnContestar').addEventListener('click', () => {
  if (!entrante) return;
  const call = entrante;
  seguirLlamada(call, $('plQuien').textContent);
  call.accept();
});
// Rechazar manda la llamada al buzón de voz
$('btnBuzon').addEventListener('click', () => { if (entrante) entrante.reject(); });
$('btnColgarPanel').addEventListener('click', () => {
  if (conexion) conexion.disconnect();
  else if (device) device.disconnectAll();
});
$('btnSilenciar').addEventListener('click', () => {
  if (!conexion) return;
  const mudo = !conexion.isMuted();
  conexion.mute(mudo);
  $('btnSilenciar').setAttribute('aria-pressed', String(mudo));
  $('btnSilenciar').textContent = mudo ? 'Activar micrófono' : 'Silenciar';
});

$('btnLlamar').addEventListener('click', async () => {
  const est = $('marcadorEstado');
  const numero = $('numeroLlamar').value.trim();
  if (!numero) { est.textContent = 'Escribe un número.'; return; }
  est.textContent = 'Preparando la línea…';
  try {
    const datos = await iniciarLinea();
    if (!datos) { est.textContent = 'La línea no está conectada.'; return; }

    const mismo = paraLlamar && soloDigitos(paraLlamar.numero) === soloDigitos(numero);
    const { data: fila, error } = await sb.from('llamadas')
      .insert({ direccion: 'saliente', canal: 'telefono', numero, estado: 'iniciando', con_aviso: false,
                contacto_id: mismo ? paraLlamar.id : null })
      .select('id').single();
    if (error) { est.textContent = 'No se pudo registrar la llamada: ' + error.message; return; }

    const quien = (mismo && paraLlamar.nombre) || await nombreDe(numero);
    seguirLlamada(await device.connect({ params: { To: numero, llamada: fila.id } }),
                  quien ? quien + ' · ' + numero : numero);
    est.textContent = 'Llamando a ' + numero + '…';
    $('btnColgar').hidden = false;
    $('btnLlamar').hidden = true;
  } catch (e) {
    est.textContent = e.message;
  }
});

$('btnColgar').addEventListener('click', () => {
  if (conexion) conexion.disconnect();
  else if (device) device.disconnectAll();
});


/* ---------- 5b. SMS recibidos ----------
   Llegan al número de Moya y la función los guarda como mensajes del
   contacto. Aquí se leen, se marcan como leídos y se devuelve la llamada. */
let smsLista = [], smsElegido = null;
const numeroDeSms = (m) => m.contactos?.telefono || String(m.asunto || '').replace(/^SMS de\s*/, '');

async function cargarSms(callado = false) {
  const ul = $('listaSms');
  if (!callado) ul.innerHTML = '<li class="lista__cargando">Cargando…</li>';
  const { data, error } = await sb.from('mensajes')
    .select('id,created_at,asunto,texto,leido,contacto_id,contactos(nombre,empresa,telefono)')
    .eq('canal', 'sms').order('created_at', { ascending: false }).limit(100);
  if (error) { if (!callado) ul.innerHTML = '<li class="lista__vacio">No se pudieron cargar los SMS.</li>'; return; }
  smsLista = (data || []).filter((m) => !enEspera.has(m.id));
  pintarSms();
}

function pintarSms() {
  const ul = $('listaSms');
  const nuevos = smsLista.filter((m) => !m.leido).length;
  ['smsNuevos', 'smsNuevosModo'].forEach((id) => { $(id).textContent = nuevos; $(id).hidden = !nuevos; });
  if (!smsLista.length) {
    ul.innerHTML = '<li class="lista__vacio">Todavía no llegan SMS al número de Moya.</li>';
    return;
  }
  ul.innerHTML = smsLista.map((m) => `<li><button class="fila ${smsElegido === m.id ? 'is-on' : ''} ${m.leido ? '' : 'is-nuevo'}"
      type="button" data-id="${m.id}">
      <span class="fila__cuerpo">
        <span class="fila__top"><b>${escapar(m.contactos?.nombre || numeroDeSms(m))}</b><span class="fila__hora">${fechaCorta(m.created_at)}</span></span>
        <span class="fila__bajo"><span class="fila__txt">${escapar(m.texto)}</span></span>
      </span></button></li>`).join('');
  ul.querySelectorAll('.fila').forEach((b) => b.addEventListener('click', () => verSms(b.dataset.id)));
}

async function verSms(id) {
  const m = smsLista.find((x) => x.id === id);
  if (!m) return;
  smsElegido = id;
  elegida = null;
  pintarLista();
  const numero = numeroDeSms(m);
  $('detalle').innerHTML = `
    <header class="det__head">
      <div>
        <h2 class="det__titulo">${escapar(m.contactos?.nombre || numero)}</h2>
        <p class="det__sub">SMS · ${fechaCorta(m.created_at)} · ${escapar(numero)}
           ${m.contactos?.empresa ? ' · ' + escapar(m.contactos.empresa) : ''}</p>
      </div>
      <span class="pill pill--ia">SMS</span>
    </header>
    <div class="det__acciones det__acciones--fila">
      <button class="abtn abtn--primary abtn--sm" type="button" id="smsLlamar">Llamar</button>
      ${permisos.contactos && m.contacto_id ? '<button class="abtn abtn--ghost abtn--sm" type="button" id="smsFicha">Ver su ficha</button>' : ''}
      <button class="abtn abtn--ghost abtn--sm det__eliminar" type="button" id="smsEliminar">Eliminar</button>
    </div>
    <p class="sms__texto">${escapar(m.texto)}</p>`;

  $('smsLlamar').addEventListener('click', () => {
    paraLlamar = m.contacto_id ? { id: m.contacto_id, numero, nombre: m.contactos?.nombre } : null;
    $('numeroLlamar').value = numero;
    $('marcadorEstado').textContent = 'Listo para llamar a ' + (m.contactos?.nombre || numero) + '.';
    cerrarHoja();
    modoLlamadas('marcador');
    $('marcador').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  const ficha = $('smsFicha');
  if (ficha) ficha.addEventListener('click', () => { irA('contactos'); setTimeout(() => verContacto(m.contacto_id), 250); });
  $('smsEliminar').addEventListener('click', () => eliminarSms(m));
  alDetalle();

  if (!m.leido) {
    m.leido = true;
    pintarSms();
    await sb.from('mensajes').update({ leido: true }).eq('id', m.id);
  }
}


/* ---------- Bandeja: llamadas y SMS en pestañas ---------- */
function verBandeja(cual) {
  document.querySelectorAll('#segBandeja .segmento').forEach((b) => {
    const on = b.dataset.bandeja === cual;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('listaLlamadas').hidden = cual !== 'llamadas';
  $('filtroLlamadas').hidden = cual !== 'llamadas';
  $('listaSms').hidden = cual !== 'sms';
}
$('segBandeja').addEventListener('click', (e) => {
  const b = e.target.closest('.segmento');
  if (b) verBandeja(b.dataset.bandeja);
});
// En tablet el detalle queda debajo de la lista: se lleva la vista hasta él (en el móvil es una hoja).
const alDetalle = () => {
  if (matchMedia('(min-width:701px) and (max-width:1000px)').matches) $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ---------- Eliminar con deshacer ----------
   Lo eliminado sale de la lista en el acto, pero se borra de verdad cuando
   acaba la cuenta. Si se elimina otra cosa antes, la anterior se confirma. */
const DESHACER_SEG = 6;
let pendiente = null;
const enEspera = new Set();   // ids que esperan la cuenta: al recargar no reaparecen
function eliminarConDeshacer(texto, quitar, restaurar, borrar) {
  confirmarPendiente();
  quitar();
  let quedan = DESHACER_SEG;
  $('deshacerTxt').textContent = texto;
  $('deshacerSeg').textContent = quedan;
  $('deshacer').hidden = false;
  const p = { restaurar, borrar };
  p.tic = setInterval(() => {
    quedan -= 1;
    $('deshacerSeg').textContent = quedan;
    if (quedan <= 0) confirmarPendiente();
  }, 1000);
  pendiente = p;
}
async function confirmarPendiente() {
  const p = pendiente;
  if (!p) return;
  pendiente = null;
  clearInterval(p.tic);
  $('deshacer').hidden = true;
  try { await p.borrar(); }
  catch (e) { p.restaurar(); aviso('<b>No se pudo eliminar.</b> ' + escapar(e.message), 'error'); }
}
$('btnDeshacer').addEventListener('click', () => {
  const p = pendiente;
  if (!p) return;
  pendiente = null;
  clearInterval(p.tic);
  $('deshacer').hidden = true;
  p.restaurar();
});
// Si se cierra el panel durante la cuenta, lo eliminado se borra igual.
window.addEventListener('pagehide', () => { confirmarPendiente(); });

const detalleVacio = () => {
  $('detalle').innerHTML = '<p class="detalle__vacio">Elige una llamada o un SMS para ver el detalle.</p>';
};
// delete() sin filas no da error cuando la base no lo permite: se comprueba
async function borrarFila(tabla, id) {
  const { data, error } = await sb.from(tabla).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('No tienes permiso para eliminarlo.');
}

function eliminarLlamada(l) {
  const i = llamadas.indexOf(l);
  eliminarConDeshacer('Llamada eliminada',
    () => { enEspera.add(l.id); llamadas.splice(i, 1); if (elegida === l.id) { elegida = null; detalleVacio(); } pintarLista(); },
    () => { enEspera.delete(l.id); if (!llamadas.includes(l)) llamadas.splice(Math.min(i, llamadas.length), 0, l); pintarLista(); },
    async () => {
      await borrarFila('llamadas', l.id);
      enEspera.delete(l.id);
      if (l.grabacion_path) await sb.storage.from('llamadas').remove([l.grabacion_path]);
    });
}
function eliminarSms(m) {
  const i = smsLista.indexOf(m);
  eliminarConDeshacer('SMS eliminado',
    () => { enEspera.add(m.id); smsLista.splice(i, 1); if (smsElegido === m.id) { smsElegido = null; detalleVacio(); } pintarSms(); },
    () => { enEspera.delete(m.id); if (!smsLista.includes(m)) smsLista.splice(Math.min(i, smsLista.length), 0, m); pintarSms(); },
    async () => { await borrarFila('mensajes', m.id); enEspera.delete(m.id); });
}
// Mientras la sección Llamadas esté abierta, los SMS nuevos aparecen solos.
setInterval(() => { if (!$('vista-llamadas').hidden && permisos.llamadas) cargarSms(true); }, 30000);

/* =========================================================
   6. Contactos, prospectos y postulantes
   ========================================================= */
const C_ESTADOS = {
  prospecto: ['Prospecto', 'av'], cliente: ['Cliente', 'ok'],
  pausado: ['Pausado', ''], perdido: ['Perdido', 'mal']
};
const P_ESTADOS = {
  nuevo: ['Nuevo', 'av'], revisado: ['Revisado', ''], entrevista: ['Entrevista', 'ia'],
  descartado: ['Descartado', 'mal'], contratado: ['Contratado', 'ok']
};
const C_ORIGENES = ['manual', 'formulario', 'llamada', 'sms', 'referido', 'redes', 'otro'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

let contactos = [], postulantes = [], contactoElegido = null, postulanteElegido = null;
let lado = 'cartera';

async function cargarContactos() {
  const ul = $('listaContactos');
  ul.innerHTML = '<li class="lista__cargando">Cargando…</li>';
  const [c, p] = await Promise.all([
    sb.from('contactos').select('*').order('updated_at', { ascending: false }).limit(500),
    sb.from('postulantes').select('*').order('created_at', { ascending: false }).limit(300)
  ]);
  if (c.error) { ul.innerHTML = ''; return aviso('<b>No se pudieron cargar los contactos.</b> ' + escapar(c.error.message), 'error'); }
  contactos = c.data || [];
  postulantes = p.data || [];
  resumenContactos();
  pintarContactos();
  if (lado === 'cartera' && contactoElegido && contactos.some((x) => x.id === contactoElegido)) verContacto(contactoElegido);
  if (lado === 'postulantes' && postulanteElegido && postulantes.some((x) => x.id === postulanteElegido)) verPostulante(postulanteElegido);
}
$('recargarContactos').addEventListener('click', cargarContactos);
$('filtroContactos').addEventListener('change', pintarContactos);
$('buscaContacto').addEventListener('input', pintarContactos);
$('nuevoContacto').addEventListener('click', () => {
  irALado('cartera');
  contactoElegido = null; pintarContactos(); fichaContacto(null);
});

$('segContactos').addEventListener('click', (e) => {
  const b = e.target.closest('.segmento');
  if (b) irALado(b.dataset.lado);
});
function irALado(nuevo) {
  lado = nuevo;
  document.querySelectorAll('#segContactos .segmento')
    .forEach((b) => b.classList.toggle('is-on', b.dataset.lado === lado));
  $('tituloLista').textContent = lado === 'cartera' ? 'Cartera' : 'Postulaciones';
  $('nuevoContacto').hidden = lado !== 'cartera';
  $('exportarContactos').textContent = lado === 'cartera' ? 'Exportar CSV' : 'Exportar CSV';
  const f = $('filtroContactos');
  f.innerHTML = lado === 'cartera'
    ? '<option value="">Todos</option>' + Object.entries(C_ESTADOS).map(([k, v]) => `<option value="${k}">${v[0]}s</option>`).join('')
    : '<option value="">Todas</option>' + Object.entries(P_ESTADOS).map(([k, v]) => `<option value="${k}">${v[0]}s</option>`).join('');
  $('buscaContacto').placeholder = lado === 'cartera'
    ? 'Buscar nombre, empresa, teléfono…' : 'Buscar nombre, correo, área…';
  pintarContactos();
  if (lado === 'cartera') fichaContacto0(); else fichaPostulante0();
}

function resumenContactos() {
  const cuenta = (e) => contactos.filter((c) => c.estado === e).length;
  const valor = contactos.filter((c) => c.estado === 'cliente')
    .reduce((a, c) => a + Number(c.valor_mensual || 0), 0);
  const poner = (k, v) => { const el = document.querySelector(`[data-c="${k}"]`); if (el) el.textContent = v; };
  poner('total', nf.format(contactos.length));
  poner('prospecto', nf.format(cuenta('prospecto')));
  poner('cliente', nf.format(cuenta('cliente')));
  poner('valor', money.format(valor));
  const nuevos = postulantes.filter((p) => p.estado === 'nuevo').length;
  $('contactosResumen').textContent =
    `${contactos.length} ficha(s) · ${postulantes.length} postulación(es)` +
    (nuevos ? ` · ${nuevos} sin revisar` : '');
  const seg = document.querySelector('#segContactos [data-lado="postulantes"]');
  if (seg) seg.innerHTML = 'Postulantes' + (nuevos ? ` <span class="bolita">${nuevos}</span>` : '');
}

function pintarContactos() {
  return lado === 'cartera' ? pintarCartera() : pintarPostulantes();
}

function pintarCartera() {
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

function pintarPostulantes() {
  const q = $('buscaContacto').value.trim().toLowerCase();
  const f = $('filtroContactos').value;
  const ul = $('listaContactos');
  const vis = postulantes.filter((p) => {
    if (f && p.estado !== f) return false;
    if (!q) return true;
    return [p.nombre, p.email, p.telefono, p.area, p.ingles]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
  if (!vis.length) {
    ul.innerHTML = `<li class="lista__vacio">${postulantes.length ? 'Ninguna postulación coincide.' : 'Todavía no hay postulaciones. Llegan del formulario «¿Quieres formar parte de nuestro equipo?».'}</li>`;
    return;
  }
  ul.innerHTML = vis.map((p) => {
    const [txt, cl] = P_ESTADOS[p.estado] || [p.estado, ''];
    return `<li><button class="fila ${postulanteElegido === p.id ? 'is-on' : ''}" type="button" data-id="${p.id}">
      <span class="fila__ini" aria-hidden="true">${escapar(inicial(p.nombre))}</span>
      <span class="fila__cuerpo">
        <span class="fila__top"><b>${escapar(p.nombre)}</b>
          <span class="pill ${cl ? 'pill--' + cl : ''}">${txt}</span></span>
        <span class="fila__bajo">${escapar(p.area || 'Sin área')} · ${fechaCorta(p.created_at)}</span>
      </span></button></li>`;
  }).join('');
  ul.querySelectorAll('.fila').forEach((b) =>
    b.addEventListener('click', () => verPostulante(b.dataset.id)));
}
const inicial = (s) => String(s || '').trim().charAt(0).toUpperCase() || '?';

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
        <div class="det__acciones">
          ${!nuevo && c.telefono && permisos.llamadas
            ? `<button class="abtn abtn--primary abtn--sm" type="button" id="cLlamar">Llamar</button>` : ''}
          ${!nuevo ? `<span class="pill pill--${(C_ESTADOS[c.estado] || ['', ''])[1]}">${(C_ESTADOS[c.estado] || [c.estado])[0]}</span>` : ''}
        </div>
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
    ${nuevo ? '' : '<div class="ficha__extra" id="cExtra"></div>'}`;

  $('formContacto').addEventListener('submit', (e) => { e.preventDefault(); guardarContacto(nuevo ? null : c.id); });
  if (nuevo) $('cCancelar').addEventListener('click', () => { contactoElegido = null; pintarContactos(); fichaContacto0(); });
  else {
    $('cBorrar').addEventListener('click', () => borrarContacto(c.id, c.nombre));
    const l = $('cLlamar');
    if (l) l.addEventListener('click', () => llamarA(c));
    detalleContacto(c.id);
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

/* Avisa, no bloquea: dos fichas con el mismo teléfono a veces son dos
   personas de la misma empresa, y eso lo sabe quien está mirando. */
function duplicados(fila, id) {
  const dig = soloDigitos(fila.telefono);
  const mail = (fila.email || '').toLowerCase();
  return contactos.filter((c) => c.id !== id &&
    ((dig && c.tel_digitos === dig) || (mail && (c.email || '').toLowerCase() === mail)));
}

async function guardarContacto(id) {
  const msg = $('cEstadoMsg'), btn = $('cGuardar');
  const fila = leerContacto();
  if (!fila.nombre) { msg.textContent = 'El nombre hace falta.'; $('cNombre').focus(); return; }

  const iguales = duplicados(fila, id);
  if (iguales.length && !btn.dataset.confirmado) {
    btn.dataset.confirmado = '1';
    msg.innerHTML = `<b>Ojo:</b> ya hay una ficha con ese teléfono o correo — ` +
      iguales.map((c) => escapar(c.nombre || 'sin nombre')).join(', ') +
      `. Toca «${btn.textContent}» otra vez si aun así quieres guardarla.`;
    return;
  }
  delete btn.dataset.confirmado;

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
  if (!confirm(`¿Eliminar a ${nombre || 'este contacto'}? Se van también sus mensajes y tareas. No se puede deshacer.`)) return;
  const { error } = await sb.from('contactos').delete().eq('id', id);
  if (error) return aviso('<b>No se pudo eliminar.</b> ' + escapar(error.message), 'error');
  contactoElegido = null;
  fichaContacto0();
  await cargarContactos();
}

/* Marcar desde la ficha: lleva a llamadas con el número puesto y deja
   anotado a quién se llama, para que la llamada nazca ya vinculada. */
function llamarA(c) {
  paraLlamar = { id: c.id, numero: c.telefono, nombre: c.nombre };
  irA('llamadas');
  modoLlamadas('marcador');
  setTimeout(() => {
    $('numeroLlamar').value = c.telefono || '';
    $('marcadorEstado').textContent = 'Listo para llamar a ' + (c.nombre || c.telefono) + '.';
    $('numeroLlamar').focus();
  }, 200);
}

/* ---------- lo que cuelga de la ficha: tareas y línea de tiempo ---------- */
async function detalleContacto(id) {
  const host = $('cExtra');
  if (!host) return;
  host.innerHTML = '<p class="ficha__cargando">Cargando historial…</p>';
  const [t, m, l] = await Promise.all([
    sb.from('tareas').select('*').eq('contacto_id', id).order('hecha').order('vence', { nullsFirst: false }),
    sb.from('mensajes').select('*').eq('contacto_id', id).order('created_at', { ascending: false }).limit(20),
    permisos.llamadas
      ? sb.from('llamadas').select('id,created_at,direccion,estado,duracion_seg').eq('contacto_id', id).order('created_at', { ascending: false }).limit(20)
      : { data: [] }
  ]);
  const tareas = t.data || [], mensajes = m.data || [], llams = l.data || [];

  const linea = [
    ...mensajes.map((x) => ({ cuando: x.created_at, tipo: 'mensaje', dato: x })),
    ...llams.map((x) => ({ cuando: x.created_at, tipo: 'llamada', dato: x }))
  ].sort((a, b) => new Date(b.cuando) - new Date(a.cuando));

  host.innerHTML = `
    <section class="bloque">
      <h3 class="ficha__h3">Seguimientos</h3>
      <ul class="tareas" id="cTareas">${tareas.length ? tareas.map(filaTarea).join('')
        : '<li class="ranks__empty">Sin seguimientos todavía.</li>'}</ul>
      <form class="tarea__alta" id="cNuevaTarea">
        <input id="cTareaTxt" maxlength="200" placeholder="Llamar a… / Enviar la propuesta…" />
        <input id="cTareaFecha" type="date" aria-label="Para cuándo" />
        <button class="abtn abtn--primary abtn--sm" type="submit">Agregar</button>
      </form>
    </section>

    <section class="bloque">
      <h3 class="ficha__h3">Actividad</h3>
      ${linea.length ? `<ol class="tiempo">${linea.map((x) => x.tipo === 'mensaje'
          ? `<li class="tiempo__it tiempo__it--msg">
               <span class="tiempo__cuando">${fechaCorta(x.cuando)}</span>
               <div><b>${escapar(x.dato.asunto || 'Mensaje desde el sitio')}</b>
                 <p>${escapar(x.dato.texto)}</p></div></li>`
          : `<li class="tiempo__it tiempo__it--tel">
               <span class="tiempo__cuando">${fechaCorta(x.cuando)}</span>
               <div><b>Llamada ${x.dato.direccion === 'entrante' ? 'entrante' : 'saliente'}</b>
                 <p>${(ESTADOS[x.dato.estado] || [x.dato.estado])[0]} · ${duracion(x.dato.duracion_seg)}</p></div></li>`
        ).join('')}</ol>`
        : '<p class="ranks__empty">Todavía no hay mensajes ni llamadas con este contacto.</p>'}
    </section>`;

  host.querySelectorAll('.tarea__check').forEach((b) =>
    b.addEventListener('change', () => marcarTarea(b.dataset.id, b.checked, id)));
  host.querySelectorAll('.tarea__x').forEach((b) =>
    b.addEventListener('click', () => borrarTarea(b.dataset.id, id)));
  $('cNuevaTarea').addEventListener('submit', (e) => { e.preventDefault(); nuevaTarea(id); });

  // Los mensajes dejan de estar "nuevos" cuando alguien abre la ficha.
  const sinLeer = mensajes.filter((x) => !x.leido).map((x) => x.id);
  if (sinLeer.length) await sb.from('mensajes').update({ leido: true }).in('id', sinLeer);
}

const vencida = (t) => !t.hecha && t.vence && t.vence < hoyISO();
function filaTarea(t) {
  return `<li class="tarea ${t.hecha ? 'is-hecha' : ''} ${vencida(t) ? 'is-tarde' : ''}">
    <label><input class="tarea__check" type="checkbox" data-id="${t.id}" ${t.hecha ? 'checked' : ''} />
      <span>${escapar(t.titulo)}</span></label>
    <span class="tarea__fecha">${t.vence ? diaCorto(t.vence) : ''}</span>
    <button class="tarea__x" type="button" data-id="${t.id}" aria-label="Quitar">×</button></li>`;
}

async function nuevaTarea(contactoId) {
  const txt = $('cTareaTxt').value.trim();
  if (!txt) return;
  const { error } = await sb.from('tareas')
    .insert({ titulo: txt, vence: $('cTareaFecha').value || null, contacto_id: contactoId });
  if (error) return aviso('<b>No se pudo crear el seguimiento.</b> ' + escapar(error.message), 'error');
  $('cTareaTxt').value = ''; $('cTareaFecha').value = '';
  detalleContacto(contactoId);
}
async function marcarTarea(id, hecha, contactoId) {
  await sb.from('tareas').update({ hecha, hecha_at: hecha ? new Date().toISOString() : null }).eq('id', id);
  if (contactoId) detalleContacto(contactoId);
}
async function borrarTarea(id, contactoId) {
  await sb.from('tareas').delete().eq('id', id);
  if (contactoId) detalleContacto(contactoId);
}

/* ---------- postulantes ---------- */
function verPostulante(id) {
  postulanteElegido = id;
  pintarContactos();
  fichaPostulante(postulantes.find((p) => p.id === id) || null);
}
function fichaPostulante0() {
  $('fichaContacto').innerHTML = '<p class="detalle__vacio">Elige una postulación para verla.</p>';
}
function fichaPostulante(p) {
  if (!p) return fichaPostulante0();
  const dato = (t, v) => v ? `<div><dt>${t}</dt><dd>${escapar(v)}</dd></div>` : '';
  $('fichaContacto').innerHTML = `
    <header class="det__head">
      <div>
        <h2 class="det__titulo">${escapar(p.nombre)}</h2>
        <p class="det__sub">Postuló el ${fechaCorta(p.created_at)}</p>
      </div>
      <span class="pill pill--${(P_ESTADOS[p.estado] || ['', ''])[1]}">${(P_ESTADOS[p.estado] || [p.estado])[0]}</span>
    </header>

    <div class="estados" id="pEstados" role="group" aria-label="Estado de la postulación">
      ${Object.entries(P_ESTADOS).map(([k, v]) =>
        `<button class="estado ${k === p.estado ? 'is-on' : ''}" type="button" data-estado="${k}">${v[0]}</button>`).join('')}
    </div>

    <dl class="det__datos">
      ${dato('Correo', p.email)}${dato('Teléfono', p.telefono)}${dato('Área', p.area)}
      ${dato('Experiencia', p.experiencia)}${dato('Inglés', p.ingles)}
    </dl>

    ${p.cv ? `<p class="det__cv"><a href="${escapar(p.cv)}" target="_blank" rel="noopener noreferrer">Abrir el CV ↗</a></p>` : ''}
    ${p.mensaje ? `<div class="det__bloque"><h3>Lo que escribió</h3><p class="copy">${escapar(p.mensaje)}</p></div>` : ''}

    <label class="afield"><span>Notas internas</span>
      <textarea id="pNotas" rows="3" placeholder="Qué te pareció, cuándo la entrevistaste…">${escapar(p.notas || '')}</textarea></label>
    <p class="ficha__estado" id="pEstadoMsg"></p>
    <div class="ficha__botones">
      <button class="abtn abtn--primary" type="button" id="pGuardar">Guardar notas</button>
      ${p.email ? `<a class="abtn abtn--ghost" href="mailto:${escapar(p.email)}">Escribirle</a>` : ''}
      <button class="abtn abtn--ghost" type="button" id="pBorrar">Eliminar</button>
    </div>`;

  $('pEstados').addEventListener('click', async (e) => {
    const b = e.target.closest('.estado');
    if (!b || b.dataset.estado === p.estado) return;
    const { error } = await sb.from('postulantes').update({ estado: b.dataset.estado }).eq('id', p.id);
    if (error) return aviso('<b>No se pudo cambiar el estado.</b> ' + escapar(error.message), 'error');
    await cargarContactos();
  });
  $('pGuardar').addEventListener('click', async () => {
    const msg = $('pEstadoMsg');
    msg.textContent = 'Guardando…';
    const { error } = await sb.from('postulantes').update({ notas: $('pNotas').value.trim() || null }).eq('id', p.id);
    msg.textContent = error ? 'No se pudo guardar: ' + error.message : 'Guardado.';
    if (!error) await cargarContactos();
  });
  $('pBorrar').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la postulación de ${p.nombre}? No se puede deshacer.`)) return;
    const { error } = await sb.from('postulantes').delete().eq('id', p.id);
    if (error) return aviso('<b>No se pudo eliminar.</b> ' + escapar(error.message), 'error');
    postulanteElegido = null; fichaPostulante0(); await cargarContactos();
  });
}

/* ---------- exportar ---------- */
function csv(filas, columnas) {
  const limpia = (v) => {
    let t = String(Array.isArray(v) ? v.join(' | ') : (v ?? ''));
    // Una celda que empieza por = + - @ la interpreta Excel como fórmula.
    // Los teléfonos empiezan por '+' y son el caso normal, no un ataque: a
    // esos les basta un espacio delante, que Excel no muestra; al resto se
    // le pone un apóstrofo, que es la defensa de siempre.
    if (/^[=+\-@\t\r]/.test(t)) t = (/^\+?[\d\s().\-]+$/.test(t) ? ' ' : "'") + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  return '﻿' + [columnas.map((c) => csvCab(c)).join(',')]
    .concat(filas.map((f) => columnas.map((c) => limpia(f[c])).join(',')))
    .join('\r\n');
}
const CAB = {
  nombre: 'Nombre', empresa: 'Empresa', email: 'Correo', telefono: 'Teléfono',
  telefono2: 'Teléfono alterno', region: 'Ciudad o zona', estado: 'Estado',
  origen: 'Cómo llegó', valor_mensual: 'Ingreso mensual', etiquetas: 'Etiquetas',
  notas: 'Notas', created_at: 'Alta', area: 'Área', experiencia: 'Experiencia',
  ingles: 'Inglés', cv: 'CV', mensaje: 'Mensaje'
};
const csvCab = (c) => '"' + (CAB[c] || c) + '"';

function bajarArchivo(nombre, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('exportarContactos').addEventListener('click', () => {
  const hoy = hoyISO();
  if (lado === 'cartera') {
    bajarArchivo(`contactos-moya-${hoy}.csv`,
      csv(contactos, ['nombre', 'empresa', 'email', 'telefono', 'telefono2', 'region',
                      'estado', 'origen', 'valor_mensual', 'etiquetas', 'notas', 'created_at']),
      'text/csv;charset=utf-8');
  } else {
    bajarArchivo(`postulantes-moya-${hoy}.csv`,
      csv(postulantes, ['nombre', 'email', 'telefono', 'area', 'experiencia', 'ingles',
                        'cv', 'estado', 'mensaje', 'notas', 'created_at']),
      'text/csv;charset=utf-8');
  }
});

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
let modoContenido = 'galeria';
let mesVista = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
  await pintarContenido();
  if (contenidoElegido && contenidos.some((d) => d.id === contenidoElegido)) verContenido(contenidoElegido);
}
$('recargarContenido').addEventListener('click', cargarContenido);
$('filtroContenido').addEventListener('change', pintarContenido);
$('nuevoContenido').addEventListener('click', () => { contenidoElegido = null; pintarContenido(); formContenido(); });

$('segContenido').addEventListener('click', (e) => {
  const b = e.target.closest('.segmento');
  if (!b || b.dataset.modo === modoContenido) return;
  modoContenido = b.dataset.modo;
  document.querySelectorAll('#segContenido .segmento')
    .forEach((x) => x.classList.toggle('is-on', x.dataset.modo === modoContenido));
  pintarContenido();
});

async function pintarContenido() {
  $('galeria').hidden = modoContenido !== 'galeria';
  $('calendario').hidden = modoContenido !== 'calendario';
  resumenContenido();
  return modoContenido === 'galeria' ? pintarGaleria() : pintarCalendario();
}

function resumenContenido() {
  const porEstado = (e) => contenidos.filter((d) => d.estado === e).length;
  $('contenidoResumen').textContent = contenidos.length
    ? `${contenidos.length} pieza(s) · ${porEstado('por_aprobar')} por aprobar · ${porEstado('aprobado')} aprobadas`
    : 'Todavía no hay diseños cargados.';
}

const esImagen = (a) => /^image\//.test(a?.mime || '');

async function pintarGaleria() {
  const f = $('filtroContenido').value;
  const host = $('galeria');
  const vis = contenidos.filter((d) => !f || d.estado === f);
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

/* ---------- calendario del mes ----------
   Para programar se piensa en mes, no en cuadrícula. Las piezas se
   arrastran de un día a otro y eso cambia su fecha de publicación; es
   la misma vista con la que después se lee el plan del Autopilot. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['lun','mar','mié','jue','vie','sáb','dom'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function pintarCalendario() {
  const host = $('calendario');
  const f = $('filtroContenido').value;
  const piezas = contenidos.filter((d) => !f || d.estado === f);

  const y = mesVista.getFullYear(), m = mesVista.getMonth();
  const primero = new Date(y, m, 1);
  // La semana empieza el lunes: getDay() da 0 para domingo.
  const desplaza = (primero.getDay() + 6) % 7;
  const largo = new Date(y, m + 1, 0).getDate();
  const hoy = hoyISO();

  const porDia = new Map();
  piezas.forEach((d) => {
    if (!d.fecha_publicacion) return;
    if (!porDia.has(d.fecha_publicacion)) porDia.set(d.fecha_publicacion, []);
    porDia.get(d.fecha_publicacion).push(d);
  });
  const sinFecha = piezas.filter((d) => !d.fecha_publicacion);

  const celdas = [];
  for (let i = 0; i < desplaza; i++) celdas.push('<div class="dia dia--fuera"></div>');
  for (let n = 1; n <= largo; n++) {
    const fecha = iso(new Date(y, m, n));
    const dentro = porDia.get(fecha) || [];
    celdas.push(`<div class="dia ${fecha === hoy ? 'is-hoy' : ''}" data-fecha="${fecha}">
      <span class="dia__n">${n}</span>
      ${dentro.map((d) => chip(d)).join('')}</div>`);
  }

  host.innerHTML = `
    <header class="cal__head">
      <div class="cal__nav">
        <button class="abtn abtn--ghost abtn--sm" type="button" data-mes="-1" aria-label="Mes anterior">←</button>
        <h2 class="panel__title">${MESES[m]} ${y}</h2>
        <button class="abtn abtn--ghost abtn--sm" type="button" data-mes="1" aria-label="Mes siguiente">→</button>
      </div>
      <button class="abtn abtn--ghost abtn--sm" type="button" data-mes="0">Hoy</button>
    </header>
    <div class="cal__dias">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal__rejilla" id="calRejilla">${celdas.join('')}</div>
    <div class="cal__pendientes" data-fecha="">
      <h3 class="ficha__h3">Sin fecha</h3>
      ${sinFecha.length ? sinFecha.map((d) => chip(d)).join('')
        : '<p class="ranks__empty">Todo lo visible tiene fecha.</p>'}
    </div>`;

  host.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    const paso = Number(b.dataset.mes);
    mesVista = paso === 0 ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                          : new Date(y, m + paso, 1);
    pintarCalendario();
  }));
  host.querySelectorAll('.chip-pieza').forEach((el) => {
    el.addEventListener('click', () => verContenido(el.dataset.id));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
    });
  });
  host.querySelectorAll('.dia:not(.dia--fuera), .cal__pendientes').forEach((celda) => {
    celda.addEventListener('dragover', (e) => { e.preventDefault(); celda.classList.add('is-destino'); });
    celda.addEventListener('dragleave', () => celda.classList.remove('is-destino'));
    celda.addEventListener('drop', async (e) => {
      e.preventDefault();
      celda.classList.remove('is-destino');
      const id = e.dataTransfer.getData('text/plain');
      await moverPieza(id, celda.dataset.fecha || null);
    });
  });
}

function chip(d) {
  const [txt, cl] = D_ESTADOS[d.estado] || [d.estado, ''];
  return `<button class="chip-pieza chip-pieza--${cl} ${contenidoElegido === d.id ? 'is-on' : ''}"
    type="button" draggable="true" data-id="${d.id}" title="${escapar(d.titulo)} · ${txt}">
    <span class="chip-pieza__red">${(D_REDES[d.red] || d.red).slice(0, 2).toUpperCase()}</span>
    <span class="chip-pieza__t">${escapar(d.titulo)}</span></button>`;
}

async function moverPieza(id, fecha) {
  const d = contenidos.find((x) => x.id === id);
  if (!d || d.fecha_publicacion === fecha) return;
  const { error } = await sb.from('contenido').update({ fecha_publicacion: fecha }).eq('id', id);
  if (error) return aviso('<b>No se pudo mover la pieza.</b> ' + escapar(error.message), 'error');
  d.fecha_publicacion = fecha;
  pintarCalendario();
}

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
    if (nuevo) { contenidoElegido = null; pintarContenido(); fichaContenido0(); }
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
  await pintarContenido();
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
  const [stats, llamadas7, ultimasLlam, prosp7, ultimosCont, porAprobar, agenda,
         pendientes, sinLeer, postNuevos] = await Promise.all([
    permisos.metricas  ? sb.rpc('moya_stats') : nada,
    permisos.llamadas  ? sb.from('llamadas').select('id', { count: 'exact', head: true }).gte('created_at', hace7) : nada,
    permisos.llamadas  ? sb.from('llamadas').select('id,created_at,direccion,estado,numero,duracion_seg,ia_estado,contactos(nombre)')
                           .order('created_at', { ascending: false }).limit(5) : nada,
    permisos.contactos ? sb.from('contactos').select('id', { count: 'exact', head: true }).gte('created_at', hace7) : nada,
    permisos.contactos ? sb.from('contactos').select('id,nombre,empresa,estado,created_at')
                           .order('created_at', { ascending: false }).limit(5) : nada,
    permisos.contenido ? sb.from('contenido').select('id', { count: 'exact', head: true }).eq('estado', 'por_aprobar') : nada,
    permisos.contenido ? sb.from('contenido').select('id,titulo,red,tipo,estado,fecha_publicacion')
                           .gte('fecha_publicacion', hoyISO()).order('fecha_publicacion', { ascending: true }).limit(5) : nada,
    permisos.contactos ? sb.from('tareas').select('*, contactos(nombre)').eq('hecha', false)
                           .or(`vence.lte.${hoyISO()},vence.is.null`)
                           .order('vence', { nullsFirst: false }).limit(8) : nada,
    permisos.contactos ? sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('leido', false) : nada,
    permisos.contactos ? sb.from('postulantes').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo') : nada
  ]);

  /* ---- indicadores ---- */
  const t = stats.data?.totales || {};
  const tarjetas = [];
  if (permisos.metricas) tarjetas.push(['Visitas hoy', nf.format(t.hoy || 0), 'Del sitio público']);
  if (permisos.llamadas) tarjetas.push(['Llamadas · 7 días', nf.format(llamadas7.count || 0), 'Entrantes y salientes']);
  if (permisos.contactos) tarjetas.push(['Contactos nuevos · 7 días', nf.format(prosp7.count || 0), 'Altas en la cartera']);
  if (permisos.contactos) tarjetas.push(['Mensajes sin leer', nf.format(sinLeer.count || 0),
    (postNuevos.count ? `y ${postNuevos.count} postulación(es) sin revisar` : 'Del formulario del sitio')]);
  if (permisos.contenido) tarjetas.push(['Diseños por aprobar', nf.format(porAprobar.count || 0), 'Esperan tu visto bueno']);
  $('resumenKpis').innerHTML = tarjetas.map(([l, v, p]) =>
    `<article class="kpi"><p class="kpi__label">${l}</p><p class="kpi__value">${v}</p>
     <p class="kpi__delta">${p}</p></article>`).join('');

  /* ---- bloques ---- */
  const bloques = [];

  if (permisos.contactos) {
    const filas = pendientes.data || [];
    bloques.push(caja('Para hoy', 'contactos', filas.length
      ? filas.map((t) => linea(escapar(t.titulo),
          (t.contactos?.nombre ? escapar(t.contactos.nombre) + ' · ' : '') +
          (t.vence ? (t.vence < hoyISO() ? 'venció el ' : 'para el ') + diaCorto(t.vence) : 'sin fecha'),
          t.vence && t.vence < hoyISO() ? '<span class="pill pill--mal">Atrasada</span>' : '')).join('')
      : vacio('Nada pendiente. Los seguimientos se crean desde la ficha de cada contacto.')));
  }

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
        <li>Un administrador pega esos dos datos en <b>Ajustes</b>.</li>
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

/* =========================================================
   10. Ajustes — claves de Twilio, Groq y Autopilot
   La base nunca devuelve un secreto: integraciones_estado()
   sólo dice si está puesto y, de los SID y el número, los
   últimos 4. Un campo vacío al guardar deja la clave como está.
   ========================================================= */
const campos = () => [...document.querySelectorAll('#formAjustes [data-clave]')];

async function cargarAjustes() {
  $('ajustesError').hidden = true;
  const { data, error } = await sb.rpc('integraciones_estado');
  if (error || !data) {
    $('ajustesError').textContent = 'No se pudieron leer los ajustes' + (error ? ': ' + error.message : '.');
    $('ajustesError').hidden = false;
    return;
  }
  campos().forEach((inp) => {
    const e = data[inp.dataset.clave] || {};
    const est = document.querySelector(`[data-estado="${inp.dataset.clave}"]`);
    inp.value = '';
    est.classList.toggle('is-ok', !!e.puesta);
    est.textContent = !e.puesta ? 'Sin configurar'
      : 'Guardado' + (e.final ? ' · termina en ' + e.final : '') +
        (e.updated_at ? ' · ' + fechaCorta(e.updated_at) : '');
  });
}

async function probarAjustes() {
  const caja = $('revision'), lista = $('listaRevision');
  caja.hidden = false;
  lista.innerHTML = '<li>Revisando con Twilio y Groq…</li>';
  const { data, error } = await sb.functions.invoke('llamadas', { body: { accion: 'probar' } });
  if (error || data?.error) {
    lista.innerHTML = `<li><span class="pill pill--mal">Error</span> ${escapar(await motivo(error, data))}</li>`;
    return;
  }
  lista.innerHTML = (data.revision || []).map((r) =>
    `<li><span class="pill ${r.ok ? 'pill--ok' : 'pill--mal'}">${r.ok ? 'Bien' : 'Revisar'}</span>
      <b>${escapar(r.que)}</b> ${escapar(r.detalle)}</li>`).join('');
  redesMontado = false;   // si cambió Autopilot, Redes se vuelve a montar
}

$('btnProbar').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  await probarAjustes();
  e.currentTarget.disabled = false;
});

$('formAjustes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('ajustesError'), btn = $('btnGuardarAjustes');
  err.hidden = true;
  const p = {};
  campos().forEach((inp) => { if (inp.value.trim()) p[inp.dataset.clave] = inp.value.trim(); });
  if (!Object.keys(p).length) { err.textContent = 'No escribiste nada nuevo.'; err.hidden = false; return; }

  btn.disabled = true; btn.textContent = 'Guardando…';
  const { error } = await sb.rpc('guardar_integraciones', { p });
  btn.disabled = false; btn.textContent = 'Guardar y probar';
  if (error) { err.textContent = error.message; err.hidden = false; return; }
  await cargarAjustes();
  await probarAjustes();
});

arranque();
