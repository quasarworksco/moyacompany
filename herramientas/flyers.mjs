/* =========================================================
   Flyers de Moya & Company — 1080×1350, ES e EN
   Se arman como HTML y se fotografían con el navegador: así
   la tipografía es Poppins de verdad y no un dibujo.

   Uso:  python3 -m http.server 8099 --bind 127.0.0.1   (en la raíz)
         node herramientas/flyers.mjs
   Poppins va en herramientas/flyer-estilo/ para no depender de
   Google Fonts al generar.
   ========================================================= */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const TMP = RAIZ + '/herramientas/flyer-estilo';
const SALIDA = RAIZ + '/contenido/flyers/2026-11';
const BASE = 'http://127.0.0.1:8099';

const WA = '+1 (713) 382-7990';
const WEB = 'moyacompany.com';

/* ---------- piezas reutilizables ---------- */
/* El lockup del sitio lleva el nombre dentro del PNG y a este tamaño no se
   lee; se arma con la marca sola y el nombre tipografiado en Poppins. */
const cab = (L) => `<header class="cab">
  <div class="marca"><img src="/assets/img/logo-mark.png" alt="" />
    <span>MOYA <b>&amp;</b> COMPANY</span></div>
  <div class="idioma">${L === 'es' ? '<b>ES</b> ⇄ EN' : 'ES ⇄ <b>EN</b>'}</div>
</header>`;

const pie = (cta) => `<footer class="pie">
  <div class="cta">${cta} <svg width="26" height="20" viewBox="0 0 26 20" fill="none"><path d="M2 10h21M16 3l7 7-7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div class="datos">${WEB}<span>WhatsApp ${WA}</span></div>
</footer>`;

