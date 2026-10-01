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
dev/servidor-prueba.js  sirve docs/ y corre Code.gs con Sheets falsos (PIN 1111 Enrique, 2222 Osmar, 3333 solo ver);
                      CARGA_INICIAL=ruta.csv simula el CSV de carga inicial de Drive
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
(actualizar ESA implementación: si se crea otra, cambia la URL).
**Permisos nuevos (scopes):** abrir /exec NO alcanza si doGet no usa ese servicio. Hacer que el dueño abra el
editor, elija la función autorizar() y toque Ejecutar (usa Sheets, Drive y UrlFetch). Ojo: `clasp create-script` pisa
`appsscript.json`; si se vuelve a clonar, restaurarlo (zona Asunción, webapp anónima, scope spreadsheets).

## GitHub

- Repo público `zehirutsa-svg/registros-zehirut`; GitHub Pages publica `main` / carpeta `docs`.
- App: **https://zehirutsa-svg.github.io/registros-zehirut/**
- Push con deploy key propia (`~/.ssh/github_registros`, puesta en `core.sshCommand` del repo local).

Publicar una versión nueva: cambiar `docs/`, subir `CACHE` en `sw.js` y `VERSION` en `app.js`, commit + push.

## Regla de diseño (pedido del usuario, 28/09/2026)

**UI limpias, simples, claras y amigables. Nunca dos botones o caminos para lo mismo.**
Antes de agregar un botón, revisar que esa función no exista ya en otra parte de la pantalla.
Ej.: sincronizar/estado solo desde el cartel de arriba a la derecha; cargar solo desde la ficha del insumo.

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

