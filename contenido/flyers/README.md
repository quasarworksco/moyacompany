# Flyers de Moya & Company

Piezas 1080×1350 (4:5, el formato de feed de Instagram y Facebook), en
español e inglés, pensadas para cargarse en **Contenido** del panel y,
cuando DGP active el plan, para entrar en la cola del Social Media
Autopilot.

| Archivo | De qué va |
|---|---|
| `flyer-01-mano-derecha` | Veronica Moya, fundadora y CEO · la pieza de marca |
| `flyer-02-desde-6` | La tarifa: desde $6 la hora y qué incluye |
| `flyer-03-servicios` | Los seis servicios en una malla |
| `flyer-04-mas-tiempo` | El beneficio: más enfoque, más tiempo, mejores resultados |
| `flyer-05-call-center` | Call Center y Customer Service, con una maqueta del panel |
| `flyer-06-crm-sop` | Estructura de CRM y SOPs |

Cada una existe en `-es.jpg` y `-en.jpg`.

## Volver a generarlas

Las piezas se arman como HTML y se fotografían con el navegador, así que
el texto es Poppins de verdad y se corrige editando una línea, no
repintando una imagen:

```bash
python3 -m http.server 8099 --bind 127.0.0.1   # desde la raíz del repo
node herramientas/flyers.mjs
```

El texto de cada pieza está en `herramientas/flyers.mjs` (objeto
`PIEZAS`); el estilo común, en `herramientas/flyer-estilo/base.css`.
Poppins está en esa misma carpeta para no depender de Google Fonts al
generar.
