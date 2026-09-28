/**
 * Registros Zehirut — script del Google Sheet "Registros Zehirut".
 *
 * Recibe lo que cargan los teléfonos (stock de insumos, lluvias) y devuelve lo que la
 * app necesita para trabajar sin señal. Cada cambio viene con un id armado en el
 * teléfono: si llega dos veces (reintento con mala señal) se guarda una sola.
 *
 * Hojas de este Sheet:
 *   Usuarios     — Nombre | PIN | Activo | un permiso por módulo. Se edita a mano.
 *   Stock        — saldo de cada insumo. Se rearma sola, no editar.
 *   Movimientos  — ingresos, consumos y conteos. Nunca se borra: una corrección anula.
 *   Insumos      — lista de insumos (se edita desde la app o a mano).
 *   Destinos     — corrales / destinos de los consumos (ídem).
 *   Registro     — todo lo que llegó de los teléfonos, con resultado. Solo se agrega.
 *   Tapfeed      — detalle por corral de cada informe de Tapfeed cargado (consumo del
 *                  confinamiento). De acá lee la tarea que arma el informe diario.
 * Lluvias se guarda en la planilla de siempre ("Registro de Lluvias Zehirut S.A."), la
 * misma que usa ZehirutApp, con el mismo formato: da igual desde cuál se cargue.
 *
 * Permisos por módulo (columnas de Usuarios): Administrar > Cargar > Ver > (vacío = nada).
 * En Facturas además "Propias" (ve y carga solo las suyas). Se chequean acá, no solo en la app.
 *
 * Nada privado vive en este archivo (el repositorio es público): los PIN están solo en la
 * hoja Usuarios.
 */

const ZONA = 'America/Asuncion';
const ESQUEMA = '5';   // subir cuando cambien hojas: la próxima llamada vuelve a preparar todo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const MODULOS = ['Stock', 'Lluvias', 'Facturas', 'Combustible', 'Fondo fijo'];
const NIVELES = { '': 0, 'VER': 1, 'PROPIAS': 2, 'CARGAR': 2, 'ADMINISTRAR': 3 };
// "Configurar" (casilla): editar las listas de insumos y destinos. Aparte de los niveles
// porque quien administra Stock (conteos, anular) no necesariamente arma las listas.
const COLS_USUARIOS = ['Nombre', 'PIN', 'Activo'].concat(MODULOS, ['Configurar']);
// "Por estancia": el insumo lleva un stock separado para cada estancia (ej. Fardos).
// "Producción propia": se produce en la estancia; sus ingresos no llevan proveedor, remito ni factura.
// "Nombre en Tapfeed": cómo aparece el insumo en el PDF de Tapfeed (ej. "Maiz Molido DGM 1,2").
const COLS_INSUMOS = ['Insumo', 'Unidad', 'Kg por unidad', 'Stock mínimo', 'Activo', 'Por estancia', 'Producción propia', 'Nombre en Tapfeed'];
const COLS_TAPFEED = ['Fecha', 'Corral', 'Cabezas', 'Insumo', 'Nombre en Tapfeed', 'Kg tal cual', 'Kg MS', 'Archivo', 'Cargado por', 'Recibido'];
const COLS_DESTINOS = ['Destino', 'Activo'];
const COLS_MOV = ['ID', 'Fecha', 'Tipo', 'Insumo', 'Cantidad', 'Unidad', 'Kg', 'Destino', 'Proveedor',
  'Remito', 'Factura', 'Nota', 'Cargado por', 'Hora en el teléfono', 'Recibido', 'Anulado', 'Anulado por / motivo', 'Marca de tiempo',
  'Estancia'];
const COLS_REGISTRO = ['Recibido', 'Usuario', 'Acción', 'Detalle', 'Resultado', 'ID'];
const TIPOS_MOV = ['Ingreso', 'Consumo', 'Conteo'];

// Cargas iniciales (decididas con el usuario el 28/09/2026). Después se editan desde la app.
const INSUMOS_INICIALES = [
  ['Fardos', 'fardo', '', '', true, true, true, ''],
  ['Maíz molido', 'kg', 1, '', true, false, false, 'Maiz Molido DGM 1,2'],
  ['Concentrado Desarrollo', 'bolsa', 40, '', true, false, false, 'Concentrado Desarrollo'],
  ['Balanceado Pre destete', 'bolsa', 40, '', true, false, false, 'Balan Pre destete'],
  ['Suplemento E-PRO 35', 'bolsa', 40, '', true, false, false, ''],
  ['Concentrado Beef 1.000 M', 'bolsa', 40, '', true, false, false, ''],
  ['Silo micropicado Gatton', 'kg', 1, '', true, false, false, 'Micropicado Gatton'],
  ['Maíz quebrado', 'kg', 1, '', true, false, false, ''],
];
const DESTINOS_INICIALES = ['AC D Norte', 'AC Torta Frente', 'AC Torta Fondo', 'AC B Norte Frente',
  'AC B Norte Fondo', 'AC B Medio Frente', 'AC B Medio Fondo', 'Confinamiento'];
// Los PIN se completan a mano en la hoja (los mismos que en ZehirutApp).
const USUARIOS_INICIALES = [
  ['Enrique Delfante', '', true, 'Administrar', 'Administrar', 'Administrar', 'Administrar', 'Administrar', true],
  ['Osmar Acosta', '', true, 'Administrar', 'Administrar', 'Propias', 'Cargar', 'Cargar', false],
];

// Lluvias: la planilla de siempre (compartida con ZehirutApp, ver Lluvias.js de ese proyecto).
const LLUVIAS_PLANILLA_ID = '1DXk0c3HOAsjoPwmfZzqSCUEZ9ByAOL9XlkmRdEBT7Ds';
const LLUVIAS_HOJA = 'Lluvias';
const ESTANCIAS = ['LA PRUDENCIA', 'LA PACIENCIA'];

// Carpeta "1 Tapfeed" (dentro de "Confinamiento ZEHIRUT"): ahí se guarda cada PDF subido.
const TAPFEED_CARPETA = '1ZybVBnxzMW_9OixfT_ut9GuvKtQbagH1';
// Carga inicial (una sola vez): archivo CSV en el Drive del dueño, fuera del repositorio porque
// tiene datos de la empresa. Se importa solo y se renombra "(importado)".
const CARGA_INICIAL = 'Registros Zehirut - carga inicial.csv';
// "Registros Zehirut – datos para el informe" (carpeta Confinamiento ZEHIRUT): la creó la conexión a
// Drive de Claude, que solo puede leer archivos creados por ella; esta app la mantiene al día y de
// ahí lee la tarea que arma el informe diario del confinamiento.
const INFORME_PLANILLA_ID = '18sle8JEHOrayTQhC0dX5UIf-FsW6rFm2RLpTSgQ3aEo';
const INFORME_DIAS = 10;                 // días que se publican (la tarea lee ~100 filas por hoja)
const INFORME_INICIO = '2026-09-28';      // desde acá se avisan los días sin Tapfeed
const INFORME_ACUM_DESDE = '2026-09-21';  // inicio del confinamiento (consumo acumulado)
const SECTORES_POR_FINCA = {
  'LA PRUDENCIA': ['A', 'C', 'D', 'F'],
  'LA PACIENCIA': ['A', 'B', 'C', 'E', 'F'],
};

// ---------------------------------------------------------------- instalación
const props_ = () => PropertiesService.getScriptProperties();

