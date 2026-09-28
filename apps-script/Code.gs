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
const ESQUEMA = '2';   // subir cuando cambien hojas: la próxima llamada vuelve a preparar todo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const MODULOS = ['Stock', 'Lluvias', 'Facturas', 'Combustible', 'Fondo fijo'];
const NIVELES = { '': 0, 'VER': 1, 'PROPIAS': 2, 'CARGAR': 2, 'ADMINISTRAR': 3 };
// "Configurar" (casilla): editar las listas de insumos y destinos. Aparte de los niveles
// porque quien administra Stock (conteos, anular) no necesariamente arma las listas.
const COLS_USUARIOS = ['Nombre', 'PIN', 'Activo'].concat(MODULOS, ['Configurar']);
const COLS_INSUMOS = ['Insumo', 'Unidad', 'Kg por unidad', 'Stock mínimo', 'Activo'];
const COLS_DESTINOS = ['Destino', 'Activo'];
const COLS_MOV = ['ID', 'Fecha', 'Tipo', 'Insumo', 'Cantidad', 'Unidad', 'Kg', 'Destino', 'Proveedor',
  'Remito', 'Factura', 'Nota', 'Cargado por', 'Hora en el teléfono', 'Recibido', 'Anulado', 'Anulado por / motivo', 'Marca de tiempo'];
const COLS_REGISTRO = ['Recibido', 'Usuario', 'Acción', 'Detalle', 'Resultado', 'ID'];
const TIPOS_MOV = ['Ingreso', 'Consumo', 'Conteo'];

// Cargas iniciales (decididas con el usuario el 28/09/2026). Después se editan desde la app.
const INSUMOS_INICIALES = [
  ['Fardos', 'fardo', '', '', true],
  ['Maíz molido', 'kg', 1, '', true],
  ['Concentrado Desarrollo', 'bolsa', 40, '', true],
  ['Balanceado Pre destete', 'bolsa', 40, '', true],
  ['Suplemento E-PRO 35', 'bolsa', 40, '', true],
  ['Concentrado Beef 1.000 M', 'bolsa', 40, '', true],
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
        return [nombre, unidad, kg, minimo, x.activo !== false];
      });
      leerInsumos_(ss).forEach((i) => {
        if (usados[i.nombre] && !vistos[i.nombre.toUpperCase()]) filas.push([i.nombre, i.unidad, i.kgUnidad == null ? '' : i.kgUnidad, i.minimo == null ? '' : i.minimo, false]);
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
  })).filter((m) => m.id);
}

/** Saldo de cada insumo: en orden de fecha (y de carga dentro del día), un conteo fija el
 *  saldo y ingresos/consumos suman o restan. Los anulados no cuentan. */
