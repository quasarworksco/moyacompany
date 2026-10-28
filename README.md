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
propuesta.html           Propuesta comercial para la clienta (no enlazada, noindex)
admin/index.html         Panel de administración: métricas + CRM (no enlazado, noindex)
assets/js/analytics.js   Registro de visitas (sin cookies)
assets/js/admin.js       Acceso y panel de métricas
assets/js/supabase-config.js  Credenciales de Supabase
supabase/migrations/     Esquema de la base (visitas y CRM)
supabase/functions/      Edge functions (llamadas con Twilio + IA)
assets/css/styles.css    Estilos: glassmorfismo, animaciones, responsive
assets/css/propuesta.css Estilos propios de la propuesta
assets/css/admin.css     Estilos del panel
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

## Página de propuesta

`propuesta.html` es un documento comercial aparte, en
`https://moyacompany.com/propuesta.html`. **No está enlazada desde el sitio**
y lleva `noindex, nofollow`, así que solo la ve quien tenga el enlace.

El documento lo **emite DGP GROUP USA** y va dirigido a Moya & Company. Contiene el
alcance del proyecto, las dos opciones de inversión (mensual y anual), la comparación a
12 meses, los datos de pago por Zelle y el bloque de firma con la conformidad del cliente.
Tiene estilos de impresión, de modo que el botón «Descargar en PDF» genera un PDF limpio
desde el navegador.

La confirmación se canaliza por WhatsApp al **+1 (239) 823-1738**. El correo
`Carlosdevicente04@gmail.com` aparece únicamente como cuenta Zelle, con Carlos de Vicente
como titular.

La marca de DGP GROUP USA es un monograma tipográfico (`.dgp-mark` en `propuesta.css`).
Si hay un logo real, se sustituye por un `<img>` en la barra superior, la firma y el pie.

Las cifras están escritas directamente en el HTML. Si cambian, hay que actualizar:
los importes de las dos tarjetas de plan, la tabla de comparación, la cifra de la
portada y el texto de ahorro.

## Panel de administración

`admin/index.html` se sirve en `https://moyacompany.com/admin/`. No está enlazado
desde el sitio y lleva `noindex, nofollow`.

**El acceso es con correo y contraseña reales** (Supabase Auth). A diferencia del
portero anterior, aquí el permiso lo decide la base de datos: cada consulta pasa por
`puede(modulo)`, que exige una fila activa en `admins`. El navegador no decide nada —
aunque alguien edite el JavaScript, la base le sigue negando los datos.

### Dar de alta a alguien

1. En Supabase → **Authentication → Users → Add user**, con su correo y contraseña
   (marca «Auto Confirm User»).
2. En el **SQL Editor**:

   ```sql
   select public.alta_admin('correo@moyacompanytx.com', 'Nombre Apellido');
   ```

   Eso le da rol `admin`, que ve todos los módulos.

Para un acceso limitado, en vez de `alta_admin` inserta la fila a mano con los módulos
que deba ver:

```sql
insert into public.admins (user_id, email, nombre, rol, permisos)
select id, email, 'Nombre', 'agente', array['llamadas']
from auth.users where email = 'agente@moyacompanytx.com';
```

Módulos disponibles: `metricas`, `llamadas`, `contactos`, `admins`.

### Secciones

- **Métricas** — las visitas del sitio público.
- **Llamadas** — historial, grabación, transcripción y el resumen de la IA; y el
  marcador para llamar desde el navegador.

## Llamadas y CRM

La sección de llamadas se apoya en tres piezas:

| Pieza | Para qué |
| --- | --- |
| **Twilio** | La voz: llamar desde el navegador, recibir en el panel, grabar |
| **Supabase Storage** | Guarda la grabación (bucket privado `llamadas`) |
| **Groq** | Whisper transcribe y un modelo Llama extrae resumen, datos y tareas |