function asegurarConfigurado_() {
  if (props_().getProperty('ESQUEMA') === ESQUEMA) return;
  conLock_(() => {
    if (props_().getProperty('ESQUEMA') === ESQUEMA) return;
    configurar();
    props_().setProperty('ESQUEMA', ESQUEMA);
  });
}

/** Arma las hojas y las listas iniciales. Se puede repetir: no pisa nada que ya exista. */
function configurar() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(ZONA);
  const stock = hoja_(ss, 'Stock', null);
  const mov = hoja_(ss, 'Movimientos', COLS_MOV);
  const ins = hoja_(ss, 'Insumos', COLS_INSUMOS);
  const des = hoja_(ss, 'Destinos', COLS_DESTINOS);
  const usu = hoja_(ss, 'Usuarios', COLS_USUARIOS);
  const reg = hoja_(ss, 'Registro', COLS_REGISTRO);
  mov.getRange('B:B').setNumberFormat('@');
  usu.getRange('B:B').setNumberFormat('@');   // PIN como texto: no pierde ceros adelante
  if (ins.getLastRow() < 2) ins.getRange(2, 1, INSUMOS_INICIALES.length, COLS_INSUMOS.length).setValues(INSUMOS_INICIALES);
  if (des.getLastRow() < 2) des.getRange(2, 1, DESTINOS_INICIALES.length, 2).setValues(DESTINOS_INICIALES.map((d) => [d, true]));
  if (usu.getLastRow() < 2) {
    usu.getRange(2, 1, USUARIOS_INICIALES.length, COLS_USUARIOS.length).setValues(USUARIOS_INICIALES);
    const opciones = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Administrar', 'Cargar', 'Ver', 'Propias'], true).setAllowInvalid(false).build();
    usu.getRange(2, 4, 200, MODULOS.length).setDataValidation(opciones);
    usu.getRange(2, 3, 200, 1).insertCheckboxes();
  }
  asegurarColumnaConfigurar_(usu);
  asegurarColumnasEstancia_(ins, mov);
  asegurarColumnaPropia_(ins);
  asegurarTapfeed_(ss, ins);
  ins.getRange(2, 5, 200, 1).insertCheckboxes();
  des.getRange(2, 2, 200, 1).insertCheckboxes();
  [stock, mov, ins, des, usu, reg].forEach((h, i) => { ss.setActiveSheet(h); ss.moveActiveSheet(i + 1); });
  ss.getSheets().forEach((h) => {
    if (['Stock', 'Movimientos', 'Insumos', 'Destinos', 'Usuarios', 'Registro'].indexOf(h.getName()) === -1 && h.getLastRow() === 0) ss.deleteSheet(h);
  });
  reconstruirStock_(ss);
  ss.setActiveSheet(stock);
}

/** Versión 2: la columna "Configurar" en una hoja Usuarios ya existente. Queda tildada solo
 *  para Enrique (el que decidió que la configuración sea solo suya, 28/09/2026). */
function asegurarColumnaConfigurar_(usu) {
  const ancho = usu.getLastColumn();
  const enc = usu.getRange(1, 1, 1, ancho).getValues()[0].map(String);
  let col = enc.indexOf('Configurar') + 1;
  if (!col) {
    col = ancho + 1;
    usu.getRange(1, col).setValue('Configurar').setFontWeight('bold').setBackground('#eeeeee');
    const n = usu.getLastRow();
    if (n > 1) {
      usu.getRange(2, col, n - 1, 1).setValues(usu.getRange(2, 1, n - 1, 1).getValues()
        .map((f) => [String(f[0]).trim() === 'Enrique Delfante']));
    }
  }
  usu.getRange(2, col, 200, 1).insertCheckboxes();
}

/** Versión 3: stock por estancia. En hojas ya existentes agrega "Por estancia" en Insumos
 *  (tildada solo en Fardos, pedido del 28/09/2026) y "Estancia" al final de Movimientos. */
function asegurarColumnasEstancia_(ins, mov) {
  const colIns = COLS_INSUMOS.indexOf('Por estancia') + 1;
  if (String(ins.getRange(1, colIns).getValue()) !== 'Por estancia') {
    ins.getRange(1, colIns).setValue('Por estancia').setFontWeight('bold').setBackground('#eeeeee');
    const n = ins.getLastRow();
    if (n > 1) {
      ins.getRange(2, colIns, n - 1, 1).setValues(ins.getRange(2, 1, n - 1, 1).getValues()
        .map((f) => [String(f[0]).trim() === 'Fardos']));
    }
  }
  ins.getRange(2, colIns, 200, 1).insertCheckboxes();
  const colMov = COLS_MOV.indexOf('Estancia') + 1;
  if (String(mov.getRange(1, colMov).getValue()) !== 'Estancia') {
    mov.getRange(1, colMov).setValue('Estancia').setFontWeight('bold').setBackground('#eeeeee');
  }
}

/** Versión 4: columna "Producción propia" en una hoja Insumos ya existente (tildada solo en
 *  Fardos, que se producen en la estancia: pedido del 28/09/2026). */
function asegurarColumnaPropia_(ins) {
  const col = COLS_INSUMOS.indexOf('Producción propia') + 1;
  if (String(ins.getRange(1, col).getValue()) !== 'Producción propia') {
    ins.getRange(1, col).setValue('Producción propia').setFontWeight('bold').setBackground('#eeeeee');
    const n = ins.getLastRow();
    if (n > 1) {
      ins.getRange(2, col, n - 1, 1).setValues(ins.getRange(2, 1, n - 1, 1).getValues()
        .map((f) => [String(f[0]).trim() === 'Fardos']));
    }
  }
  ins.getRange(2, col, 200, 1).insertCheckboxes();
}

/** Versión 5: Tapfeed. Columna "Nombre en Tapfeed" en Insumos (con los nombres conocidos),
 *  insumos nuevos (Silo micropicado Gatton, Maíz quebrado) y la hoja Tapfeed. */
function asegurarTapfeed_(ss, ins) {
  const col = COLS_INSUMOS.indexOf('Nombre en Tapfeed') + 1;
  if (String(ins.getRange(1, col).getValue()) !== 'Nombre en Tapfeed') {
    ins.getRange(1, col).setValue('Nombre en Tapfeed').setFontWeight('bold').setBackground('#eeeeee');
  }
  const n = ins.getLastRow();
  const actuales = n > 1 ? ins.getRange(2, 1, n - 1, COLS_INSUMOS.length).getValues() : [];
  actuales.forEach((f, i) => {
    const ini = INSUMOS_INICIALES.find((x) => x[0] === String(f[0]).trim());
    if (ini && ini[7] && !String(f[col - 1]).trim()) ins.getRange(i + 2, col).setValue(ini[7]);
  });
  const faltan = INSUMOS_INICIALES.filter((x) => !actuales.some((f) => String(f[0]).trim() === x[0]));
  if (faltan.length) ins.getRange(ins.getLastRow() + 1, 1, faltan.length, COLS_INSUMOS.length).setValues(faltan);
  hoja_(ss, 'Tapfeed', COLS_TAPFEED).getRange('A:A').setNumberFormat('@');
}

/** Importa una sola vez el CSV de carga inicial (ingresos y consumos anteriores a la app).
 *  Formato: id;AAAA-MM-DD;Tipo;Insumo;Cantidad;Destino;Nota (con encabezado). */
