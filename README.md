# Moya &amp; Company — Sitio web

**Your Digital Right Hand!** · Sitio estático bilingüe (español / inglés) con glassmorfismo,
splash screen y diseño premium en la paleta de la marca.

## Estructura

```
index.html               Página completa (hero, servicios, beneficios, cierre, contacto, footer)
assets/css/styles.css    Estilos: glassmorfismo, animaciones, responsive
assets/js/i18n.js        Diccionario ES / EN — aquí se editan TODOS los textos
assets/js/main.js        Splash, menú, cambio de idioma, reveals, formulario
assets/img/logo.svg      Logo (placeholder — reemplazar por el logo real)
assets/img/favicon.svg   Ícono de pestaña
```

## Cómo verlo

Abre `index.html` en el navegador, o levanta un servidor local:

```bash
npx http-server -p 8080 .
# http://localhost:8080
```

## Reemplazar el logo

El logo actual es un **placeholder**. Para poner el definitivo:

1. Guarda el archivo como `assets/img/logo.svg` (recomendado: SVG o PNG con fondo transparente,
   mínimo 512×512 px).
2. Si es PNG, nómbralo `assets/img/logo.png` y reemplaza `assets/img/logo.svg` por
   `assets/img/logo.png` en `index.html` (aparece 5 veces: splash, header, tarjeta del hero,
   sección de cierre y footer).
3. Opcional: actualiza también `assets/img/favicon.svg`.

No hace falta tocar nada más: el mismo archivo se usa en toda la página.

## Cambiar textos

Todos los textos visibles viven en `assets/js/i18n.js`, en dos bloques: `es` y `en`.
Cada elemento del HTML se enlaza con `data-i18n="clave"`. Para cambiar una frase, edita
el valor en **ambos** idiomas.

El idioma se detecta automáticamente del navegador y se guarda en `localStorage`;
el visitante puede cambiarlo con el switch ES / EN del encabezado.

## Datos de contacto

Se repiten en `index.html` (tarjetas de contacto, footer, botón flotante de WhatsApp y hero):

- Email: `veronica@moyacompanytx.com`
- Teléfono / WhatsApp: `+1 (713) 382-7990` → `tel:+17133827990`, `https://wa.me/17133827990`
- Instagram: `https://instagram.com/moyacompanytx`
- Facebook: `https://www.facebook.com/moyaandcompany` — ⚠️ **verificar la URL exacta de la
  página antes de publicar**; está marcada con un comentario en el HTML.

## Formulario

El formulario de contacto no requiere backend: arma un `mailto:` con los datos y abre el
cliente de correo del visitante. Si en el futuro se quiere recibir los mensajes en un panel,
se puede conectar a Formspree, Netlify Forms o similar cambiando el `submit` en
`assets/js/main.js`.

## Marca

| Elemento | Valor |
| --- | --- |
| Tipografía | Poppins (300 / 400 / 500 / 600 / 700) |
| Azul profundo | `#0630b8` |
| Azul eléctrico | `#3365fa` |
| Base | Blanco sobre degradados azul noche |

## Publicar

Es un sitio 100% estático: sirve cualquier hosting.

- **GitHub Pages:** Settings → Pages → Branch `main` / carpeta `/ (root)`.
- **Vercel / Netlify:** importar el repositorio, sin comando de build, directorio raíz.
