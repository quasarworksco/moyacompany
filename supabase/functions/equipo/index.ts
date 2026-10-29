// Equipo del CRM de Moya & Company: miembros, permisos, contraseñas y su número de Twilio.
// Sólo la cuenta principal (admins.principal) puede usarla.
//
// Desde el panel, JSON { accion, ... }:
//   listar                                    → miembros y números de Twilio de la cuenta
//   crear     { usuario, nombre, contrasena, rol, permisos, numero, acceso_hasta, debe_cambiar }
//   editar    { user_id, nombre, rol, permisos, numero, activo, acceso_hasta }
//   contrasena{ user_id, contrasena, debe_cambiar }
//   eliminar  { user_id }
//
// «usuario» puede ser un correo o un nombre de usuario (maria, juan.perez). Sin correo,
// la cuenta queda como usuario@equipo.moyacompany.com: sirve para entrar, no recibe correos.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const ORIGENES = ['https://moyacompany.com', 'https://www.moyacompany.com'];
const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const LLAMADAS = URL_BASE + '/functions/v1/llamadas';
const DOMINIO = 'equipo.moyacompany.com';                   // el mismo que usa el panel al entrar
const MODULOS = ['metricas', 'llamadas', 'contactos', 'contenido'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
class Aviso extends Error {}                                 // error para mostrarle tal cual a la persona

function e164(t: unknown) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}
const usuarioDe = (email: string) => email.endsWith('@' + DOMINIO) ? email.slice(0, -DOMINIO.length - 1) : email;