function importarCargaInicial_(ss) {
  const archivos = DriveApp.getFilesByName(CARGA_INICIAL);
  if (!archivos.hasNext()) return;
  const archivo = archivos.next();
  conLock_(() => {
    const movs = leerMovimientos_(ss);
    const insumos = {};
    leerInsumos_(ss).forEach((i) => { insumos[i.nombre] = i; });
    const ahora = new Date();
    const filas = [];
    archivo.getBlob().getDataAsString('UTF-8').split(/\r?\n/).slice(1).forEach((l) => {
      const c = l.split(';');
      if (c.length < 5 || !c[0] || movs.some((m) => m.id === c[0])) return;
      const ins = insumos[c[3]];
      if (!ins || !esFecha_(c[1]) || TIPOS_MOV.indexOf(c[2]) === -1) throw new Error('carga inicial: fila inválida: ' + l);
      const cant = Number(c[4]);
      filas.push([c[0], c[1], c[2], ins.nombre, cant, ins.unidad, ins.kgUnidad ? Math.round(cant * ins.kgUnidad * 100) / 100 : '',
        c[5] || '', '', '', '', c[6] || '', 'Carga inicial', '', ahora, false, '', ahora.getTime() + filas.length, '']);
    });
    const sh = ss.getSheetByName('Movimientos');
    if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS_MOV.length).setValues(filas);
    registrar_(ss, [[ahora, 'Carga inicial', 'Importar ' + CARGA_INICIAL, filas.length + ' movimientos', 'Aplicado', '']]);
    reconstruirStock_(ss);
    publicarDatosInforme_(ss);
  });
  archivo.setName(CARGA_INICIAL.replace('.csv', ' (importado).csv'));
}

function hoja_(ss, nombre, encabezado) {
  let h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  if (encabezado && h.getLastRow() === 0) {
    h.getRange(1, 1, 1, encabezado.length).setValues([encabezado]).setFontWeight('bold').setBackground('#eeeeee');
    h.setFrozenRows(1);
  }
  return h;
}

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- web (lo que llama la app)
function doGet() {
  asegurarConfigurado_();
  importarCargaInicial_(SpreadsheetApp.getActive());
  publicarDatosInforme_(SpreadsheetApp.getActive());
  const url = SpreadsheetApp.getActive().getUrl();
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;font-size:20px;padding:24px">' +
    '<p>✓ <b>Registros Zehirut</b> está funcionando.</p>' +
    '<p><a href="' + url + '" target="_blank">Abrir la planilla</a></p></div>')
    .setTitle('Registros Zehirut');
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'pedido inválido' }); }
  try {
    asegurarConfigurado_();
    switch (body.accion) {
      case 'entrar': return json_(entrar_(body));
      case 'guardar': return json_(guardar_(body));
      case 'datos': return json_(datos_(body));
      case 'catalogo': return json_(guardarCatalogo_(body));
      case 'tapfeed': return json_(cargarTapfeed_(body));
      default: return json_({ ok: false, error: 'acción desconocida' });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- usuarios y permisos
// Freno contra probar PIN al azar: después de 15 errores en 10 minutos no se acepta ninguno.
const MAX_FALLOS = 15;

function leerUsuarios_(ss) {
  const sh = ss.getSheetByName('Usuarios');
  const n = sh.getLastRow();
  if (n < 2) return [];
  const enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  return sh.getRange(2, 1, n - 1, enc.length).getValues().map((f) => {
    const permisos = {};
    MODULOS.forEach((m) => {
      const i = enc.indexOf(m);
      permisos[m] = i === -1 ? '' : String(f[i] || '').trim();
    });
    const activo = f[2] === true || /^(SI|SÍ|TRUE)$/i.test(String(f[2]).trim());
    const iConf = enc.indexOf('Configurar');
    const configura = iConf !== -1 && (f[iConf] === true || /^(SI|SÍ|TRUE)$/i.test(String(f[iConf]).trim()));
    return { nombre: String(f[0]).trim(), pin: String(f[1]).trim(), activo, permisos, configura };
  }).filter((u) => u.nombre && u.pin && u.activo);
}

/** Usuario dueño de ese PIN, o error. Dos usuarios con el mismo PIN: no se adivina cuál es. */
function usuarioDe_(ss, pin) {
  pin = String(pin || '').trim();
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_FALLOS) throw new Error('demasiados intentos con PIN equivocado; esperá 10 minutos');
  const encontrados = pin ? leerUsuarios_(ss).filter((u) => u.pin === pin) : [];
  if (encontrados.length > 1) throw new Error('ese PIN lo tienen dos usuarios; avisale al administrador');
  if (!encontrados.length) {
    cache.put('fallos', String(fallos + 1), 600);
    throw Object.assign(new Error('PIN incorrecto'), { pinInvalido: true });
  }
  return encontrados[0];
}

function nivel_(u, modulo) {
  return NIVELES[String(u.permisos[modulo] || '').toUpperCase()] || 0;
}

function exigir_(u, modulo, minimo) {
  if (nivel_(u, modulo) < NIVELES[minimo]) {
    throw new Error('no tenés permiso para ' + (minimo === 'VER' ? 'ver ' : minimo === 'CARGAR' ? 'cargar en ' : 'administrar ') + modulo);
  }
}

function publico_(u) {
  return { nombre: u.nombre, permisos: u.permisos, configura: !!u.configura };
}

function entrar_(body) {
  const ss = SpreadsheetApp.getActive();
  try {
    return { ok: true, usuario: publico_(usuarioDe_(ss, body.pin)) };
  } catch (e) {
    if (e.pinInvalido) return { ok: true, usuario: null };
    throw e;
  }
}

// ---------------------------------------------------------------- utilidades de fechas
function iso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd');
  const s = String(v || '');
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : s;
}

function ddmmaaaa_(isoFecha) {
  const p = isoFecha.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function sumarDias_(isoFecha, n) {
  const p = isoFecha.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

const esFecha_ = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const texto_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 120);

// ---------------------------------------------------------------- catálogos (insumos / destinos)
function leerInsumos_(ss) {
  const sh = ss.getSheetByName('Insumos');
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS_INSUMOS.length).getValues()
    .filter((f) => String(f[0]).trim())
    .map((f) => ({
      nombre: String(f[0]).trim(),
      unidad: String(f[1]).trim() || 'kg',
      kgUnidad: f[2] === '' ? null : Number(f[2]),
      minimo: f[3] === '' ? null : Number(f[3]),
      activo: f[4] === true || String(f[4]).toUpperCase() === 'TRUE',
      porEstancia: f[5] === true || String(f[5]).toUpperCase() === 'TRUE',
      propia: f[6] === true || String(f[6]).toUpperCase() === 'TRUE',
      tapfeed: String(f[7] || '').trim(),
    }));
}

function leerDestinos_(ss) {
  const sh = ss.getSheetByName('Destinos');
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 2).getValues()
    .filter((f) => String(f[0]).trim())
    .map((f) => ({ nombre: String(f[0]).trim(), activo: f[1] === true || String(f[1]).toUpperCase() === 'TRUE' }));
}

/** Reemplaza la lista de insumos o de destinos (solo quien tiene tildado Configurar). Nunca se borra
 *  uno que tenga movimientos: se desactiva, para que el historial siga mostrando su nombre. */
