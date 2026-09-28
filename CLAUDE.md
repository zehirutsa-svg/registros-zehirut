# Registros Zehirut

App para celular (PWA instalable, funciona sin señal) con módulos y permisos por usuario.
Estancias La Prudencia / La Paciencia (ZEHIRUT S.A.). Proyecto separado de `ZehirutApp`
(no se toca ZehirutApp; sus módulos se migran acá de a uno más adelante: combustible, facturas,
fondo fijo). Mismo esquema que `Registro de score confinamiento` (Lectura de Comederos):
HTML/CSS/JS planos en GitHub Pages + Apps Script propio + Google Sheet propio.

## Estructura

```
docs/                 la app (GitHub Pages publica esta carpeta)
  index.html, style.css, app.js   (VERSION en app.js)
  config.js           SCRIPT_URL = URL /exec del Apps Script
  sw.js               service worker (red primero 3 s, si no copia guardada). Subir CACHE en cada publicación
  manifest.webmanifest, icons/    (block con espiral + marca ZEH + lápiz, fondo blanco)
apps-script/          backend (Code.gs + appsscript.json), se sube con clasp
.clasp.json           scriptId y parentId (Sheet "Registros Zehirut")
dev/servidor-prueba.js  sirve docs/ y corre Code.gs con Sheets falsos (PIN 1111 Enrique, 2222 Osmar, 3333 solo ver)
dev/generar-iconos.js regenera docs/icons/ (usa Chrome headless)
dev/bocetos-logo.js   bocetos del logo (versiones 1-3; se eligió la 2)
```

Probar local: `node dev/servidor-prueba.js 8766` → <http://localhost:8766> (`/_hojas` muestra las hojas simuladas).

## Google (clasp, cuenta zehirutsa@gmail.com)

- Sheet "Registros Zehirut": `https://docs.google.com/spreadsheets/d/1a-Tl5GQCEzwBGTVMK3r3yNd0kT2p51xIn92KMkOPvmo`
- Script ligado: `https://script.google.com/d/1J2YDI-HMm_t7oaqsCM5J_V1y6RN2VqeM5karHpWWSLosB2OISY3gJcKv/edit`
- Implementación web: `AKfycbwEt6SDljH5xaH489NjFkz87Ua_-nbIT4ovi21OJUyBBMM6JhR2MWKlP0zkwiMUlshjpg` (URL en `docs/config.js`),
  ejecuta como el dueño, acceso anónimo (la seguridad es el PIN, validado en el script).

Cambiar el script: editar `apps-script/Code.gs` → `clasp push --force` →
`clasp update-deployment AKfycbwEt6SDljH5xaH489NjFkz87Ua_-nbIT4ovi21OJUyBBMM6JhR2MWKlP0zkwiMUlshjpg -d "..."`
(actualizar ESA implementación: si se crea otra, cambia la URL). Ojo: `clasp create-script` pisa
`appsscript.json`; si se vuelve a clonar, restaurarlo (zona Asunción, webapp anónima, scope spreadsheets).

## GitHub

- Repo público `zehirutsa-svg/registros-zehirut`; GitHub Pages publica `main` / carpeta `docs`.
- App: **https://zehirutsa-svg.github.io/registros-zehirut/**
- Push con deploy key propia (`~/.ssh/github_registros`, puesta en `core.sshCommand` del repo local).

Publicar una versión nueva: cambiar `docs/`, subir `CACHE` en `sw.js` y `VERSION` en `app.js`, commit + push.

## Primer módulo: Stock de insumos (decisiones 2026-09-28)

Insumos (editables, se pueden agregar nuevos):

| Insumo | Se carga en | kg por unidad |
|---|---|---|
| Fardos | fardo (se cuenta por unidad, sin peso) | — |
| Maíz molido | kg (a granel) | 1 |
| Concentrado Desarrollo | bolsa | 40 |
| Balanceado Pre destete | bolsa | 40 |
| Suplemento E-PRO 35 | bolsa | 40 |
| Concentrado Beef 1.000 M | bolsa | 40 |

Silo micropicado: afuera por ahora (se agrega como insumo nuevo cuando el usuario quiera).

Destinos (editables; los dados de baja no se borran):
AC D Norte, AC Torta Frente, AC Torta Fondo, AC B Norte Frente, AC B Norte Fondo,
AC B Medio Frente, AC B Medio Fondo, y **Confinamiento** (sin corral).
Hembras C6P: el usuario las agrega después (todavía no tienen ubicación).

- Confinamiento (Desmamantes C6O, Machos C6P) se registra en **Tap Feed**: no se carga acá
  corral por corral. El usuario carga a mano solo el Concentrado Desarrollo que consume el
  confinamiento, con destino "Confinamiento".
- **Ingresos a mano** (los insumos llegan antes que la factura): quedan "sin factura" y después
  se les asocia una factura. Foto del remito opcional.
- Stock guardado en kg, mostrado en bolsas (fardos: en unidades).
- **Navegación de Stock (pedido 28/09, "menos botones")**: sin pestañas. Tarjetas → ficha del insumo
  (saldo, Consumo/Ingreso/Conteo, sus movimientos) → formulario de UN tipo con el insumo ya elegido
  (fecha, cantidad, destino en desplegable). La flecha vuelve un paso. Configurar = botón chico al pie,
  solo con la casilla Configurar. No volver a agregar pestañas ni grillas de botones.
- **Destino opcional** en los consumos: lo importante es cuánto se usó por día (ej. "tantos
  fardos hoy" sin destino). Facilitar la carga por sobre el detalle.
- Stock inicial y primeros consumos los carga el usuario (Enrique) cuando la app esté lista.

## Segundo módulo: Lluvias

Ya existe en ZehirutApp (`Lluvias.js`: planilla "Registro de Lluvias Zehirut S.A.", sectores por
estancia, ID AAAAMMDDFINCASECTOR, resumen año / temporada set-ago). Se integra acá; Osmar con
acceso total.

## Usuarios (inicio)

- **Enrique Delfante**: todo.
- **Configurar** (casilla en Usuarios): editar listas de insumos y destinos. Solo Enrique (pedido 28/09).
- **Osmar Acosta**: todos los registros (stocks, lluvias, combustible, fondo fijo) con las mismas
  limitaciones que tiene en ZehirutApp para facturas (ver solo las propias, no eliminar).
- PINs: nunca en el código (el repo de GitHub es público); viven en la planilla.

Referencia de grupos y dietas: `Zehirut S.A\CONFINAMIENTO 2026\Dietas y otros\Proyeccion_comida_60_dias.xlsx`.
