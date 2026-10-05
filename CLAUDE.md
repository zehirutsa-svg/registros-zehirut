# Registros Zehirut

App para celular (PWA instalable, funciona sin señal) con módulos y permisos por usuario.
Estancias La Prudencia / La Paciencia (ZEHIRUT S.A.). Proyecto separado de `ZehirutApp`
(no se toca ZehirutApp; sus módulos se migran acá de a uno más adelante: combustible, facturas,
fondo fijo). Mismo esquema que `Registro de score confinamiento` (Lectura de Comederos):
HTML/CSS/JS planos en GitHub Pages + Apps Script propio + Google Sheet propio.

## Arquitectura (estado 01/10/2026) — leer primero

Para los usuarios hay **una sola app: Registros Zehirut**. Por dentro:

| Parte | Dónde vive |
|---|---|
| Pantallas (lo que abre el celular) | **GitHub Pages**: carpeta `docs/` de este repo |
| Servidor de Registros (stock, sanidad, horómetro, combustible, lluvias, usuarios, conexión con la estancia) | **Apps Script** ligado al Sheet "Registros Zehirut" (`apps-script/`) |
| Servidor de facturas, fondo fijo y mail diario | **Apps Script de ZehirutApp**, usado como **biblioteca** `ZA` (versión fija en `appsscript.json`) |
| Datos (planillas, comprobantes, carpetas) | **Google Drive / Sheets** |
| Sanidad por animal | App de la estancia (estancia-app, servidor propio) → manda consumos cada 15 min |

- **ZehirutApp ya no es una app**: sin pantallas (web apagada, muestra un botón a Registros). Sigue viva solo como
  biblioteca y por el disparador del mail diario. Cambiar facturas = publicar ZehirutApp + subir la versión acá.
- **Usuarios y permisos: una sola planilla, la hoja Usuarios de este Sheet** (ZehirutApp también la lee).
- Unificar ZehirutApp dentro de este Apps Script: decidido **dejarlo separado** por ahora (01/10/2026).

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
| Suplemento E-PRO 35 | bolsa | 30 (corregido 03/10/2026) |
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
Instrucciones de la tarea (v5, 03/10/2026): Google Doc id 1RME5v8S-HfgmIbqv-i_nnp2DJI8NDwjZAMUbN5v5Ulg (v1 a v4
quedaron renombrados "VIEJO - NO USAR…"; la conexión no puede editar el texto de un doc existente, solo crear).

**Stock del informe (pedido 03/10/2026):** "Stock por día" trae TODOS los insumos activos de Stock (no solo los de
Tapfeed) y los **días de stock = saldo ÷ consumo esperado** (ya no ÷ promedio 7 días; el promedio queda como
referencia y se sacó "Consumo últimos 7 días"). Consumo esperado = hoja **"Consumo esperado"** de Datos base
confinamiento (la edita el usuario; la creó el script con ESPERADO_INICIAL, de Proyeccion_comida_60_dias.xlsx): un
grupo por fila, kg tal cual por cabeza y día por insumo (columnas = nombre exacto del insumo). Con "Categoría", las
cabezas salen del último Tapfeed (corrales de esa categoría en la hoja Corrales); si no, columna Cabezas; "Desde"
opcional. Valores fijos por cabeza (no se escalan por peso). **Fardos por UNIDAD, nunca en kg** (columna Unidad en Stock por día; fila de fardo = total del grupo con Cabezas 1, 9 fardos/día). Silo del autoconsumo de toretones: sale de otro lado, NO va (03/10). Hembras separadas en E-PRO y fardo (fardo ~9 fardos/día = 3,17 kg/cab). Toretones BEEF comen maíz QUEBRADO (no molido). Parámetro "Insumos fuera del informe" (hoy Semilla de Gatton). Parámetro "Estancia de los insumos por estancia (Fardos)" = La Paciencia: el informe muestra solo esos fardos. Orden de la tabla Stock: ORDEN_STOCK_INFORME (Pre destete, Desarrollo, Beef, E-PRO, Maíz molido, Maíz quebrado, Silo, Fardos). (El parámetro "Kg por fardo" se eliminó el 03/10.)
Parámetros (300). Código: leerDatosBase_ y publicarDatosInforme_.

- Botón "Subir informe Tapfeed" al pie de Stock (solo casilla Configurar). El PDF "Uso de ingredientes
  por grupo" se lee EN LA APP con pdf.js (cdnjs, se baja al usarlo): período, corrales (cabezas) y kg
  tal cual / MS por ingrediente; controla que la suma de corrales = TOTAL. **Solo informes de un día**
  (uno de varios días se rechaza: no trae el detalle diario).