function guardarCatalogo_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (!u.configura) throw new Error('no tenés permiso para cambiar las listas de insumos y destinos');
  return conLock_(() => {
    const usados = {};
    leerMovimientos_(ss).forEach((m) => { usados[m.insumo] = true; usados['D:' + m.destino] = true; });
    let filas, sh, ancho;
    if (body.tipo === 'insumos') {
      const vistos = {};
      filas = (Array.isArray(body.lista) ? body.lista : []).map((x) => {
        const nombre = texto_(x.nombre, 60);
        const unidad = texto_(x.unidad, 20) || 'kg';
        const kg = x.kgUnidad === '' || x.kgUnidad == null ? '' : Number(x.kgUnidad);
        const minimo = x.minimo === '' || x.minimo == null ? '' : Number(x.minimo);
        if (!nombre) throw new Error('hay un insumo sin nombre');
        if (vistos[nombre.toUpperCase()]) throw new Error('el insumo "' + nombre + '" está repetido');
        vistos[nombre.toUpperCase()] = true;
        if (kg !== '' && !(kg > 0)) throw new Error('kg por unidad inválido en ' + nombre);
        if (minimo !== '' && !(minimo >= 0)) throw new Error('stock mínimo inválido en ' + nombre);
        // El nombre en Tapfeed no se edita desde la app: se conserva el de la hoja.
        const antes = leerInsumos_(ss).find((i) => i.nombre.toUpperCase() === nombre.toUpperCase());
        return [nombre, unidad, kg, minimo, x.activo !== false, x.porEstancia === true, x.propia === true, antes ? antes.tapfeed : ''];
      });
      leerInsumos_(ss).forEach((i) => {
        if (usados[i.nombre] && !vistos[i.nombre.toUpperCase()]) filas.push([i.nombre, i.unidad, i.kgUnidad == null ? '' : i.kgUnidad, i.minimo == null ? '' : i.minimo, false, !!i.porEstancia, !!i.propia, i.tapfeed]);
      });
      sh = ss.getSheetByName('Insumos'); ancho = COLS_INSUMOS.length;
    } else if (body.tipo === 'destinos') {
      const vistos = {};
      filas = (Array.isArray(body.lista) ? body.lista : []).map((x) => {
        const nombre = texto_(x.nombre, 60);
        if (!nombre) throw new Error('hay un destino sin nombre');
        if (vistos[nombre.toUpperCase()]) throw new Error('el destino "' + nombre + '" está repetido');
        vistos[nombre.toUpperCase()] = true;
        return [nombre, x.activo !== false];
      });
      leerDestinos_(ss).forEach((d) => {
        if (usados['D:' + d.nombre] && !vistos[d.nombre.toUpperCase()]) filas.push([d.nombre, false]);
      });
      sh = ss.getSheetByName('Destinos'); ancho = 2;
    } else {
      throw new Error('catálogo desconocido');
    }
    if (!filas.length) throw new Error('la lista quedó vacía');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ancho).clearContent();
    sh.getRange(2, 1, filas.length, ancho).setValues(filas);
    registrar_(ss, [[new Date(), u.nombre, 'Editar ' + body.tipo, filas.map((f) => f[0]).join(', '), 'Aplicado', '']]);
    reconstruirStock_(ss);
    return { ok: true };
  });
}

// ---------------------------------------------------------------- movimientos y stock
function leerMovimientos_(ss) {
  const sh = ss.getSheetByName('Movimientos');
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS_MOV.length).getValues().map((f, i) => ({
    fila: i + 2,
    id: String(f[0]),
    fecha: iso_(f[1]),
    tipo: String(f[2]),
    insumo: String(f[3]),
    cantidad: Number(f[4]) || 0,
    unidad: String(f[5]),
    kg: f[6] === '' ? null : Number(f[6]),
    destino: String(f[7]),
    proveedor: String(f[8]),
    remito: String(f[9]),
    factura: String(f[10]),
    nota: String(f[11]),
    usuario: String(f[12]),
    anulado: f[15] === true || String(f[15]).toUpperCase() === 'TRUE',
    anuladoPor: String(f[16]),
    ts: Number(f[17]) || 0,
    estancia: String(f[18] || ''),
  })).filter((m) => m.id);
}

/** Clave del saldo: el insumo, o insumo|ESTANCIA si lleva stock por estancia. */
function claveStock_(insumo, estancia) {
  return estancia ? insumo + '|' + estancia : insumo;
}

/** Saldo de cada insumo (y estancia): en orden de fecha (y de carga dentro del día), un conteo
 *  fija el saldo y ingresos/consumos suman o restan. Los anulados no cuentan. */
function calcularStock_(insumos, movs) {
  const s = {};
  const nuevo = (insumo, estancia) => ({ insumo, estancia: estancia || '', cantidad: 0, ultimoConteo: null, ultimo: null });
  insumos.forEach((i) => {
    if (i.porEstancia) ESTANCIAS.forEach((e) => { s[claveStock_(i.nombre, e)] = nuevo(i.nombre, e); });
    else s[i.nombre] = nuevo(i.nombre, '');
  });
  movs.filter((m) => !m.anulado)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ts - b.ts))
    .forEach((m) => {
      const k = claveStock_(m.insumo, m.estancia);
      const x = s[k] || (s[k] = nuevo(m.insumo, m.estancia));
      if (m.tipo === 'Conteo') { x.cantidad = m.cantidad; x.ultimoConteo = m.fecha; }
      else if (m.tipo === 'Ingreso') x.cantidad += m.cantidad;
      else if (m.tipo === 'Consumo') x.cantidad -= m.cantidad;
      x.cantidad = Math.round(x.cantidad * 1000) / 1000;
      x.ultimo = m.fecha;
    });
  return s;
}

function nombreEstancia_(e) {
  return e === 'LA PRUDENCIA' ? 'La Prudencia' : e === 'LA PACIENCIA' ? 'La Paciencia' : e;
}

function reconstruirStock_(ss, movs) {
  movs = movs || leerMovimientos_(ss);
  const insumos = leerInsumos_(ss);
  const saldos = calcularStock_(insumos, movs);
  const sh = ss.getSheetByName('Stock');
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const desde7 = sumarDias_(hoy, -6);
  const consumo7 = {};
  movs.forEach((m) => {
    const k = claveStock_(m.insumo, m.estancia);
    if (!m.anulado && m.tipo === 'Consumo' && m.fecha >= desde7 && m.fecha <= hoy) consumo7[k] = (consumo7[k] || 0) + m.cantidad;
  });
  const valores = [['Insumo', 'Stock', 'Unidad', 'Stock en kg', 'Consumo últimos 7 días', 'Promedio por día', 'Alcanza para (días)', 'Stock mínimo', 'Último conteo', 'Último movimiento']];
  const fondos = [valores[0].map(() => '#eeeeee')];
  insumos.forEach((i) => {
    // Un renglón por estancia si el insumo lleva stock por estancia (más uno "sin estancia"
    // solo si quedó algo cargado antes de separarlo).
    const claves = Object.keys(saldos).filter((k) => saldos[k].insumo === i.nombre &&
      (!i.porEstancia ? !saldos[k].estancia : (saldos[k].estancia || saldos[k].ultimo)));
    claves.forEach((k) => {
      const x = saldos[k];
      if (!i.activo && !x.ultimo) return;
      const c7 = consumo7[k] || 0;
      const prom = Math.round((c7 / 7) * 100) / 100;
      const bajo = i.minimo != null && x.cantidad < i.minimo;
      valores.push([
        i.nombre + (i.porEstancia ? ' – ' + (x.estancia ? nombreEstancia_(x.estancia) : 'sin estancia') : ''),
        x.cantidad, i.unidad, i.kgUnidad ? x.cantidad * i.kgUnidad : (i.unidad === 'kg' ? x.cantidad : ''),
        c7, prom, prom > 0 ? Math.floor(x.cantidad / prom) : '', i.minimo == null ? '' : i.minimo,
        x.ultimoConteo ? ddmmaaaa_(x.ultimoConteo) : '', x.ultimo ? ddmmaaaa_(x.ultimo) : '',
      ]);
      fondos.push(valores[0].map(() => (bajo ? '#F7C1C1' : '#ffffff')));
    });
  });
  sh.clear();
  sh.getRange(1, 1, valores.length, valores[0].length).setValues(valores).setBackgrounds(fondos).setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, valores[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A1').setNote('Se rearma sola con cada carga. No editar: los cambios se hacen desde la app o en Movimientos.');
}

function registrar_(ss, filas) {
  if (!filas.length) return;
  const sh = ss.getSheetByName('Registro');
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS_REGISTRO.length).setValues(filas);
}