/* ---------- contenido de cada pieza ---------- */
const PIEZAS = [
  /* 1 — la fundadora, con su foto */
  {
    slug: 'flyer-01-mano-derecha',
    es: { ceja: 'Conoce a quien está detrás', h1: 'TU MANO DERECHA<br><span class="b">DIGITAL</span>',
      rol: 'Fundadora y CEO', nom: 'Veronica Moya',
      cita: '“Tienes la visión. Nosotros somos tu respaldo.”',
      lista: ['Ingeniera industrial y asistente virtual', 'Equipo bilingüe español / inglés',
              'Personas. Procesos. Tecnología.'],
      cta: 'Hablemos' },
    en: { ceja: 'Meet the person behind it', h1: 'YOUR DIGITAL<br><span class="b">RIGHT HAND!</span>',
      rol: 'Founder & CEO', nom: 'Veronica Moya',
      cita: '“You have the vision. We are your backing.”',
      lista: ['Industrial engineer and virtual assistant', 'Bilingual team, Spanish / English',
              'People. Processes. Technology.'],
      cta: "Let's talk" },
    cuerpo: (c) => `<div class="cuerpo retrato">
      <div class="retrato__foto"><img src="/assets/img/veronica.jpg" alt="Veronica Moya" /></div>
      <div class="retrato__txt">
        <p class="retrato__rol">${c.rol}</p>
        <p class="retrato__nom">${c.nom}</p>
        <p class="retrato__cita">${c.cita}</p>
        <ul class="puntos">${c.lista.map((x) => `<li>${x}</li>`).join('')}</ul>
      </div></div>`
  },

  /* 2 — la tarifa */
  {
    slug: 'flyer-02-desde-6',
    es: { ceja: 'Tarifas', h1: 'DESDE <span class="b">$6</span><br>LA HORA',
      bajada: 'Planes flexibles según las horas que necesites. Cuéntanos cómo funciona tu operación y armamos una propuesta a tu medida.',
      lista: ['Sin contratos rígidos: pagas por las horas que usas.',
              'Equipo bilingüe español / inglés.',
              'Puedes combinar varios servicios en un mismo plan.',
              'Reportes y comunicación directa contigo.'],
      nota: '* Tarifa inicial. El precio final depende del servicio y del volumen de horas.',
      cta: 'Solicitar propuesta' },
    en: { ceja: 'Pricing', h1: 'STARTING FROM<br><span class="b">$6</span> AN HOUR',
      bajada: 'Flexible plans based on the hours you need. Tell us how your operation works and we will put together a proposal that fits.',
      lista: ['No rigid contracts: you pay for the hours you use.',
              'Bilingual team, Spanish / English.',
              'You can combine several services in one plan.',
              'Reports and direct communication with you.'],
      nota: '* Starting rate. The final price depends on the service and the volume of hours.',
      cta: 'Request a proposal' },
    cuerpo: (c) => `<p class="bajada">${c.bajada}</p>
      <div class="cuerpo">
        <div class="tarjeta lista"><ul>${c.lista.map((x) =>
          `<li><span class="tic"><svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M2 7.5 6.5 12 16 2" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${x}</li>`).join('')}</ul>
          <p class="nota">${c.nota}</p></div>
      </div>`
  },

  /* 3 — los seis servicios */
  {
    slug: 'flyer-03-servicios',
    es: { ceja: 'Servicios', h1: 'SEIS FORMAS DE<br><span class="b">QUITARTE PESO</span>',
      srv: [['Call Center', 'Gestión de llamadas y atención profesional.'],
            ['Social Media', 'Presencia en línea y crecimiento de marca.'],
            ['Asistencia Virtual', 'Soporte administrativo del día a día.'],
            ['Customer Service', 'Experiencias de cliente por canales eficientes.'],
            ['Estructura de CRM', 'Datos centralizados y procesos automatizados.'],
            ['SOPs', 'Procedimientos estándar para operar igual siempre.']],
      cta: 'Ver servicios' },
    en: { ceja: 'Services', h1: 'SIX WAYS TO<br><span class="b">TAKE WEIGHT OFF</span>',
      srv: [['Call Center', 'Call management and professional support.'],
            ['Social Media', 'Online presence and brand growth.'],
            ['Virtual Assistance', 'Day-to-day administrative support.'],
            ['Customer Service', 'Customer experiences through efficient channels.'],
            ['CRM Structure', 'Centralized data and automated processes.'],
            ['SOPs', 'Standard procedures so you operate the same way every time.']],
      cta: 'See services' },
    cuerpo: (c) => `<div class="cuerpo"><div class="malla">${c.srv.map(([t, d], i) =>
      `<article class="tarjeta celda"><span class="num">${String(i + 1).padStart(2, '0')}</span>
        <h3>${t}</h3><p>${d}</p></article>`).join('')}</div></div>`
  },

  /* 4 — el beneficio */
  {
    slug: 'flyer-04-mas-tiempo',
    es: { ceja: 'El impacto', h1: 'LO QUE GANAS<br>AL <span class="b">DELEGAR</span>',
      ben: [['Más enfoque', 'en lo que impulsa tu negocio'],
            ['Más tiempo', 'para crecer en lo que verdaderamente importa'],
            ['Mejores resultados', 'a través de procesos eficientes y organización']],
      cierre: 'Personas. Procesos. Tecnología. Mejores negocios.', cta: 'Empezar' },
    en: { ceja: 'The impact', h1: 'WHAT YOU GAIN<br>BY <span class="b">DELEGATING</span>',
      ben: [['More Focus', 'on what drives your business'],
            ['More Time', 'to grow what truly matters'],
            ['Better Results', 'through efficient processes and organization']],
      cierre: 'People. Processes. Technology. Better Business.', cta: 'Get started' },
    cuerpo: (c) => `<div class="cuerpo"><div class="escalera">${c.ben.map(([t, d], i) =>
      `<article class="tarjeta peldano"><span class="peldano__n">${i + 1}</span>
        <div><h3>${t}</h3><p>${d}</p></div></article>`).join('')}</div>
      <p class="lema">${c.cierre}</p></div>`
  },

  /* 5 — call center y customer service, con una maqueta del panel */
  {
    slug: 'flyer-05-call-center',
    es: { ceja: 'Call Center · Customer Service', h1: 'QUE NUNCA SE<br>QUEDE UNA <span class="b">LLAMADA</span>',
      bajada: 'Contestamos, damos seguimiento y te dejamos el resumen de cada conversación en tu panel.',
      filas: [['Laura Jiménez', 'Entrante · 3m 34s', 'Resuelta'],
              ['MD Trucking', 'Entrante · 5m 02s', 'Resuelta'],
              ['Carlos Ruiz', 'Saliente · 1m 18s', 'Seguimiento']],
      etiq: ['Resumen con IA', 'Grabación', 'Bilingüe'], cta: 'Quiero mi línea' },
    en: { ceja: 'Call Center · Customer Service', h1: 'NEVER MISS<br>ANOTHER <span class="b">CALL</span>',
      bajada: 'We answer, we follow up, and we leave the summary of every conversation in your panel.',
      filas: [['Laura Jiménez', 'Inbound · 3m 34s', 'Resolved'],
              ['MD Trucking', 'Inbound · 5m 02s', 'Resolved'],
              ['Carlos Ruiz', 'Outbound · 1m 18s', 'Follow-up']],
      etiq: ['AI summary', 'Recording', 'Bilingual'], cta: 'I want my line' },
    cuerpo: (c) => `<p class="bajada">${c.bajada}</p>
      <div class="cuerpo"><div class="tarjeta maqueta">
        <div class="maqueta__barra"><span></span><span></span><span></span></div>
        ${c.filas.map(([n, s, e], i) => `<div class="maqueta__fila">
          <span class="punto ${i === 2 ? 'punto--azul' : ''}"></span>
          <div><b>${n}</b><em>${s}</em></div>
          <span class="chip ${i === 2 ? 'chip--av' : ''}">${e}</span></div>`).join('')}
      </div>
      <div class="etiquetas">${c.etiq.map((x) => `<span>${x}</span>`).join('')}</div></div>`
  },

  /* 6 — CRM y SOPs */
  {
    slug: 'flyer-06-crm-sop',
    es: { ceja: 'Estructura de CRM · SOPs', h1: 'TU OPERACIÓN,<br><span class="b">ORDENADA</span>',
      bajada: 'Centralizamos los datos de tus clientes y escribimos los procedimientos para que el negocio funcione igual sin ti encima.',
      cols: [['Prospectos', ['Laura J.', 'MD Trucking']],
             ['En proceso', ['Carlos R.', 'Panadería J.']],
             ['Clientes', ['Ana G.']]],
      etiq: ['Datos en un solo lugar', 'Procesos escritos', 'Reportes claros'], cta: 'Ordenar mi operación' },
    en: { ceja: 'CRM Structure · SOPs', h1: 'YOUR OPERATION,<br><span class="b">IN ORDER</span>',
      bajada: 'We centralize your customer data and write the procedures so the business runs the same way without you on top of it.',
      cols: [['Prospects', ['Laura J.', 'MD Trucking']],
             ['In progress', ['Carlos R.', 'Panadería J.']],
             ['Clients', ['Ana G.']]],
      etiq: ['Data in one place', 'Written processes', 'Clear reports'], cta: 'Put my operation in order' },
    cuerpo: (c) => `<p class="bajada">${c.bajada}</p>
      <div class="cuerpo"><div class="tablero">${c.cols.map(([t, fichas], i) =>
        `<div class="columna"><p class="columna__t columna__t--${i}">${t}</p>
          ${fichas.map((f) => `<div class="ficha2"><b>${f}</b><i></i></div>`).join('')}</div>`).join('')}</div>
      <div class="etiquetas">${c.etiq.map((x) => `<span>${x}</span>`).join('')}</div></div>`
  }
];

/* ---------- estilos propios de cada pieza ---------- */
const CSS = `
/* 1 — retrato */
.retrato{flex-direction:row;align-items:center;gap:52px}
.retrato__foto{flex:0 0 376px;width:376px;height:470px;border-radius:34px;overflow:hidden;
  border:10px solid #fff;box-shadow:0 50px 90px -40px rgba(1,8,40,.7)}
.retrato__foto img{width:100%;height:100%;object-fit:cover;object-position:50% 22%}
.retrato__rol{font-size:18px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--blue)}
.retrato__nom{margin-top:6px;font-size:46px;font-weight:700;letter-spacing:-.025em}
.retrato__cita{margin-top:18px;font-size:25px;line-height:1.45;font-weight:500;color:var(--dim)}
.puntos{margin-top:28px;list-style:none;display:grid;gap:14px}
.puntos li{position:relative;padding-left:32px;font-size:22px;font-weight:500;color:var(--navy)}
.puntos li::before{content:'';position:absolute;left:0;top:11px;width:14px;height:14px;border-radius:50%;
  background:linear-gradient(135deg,var(--blue),var(--blue2))}

/* 2 — lista de tarifa */
.lista{padding:48px 52px}
.lista ul{list-style:none;display:grid;gap:26px}
.lista li{display:flex;gap:20px;align-items:flex-start;font-size:26px;line-height:1.4;
  font-weight:500;color:var(--navy)}
.tic{flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;
  color:#fff;background:linear-gradient(135deg,var(--blue),var(--blue2))}
.nota{margin-top:34px;padding-top:26px;border-top:1px solid var(--line);
  font-size:18px;color:var(--soft)}

/* 3 — malla de servicios */
.malla{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.celda{padding:30px 32px}
.celda .num{font-size:17px;font-weight:800;letter-spacing:.14em;color:var(--blue3)}
.celda h3{margin-top:8px;font-size:29px;font-weight:700;letter-spacing:-.02em}
.celda p{margin-top:8px;font-size:19px;line-height:1.45;font-weight:400;color:var(--dim)}

/* 4 — escalera de beneficios */
.escalera{display:grid;gap:22px}
.peldano{display:flex;align-items:center;gap:30px;padding:34px 40px}
.peldano__n{flex:0 0 76px;width:76px;height:76px;display:grid;place-items:center;border-radius:24px;
  font-size:34px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--blue),var(--blue2));
  box-shadow:0 20px 40px -20px rgba(6,48,184,.9)}
.peldano h3{font-size:38px;font-weight:700;letter-spacing:-.025em}
.peldano p{margin-top:4px;font-size:22px;font-weight:400;color:var(--dim)}
.lema{margin-top:38px;text-align:center;font-size:25px;font-weight:600;color:var(--blue)}

/* 5 — maqueta del panel */
.maqueta{padding:34px 38px}
.maqueta__barra{display:flex;gap:10px;margin-bottom:26px}
.maqueta__barra span{width:13px;height:13px;border-radius:50%;background:var(--mist)}
.maqueta__fila{display:flex;align-items:center;gap:22px;padding:22px 0;border-top:1px solid var(--line)}
.maqueta__fila:first-of-type{border-top:0;padding-top:4px}
.maqueta__fila div{flex:1}
.maqueta__fila b{display:block;font-size:27px;font-weight:600;letter-spacing:-.015em}
.maqueta__fila em{display:block;margin-top:2px;font-size:19px;font-style:normal;color:var(--soft)}
.punto{width:13px;height:13px;border-radius:50%;background:#2f9e54}
.punto--azul{background:var(--blue2)}
.chip{padding:9px 20px;border-radius:999px;font-size:18px;font-weight:700;
  color:#14612f;background:#e8f6ed;border:1px solid #bfe3cc}
.chip--av{color:#7a4a05;background:#fdf4e3;border-color:#f0dcae}
.etiquetas{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.etiquetas span{padding:13px 26px;border-radius:999px;font-size:20px;font-weight:600;
  color:var(--blue);background:var(--mist);border:1px solid rgba(51,101,250,.22)}

/* 6 — tablero de CRM */
.tablero{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.columna{padding:26px 22px;border-radius:26px;background:rgba(255,255,255,.75);
  border:1px solid var(--line);min-height:300px}
.columna__t{font-size:17px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  margin-bottom:18px;color:var(--soft)}
.columna__t--0{color:var(--blue3)} .columna__t--1{color:#b4792a} .columna__t--2{color:#15803d}
.ficha2{padding:20px 22px;border-radius:18px;background:#fff;border:1px solid var(--line);
  margin-bottom:14px;box-shadow:0 18px 34px -28px rgba(9,30,110,.8)}
.ficha2 b{display:block;font-size:22px;font-weight:600;letter-spacing:-.01em}
.ficha2 i{display:block;margin-top:10px;height:8px;width:62%;border-radius:8px;background:var(--mist)}
`;

const pagina = (p, L) => {
  const c = p[L];
  const titular = c.h1.includes('<br>') && c.h1.replace(/<[^>]+>/g, '').length > 30 ? 'chico' : '';
  return `<!DOCTYPE html><html lang="${L}"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="/herramientas/flyer-estilo/base.css" /><style>${CSS}</style></head>
<body><div class="lienzo"><div class="marco">
  ${cab(L)}
  <p class="ceja">${c.ceja}</p>
  <h1 class="${titular}">${c.h1}</h1>
  ${p.cuerpo(c)}
  ${pie(c.cta)}
</div></div></body></html>`;
};

/* ---------- a fotografiar ---------- */
mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const hoja = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
const fallos = [];
hoja.on('pageerror', (e) => fallos.push(String(e)));
hoja.on('requestfailed', (q) => fallos.push('falló ' + q.url()));

for (const p of PIEZAS) {
  for (const L of ['es', 'en']) {
    const tmp = `${TMP}/_${p.slug}-${L}.html`;
    writeFileSync(tmp, pagina(p, L));
    await hoja.goto(`${BASE}/herramientas/flyer-estilo/_${p.slug}-${L}.html`, { waitUntil: 'load' });
    await hoja.evaluate(() => document.fonts.ready);
    await hoja.waitForTimeout(220);
    await hoja.screenshot({ path: `${SALIDA}/${p.slug}-${L}.jpg`, type: 'jpeg', quality: 92 });
    unlinkSync(tmp);
    console.log('✓', `${p.slug}-${L}.jpg`);
  }
}
await navegador.close();
if (fallos.length) console.log('avisos:', [...new Set(fallos)].slice(0, 6));
console.log('en', SALIDA, '→', readdirSync(SALIDA).length, 'archivos');