- El script registra un Consumo por ingrediente del TOTAL (destino Confinamiento, "Cargado por"
  = "Tapfeed (usuario)", ID `TF-AAAA-MM-DD-<insumo>`), guarda el detalle por corral en la hoja
  **Tapfeed** y el PDF en la carpeta "1 Tapfeed" (Drive id 1ZybVBnxzMW_9OixfT_ut9GuvKtQbagH1).
  Si el día ya estaba: la app avisa y "Reemplazar" anula los consumos anteriores del día.
- **Stock con peso CARGADO (05/10/2026, v1.21.0).** Tapfeed da dos números distintos: "Uso ingrediente & premezcla"
  = peso **cargado** al mixer (lo que sale del depósito) y "Uso de ingredientes por grupo" = peso **entregado** a los
  corrales (menor: residuo en el mixer, balanza en movimiento; 04/10: 19.512 vs 19.456 kg). **Stock = cargado;
  consumo por corral / MS = entregado.** Cada día se suben los DOS PDF por el mismo botón (la app reconoce el informe
  por el título; el "Informe carga" de ~6 páginas se descartó: difícil de leer). Premezcla de un día (`accion:
  'premezcla'`, cargarPremezcla_): anula los consumos `TF-<fecha>-*` del día y registra `TF-<fecha>-<insumo>-P`
  (Nota "Tapfeed premezcla (peso cargado)"); el detalle va a la hoja **Tapfeed premezcla**. El informe por grupo de
  un día que ya tiene premezcla solo carga el detalle por corral (no toca stock); sin premezcla descuenta con el
  entregado (Nota "Tapfeed") y Resumen avisa "Stock del DD/MM/AAAA descontado con peso entregado (falta informe de
  premezcla)". Columnas del PDF de premezcla (pdf.js): Ingrediente, Real recuperar / cargado, Unidad, Seca
  recuperar / cargado, desviación, precio; control: suma = Total.
- **Ajuste de stock**: un PDF de premezcla del 21/09 a un día X = ajuste. Por insumo: cargado − consumo de
  Confinamiento registrado en el período (sin ajustes anteriores); la app muestra la cuenta (simular) antes de
  confirmar. Movimiento Consumo (positivo o negativo) con ID `AJS-<X>-…`, fecha X, destino Confinamiento; suma al
  acumulado y al saldo pero NO al consumo del día ni al promedio 7 días (esAjusteStock_). Un ajuste nuevo anula el
  anterior. Una premezcla diaria de un día ≤ X se rechaza (rehacer el ajuste). Referencia 21–26/09: Pre destete 6 kg,
  maíz 1 kg, silo 17 kg.
- Insumos ↔ Tapfeed por la columna "Nombre en Tapfeed" de la hoja Insumos (solo se edita en la hoja). **Puede
  tener varios nombres separados por punto y coma** (Tapfeed renombra: el 01/10 "Concentrado Desarrollo" pasó a
  "Concen Desarrollo"; agregado solo con agregarNombreTapfeed_). La coma no sirve de separador ("Maiz Molido DGM 1,2").
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
  'producto' → guardarProducto_ en Sanidad.gs, escribe solo esa fila). Cambio de nombre con movimientos (03/10):
  en Semen y Materiales sanitarios se renombran también sus movimientos (columna Insumo); en Medicamentos no
  (la app de la estancia lo nombra así): se desactiva y se crea otro.
- Lista inicial: `apps-script/Sanidad.gs` (PRODUCTOS_SANIDAD, 98 productos de la hoja INVENTARIO de la
  planilla "Inventario y stock de medicamentos"), se agrega una sola vez (esquema 7). Después se edita
  desde la app (ver "Alta y edición de productos"); cambiar "Stock" pasa un producto a otro rubro.
- **Dispositivos en unidades** (v1.20.8, 04/10/2026): un producto que viene en paquetes/cajas de
  unidades (`contenido` + `unidadContenido` = un, sin ser semen; ej. REPRO ONE de a 10) muestra el saldo
  en unidades sueltas ("378 un") y la presentación abajo ("37,8 paquetes"), porque se usa de a uno.
  Ingresos y conteos se siguen cargando por presentación (`enUnidades`, `infoInsumo().ver`).