Silo micropicado Gatton: se suma como insumo (kg) para la integración con Tapfeed (28/09).
**PENDIENTE para más adelante (no complicar ahora):** su stock inicial está mal (hoy "estimado 3.000.000
kg" en Datos base confinamiento) y en realidad son **varios silos**, no uno. Revisarlo con el usuario.

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
- **Stock por estancia** (casilla "Por estancia" en Insumos; hoy solo Fardos, pedido 28/09): un saldo para
  La Prudencia y otro para La Paciencia; al cargar hay que elegir la estancia (sin preselección).
  Columna "Estancia" al final de Movimientos. El resto de los insumos: stock único.
- **Producción propia** (casilla en Insumos; hoy solo Fardos): sus ingresos no piden proveedor, remito ni
  factura y nunca cuentan como "sin factura".
- **Corregir** un movimiento: abre el formulario con sus datos; al guardar anula el viejo (motivo
  "Corregido") y carga el nuevo. Si el viejo no se había enviado, se reemplaza en la cola.
- **Navegación de Stock (pedido 28/09, "menos botones")**: sin pestañas. Tarjetas → ficha del insumo
  (saldo, Consumo/Ingreso/Conteo, sus movimientos) → formulario de UN tipo con el insumo ya elegido
  (fecha, cantidad, destino en desplegable). La flecha vuelve un paso. Configurar = botón chico al pie,
  solo con la casilla Configurar. No volver a agregar pestañas ni grillas de botones.
- **Destino opcional** en los consumos: lo importante es cuánto se usó por día (ej. "tantos
  fardos hoy" sin destino). Facilitar la carga por sobre el detalle.
- Stock inicial y primeros consumos los carga el usuario (Enrique) cuando la app esté lista.

## Tapfeed: consumo del confinamiento (decidido 28/09/2026)

Reparto acordado: **la app solo registra** (no hace informes); **la tarea diaria de Claude solo hace
informes** leyendo la planilla **"Registros Zehirut – datos para el informe"** (Drive id
18sle8JEHOrayTQhC0dX5UIf-FsW6rFm2RLpTSgQ3aEo, carpeta Confinamiento ZEHIRUT), que el script reescribe
entera con cada cambio de stock (publicarDatosInforme_). **Datos YA CALCULADOS y cortos (últimos 10 días)**:
Resumen, Stock por día, Corrales por día, Ingredientes por día, Stock actual. Motivo: read_file_content de la
conexión devuelve solo ~100 filas por hoja; con el historial completo la tarea se trababa bajando el xlsx. **Por qué una planilla aparte:** la conexión a Drive de Claude (la que usa
la tarea) solo ve archivos creados por ella misma; esa planilla la creó esa conexión y el script le
escribe. De "Datos base confinamiento" la tarea solo usa Corrales y Parámetros.
La tarea (Cowork, "Informe confinamiento ZEHIRUT", trig_014qydevJNGPz1BWHB7ZbT1v, 8:45 diario) busca las
instrucciones **por título exacto** "Instrucciones tarea diaria - Informe confinamiento" (ignora "VIEJO…").
Para cambiarlas: crear un doc nuevo con ese título y renombrar el anterior "VIEJO - NO USAR - … vN"
(no editar la tarea: reenviarla por RemoteTrigger exige mandar ~90 KB de config, riesgoso).
Instrucciones de la tarea (v3): Google Doc id 1FlKEzFKtSPwaExD55js1bl0HwKCZQGyJ790bOmez7vg (v1 y v2 quedaron
renombrados "VIEJO - NO USAR…"; la conexión no puede editar el texto de un doc existente, solo crear).

- Botón "Subir informe Tapfeed" al pie de Stock (solo casilla Configurar). El PDF "Uso de ingredientes
  por grupo" se lee EN LA APP con pdf.js (cdnjs, se baja al usarlo): período, corrales (cabezas) y kg
  tal cual / MS por ingrediente; controla que la suma de corrales = TOTAL. **Solo informes de un día**
  (uno de varios días se rechaza: no trae el detalle diario).
- El script registra un Consumo por ingrediente del TOTAL (destino Confinamiento, "Cargado por"
  = "Tapfeed (usuario)", ID `TF-AAAA-MM-DD-<insumo>`), guarda el detalle por corral en la hoja
  **Tapfeed** y el PDF en la carpeta "1 Tapfeed" (Drive id 1ZybVBnxzMW_9OixfT_ut9GuvKtQbagH1).
  Si el día ya estaba: la app avisa y "Reemplazar" anula los consumos anteriores del día.
- Insumos ↔ Tapfeed por la columna "Nombre en Tapfeed" de la hoja Insumos (solo se edita en la hoja).
- Carga inicial (ingresos 2025/2026 y consumo del 21/09, sin PDF: acumulado de la tarea menos los PDF
  22–27): CSV "Registros Zehirut - carga inicial.csv" en la carpeta "Confinamiento ZEHIRUT"; el script
  lo importa solo en doGet y lo renombra "(importado)". Los datos no van al repo (es público).
- El script necesita el permiso de Drive (scope drive): tras agregarlo, el dueño reautoriza abriendo /exec.

## Tercer módulo: Combustible (desde 01/10/2026, reemplaza al de ZehirutApp)

Mismo motor y mismo recorrido que Stock: los insumos Nafta y Diesel (litro) tienen Módulo = "Combustible"
(columna nueva en Insumos) y los permisos son los de la columna Combustible de Usuarios. Consumo: Máquina
(hoja Máquinas = Bienes de Uso de las facturas, filtradas por combustible; u "Otro destino" con texto),
"¿Cuál?" si la máquina agrupa (Motos, Motosierras…), Trabajo (hoja Trabajos; obligatorio si "Pide
trabajo" = tractores), Estancia opcional (columna Finca). Columnas nuevas en Movimientos: Máquina, Equipo,
Trabajo, Finca. No se migró nada de ZehirutApp (arranca en cero el 01/10; stock inicial con Conteo).
Configurar (insumos de Stock) no toca los de Combustible. Sin Excel propio (la app solo registra).

## Horómetro (partes de tractores y generadores, 30/09/2026)

Tarjeta en Stocks debajo de Combustible; permisos = columna Combustible. Código: `apps-script/Horometro.gs` +
`docs/horometro.js` (mismo recorrido que Stock: lista de máquinas → ficha → formulario). Hoja **Horómetro**.
- Parte: fecha, máquina, trabajo (hoja Trabajos, lista cerrada), cantidad opcional en **ha o km**, unidad de
  negocio **CRÍA / RECRÍA**, horómetro inicio y final; horas = final − inicio (se ven al tipear). El inicio
  viene con el final del último parte de esa máquina; si no coincide (horas sin parte o superposición) o
  pasa de 24 h, pide confirmar. Corregir = anular + nuevo (mismas reglas que Movimientos).
- Máquinas: columna "Horómetro" de la hoja Máquinas (tractores Valtra, Massey, LS; generadores Caterpillar
  y Yanmar 1/2/3). No mueve stock: el control es litros ÷ horas con lo cargado en Combustible a la misma
  máquina (ficha: horas del mes por unidad de negocio, litros del mes, l/h).
- Trabajos (lista depurada por el usuario, única para Combustible y Horómetro): Caminería, Trabajos varios
  con traila, Trabajos varios con niveladora, Cargada de corral, Acarreo de fardos, Acarreos varios,
  Fumigación, Generador (energía), Bombeo, Aviación, Uso general, Trabajos de carpida, Recorrida, Aserraje,
  Trabajos de limpieza (agregados 30/09 con migraciones de una vez: agregarTrabajos_). **Solo desplegable, también en Combustible** (el script rechaza un trabajo que no esté en la lista);
  la edita solo quien tiene Configurar: "⚙ Configurar trabajos" al pie de Horómetro (catálogo tipo 'trabajos').
- Excel: Resumen (horas por unidad de negocio, litros, l/h por máquina) + una hoja por máquina con el
  formato de "Hora Tractor" de la planilla de rendición.

## Cuarto módulo: Sanidad (armado 30/09/2026; stocks reorganizados 01/10/2026)

Stock del depósito sanitario (uno solo, sin estancia). **Tres stocks = columna "Rubro" de Insumos, y el rubro dice
CÓMO se descuenta** (decisión 01/10: nunca mezclar en un stock ítems que bajan de formas distintas):
- 🧴 **Medicamentos** (ícono `docs/icons/vacuna.svg`): todo lo que se aplica a animales, incluidas hormonas y
  Progestar. El uso llega solo desde la app de la estancia; acá no hay Consumo (el script lo rechaza).
- **Materiales sanitarios** (`icons/materiales.svg`): alcohol, jeringas, guantes (latex y de tacto), Bagodryl,
  vainas, aplicador DIB. Consumo a mano acá; no se ofrecen en la app de la estancia (se mandan inactivos).
- 🧬 **Semen** (pajuelas): ingresos y conteos; el descuento por Servicios de IATF queda para más adelante.
- **IATF no es un stock: es la Indicación "Reproducción"** (planilla de inventario). Botón "🏷 IATF" al lado del
  buscador y chip IATF en la tarjeta; columna "Uso" en el Excel. "Insumos IATF" y la casilla "Baja en
  Registros" existieron 30/09 y se migraron una vez (migrarRubrosSanidad_, esquema 13).
Permisos: columna **Sanidad** de Usuarios (hoy solo Enrique = Administrar).
- Mismo motor que Stock (Módulo = "Sanidad"). Cada presentación es un producto distinto (CIDENTAL 250 ml ≠
  500 ml). Columnas "Contenido por unidad" + "Unidad del contenido" (frasco de 500 ml, caja de 100 un):
  el saldo se guarda en frascos **con decimales** y se muestra también en ml/un. Sin destinos (corrales).
- **Alta y edición de productos, de a uno** (pedido 30/09, la lista larga de Configurar era engorrosa): "➕ Nuevo
  producto" al pie de cada stock y "✏️ Editar datos del producto" en la ficha (solo con Configurar; acción
  'producto' → guardarProducto_ en Sanidad.gs, escribe solo esa fila). Un producto con movimientos no cambia
  de nombre (lo nombran los movimientos y la app de la estancia): se desactiva y se crea otro.
- Lista inicial: `apps-script/Sanidad.gs` (PRODUCTOS_SANIDAD, 98 productos de la hoja INVENTARIO de la
  planilla "Inventario y stock de medicamentos"), se agrega una sola vez (esquema 7). Después se edita
  desde la app (ver "Alta y edición de productos"); cambiar "Stock" pasa un producto a otro rubro.
- Ficha del producto (columnas Principio activo, Indicación, Laboratorio, Proveedor, Dosis base, Peso base
  en Insumos, de la hoja INVENTARIO; esquema 11). Pantalla: **solo aparecen las tarjetas que se buscan**
  (nombre comercial, principio activo, laboratorio, proveedor o indicación): nombre grande, principio
  activo en gris debajo, saldo y la ficha. El Ingreso trae el proveedor de la ficha.
- Excel por rubro: Resumen +
  Movimientos, con Unidad de negocio **PATRIMONIAL** (decisión del contador), sin hoja por producto.
- **Conexión con la app de la estancia** (`Proyectos Claude\estancia-app`, sección "Sanidad ↔ Registros
  Zehirut" de su CLAUDE.md): su servidor llama cada 15 min `accion: 'estancia'` con la clave compartida
  (propiedad CLAVE_ESTANCIA; se fija una sola vez con `accion: 'claveEstancia'`). Manda el total por
  día × producto de 30 días y recibe la lista de productos (Registros es el dueño de la lista; allá no
  se crean productos). Acá queda un Consumo por día × producto, ID `SAN-AAAA-MM-DD-<producto>`,
  "Cargado por" = "App de la estancia", reescrito en cada llamada (en el lugar; si ya no hay
  aplicaciones, anulado). Cuenta desde el primer conteo de cada producto. Esos consumos no se corrigen
  ni anulan desde la app (se corrigen allá). Lo que no se pudo descontar (producto desconocido, unidad
  distinta) se ve arriba de la lista y en la hoja Registro. Código en `apps-script/Sanidad.gs`.
- **Más adelante (verlo aparte):** descontar semen y hormonas al cargar un Servicio de IATF.
- Arranque: cuando el usuario actualice su planilla, se carga el stock inicial como Conteo.

## Excel (Stock y Combustible; Sanidad ver arriba)

Bajar lo registrado NO es un reporte (aclarado por el usuario 28/09): botón "📥 Bajar Excel" al pie de las
tarjetas (todos los que ven el módulo), período desde/hasta. exportarExcel_: Resumen (saldo inicial,
entradas, salidas, saldo final, kg), una hoja por insumo/estancia con el formato de las planillas de
siempre (Fecha | Destino | Cód. bien de uso | Trabajo | Estancia | Salida | Entrada | Saldo con fórmula; el
primer conteo = "Stock inicial", los demás = "Ajuste por conteo" con la diferencia) y Movimientos (tabla
plana). **Cód. bien de uso = código de Bienes de Uso de ZehirutApp, el que usa Albor** (en combustible
sale de la máquina). Se arma en un Sheet temporal y se exporta a xlsx (scope script.external_request).

## Segundo módulo: Lluvias

Una sola pantalla (sin pestañas): el día (‹ › entre días con lluvia; ambas estancias con barras),
botón "Compartir por WhatsApp" (navigator.share en el celular, wa.me en la PC; día + acumulados de
temporada y año con barras ▓░ entre ``` como en ZehirutApp), acumulados con barras (mes actual, temporada
actual "26-27" y total de la temporada anterior "25-26" para comparar; sin el año, pedido 28/09; el
rótulo va al lado de cada barra, sin leyenda). WhatsApp: día + temporada actual y anterior, misma escala. "Cargar lluvia" abre el formulario y vuelve al día cargado. Sectores con su
referencia (C Central, D Retiro / B Retiro, E Central).

Ya existe en ZehirutApp (`Lluvias.js`: planilla "Registro de Lluvias Zehirut S.A.", sectores por
estancia, ID AAAAMMDDFINCASECTOR, resumen año / temporada set-ago). Se integra acá; Osmar con
acceso total.

## Facturas y Fondo fijo (abiertos a todos desde 01/10/2026; en ZehirutApp quedaron ocultos)

- **Navegación (pedido 01/10/2026):** en el inicio el grupo se llama **Registros contables** (antes Comprobantes) y
  tiene tres tarjetas: **Comprobantes** (abre "Carga de comprobantes": Factura, Anticipo a proveedor, Pago sin
  factura), **Ver facturas** (buscador; **no carga nada hasta que se busca algo o se elige un mes**) y Fondo
  fijo. Factura y Anticipo abren el selector de archivo en el mismo toque (`#fac-elegir`, sin `capture`:
  el celular ofrece sacar foto o elegir archivo; la compu, el explorador). `ui.fac.raiz` = pantalla de
  entrada (tipo | lista): la flecha vuelve ahí y después al grupo; al guardar se vuelve a la raíz.

- No se copia la lógica: el script usa **ZehirutApp como biblioteca** (símbolo `ZA`, versión fija en
  `appsscript.json`, hoy 136). Misma planilla, carpetas de Drive, clave de Gemini y permisos/PIN de la
  hoja Usuarios de ZehirutApp. Lo que se carga acá aparece en ZehirutApp y al revés.
- El cliente llama `accion:"za"` con `fn` + `args`; el script solo deja pasar las funciones de
  `ZA_PERMITIDAS` y reemplaza `"__PIN__"` por el PIN de la sesión. UI en `docs/facturas.js`.
- **Abierto a todos (01/10/2026)**: sin modo prueba. Ve los módulos quien tiene Facturas o Fondo fijo en
  Usuarios; lo que puede hacer lo deciden los permisos de ZehirutApp. En ZehirutApp (v135) los botones de
  Comprobantes y Fondo fijo quedaron ocultos con un aviso que manda acá (su código sigue: es la biblioteca).
- **Una sola planilla de usuarios (01/10/2026): la hoja Usuarios de este Sheet.** ZehirutApp (biblioteca,
  versión 136+) lee de acá los permisos (Facturas: Ver / Cargar / Propias / Administrar = además eliminar;
  Fondo fijo: Ver; Lluvias: Cargar) y los correos del aviso diario (columnas **Email** y **Recibe avisos**).
  La planilla vieja "Usuarios - Zehirut S.A." ya no da permisos; se leyó una vez (migrarUsuariosZehirut_) para
  traer correos, avisos y usuarios activos que faltaban. El alta automática desde ZehirutApp se sacó.
- **Cada vez que ZehirutApp publica versión nueva** que toque facturas/FF: subir el número de versión
  de la biblioteca en `appsscript.json`, `clasp push --force` + update-deployment.
- Scopes nuevos (calendar.events, send_mail, scriptapp, que usa la biblioteca): el dueño corre
  `autorizar()` desde el editor.
- Fotos: se achican solo si pasan de 2400 px de lado mayor (JPEG 0,88) para que Gemini lea bien; los
  PDF no se tocan. Pendiente fase 2: cola offline de fotos ("pendiente de leer").

## Usuarios (inicio)

- **Enrique Delfante**: todo.
- **Configurar** (casilla en Usuarios): editar listas de insumos y destinos. Solo Enrique (pedido 28/09).
- **Osmar Acosta**: todos los registros (stocks, lluvias, combustible, fondo fijo) con las mismas
  limitaciones que tiene en ZehirutApp para facturas (ver solo las propias, no eliminar).
- PINs: nunca en el código (el repo de GitHub es público); viven en la planilla.

Referencia de grupos y dietas: `Zehirut S.A\CONFINAMIENTO 2026\Dietas y otros\Proyeccion_comida_60_dias.xlsx`.
