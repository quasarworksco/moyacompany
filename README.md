# Moya &amp; Company — Sitio web

**Your Digital Right Hand!** · Sitio estático bilingüe (español / inglés) con glassmorfismo,
splash screen y diseño premium sobre base blanca, con secciones alternadas para que el azul
de la marca funcione como acento y no sature la página.

### Ritmo de secciones

| Sección | Fondo |
| --- | --- |
| Splash | Blanco con aurora azul suave |
| Hero | Blanco → hielo (`#f3f7ff`) |
| Marquee | Banda hielo |
| Servicios | Hielo degradado |
| **Tarifas — desde $6 la hora** | Azul profundo (`#04123f → #0630b8 → #3365fa`) |
| Beneficios | Blanco |
| Cierre | Hielo, con panel azul redondeado |
| Contacto | Blanco |
| Footer | Azul profundo |

## Estructura

```
index.html               Página completa (hero, servicios, tarifas, beneficios, nosotros,
                         cierre, contacto, footer) + meta Open Graph / Twitter y JSON-LD
assets/css/styles.css    Estilos: glassmorfismo, animaciones, responsive
assets/js/i18n.js        Diccionario ES / EN — aquí se editan TODOS los textos
assets/js/main.js        Splash, menú, cambio de idioma, reveals, formulario
assets/img/logo.png      Logo completo (marca + nombre) — splash screen
assets/img/logo-mark.png Solo la marca — header, cierre y footer
assets/img/favicon.png   Ícono de pestaña
assets/img/hero.jpg      Fondo del hero (ilustración de oficina, ver abajo)
assets/img/og-image.jpg  Imagen de compartir (Open Graph / Twitter Card) 1200x630
assets/img/veronica.jpg  Retrato de la sección Nosotros
```

## Cómo verlo

Abre `index.html` en el navegador, o levanta un servidor local:

```bash
npx http-server -p 8080 .
# http://localhost:8080
```

## Logo

El logo oficial ya está aplicado. Se generaron tres archivos a partir del original,
con el fondo blanco convertido en transparencia y los colores ajustados a los tres
tonos de la marca (`#00227c`, `#0930b9`, `#3466f9`):

| Archivo | Dónde se usa |
| --- | --- |
| `assets/img/logo.png` | Splash screen (lockup completo con el nombre) |
| `assets/img/logo-mark.png` | Header, sección de cierre y footer |
| `assets/img/favicon.png` | Pestaña del navegador |

Sobre los fondos azules (cierre y footer) la marca va dentro de una placa blanca
redondeada, porque el azul oscuro del logo se perdería contra el fondo.

Para actualizar el logo, reemplaza esos archivos manteniendo los mismos nombres.

## Fondo del hero

`assets/img/hero.jpg` es una **ilustración de escena de oficina** hecha a medida en los
colores de la marca: escritorios, monitor con gráfica, laptop, agente con auriculares,
ventanas, estantes y tarjetas de UI flotantes. Va difuminada bajo un velo blanco
(`.hero__veil` en `styles.css`) para que el texto siempre se lea.

Para cambiarla por una fotografía real, reemplaza ese archivo — idealmente **horizontal,
1920×1100 px o más**. Si la foto es muy cargada u oscura, sube las opacidades del velo.

## Compartir en redes

En el `<head>` de `index.html` están las etiquetas **Open Graph** (Facebook, WhatsApp,
LinkedIn, Instagram) y **Twitter Card** (`summary_large_image`), más un bloque
**JSON-LD** de `ProfessionalService` para buscadores.

Todas apuntan al dominio `https://moyacompany.dgp-link.com/`. **Si cambias de dominio,
actualiza también esas URLs** — Open Graph exige rutas absolutas.

La imagen que se ve al compartir es `assets/img/og-image.jpg` (1200×630). Se genera a
partir del fondo del hero + el logo + el eslogan. Tras publicar cambios, puede hacer falta
refrescar el caché con el [Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/)
o el [Card Validator de X](https://cards-dev.twitter.com/validator).

## Cambiar textos

Todos los textos visibles viven en `assets/js/i18n.js`, en dos bloques: `es` y `en`.
Cada elemento del HTML se enlaza con `data-i18n="clave"`. Para cambiar una frase, edita
el valor en **ambos** idiomas.

El idioma se detecta automáticamente del navegador y se guarda en `localStorage`;
el visitante puede cambiarlo con el switch ES / EN del encabezado.

## Tarifa

El precio de entrada (**Desde $6 la hora / Starting from $6 an hour**) aparece en tres lugares:
la píldora bajo el subtítulo del hero, la tarjeta del hero y la sección `#pricing`.
Para cambiarlo, edita las claves `price.*` en `assets/js/i18n.js` y el `$6` que está escrito
directamente en `index.html` (tarjeta del hero y título de tarifas).

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