La edge function `llamadas` (desplegada) orquesta todo. Mientras no haya credenciales
de Twilio, el panel muestra «Línea no conectada» y el resto sigue funcionando.

### Conectar Twilio y la IA

Desde el panel: pestaña **Ajustes** (sólo la ve el rol `admin`). Ahí se pegan el
Account SID, el Auth Token, la API Key (SID y Secret), el número y la clave de Groq,
y **Guardar y probar** revisa cada una contra Twilio y Groq.

Las claves viven en la tabla `integraciones`, que tiene RLS sin políticas: nadie la
alcanza por la API. El panel entra sólo por dos funciones que exigen rol admin
(migración `0007`): `guardar_integraciones()` escribe y valida el formato, e
`integraciones_estado()` dice qué está puesto sin devolver nunca un secreto (de los
SID y del número, los últimos 4). Para cambiar una clave se pega la nueva; un campo
vacío deja la que había.

Al probar, si todo está bien, la función crea sola la «TwiML App» en Twilio y apunta
el número a sí misma. No hay que configurar webhooks a mano.

### Grabación

**Todas las llamadas se graban**, entrantes y salientes, y sin aviso: Moya está en
Texas, que es de consentimiento de una parte. Ojo con quien esté en un estado que exige
el permiso de todos (California, Florida, Washington, Illinois, Pensilvania…): ahí
grabar sin avisar tiene riesgo legal. Las llamadas de menos de 5 segundos y los buzones
vacíos no se guardan.

### Llamadas entrantes y SMS

Al entrar al panel, quien tiene permiso de llamadas queda conectado a la línea: las
llamadas al número de Moya suenan en cualquier sección, con el nombre del contacto si
existe. «Al buzón» la manda al buzón de voz. Si nadie contesta en 25 segundos, también.

Los SMS que llegan al número entran como mensajes en la ficha del contacto (o de uno
nuevo). Sólo se reciben: enviar SMS desde un número local exige el registro A2P 10DLC
en Twilio.

El SDK de voz de Twilio está en `assets/js/vendor/`: Twilio no publica la versión 2 en
un CDN. Para actualizarlo: `npm pack @twilio/voice-sdk@<versión>` y copiar
`dist/twilio.min.js`.

## Métricas

Las visitas se guardan en Supabase. No se usan cookies ni se guarda la IP: sólo la
página, el idioma, el tipo de dispositivo, el origen y un identificador de sesión
que vive en `sessionStorage`.

**Ya está en marcha.** Vive en el proyecto propio de Moya
(`hadpcfbmhgioclzqokvo`), en dos objetos con prefijo `moya_`:

| Objeto | Qué hace |
| --- | --- |
| `moya_pageviews` | Tabla de visitas. RLS activo con una única política: `INSERT` para `anon`. |
| `moya_stats()` | Función `SECURITY DEFINER` que devuelve sólo agregados. |

Los agregados exigen sesión iniciada: `moya_stats()` sólo se puede llamar con un
usuario del panel. El sitio público, sin sesión, únicamente puede **insertar** una
visita.

> Las métricas vivieron un tiempo en el proyecto `dgp-linkshop`. Al crear el proyecto
> propio se mudaron aquí. Las tablas viejas (`moya_pageviews` y `moya_stats`) siguen
> en linkshop sin usarse y se pueden borrar cuando quieras.

La clave `anon` es pública por diseño y está limitada por las políticas de RLS:
permite registrar una visita y leer totales, nunca las filas individuales.

Si `supabase-config.js` está vacío, el sitio público no intenta registrar nada y el
panel muestra un aviso en lugar de las métricas.

## Compartir en redes

En el `<head>` de `index.html` están las etiquetas **Open Graph** (Facebook, WhatsApp,
LinkedIn, Instagram) y **Twitter Card** (`summary_large_image`), más un bloque
**JSON-LD** de `ProfessionalService` para buscadores.

Todas apuntan al dominio `https://moyacompany.com/`. **Si cambias de dominio,
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