// ---------------------------------------------------------------- guardar (cola del teléfono)
// Cada op: { id, ts, tipo: 'mov' | 'anular' | 'factura' | 'lluvia', ... }.
// Respuesta por op: aplicado | duplicado (ya había llegado) | rechazado (con motivo).
function guardar_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  const ops = Array.isArray(body.ops) ? body.ops : [];
  return conLock_(() => {
    const ahora = new Date();
    const hoy = Utilities.formatDate(ahora, ZONA, 'yyyy-MM-dd');
    const shM = ss.getSheetByName('Movimientos');
    const movs = leerMovimientos_(ss);
    const porId = {};
    movs.forEach((m) => { porId[m.id] = m; });
    const insumos = {};
    leerInsumos_(ss).forEach((i) => { insumos[i.nombre] = i; });
    const destinos = {};
    leerDestinos_(ss).forEach((d) => { destinos[d.nombre] = d; });
    const yaProcesados = idsRegistro_(ss);
    const nuevas = [];
    const log = [];
    const resultados = [];
    const lluvias = [];
    let tocoStock = false;

    ops.forEach((op) => {
      const id = texto_(op.id, 40);
      const ts = Number(op.ts);
      const horaTel = isFinite(ts) ? Utilities.formatDate(new Date(ts), ZONA, 'dd/MM/yyyy HH:mm:ss') : '';
      const res = (estado, detalle, motivo) => {
        resultados.push({ id, estado, motivo: motivo || '' });
        if (estado === 'aplicado') yaProcesados[id] = true;
        if (estado !== 'duplicado') log.push([ahora, u.nombre, accionTexto_(op), detalle, estado === 'aplicado' ? 'Aplicado' : 'Rechazado: ' + motivo, id]);
      };
      if (!id || !isFinite(ts)) return res('rechazado', '', 'dato inválido');
      if (porId[id] || yaProcesados[id]) return res('duplicado');
      try {
        if (op.tipo === 'mov') {
          exigir_(u, 'Stock', 'CARGAR');
          const m = validarMov_(op, u, insumos, destinos, hoy);
          const fila = [id, m.fecha, m.tipo, m.insumo, m.cantidad, m.unidad, m.kg == null ? '' : m.kg, m.destino,
            m.proveedor, m.remito, m.factura, m.nota, u.nombre, horaTel, ahora, false, '', ts, m.estancia];
          nuevas.push(fila);
          porId[id] = { id, fecha: m.fecha, tipo: m.tipo, insumo: m.insumo, estancia: m.estancia, cantidad: m.cantidad, usuario: u.nombre, anulado: false, ts };
          movs.push(porId[id]);
          tocoStock = true;
          res('aplicado', m.tipo + ' ' + m.insumo + (m.estancia ? ' (' + nombreEstancia_(m.estancia) + ')' : '') + ' ' + m.cantidad + ' ' + m.unidad + ' (' + ddmmaaaa_(m.fecha) + ')' + (m.destino ? ' → ' + m.destino : ''));
        } else if (op.tipo === 'anular' || op.tipo === 'factura') {
          exigir_(u, 'Stock', 'CARGAR');
          const ref = porId[texto_(op.ref, 40)];
          if (!ref) throw new Error('ese movimiento no existe');
          const admin = nivel_(u, 'Stock') >= NIVELES.ADMINISTRAR;
          if (op.tipo === 'anular') {
            if (ref.anulado) return res('duplicado');
            // Quien carga corrige lo suyo de los últimos 7 días; lo demás, quien administra.
            if (!admin && (ref.usuario !== u.nombre || ref.fecha < sumarDias_(hoy, -7))) {
              throw new Error('solo quien administra Stock puede anular movimientos de otros o de hace más de 7 días');
            }
            const motivo = texto_(op.motivo, 200);
            ref.anulado = true;
            if (ref.fila) shM.getRange(ref.fila, 16, 1, 2).setValues([[true, u.nombre + (motivo ? ': ' + motivo : '')]]);
            else marcarNuevaAnulada_(nuevas, ref.id, u.nombre, motivo);
            tocoStock = true;
            res('aplicado', 'Anula ' + ref.tipo + ' ' + ref.insumo + ' ' + ref.cantidad + ' (' + ddmmaaaa_(ref.fecha) + ')');
          } else {
            if (ref.tipo !== 'Ingreso') throw new Error('solo se asocia factura a un ingreso');
            const factura = texto_(op.factura, 60);
            if (ref.fila) shM.getRange(ref.fila, 11).setValue(factura);
            else nuevas.forEach((f) => { if (f[0] === ref.id) f[10] = factura; });
            res('aplicado', 'Factura "' + factura + '" para ingreso ' + ref.insumo + ' (' + ddmmaaaa_(ref.fecha) + ')');
          }
        } else if (op.tipo === 'lluvia') {
          exigir_(u, 'Lluvias', 'CARGAR');
          const l = validarLluvia_(op, hoy);
          lluvias.push(l);
          res('aplicado', 'Lluvia ' + l.finca + ' ' + ddmmaaaa_(l.fecha) + ': ' + l.registros.map((r) => r.sector + '=' + r.mm).join(' '));
        } else {
          throw new Error('tipo desconocido');
        }
      } catch (e) {
        res('rechazado', '', String(e.message || e));
      }
    });

    if (nuevas.length) shM.getRange(shM.getLastRow() + 1, 1, nuevas.length, COLS_MOV.length).setValues(nuevas);
    if (lluvias.length) guardarLluvias_(lluvias, u.nombre);
    registrar_(ss, log);
    if (tocoStock) { reconstruirStock_(ss); publicarDatosInforme_(ss); }
    return { ok: true, resultados };
  });
}

function accionTexto_(op) {
  return { mov: 'Movimiento', anular: 'Anular', factura: 'Asociar factura', lluvia: 'Lluvia' }[op.tipo] || String(op.tipo);
}

/** IDs de anulaciones/facturas/lluvias ya recibidas (esas no dejan fila propia en Movimientos). */
function idsRegistro_(ss) {
  const sh = ss.getSheetByName('Registro');
  const n = sh.getLastRow();
  const ids = {};
  if (n < 2) return ids;
  sh.getRange(2, 5, n - 1, 2).getValues().forEach((f) => {
    if (f[1] && String(f[0]).indexOf('Aplicado') === 0) ids[String(f[1])] = true;
  });
  return ids;
}

function marcarNuevaAnulada_(nuevas, id, quien, motivo) {
  nuevas.forEach((f) => { if (f[0] === id) { f[15] = true; f[16] = quien + (motivo ? ': ' + motivo : ''); } });
}