- **Principio activo = desplegable** (v1.20.7, 04/10/2026): en el alta/edición de producto se elige de los
  principios que ya existen, o "+ Nuevo…" para escribir uno de verdad nuevo; al guardar, si es igual o muy
  parecido a uno de la lista (sin acentos ni espacios, hasta 2 letras de diferencia, o uno contiene al otro)
  ofrece usar el existente (`principioParecido`). Motivo: la app de la estancia agrupa las hormonas de IATF
  por principio activo — un "Bucerelina" mal escrito quedaría fuera de la fila "Buserelina GnRH". El
  principio "GnRH" pasó a "Buserelina GnRH" en el esquema 18 (mismo día).
- Ficha del producto (columnas Principio activo, Indicación, Laboratorio, Proveedor, Dosis base, Peso base
  en Insumos, de la hoja INVENTARIO; esquema 11). Pantalla (v1.20.0, 03/10; antes solo se veía lo buscado y al
  usuario le resultó incómodo, sobre todo en Semen): **lista corta de lo que hay en stock** (saldo ≠ 0, incluye
  negativos), una línea por producto (nombre, en gris principio activo · proveedor, saldo), alfabética; tocándola se abre
  la ficha. Los que están en cero, detrás de "Ver también sin stock (N)". El buscador (nombre comercial,
  principio activo, laboratorio, proveedor o indicación) filtra y, buscando, muestra también los en cero y los
  desactivados (chip "Desactivado", para reactivarlos desde la ficha). Desactivado y en cero = no aparece.
  Esquema 15 (03/10, una sola vez, propiedad SEMEN_CERO_V15): se desactivaron los Semen con stock 0.
  Esquema 16 (03/10, una sola vez, propiedad GENETYX_V16): factura Genetyx 001-001-0005446 (kit IATF entregado
  22/09/2026): 7 productos nuevos (FACTURA_GENETYX en Sanidad.gs) con Conteo 0 + Ingreso del 22/09 (IDs GTX5446-n-C/I).
  Unidad "paquete" (Repro One, paquete de 10 dispositivos) agregada a UNIDADES_SAN.
  Esquema 17: ECGEN 5000 UI = frasco de 25 ml (polvo + 25 ml de diluyente, 200 UI/ml, ficha GlobalGen).
  **En Semen** (v1.20.1/.4) la línea gris es cabaña · proveedor (columna Laboratorio, que en Semen se llama "Cabaña" en la
  ficha y el formulario), y un producto nuevo arranca en pajuela / un (en los otros stocks, frasco / ml).
  El Ingreso trae el proveedor de la ficha.
- Excel por rubro: Resumen +
  Movimientos, con Unidad de negocio **PATRIMONIAL** (decisión del contador), sin hoja por producto.
- **Conexión con la app de la estancia** (`Proyectos Claude\estancia-app`, sección "Sanidad ↔ Registros
  Zehirut" de su CLAUDE.md): su servidor llama cada 15 min `accion: 'estancia'` con la clave compartida
  (propiedad CLAVE_ESTANCIA; se fija una sola vez con `accion: 'claveEstancia'`). Manda el total por
  día × producto de 30 días y recibe la lista de productos (Registros es el dueño de la lista; allá no
  se crean productos). Acá queda un Consumo por día × producto, ID `SAN-AAAA-MM-DD-<producto>`,
  "Cargado por" = "App de la estancia", reescrito en cada llamada (en el lugar; si ya no hay
  aplicaciones, anulado). Cuenta desde el primer conteo de cada producto; si el producto nunca se
  contó, desde su primer ingreso (04/10/2026: Adaptadores y semen tenían solo ingresos y no se les
  descontaba nada). Esos consumos no se corrigen
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
referencia (C Central, D Retiro / B Retiro, D Confi, E Central). La Paciencia tiene sectores A, B, C, D (pluviómetro nuevo, 05/10/2026), E, F.

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
  `appsscript.json`, hoy 138). Misma planilla, carpetas de Drive y clave de Gemini; los permisos
  salen de la hoja Usuarios de ESTE Sheet (ver "Una sola planilla de usuarios"). La web de ZehirutApp quedó
  apagada (v137: solo muestra un botón a Registros); el proyecto sigue como biblioteca y para el mail diario.
  v138 (01/10): sin Index.html ni Combustible.js; la planilla vieja de usuarios y la hoja "Combustible
  Movimientos" se mandaron a la papelera (ZA.limpiarObsoletos, llamada una vez desde limpiarObsoletos_). Lo que se carga acá aparece en ZehirutApp y al revés.
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