function calcularStock_(insumos, movs) {
  const s = {};
  insumos.forEach((i) => { s[i.nombre] = { insumo: i.nombre, cantidad: 0, ultimoConteo: null, ultimo: null }; });
  movs.filter((m) => !m.anulado)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ts - b.ts))
    .forEach((m) => {
      const x = s[m.insumo] || (s[m.insumo] = { insumo: m.insumo, cantidad: 0, ultimoConteo: null, ultimo: null });
      if (m.tipo === 'Conteo') { x.cantidad = m.cantidad; x.ultimoConteo = m.fecha; }
      else if (m.tipo === 'Ingreso') x.cantidad += m.cantidad;
      else if (m.tipo === 'Consumo') x.cantidad -= m.cantidad;
      x.cantidad = Math.round(x.cantidad * 1000) / 1000;
      x.ultimo = m.fecha;
    });
  return s;
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
    if (!m.anulado && m.tipo === 'Consumo' && m.fecha >= desde7 && m.fecha <= hoy) consumo7[m.insumo] = (consumo7[m.insumo] || 0) + m.cantidad;
  });
  const valores = [['Insumo', 'Stock', 'Unidad', 'Stock en kg', 'Consumo últimos 7 días', 'Promedio por día', 'Alcanza para (días)', 'Stock mínimo', 'Último conteo', 'Último movimiento']];
  const fondos = [valores[0].map(() => '#eeeeee')];
  insumos.filter((i) => i.activo || (saldos[i.nombre] && saldos[i.nombre].ultimo)).forEach((i) => {
    const x = saldos[i.nombre];
    const c7 = consumo7[i.nombre] || 0;
    const prom = Math.round((c7 / 7) * 100) / 100;
    const bajo = i.minimo != null && x.cantidad < i.minimo;
    valores.push([
      i.nombre, x.cantidad, i.unidad, i.kgUnidad ? x.cantidad * i.kgUnidad : (i.unidad === 'kg' ? x.cantidad : ''),
      c7, prom, prom > 0 ? Math.floor(x.cantidad / prom) : '', i.minimo == null ? '' : i.minimo,
      x.ultimoConteo ? ddmmaaaa_(x.ultimoConteo) : '', x.ultimo ? ddmmaaaa_(x.ultimo) : '',
    ]);
    fondos.push(valores[0].map(() => (bajo ? '#F7C1C1' : '#ffffff')));
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
            m.proveedor, m.remito, m.factura, m.nota, u.nombre, horaTel, ahora, false, '', ts];
          nuevas.push(fila);
          porId[id] = { id, fecha: m.fecha, tipo: m.tipo, insumo: m.insumo, cantidad: m.cantidad, usuario: u.nombre, anulado: false, ts };
          movs.push(porId[id]);
          tocoStock = true;
          res('aplicado', m.tipo + ' ' + m.insumo + ' ' + m.cantidad + ' ' + m.unidad + ' (' + ddmmaaaa_(m.fecha) + ')' + (m.destino ? ' → ' + m.destino : ''));
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
    if (tocoStock) reconstruirStock_(ss);
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
  const destino = tipo === 'Consumo' ? texto_(op.destino, 60) : '';
  if (destino && !destinos[destino]) throw new Error('destino desconocido: ' + destino);
  return {
    tipo, fecha, insumo: ins.nombre, cantidad, unidad: ins.unidad,
    kg: ins.kgUnidad ? Math.round(cantidad * ins.kgUnidad * 1000) / 1000 : (ins.unidad === 'kg' ? cantidad : null),
    destino,
    proveedor: tipo === 'Ingreso' ? texto_(op.proveedor, 80) : '',
    remito: tipo === 'Ingreso' ? texto_(op.remito, 40) : '',
    factura: tipo === 'Ingreso' ? texto_(op.factura, 60) : '',
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
  const resumen = {};
  const registros = [];
  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    if (!f[0]) continue;
    const fecha = iso_(f[3]);
    if (!esFecha_(fecha)) continue;
    const mm = Number(f[4]) || 0;
    const k = f[1] + '|' + f[2];
    if (!resumen[k]) resumen[k] = { finca: String(f[1]), sector: String(f[2]), anio: 0, temporada: 0 };
    if (fecha.slice(0, 4) === anio) resumen[k].anio += mm;
    if (fecha >= inicioTemp && fecha <= finTemp) resumen[k].temporada += mm;
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
    r.stock = {
      insumos,
      destinos: leerDestinos_(ss),
      saldos: Object.keys(saldos).map((k) => saldos[k]),
      movimientos: movs.filter((m) => m.fecha >= desde || (m.tipo === 'Ingreso' && !m.factura && !m.anulado))
        .map((m) => {
          const x = Object.assign({}, m);
          delete x.fila;
          return x;
        }),
      proveedores: movs.map((m) => m.proveedor).filter((p, i, a) => p && a.indexOf(p) === i).sort(),
    };
  }
  if (nivel_(u, 'Lluvias') >= NIVELES.VER) r.lluvias = datosLluvias_(desde);
  return r;
}