function validarMov_(op, u, insumos, destinos, hoy) {
  const tipo = TIPOS_MOV.indexOf(op.clase) === -1 ? null : op.clase;
  if (!tipo) throw new Error('tipo de movimiento inválido');
  if (tipo === 'Conteo' && nivel_(u, 'Stock') < NIVELES.ADMINISTRAR) throw new Error('solo quien administra Stock carga conteos');
  const fecha = String(op.fecha || '');
  if (!esFecha_(fecha)) throw new Error('fecha inválida');
  if (fecha > sumarDias_(hoy, 1)) throw new Error('fecha futura');
  const ins = insumos[texto_(op.insumo, 60)];
  if (!ins) throw new Error('insumo desconocido: ' + op.insumo);
  const cantidad = Number(op.cantidad);
  if (!isFinite(cantidad) || cantidad < 0 || (tipo !== 'Conteo' && cantidad === 0)) throw new Error('cantidad inválida');
  const estancia = ins.porEstancia ? String(op.estancia || '') : '';
  if (ins.porEstancia && ESTANCIAS.indexOf(estancia) === -1) throw new Error('falta elegir la estancia (' + ins.nombre + ' lleva stock por estancia)');
  const destino = tipo === 'Consumo' ? texto_(op.destino, 60) : '';
  if (destino && !destinos[destino]) throw new Error('destino desconocido: ' + destino);
  return {
    tipo, fecha, insumo: ins.nombre, estancia, cantidad, unidad: ins.unidad,
    kg: ins.kgUnidad ? Math.round(cantidad * ins.kgUnidad * 1000) / 1000 : (ins.unidad === 'kg' ? cantidad : null),
    destino,
    proveedor: tipo === 'Ingreso' && !ins.propia ? texto_(op.proveedor, 80) : '',
    remito: tipo === 'Ingreso' && !ins.propia ? texto_(op.remito, 40) : '',
    factura: tipo === 'Ingreso' && !ins.propia ? texto_(op.factura, 60) : '',
    nota: texto_(op.nota, 200),
  };
}

// ---------------------------------------------------------------- lluvias
function validarLluvia_(op, hoy) {
  const finca = String(op.finca || '');
  const sectores = SECTORES_POR_FINCA[finca];
  if (!sectores) throw new Error('estancia inválida');
  const fecha = String(op.fecha || '');
  if (!esFecha_(fecha) || fecha > sumarDias_(hoy, 1)) throw new Error('fecha inválida');
  const registros = (Array.isArray(op.registros) ? op.registros : [])
    .filter((r) => sectores.indexOf(r.sector) !== -1 && r.mm !== '' && r.mm != null && isFinite(Number(r.mm)) && Number(r.mm) >= 0)
    .map((r) => ({ sector: r.sector, mm: Number(r.mm) }));
  if (!registros.length) throw new Error('no hay ningún sector con mm cargados');
  return { finca, fecha, registros };
}

function codigoFinca_(finca) {
  return finca === 'LA PRUDENCIA' ? 'LPR' : 'LPA';
}

/** Mismo formato y misma regla que ZehirutApp: ID AAAAMMDD+FINCA+SECTOR; si ya existe, se pisa. */
function guardarLluvias_(lista, usuario) {
  const hoja = SpreadsheetApp.openById(LLUVIAS_PLANILLA_ID).getSheetByName(LLUVIAS_HOJA);
  const fechaCarga = Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy');
  const valores = hoja.getDataRange().getValues();
  const filaPorId = {};
  for (let i = 1; i < valores.length; i++) if (valores[i][0]) filaPorId[String(valores[i][0])] = i + 1;
  const filasNuevas = [];
  lista.forEach((l) => {
    const fechaTxt = ddmmaaaa_(l.fecha);
    l.registros.forEach((r) => {
      const id = l.fecha.replace(/-/g, '') + codigoFinca_(l.finca) + r.sector;
      if (filaPorId[id]) {
        hoja.getRange(filaPorId[id], 5, 1, 3).setValues([[r.mm, usuario, fechaCarga]]);
      } else {
        filaPorId[id] = -1;   // si vuelve a venir en este mismo envío, se actualiza la fila nueva
        const existente = filasNuevas.find((f) => f[0] === id);
        if (existente) { existente[4] = r.mm; } else filasNuevas.push([id, l.finca, r.sector, fechaTxt, r.mm, usuario, fechaCarga]);
      }
    });
  });
  if (filasNuevas.length) {
    const primera = hoja.getLastRow() + 1;
    hoja.getRange(primera, 1, filasNuevas.length, 7).setValues(filasNuevas);
    hoja.getRange(primera, 1, filasNuevas.length, 1).setNumberFormat('@');
  }
}

function datosLluvias_(desde) {
  const hoja = SpreadsheetApp.openById(LLUVIAS_PLANILLA_ID).getSheetByName(LLUVIAS_HOJA);
  const valores = hoja.getDataRange().getValues();
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const anio = hoy.slice(0, 4);
  const mes = Number(hoy.slice(5, 7));
  const inicioTemp = (mes >= 9 ? Number(anio) : Number(anio) - 1) + '-09-01';
  const finTemp = (Number(inicioTemp.slice(0, 4)) + 1) + '-08-31';
  // Temporada anterior completa (set-ago), para comparar con la actual.
  const inicioAnt = (Number(inicioTemp.slice(0, 4)) - 1) + '-09-01';
  const finAnt = inicioTemp.slice(0, 4) + '-08-31';
  const resumen = {};
  const registros = [];
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    if (!f[0]) continue;
    const fecha = iso_(f[3]);
    if (!esFecha_(fecha)) continue;
    const mm = Number(f[4]) || 0;
    const k = f[1] + '|' + f[2];
    if (!resumen[k]) resumen[k] = { finca: String(f[1]), sector: String(f[2]), anio: 0, temporada: 0, anterior: 0 };
    if (fecha.slice(0, 4) === anio) resumen[k].anio += mm;
    if (fecha >= inicioTemp && fecha <= finTemp) resumen[k].temporada += mm;
    if (fecha >= inicioAnt && fecha <= finAnt) resumen[k].anterior += mm;
    if (fecha >= desde) registros.push({ finca: String(f[1]), sector: String(f[2]), fecha, mm, usuario: String(f[5]) });
  }
  const yy = (a) => String(a).slice(-2);
  return {
    sectores: SECTORES_POR_FINCA,
    registros,
    resumen: Object.keys(resumen).map((k) => resumen[k])
      .sort((a, b) => (a.finca !== b.finca ? (a.finca < b.finca ? -1 : 1) : (a.sector < b.sector ? -1 : 1))),
    anio: Number(anio),
    temporada: 'SET' + yy(inicioTemp.slice(0, 4)) + '/AGO' + yy(finTemp.slice(0, 4)),
    // Rótulos cortos para la app: 26-27 (actual) y 25-26 (anterior).
    temporadaCorta: yy(inicioTemp.slice(0, 4)) + '-' + yy(finTemp.slice(0, 4)),
    temporadaAnterior: yy(inicioAnt.slice(0, 4)) + '-' + yy(inicioTemp.slice(0, 4)),
  };
}