/* ---------- Twilio: números de la cuenta ---------- */
async function twilioDe(db: SupabaseClient) {
  const { data } = await db.rpc('claves_integracion');
  const k = (data || {}) as Record<string, string>;
  if (!k.TWILIO_ACCOUNT_SID || !k.TWILIO_AUTH_TOKEN) return null;
  return async (path: string, metodo = 'GET', datos?: Record<string, string>) => {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${k.TWILIO_ACCOUNT_SID}/${path}`, {
      method: metodo,
      headers: {
        Authorization: 'Basic ' + btoa(k.TWILIO_ACCOUNT_SID + ':' + k.TWILIO_AUTH_TOKEN),
        ...(datos ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: datos ? new URLSearchParams(datos) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'Error de Twilio');
    return j as Record<string, any>;
  };
}
async function numerosTwilio(db: SupabaseClient) {
  const tw = await twilioDe(db);
  if (!tw) return null;
  const j = await tw('IncomingPhoneNumbers.json?PageSize=100');
  return (j.incoming_phone_numbers || []).map((n: Record<string, any>) => ({
    sid: n.sid, numero: n.phone_number, nombre: n.friendly_name,
    voz: n.capabilities?.voice !== false, sms: n.capabilities?.sms === true
  }));
}
// El número de un miembro también entra por la función de llamadas (voz y SMS)
async function apuntarNumero(db: SupabaseClient, numero: string) {
  const tw = await twilioDe(db);
  if (!tw) return;
  const j = await tw('IncomingPhoneNumbers.json?PhoneNumber=' + encodeURIComponent(numero));
  const n = (j.incoming_phone_numbers || [])[0];
  if (!n) throw new Aviso(numero + ' no está en la cuenta de Twilio.');
  if (n.voice_url !== LLAMADAS + '?evento=entrante' || n.sms_url !== LLAMADAS + '?evento=sms') {
    await tw(`IncomingPhoneNumbers/${n.sid}.json`, 'POST', {
      VoiceUrl: LLAMADAS + '?evento=entrante', VoiceMethod: 'POST',
      SmsUrl: LLAMADAS + '?evento=sms', SmsMethod: 'POST'
    });
  }
}

/* ---------- validaciones ---------- */
function permisosDe(rol: string, permisos: unknown) {
  if (rol === 'admin') return [...MODULOS, 'admins'];
  const p = (Array.isArray(permisos) ? permisos : []).filter((x) => MODULOS.includes(String(x)));
  if (!p.length) throw new Aviso('Elige al menos un módulo que pueda ver.');
  return [...new Set(p.map(String))];
}
function rolDe(r: unknown) {
  if (r !== 'admin' && r !== 'agente') throw new Aviso('El rol debe ser administrador o agente.');
  return r;
}
function contrasenaDe(c: unknown) {
  const s = String(c || '');
  if (s.length < 8) throw new Aviso('La contraseña necesita al menos 8 caracteres.');
  if (s.length > 72) throw new Aviso('La contraseña es demasiado larga.');
  return s;
}
function fechaDe(f: unknown) {
  if (f === null || f === undefined || f === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f))) throw new Aviso('La fecha de vencimiento no es válida.');
  return String(f);
}
function numeroDe(n: unknown) {
  if (n === null || n === undefined || n === '') return null;
  const t = e164(n);
  if (!t) throw new Aviso('El número debe ser de EE. UU.: +1 y 10 dígitos.');
  return t;
}
function correoDe(u: unknown) {
  const s = String(u || '').trim().toLowerCase();
  if (s.includes('@')) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) || s.length > 160) throw new Aviso('El correo no es válido.');
    if (s.endsWith('@' + DOMINIO)) throw new Aviso('Usa sólo el nombre de usuario, sin @.');
    return s;
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(s)) {
    throw new Aviso('El usuario lleva de 3 a 30 letras, números, punto, guion o guion bajo (sin espacios ni acentos).');
  }
  return s + '@' + DOMINIO;
}
const yaUsado = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '23505' || /duplicate|unique/i.test(e.message || ''));

/* ---------- acciones ---------- */
async function listar(db: SupabaseClient) {
  const [{ data: filas, error }, usuarios, numeros] = await Promise.all([
    db.from('admins').select('user_id,email,nombre,rol,permisos,activo,acceso_hasta,numero,debe_cambiar,principal,created_at')
      .order('principal', { ascending: false }).order('created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
    numerosTwilio(db).catch(() => null)
  ]);
  if (error) throw error;
  const ultimo: Record<string, string | null> = {};
  (usuarios.data?.users || []).forEach((u) => { ultimo[u.id] = u.last_sign_in_at || null; });
  const miembros = (filas || []).map((a) => ({ ...a, usuario: usuarioDe(a.email), ultimo_acceso: ultimo[a.user_id] || null }));
  return {
    miembros,
    numeros: numeros && numeros.map((n: Record<string, any>) => ({
      ...n, asignado_a: miembros.find((m) => m.numero === n.numero)?.nombre || null
    }))
  };
}

async function crear(db: SupabaseClient, b: Record<string, any>) {
  const email = correoDe(b.usuario);
  const nombre = String(b.nombre || '').trim().slice(0, 120);
  if (nombre.length < 2) throw new Aviso('Escribe el nombre de la persona.');
  const rol = rolDe(b.rol);
  const permisos = permisosDe(rol, b.permisos);
  const numero = numeroDe(b.numero);
  const password = contrasenaDe(b.contrasena);
  const acceso_hasta = fechaDe(b.acceso_hasta);

  const { data: c, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre }
  });
  if (error || !c.user) {
    if (/already|registered|exists/i.test(error?.message || '')) throw new Aviso('Ese usuario o correo ya existe.');
    throw new Aviso('No se pudo crear el usuario: ' + (error?.message || ''));
  }
  const { error: e2 } = await db.from('admins').insert({
    user_id: c.user.id, email, nombre, rol, permisos, activo: true, acceso_hasta, numero,
    debe_cambiar: b.debe_cambiar !== false, principal: false
  });
  if (e2) {
    await db.auth.admin.deleteUser(c.user.id);              // sin ficha no sirve: se deshace
    if (yaUsado(e2)) throw new Aviso('Ese número ya lo tiene otra persona del equipo.');
    throw e2;
  }
  if (numero) await apuntarNumero(db, numero).catch(() => null);
  return { user_id: c.user.id };
}

async function fila(db: SupabaseClient, id: string) {
  const { data } = await db.from('admins').select('user_id,principal,rol,activo,numero').eq('user_id', id).maybeSingle();
  if (!data) throw new Aviso('Ese miembro ya no existe.');
  return data;
}

async function editar(db: SupabaseClient, b: Record<string, any>, yo: string) {
  const m = await fila(db, String(b.user_id || ''));
  const nombre = String(b.nombre || '').trim().slice(0, 120);
  if (nombre.length < 2) throw new Aviso('Escribe el nombre de la persona.');
  const numero = numeroDe(b.numero);
  const cambios: Record<string, unknown> = { nombre, numero };
  // La cuenta principal no pierde nada: sólo cambia su nombre y su número
  if (!m.principal) {
    if (m.user_id === yo) throw new Aviso('No puedes cambiar tu propio rol ni tus permisos.');
    cambios.rol = rolDe(b.rol);
    cambios.permisos = permisosDe(cambios.rol as string, b.permisos);
    cambios.activo = b.activo !== false;
    cambios.acceso_hasta = fechaDe(b.acceso_hasta);
  }
  const { error } = await db.from('admins').update(cambios).eq('user_id', m.user_id);
  if (error) {
    if (yaUsado(error)) throw new Aviso('Ese número ya lo tiene otra persona del equipo.');
    throw error;
  }
  await db.auth.admin.updateUserById(m.user_id, { user_metadata: { nombre } });
  if (numero && numero !== m.numero) await apuntarNumero(db, numero).catch(() => null);
  return { ok: true };
}

async function contrasena(db: SupabaseClient, b: Record<string, any>, yo: string) {
  const m = await fila(db, String(b.user_id || ''));
  const password = contrasenaDe(b.contrasena);
  const { error } = await db.auth.admin.updateUserById(m.user_id, { password });
  if (error) throw new Aviso('No se pudo cambiar la contraseña: ' + error.message);
  // Si se la pone otra persona, la cambia al entrar (salvo que se diga lo contrario)
  await db.from('admins').update({ debe_cambiar: m.user_id !== yo && b.debe_cambiar !== false }).eq('user_id', m.user_id);
  return { ok: true };
}

async function eliminar(db: SupabaseClient, b: Record<string, any>, yo: string) {
  const m = await fila(db, String(b.user_id || ''));
  if (m.principal) throw new Aviso('La cuenta principal no se puede eliminar.');
  if (m.user_id === yo) throw new Aviso('No puedes eliminar tu propia cuenta.');
  // Borra la cuenta de acceso; su fila en admins se va con ella (on delete cascade).
  // Sus llamadas se quedan en el CRM, sin dueño.
  const { error } = await db.auth.admin.deleteUser(m.user_id);
  if (error) throw new Aviso('No se pudo eliminar: ' + error.message);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido' });

  const comoUsuario = createClient(URL_BASE, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false }
  });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return json(req, 401, { error: 'Inicia sesión' });
  const { data: principal } = await comoUsuario.rpc('es_principal');
  if (!principal) return json(req, 403, { error: 'Sólo la cuenta principal administra el equipo.' });

  const db = createClient(URL_BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let b: Record<string, any> = {};
  try { b = await req.json(); } catch (_) { /* cuerpo vacío */ }
  try {
    if (b.accion === 'listar') return json(req, 200, await listar(db));
    if (b.accion === 'crear') return json(req, 200, await crear(db, b));
    if (b.accion === 'editar') return json(req, 200, await editar(db, b, u.user.id));
    if (b.accion === 'contrasena') return json(req, 200, await contrasena(db, b, u.user.id));
    if (b.accion === 'eliminar') return json(req, 200, await eliminar(db, b, u.user.id));
    return json(req, 400, { error: 'Solicitud inválida' });
  } catch (e) {
    return json(req, 400, { error: e instanceof Aviso ? e.message : 'Algo falló: ' + (e as Error).message });
  }
});