// ---------------------------------------------------------------- datos para la app
function datos_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  const desde = esFecha_(body.desde) ? body.desde : '0000-00-00';
  const r = { ok: true, usuario: publico_(u) };
  if (nivel_(u, 'Stock') >= NIVELES.VER) {
    const movs = leerMovimientos_(ss);
    const insumos = leerInsumos_(ss);
    const saldos = calcularStock_(insumos, movs);
    const propias = {};
    insumos.forEach((i) => { if (i.propia) propias[i.nombre] = true; });
    r.stock = {
      insumos,
      destinos: leerDestinos_(ss),
      saldos: Object.keys(saldos).map((k) => saldos[k]),
      movimientos: movs.filter((m) => m.fecha >= desde || (m.tipo === 'Ingreso' && !m.factura && !m.anulado && !propias[m.insumo]))
        .map((m) => {
          const x = Object.assign({}, m);
          delete x.fila;
          return x;
        }),
      proveedores: movs.map((m) => m.proveedor).filter((p, i, a) => p && a.indexOf(p) === i).sort(),
    };
  }
  if (u.configura) r.tapfeedDias = diasTapfeed_(ss).filter((f) => f >= desde);
  if (nivel_(u, 'Lluvias') >= NIVELES.VER) r.lluvias = datosLluvias_(desde);
  return r;
}

// ---------------------------------------------------------------- Tapfeed (consumo del confinamiento)
// El PDF "Uso de ingredientes por grupo" se lee en la app (pdf.js) y llega ya interpretado:
// { fecha, corrales: [{ nombre, cabezas, items: [{ nombre, kg, ms }] }], total: [{ nombre, kg, ms }] }
// más el PDF en base64 para guardarlo en "1 Tapfeed". Por cada ingrediente del total se registra
// un consumo con destino Confinamiento; el detalle por corral va a la hoja Tapfeed.

function diasTapfeed_(ss) {
  const sh = ss.getSheetByName('Tapfeed');
  const n = sh.getLastRow();
  if (n < 2) return [];
  const dias = {};
  sh.getRange(2, 1, n - 1, 1).getValues().forEach((f) => { if (f[0]) dias[iso_(f[0])] = true; });
  return Object.keys(dias).sort();
}

function cargarTapfeed_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (!u.configura) throw new Error('solo quien configura puede cargar informes de Tapfeed');
  const d = body.datos || {};
  const fecha = String(d.fecha || '');
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  if (!esFecha_(fecha) || fecha > hoy) throw new Error('fecha del informe inválida');
  const total = Array.isArray(d.total) ? d.total : [];
  const corrales = Array.isArray(d.corrales) ? d.corrales : [];
  if (!total.length || !corrales.length) throw new Error('el informe no trae datos');
  const porTapfeed = {};
  leerInsumos_(ss).forEach((i) => { if (i.tapfeed) porTapfeed[i.tapfeed.toUpperCase()] = i; });
  const desconocidos = total.filter((t) => !porTapfeed[String(t.nombre).trim().toUpperCase()]).map((t) => t.nombre);
  if (desconocidos.length) {
    throw new Error('no sé a qué insumo corresponde: ' + desconocidos.join(', ') + '. Poné ese nombre en la columna "Nombre en Tapfeed" de la hoja Insumos.');
  }
  return conLock_(() => {
    const ya = diasTapfeed_(ss).indexOf(fecha) !== -1;
    if (ya && !body.reemplazar) return { ok: true, yaCargado: true };
    const ahora = new Date();
    const movs = leerMovimientos_(ss);
    const shM = ss.getSheetByName('Movimientos');
    const shT = ss.getSheetByName('Tapfeed');
    const log = [];
    if (ya) {
      // Reemplazo: se anulan los consumos de ese día y se saca su detalle.
      movs.filter((m) => m.id.indexOf('TF-' + fecha + '-') === 0 && !m.anulado).forEach((m) => {
        shM.getRange(m.fila, 16, 1, 2).setValues([[true, u.nombre + ': reemplazado por otro informe de Tapfeed']]);
      });
      const n = shT.getLastRow();
      const quedan = shT.getRange(2, 1, n - 1, COLS_TAPFEED.length).getValues().filter((f) => iso_(f[0]) !== fecha);
      shT.getRange(2, 1, n - 1, COLS_TAPFEED.length).clearContent();
      if (quedan.length) shT.getRange(2, 1, quedan.length, COLS_TAPFEED.length).setValues(quedan);
      log.push([ahora, u.nombre, 'Tapfeed', 'Reemplazo del ' + ddmmaaaa_(fecha), 'Aplicado', '']);
    }
    let url = '';
    try {
      const pdf = Utilities.newBlob(Utilities.base64Decode(String(body.pdf || '')), 'application/pdf',
        texto_(body.nombreArchivo, 120) || ('Uso de ingredientes ' + fecha + '.pdf'));
      url = DriveApp.getFolderById(TAPFEED_CARPETA).createFile(pdf).getUrl();
    } catch (e) {
      log.push([ahora, u.nombre, 'Tapfeed', 'No se pudo guardar el PDF: ' + e, 'Aviso', '']);
    }
    const sufijo = ya ? '-' + ahora.getTime() : '';
    const filasMov = total.map((t, k) => {
      const ins = porTapfeed[String(t.nombre).trim().toUpperCase()];
      const kg = Math.round(Number(t.kg) * 100) / 100;
      const cant = ins.kgUnidad && ins.unidad !== 'kg' ? Math.round((kg / ins.kgUnidad) * 1000) / 1000 : kg;
      const id = 'TF-' + fecha + '-' + ins.nombre.replace(/[^A-Za-z0-9]+/g, '') + sufijo;
      log.push([ahora, u.nombre, 'Tapfeed', 'Consumo ' + ins.nombre + ' ' + kg + ' kg (' + ddmmaaaa_(fecha) + ')', 'Aplicado', id]);
      return [id, fecha, 'Consumo', ins.nombre, cant, ins.unidad, kg, 'Confinamiento', '', '', '', 'Tapfeed',
        'Tapfeed (' + u.nombre + ')', '', ahora, false, '', ahora.getTime() + k, ''];
    });
    shM.getRange(shM.getLastRow() + 1, 1, filasMov.length, COLS_MOV.length).setValues(filasMov);
    const filasT = [];
    corrales.forEach((c) => {
      (Array.isArray(c.items) ? c.items : []).forEach((it) => {
        const ins = porTapfeed[String(it.nombre).trim().toUpperCase()];
        filasT.push([fecha, texto_(c.nombre, 60), Number(c.cabezas) || '', ins ? ins.nombre : '', texto_(it.nombre, 60),
          Number(it.kg) || 0, Number(it.ms) || 0, url, u.nombre, ahora]);
      });
    });
    if (filasT.length) shT.getRange(shT.getLastRow() + 1, 1, filasT.length, COLS_TAPFEED.length).setValues(filasT);
    registrar_(ss, log);
    reconstruirStock_(ss);
    publicarDatosInforme_(ss);
    return { ok: true, fecha, consumos: filasMov.length, archivo: url };
  });
}

// ---------------------------------------------------------------- datos para el informe diario
// La tarea lee esta planilla con una herramienta que devuelve solo ~100 filas por hoja: por eso
// acá va todo YA CALCULADO y corto (últimos INFORME_DIAS días), no el historial completo.
//   Resumen              — actualización, último día con Tapfeed, días faltantes
//   Stock por día        — por día e ingrediente del confinamiento: consumo, acumulado, 7 días,
//                          promedio, saldo y días de stock (todo en kg)
//   Corrales por día     — por día y corral: cabezas, kg tal cual y kg MS (Tapfeed)
//   Ingredientes por día — por día e ingrediente: kg tal cual y kg MS (Tapfeed)
//   Stock actual         — saldo de hoy de todos los insumos
function publicarDatosInforme_(ss) {
  try {
    const dest = SpreadsheetApp.openById(INFORME_PLANILLA_ID);
    const movs = leerMovimientos_(ss).filter((m) => !m.anulado);
    const insumos = leerInsumos_(ss);
    const porNombre = {};
    insumos.forEach((i) => { porNombre[i.nombre] = i; });
    const kgDe = (insumo, cant) => {
      const i = porNombre[insumo] || {};
      return i.kgUnidad ? cant * i.kgUnidad : (i.unidad === 'kg' ? cant : 0);
    };
    const r0 = (n) => Math.round(n);
    const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    const desde = sumarDias_(hoy, -(INFORME_DIAS - 1));
    const escribir = (nombre, filas) => {
      let h = dest.getSheetByName(nombre);
      if (!h) h = dest.insertSheet(nombre);
      h.clear();
      h.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
      h.getRange(1, 1, 1, filas[0].length).setFontWeight('bold').setBackground('#eeeeee');
      h.setFrozenRows(1);
      return h;
    };

    // Detalle de Tapfeed (hoja de la app).
    const shT = ss.getSheetByName('Tapfeed');
    const tf = shT.getLastRow() > 1 ? shT.getRange(2, 1, shT.getLastRow() - 1, COLS_TAPFEED.length).getValues()
      .map((f) => ({ fecha: iso_(f[0]), corral: String(f[1]), cabezas: Number(f[2]) || 0, insumo: String(f[3]), nombreTf: String(f[4]), kg: Number(f[5]) || 0, ms: Number(f[6]) || 0 })) : [];
    const diasTf = tf.map((t) => t.fecha).filter((f, i, a) => a.indexOf(f) === i).sort();
    const faltan = [];
    for (let f = INFORME_INICIO; f < hoy; f = sumarDias_(f, 1)) if (diasTf.indexOf(f) === -1) faltan.push(ddmmaaaa_(f));

    const corrales = [['Fecha', 'Corral', 'Cabezas', 'Kg tal cual', 'Kg MS']];
    const ingred = [['Fecha', 'Ingrediente', 'Kg tal cual', 'Kg MS']];
    diasTf.filter((f) => f >= desde).forEach((f) => {
      const delDia = tf.filter((t) => t.fecha === f);
      const pc = {};
      const pi = {};
      delDia.forEach((t) => {
        const c = pc[t.corral] || (pc[t.corral] = { cab: t.cabezas, kg: 0, ms: 0 });
        c.kg += t.kg; c.ms += t.ms;
        const nom = t.insumo || t.nombreTf;
        const i = pi[nom] || (pi[nom] = { kg: 0, ms: 0 });
        i.kg += t.kg; i.ms += t.ms;
      });
      Object.keys(pc).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
        .forEach((c) => corrales.push([ddmmaaaa_(f), c, pc[c].cab, r0(pc[c].kg), Math.round(pc[c].ms * 100) / 100]));
      Object.keys(pi).sort().forEach((i) => ingred.push([ddmmaaaa_(f), i, r0(pi[i].kg), r0(pi[i].ms)]));
    });

    // Stock por día de los ingredientes del confinamiento (los que tienen nombre en Tapfeed).
    const ingConfi = insumos.filter((i) => i.tapfeed).map((i) => i.nombre);
    const consumoDia = {};   // insumo|fecha -> kg (todos los destinos)
    movs.filter((m) => m.tipo === 'Consumo').forEach((m) => {
      const k = m.insumo + '|' + m.fecha;
      consumoDia[k] = (consumoDia[k] || 0) + kgDe(m.insumo, m.cantidad);
    });
    const orden = movs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ts - b.ts));
    const saldoAl = (insumo, fecha) => {
      let s = 0;
      orden.forEach((m) => {
        if (m.insumo !== insumo || m.fecha > fecha) return;
        if (m.tipo === 'Conteo') s = m.cantidad; else if (m.tipo === 'Ingreso') s += m.cantidad; else if (m.tipo === 'Consumo') s -= m.cantidad;
      });
      return kgDe(insumo, s);
    };
    const stockDia = [['Fecha', 'Ingrediente', 'Consumo del día kg', 'Consumo acumulado kg (desde 21/09/2026)', 'Consumo últimos 7 días kg',
      'Promedio diario 7 días kg', 'Saldo kg', 'Días de stock']];
    for (let f = desde; f <= hoy; f = sumarDias_(f, 1)) {
      ingConfi.forEach((ins) => {
        let acum = 0;
        let siete = 0;
        Object.keys(consumoDia).forEach((k) => {
          const p = k.split('|');
          if (p[0] !== ins || p[1] > f) return;
          if (p[1] >= INFORME_ACUM_DESDE) acum += consumoDia[k];
          if (p[1] > sumarDias_(f, -7)) siete += consumoDia[k];
        });
        const prom = siete / 7;
        const saldo = saldoAl(ins, f);
        stockDia.push([ddmmaaaa_(f), ins, r0(consumoDia[ins + '|' + f] || 0), r0(acum), r0(siete), r0(prom), r0(saldo),
          prom > 0 ? Math.floor(saldo / prom) : '—']);
      });
    }

    const saldos = calcularStock_(insumos, movs);
    const stock = [['Insumo', 'Estancia', 'Saldo', 'Unidad', 'Saldo kg']];
    Object.keys(saldos).map((k) => saldos[k]).forEach((x) => {
      const i = porNombre[x.insumo];
      if (!i || !i.activo) return;
      stock.push([x.insumo, x.estancia ? nombreEstancia_(x.estancia) : '', Math.round(x.cantidad * 100) / 100, i.unidad, i.kgUnidad || i.unidad === 'kg' ? r0(kgDe(x.insumo, x.cantidad)) : '']);
    });

    const resumen = escribir('Resumen', [
      ['Dato', 'Valor'],
      ['Planilla', 'Registros Zehirut – datos para el informe. La actualiza sola la app con cada carga. No editar.'],
      ['Actualizada', Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm')],
      ['Días incluidos', 'Últimos ' + INFORME_DIAS + ' días: ' + ddmmaaaa_(desde) + ' al ' + ddmmaaaa_(hoy)],
      ['Días con Tapfeed en ese período', diasTf.filter((f) => f >= desde).map(ddmmaaaa_).join(', ') || 'ninguno'],
      ['Último día con Tapfeed', diasTf.length ? ddmmaaaa_(diasTf[diasTf.length - 1]) : 'ninguno'],
      ['Días sin Tapfeed desde ' + ddmmaaaa_(INFORME_INICIO) + ' hasta ayer', faltan.join(', ') || 'ninguno'],
      ['Unidades', 'Todo en kg, redondeado. Consumo = confinamiento (Tapfeed) + otros destinos (autoconsumo, cargado en la app).'],
    ]);
    escribir('Stock por día', stockDia);
    escribir('Corrales por día', corrales);
    escribir('Ingredientes por día', ingred);
    escribir('Stock actual', stock);
    dest.getSheets().forEach((h) => {
      if (['Resumen', 'Stock por día', 'Corrales por día', 'Ingredientes por día', 'Stock actual'].indexOf(h.getName()) === -1) dest.deleteSheet(h);
    });
    dest.setActiveSheet(resumen);
  } catch (e) {
    // Nunca frena una carga: si falla, queda anotado y se reintenta con el próximo cambio.
    console.error('No se pudo actualizar la planilla del informe: ' + e);
  }
}
