// Registros Zehirut — app del teléfono.
//
// Todo lo que se carga queda primero en el teléfono (localStorage) y entra en una cola
// que se manda al Apps Script cuando hay señal. Cada cambio lleva un id propio: si se
// manda dos veces (reintento con mala señal), el script lo guarda una sola vez.
// Lo que se ve (saldos, movimientos, lluvias) es lo último que bajó de Google más lo
// que todavía está en la cola, así la app se usa igual sin señal.
'use strict';

const VERSION = '1.4.1';
const DIAS_HISTORIAL = 60;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const NIVELES = { '': 0, VER: 1, PROPIAS: 2, CARGAR: 2, ADMINISTRAR: 3 };
const PLURAL = { bolsa: 'bolsas', fardo: 'fardos', litro: 'litros', unidad: 'unidades', kg: 'kg' };
const UNIDADES = ['bolsa', 'kg', 'fardo', 'litro', 'unidad'];
// Insumos "por estancia" (ej. Fardos) llevan un stock separado en cada una.
const ESTANCIAS = [['LA PRUDENCIA', 'La Prudencia'], ['LA PACIENCIA', 'La Paciencia']];
const nombreEstancia = (e) => (ESTANCIAS.find((x) => x[0] === e) || [e, e])[1];

// ---------------------------------------------------------------- guardado en el teléfono
const guardado = {
  leer(k, def) {
    try { const v = localStorage.getItem('rz_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  escribir(k, v) {
    try { localStorage.setItem('rz_' + k, JSON.stringify(v)); } catch (e) { /* sin espacio / bloqueado */ }
  },
};

let sesion = guardado.leer('sesion', null);      // { pin, nombre, permisos, configura }
let datos = guardado.leer('datos', null);        // última respuesta de "datos"
let cola = guardado.leer('cola', []);            // cambios todavía no enviados
let ultimaSync = guardado.leer('ultimaSync', 0);

function guardarTodo() {
  guardado.escribir('sesion', sesion);
  guardado.escribir('datos', datos);
  guardado.escribir('cola', cola);
  guardado.escribir('ultimaSync', ultimaSync);
}

// Estado de pantalla (no se guarda, salvo lo que conviene recordar entre aperturas).
const ui = {
  pantalla: 'inicio',
  vistaStock: 'lista',  // lista | ficha | form | sinFactura | config
  insumoVer: null,      // insumo de la ficha abierta
  movsVisibles: 15,
  tabLluvias: 'cargar',
  pin: '',
  errorPin: '',
  entrando: false,
  sincronizando: false,
  errorSync: '',
  form: null,        // formulario de carga de stock
  lluvia: null,      // formulario de lluvias
  cfg: null,         // copia editable de insumos/destinos
};

// ---------------------------------------------------------------- utilidades
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function sumarDias(iso, n) {
  const p = iso.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function fechaTxt(iso, conDia) {
  if (!iso) return '';
  const p = iso.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return (conDia ? DIAS_SEMANA[d.getDay()] + ' ' : '') + Number(p[2]) + ' ' + MESES[Number(p[1]) - 1] + ' ' + p[0];
}
function fechaRelativa(iso) {
  const h = hoyISO();
  if (iso === h) return 'Hoy';
  if (iso === sumarDias(h, -1)) return 'Ayer';
  return '';
}
function num(n, dec) {
  if (n == null || n === '' || !isFinite(n)) return '—';
  return Number(n).toLocaleString('es-PY', { maximumFractionDigits: dec == null ? 2 : dec });
}
/** "1.500" = mil quinientos (punto de miles); "2,5" o "2.5" = dos y medio. */
function leerNumero(txt) {
  let s = String(txt || '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
function unidadTxt(unidad, cant) {
  if (cant === 1) return unidad;
  return PLURAL[unidad] || unidad;
}
function haceCuanto(ts) {
  if (!ts) return 'nunca';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' días';
}

function nivel(modulo) {
  if (!sesion) return 0;
  return NIVELES[String((sesion.permisos || {})[modulo] || '').toUpperCase()] || 0;
}
const puede = (modulo, minimo) => nivel(modulo) >= NIVELES[minimo];

// ---------------------------------------------------------------- avisos y carteles
let toastTimer = null;
function toast(texto, ms) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.remove('oculto');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('oculto'), ms || 2600);
}

/** Cartel modal. Devuelve una promesa: true (sí), false (no) o el texto escrito si tiene input.
 *  Con o.acciones ([{ id, texto, cls }]) muestra esos botones uno debajo del otro y devuelve el id. */
function cartel(o) {
  return new Promise((resolver) => {
    const m = $('#modal');
    $('#toast').classList.add('oculto');   // que el aviso flotante no tape los botones
    m.innerHTML = '<div class="caja">' +
      (o.icono ? '<div class="icono">' + o.icono + '</div>' : '') +
      '<h3>' + esc(o.titulo) + '</h3>' +
      '<div>' + (o.html || '') + '</div>' +
      (o.input ? '<input class="txt" id="cartel-input" style="margin-top:12px" placeholder="' + esc(o.input.placeholder || '') + '" value="' + esc(o.input.valor || '') + '">' +
        '<div class="error-txt" id="cartel-error"></div>' : '') +
      (o.acciones ? '<div class="acciones">' + o.acciones.map((a) =>
        '<button class="btn ' + (a.cls || '') + '" data-r="' + esc(a.id) + '">' + esc(a.texto) + '</button>').join('') + '</div>' :
      '<div class="botones">' +
      (o.no === '' ? '' : '<button class="btn sec" data-r="no">' + esc(o.no || 'Cancelar') + '</button>') +
      (o.si === '' ? '' : '<button class="btn' + (o.peligro ? ' peligro' : '') + '" data-r="si">' + esc(o.si || 'Aceptar') + '</button>') +
      (o.extra ? '<button class="btn sec" data-r="extra">' + esc(o.extra) + '</button>' : '') +
      '</div>') + '</div>';
    m.classList.remove('oculto');
    const inp = $('#cartel-input');
    if (inp) setTimeout(() => inp.focus(), 50);
    const cerrar = (v) => { m.classList.add('oculto'); m.innerHTML = ''; m.onclick = null; resolver(v); };
    m.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) { if (e.target === m && o.no !== '') cerrar(false); return; }
      const r = b.dataset.r;
      if (o.acciones) { cerrar(r); return; }
      if (r === 'si' && inp) {
        const v = inp.value.trim();
        const err = o.validar ? o.validar(v) : '';
        if (err) { $('#cartel-error').textContent = err; return; }
        cerrar(v);
        return;
      }
      cerrar(r === 'si' ? true : r === 'extra' ? 'extra' : false);
    };
  });
}

// ---------------------------------------------------------------- comunicación con Google
async function llamarUnaVez(payload) {
  const r = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita el "preflight" CORS con Apps Script
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const texto = await r.text();
  try { return JSON.parse(texto); } catch (e) { throw new Error('respuesta inesperada de Google'); }
}

// Google a veces devuelve una página de error pasajera: se reintenta 2 veces. Todo lo que
// se manda se puede repetir sin efecto doble (el script ignora un id ya recibido).
async function llamar(payload) {
  let ultimoError;
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await new Promise((res) => setTimeout(res, 1500 * intento));
    try {
      const j = await llamarUnaVez(payload);
      if (!j.ok) throw Object.assign(new Error(j.error || 'error del servidor'), { definitivo: true });
      return j;
    } catch (e) {
      ultimoError = e;
      if (e.definitivo) break;
    }
  }
  throw ultimoError;
}

async function sincronizar() {
  if (!SCRIPT_URL || !sesion || ui.sincronizando) { renderSync(); return; }
  if (!navigator.onLine) { renderSync(); return; }
  ui.sincronizando = true;
  renderSync();
  try {
    const rechazados = [];
    while (cola.length) {
      const lote = cola.slice(0, 50);
      const res = await llamar({ accion: 'guardar', pin: sesion.pin, ops: lote });
      const ids = new Set(lote.map((o) => o.id));
      cola = cola.filter((o) => !ids.has(o.id));
      (res.resultados || []).forEach((x) => {
        if (x.estado === 'rechazado') rechazados.push({ op: lote.find((o) => o.id === x.id), motivo: x.motivo });
      });
      guardarTodo();
    }
    const d = await llamar({ accion: 'datos', pin: sesion.pin, desde: sumarDias(hoyISO(), -DIAS_HISTORIAL) });
    datos = d;
    sesion.nombre = d.usuario.nombre;
    sesion.permisos = d.usuario.permisos;
    sesion.configura = !!d.usuario.configura;
    ultimaSync = Date.now();
    ui.errorSync = '';
    guardarTodo();
    if (rechazados.length) {
      cartel({
        icono: '⚠️', titulo: 'Hay cargas que no se guardaron', no: '', si: 'Entendido',
        html: '<p>Google no aceptó estos cambios:</p><ul>' + rechazados.map((r) =>
          '<li>' + esc(descripcionOp(r.op)) + ' — <b>' + esc(r.motivo) + '</b></li>').join('') + '</ul>',
      });
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/PIN incorrecto/.test(msg)) {
      // El PIN dejó de valer (lo cambiaron o desactivaron al usuario).
      ui.errorSync = '';
      if (!cola.length) { salir(true); toast('Tu PIN ya no es válido. Entrá de nuevo.', 5000); return; }
      ui.errorSync = 'PIN no válido';
    } else {
      ui.errorSync = msg;
    }
  } finally {
    ui.sincronizando = false;
    render();
  }
}

let syncTimer = null;
function programarSync(ms) {
  renderSync();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sincronizar, ms == null ? 1200 : ms);
}

function agregarACola(op) {
  op.id = nuevoId();
  op.ts = Date.now();
  op.usuario = sesion.nombre;
  cola.push(op);
  guardarTodo();
  programarSync();
}

function descripcionOp(op) {
  if (!op) return 'Cambio';
  if (op.tipo === 'mov') return op.clase + ' ' + op.insumo + ' ' + num(op.cantidad) + ' (' + fechaTxt(op.fecha) + ')';
  if (op.tipo === 'anular') return 'Anular un movimiento';
  if (op.tipo === 'factura') return 'Asociar factura ' + op.factura;
  if (op.tipo === 'lluvia') return 'Lluvia ' + op.finca + ' ' + fechaTxt(op.fecha);
  return 'Cambio';
}

// ---------------------------------------------------------------- datos combinados (Google + cola)
function stockDatos() {
  return (datos && datos.stock) || { insumos: [], destinos: [], saldos: [], movimientos: [], proveedores: [] };
}

/** Movimientos: los de Google más los que siguen en la cola (marcados "pendiente"). */
function movimientos() {
  const s = stockDatos();
  const lista = s.movimientos.map((m) => Object.assign({}, m));
  const porId = {};
  lista.forEach((m) => { porId[m.id] = m; });
  cola.forEach((op) => {
    if (op.tipo === 'mov') {
      const ins = s.insumos.find((i) => i.nombre === op.insumo) || {};
      const m = {
        id: op.id, fecha: op.fecha, tipo: op.clase, insumo: op.insumo, estancia: op.estancia || '', cantidad: op.cantidad, unidad: ins.unidad || '',
        kg: ins.kgUnidad ? op.cantidad * ins.kgUnidad : null, destino: op.destino || '', proveedor: op.proveedor || '',
        remito: op.remito || '', factura: op.factura || '', nota: op.nota || '', usuario: op.usuario, anulado: false, ts: op.ts, pendiente: true,
      };
      lista.push(m);
      porId[m.id] = m;
    } else if (op.tipo === 'anular' && porId[op.ref]) {
      porId[op.ref].anulado = true;
      porId[op.ref].anuladoPor = op.usuario + ' (pendiente)';
    } else if (op.tipo === 'factura' && porId[op.ref]) {
      porId[op.ref].factura = op.factura;
      porId[op.ref].facturaPendiente = true;
    }
  });
  return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.ts - a.ts));
}

/** Clave de un saldo: el insumo, o insumo|ESTANCIA si lleva stock por estancia (ej. Fardos). */
const claveSaldo = (insumo, estancia) => (estancia ? insumo + '|' + estancia : insumo);

/** Insumo que se produce en la estancia (ej. Fardos): sus ingresos no llevan proveedor, remito ni factura. */
const esPropio = (nombre) => !!(stockDatos().insumos.find((i) => i.nombre === nombre) || {}).propia;
const esSinFactura = (m) => m.tipo === 'Ingreso' && !m.anulado && !m.factura && !esPropio(m.insumo);

/** Saldo de cada insumo (y estancia): el que calculó Google, corregido con lo que está en la cola. */
function saldos() {
  const s = stockDatos();
  const r = {};
  const vacio = () => ({ cantidad: 0, ultimoConteo: null, pendiente: false });
  s.insumos.forEach((i) => {
    if (i.porEstancia) ESTANCIAS.forEach(([e]) => { r[claveSaldo(i.nombre, e)] = vacio(); });
    else r[i.nombre] = vacio();
  });
  s.saldos.forEach((x) => { r[claveSaldo(x.insumo, x.estancia)] = { cantidad: x.cantidad, ultimoConteo: x.ultimoConteo, pendiente: false }; });
  const servidor = {};
  s.movimientos.forEach((m) => { servidor[m.id] = m; });
  const locales = {};
  cola.filter((op) => op.tipo === 'mov').sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ts - b.ts))
    .forEach((op) => { locales[op.id] = op; });
  const anulados = new Set(cola.filter((op) => op.tipo === 'anular').map((op) => op.ref));
  Object.keys(locales).forEach((id) => {
    const op = locales[id];
    if (anulados.has(id)) return;
    const k = claveSaldo(op.insumo, op.estancia);
    const x = r[k] || (r[k] = vacio());
    if (op.clase === 'Conteo') { x.cantidad = op.cantidad; x.ultimoConteo = op.fecha; }
    else if (op.clase === 'Ingreso') x.cantidad += op.cantidad;
    else x.cantidad -= op.cantidad;
    x.pendiente = true;
  });
  // Anular algo que ya estaba en Google: se revierte su efecto (un conteo no se puede revertir acá).
  anulados.forEach((ref) => {
    const m = servidor[ref];
    const x = m && r[claveSaldo(m.insumo, m.estancia)];
    if (!x || m.anulado) return;
    if (m.tipo === 'Ingreso') x.cantidad -= m.cantidad;
    else if (m.tipo === 'Consumo') x.cantidad += m.cantidad;
    x.pendiente = true;
  });
  Object.keys(r).forEach((k) => { r[k].cantidad = Math.round(r[k].cantidad * 1000) / 1000; });
  return r;
}

/** Consumo de los últimos 7 días (hoy incluido), por insumo y estancia. */
function consumo7() {
  const desde = sumarDias(hoyISO(), -6);
  const r = {};
  movimientos().forEach((m) => {
    const k = claveSaldo(m.insumo, m.estancia);
    if (!m.anulado && m.tipo === 'Consumo' && m.fecha >= desde) r[k] = (r[k] || 0) + m.cantidad;
  });
  return r;
}

// ---------------------------------------------------------------- render general
function render() {
  const app = $('#app');
  if (!sesion) { app.innerHTML = htmlEntrada(); return; }
  if (!datos && ui.sincronizando) {
    app.innerHTML = barra('Registros Zehirut', false) + '<div class="contenido"><p class="vacio">Bajando los datos de Google…</p></div>';
    return;
  }
  const pantallas = { inicio: htmlInicio, stock: htmlStock, lluvias: htmlLluvias };
  app.innerHTML = (pantallas[ui.pantalla] || htmlInicio)();
  despuesDeRender();
}

function textoSync() {
  if (!SCRIPT_URL) return { txt: 'Solo en el teléfono', cls: 'error' };
  if (ui.sincronizando) return { txt: '⟳ Sincronizando…', cls: '' };
  if (cola.length) return { txt: '● ' + cola.length + ' sin enviar', cls: 'pend' };
  if (!navigator.onLine) return { txt: 'Sin señal', cls: 'pend' };
  if (ui.errorSync) return { txt: '⚠ Sin conexión con Google', cls: 'error' };
  return { txt: '✓ Al día', cls: '' };
}

function renderSync() {
  const b = $('#estado-sync');
  if (!b) return;
  const t = textoSync();
  b.textContent = t.txt;
  b.className = 'sync ' + t.cls;
}

function barra(titulo, volver) {
  const t = textoSync();
  return '<header class="barra">' +
    (volver ? '<button class="volver" data-a="ir" data-p="inicio" aria-label="Volver">‹</button>' : '<img src="icons/logo.svg" alt="">') +
    '<span class="titulo">' + esc(titulo) + '</span>' +
    '<button id="estado-sync" class="sync ' + t.cls + '" data-a="estado">' + esc(t.txt) + '</button>' +
    '</header>';
}

function tabs(lista, activa, accion) {
  return '<nav class="tabs">' + lista.map(([k, t]) =>
    '<button class="' + (k === activa ? 'activo' : '') + '" data-a="' + accion + '" data-t="' + k + '">' + t + '</button>').join('') + '</nav>';
}

// ---------------------------------------------------------------- entrada con PIN
function htmlEntrada() {
  const puntos = [0, 1, 2, 3].map((i) => '<span class="' + (i < ui.pin.length ? 'lleno' : '') + '"></span>').join('') +
    (ui.pin.length > 4 ? ui.pin.slice(4).split('').map(() => '<span class="lleno"></span>').join('') : '');
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Entrar'];
  return '<div class="entrada">' +
    '<img src="icons/logo.svg" alt="Registros Zehirut">' +
    '<h1>Registros Zehirut</h1>' +
    '<p>Ingresá tu PIN (el mismo de ZehirutApp)</p>' +
    '<div class="puntos">' + puntos + '</div>' +
    '<div class="teclado">' + teclas.map((t) =>
      '<button data-a="tecla" data-k="' + t + '" class="' + (t === 'Entrar' ? 'ok' : '') + '"' + (ui.entrando ? ' disabled' : '') + '>' +
      (t === 'Entrar' && ui.entrando ? '…' : t) + '</button>').join('') + '</div>' +
    '<div class="error-txt">' + esc(ui.errorPin) + '</div>' +
    '<p style="margin-top:24px;font-size:13px">La primera vez hace falta señal. Después funciona sin señal.</p>' +
    '</div>';
}

async function entrar() {
  if (ui.pin.length < 4) { ui.errorPin = 'El PIN tiene al menos 4 números.'; render(); return; }
  if (!SCRIPT_URL) { ui.errorPin = 'La app todavía no está conectada con Google.'; render(); return; }
  if (!navigator.onLine) { ui.errorPin = 'Sin señal. Para entrar la primera vez hace falta señal.'; render(); return; }
  ui.entrando = true; ui.errorPin = ''; render();
  try {
    const r = await llamar({ accion: 'entrar', pin: ui.pin });
    if (!r.usuario) { ui.errorPin = 'PIN incorrecto.'; ui.pin = ''; return; }
    sesion = { pin: ui.pin, nombre: r.usuario.nombre, permisos: r.usuario.permisos, configura: !!r.usuario.configura };
    datos = null; cola = []; ultimaSync = 0;
    ui.pin = ''; ui.pantalla = 'inicio';
    guardarTodo();
    sincronizar();
  } catch (e) {
    ui.errorPin = 'No se pudo entrar: ' + ((e && e.message) || e);
  } finally {
    ui.entrando = false;
    render();
  }
}

async function salir(forzado) {
  if (!forzado) {
    const msg = cola.length
      ? '<p><b>Hay ' + cola.length + ' carga(s) sin enviar.</b> Si salís ahora se pierden. Esperá a tener señal.</p>'
      : '<p>Para volver a entrar vas a necesitar tu PIN y señal.</p>';
    const ok = await cartel({ icono: '🚪', titulo: 'Salir de este teléfono', html: msg, si: cola.length ? 'Salir igual' : 'Salir', peligro: !!cola.length });
    if (!ok) return;
  }
  sesion = null; datos = null; cola = []; ultimaSync = 0;
  guardarTodo();
  ui.pantalla = 'inicio';
  render();
}

// ---------------------------------------------------------------- inicio
function htmlInicio() {
  const mods = [];
  if (puede('Stock', 'VER')) {
    const s = saldos();
    const ins = stockDatos().insumos.filter((i) => i.activo);
    const bajos = ins.filter((i) => i.minimo != null && (i.porEstancia ? ESTANCIAS.map(([e]) => claveSaldo(i.nombre, e)) : [i.nombre])
      .some((k) => s[k] && s[k].cantidad < i.minimo)).length;
    mods.push('<button class="modulo" data-a="ir" data-p="stock"><span class="ico">📦</span><span><b>Stock de insumos</b><small>' +
      ins.length + ' insumos' + (bajos ? ' · <span class="chip alerta">' + bajos + ' bajo mínimo</span>' : '') + '</small></span></button>');
  }
  if (puede('Lluvias', 'VER')) {
    const regs = registrosLluvia();
    const ult = regs.length ? regs.map((r) => r.fecha).sort().pop() : null;
    mods.push('<button class="modulo lluvias" data-a="ir" data-p="lluvias"><span class="ico">🌧️</span><span><b>Lluvias</b><small>' +
      (ult ? 'Último registro: ' + fechaTxt(ult) : 'Registro de lluvias por sector') + '</small></span></button>');
  }
  const pronto = ['Combustible', 'Facturas', 'Fondo fijo'].filter((m) => puede(m, 'VER'));
  pronto.forEach((m) => {
    mods.push('<div class="modulo pronto"><span class="ico">' + ({ Combustible: '⛽', Facturas: '🧾', 'Fondo fijo': '💵' }[m]) +
      '</span><span><b>' + m + '</b><small>Próximamente (por ahora en ZehirutApp)</small></span></div>');
  });
  return barra('Registros Zehirut', false) +
    '<div class="contenido">' +
    '<div class="saludo">Hola, ' + esc(String(sesion.nombre).split(' ')[0]) + ' 👋</div>' +
    (mods.length ? '<div class="modulos">' + mods.join('') + '</div>' : '<p class="vacio">Tu usuario todavía no tiene acceso a ningún módulo.</p>') +
    '<div class="pie"><span>Datos de Google: ' + haceCuanto(ultimaSync) + '</span>' +
    '<button class="btn sec chico" data-a="sync">⟳ Actualizar</button>' +
    '<button class="btn sec chico" data-a="salir">Salir</button>' +
    '<span>v' + VERSION + ' · ' + esc(sesion.nombre) + '</span></div>' +
    '</div>';
}

// ---------------------------------------------------------------- stock
// Un solo camino, sin pestañas: tarjetas → ficha del insumo → formulario de lo que se
// quiere cargar. La flecha de arriba vuelve siempre un paso.
function htmlStock() {
  const i = ui.insumoVer && stockDatos().insumos.find((x) => x.nombre === ui.insumoVer);
  if ((ui.vistaStock === 'ficha' || ui.vistaStock === 'form') && !i) ui.vistaStock = 'lista';
  if (ui.vistaStock === 'form' && !(ui.form && ui.form.clase)) ui.vistaStock = 'ficha';
  if (ui.vistaStock === 'config' && !sesion.configura) ui.vistaStock = 'lista';
  const vistas = {
    lista: ['Stock de insumos', htmlSaldo],
    ficha: [ui.insumoVer, () => htmlFicha(ui.insumoVer)],
    form: [ui.form ? (ui.form.corrige ? 'Corregir ' + ui.form.clase.toLowerCase() : ui.form.clase) + ' · ' + ui.form.insumo : '', htmlCargar],
    sinFactura: ['Ingresos sin factura', htmlSinFactura],
    config: ['Configurar', htmlConfig],
  };
  const [titulo, fn] = vistas[ui.vistaStock] || vistas.lista;
  return barra(titulo, true) + '<div class="contenido">' + fn() + '</div>';
}

/** Un paso atrás dentro de Stock (o al inicio si ya está en las tarjetas). */
function atrasStock() {
  leerCamposForm();
  const v = ui.vistaStock;
  if (v === 'form') ui.vistaStock = 'ficha';
  else if (v === 'ficha' || v === 'sinFactura' || v === 'config') { ui.vistaStock = 'lista'; ui.insumoVer = null; ui.cfg = null; }
  else ui.pantalla = 'inicio';
  render();
  window.scrollTo(0, 0);
}

/** Datos de una tarjeta/ficha (de una estancia, si el insumo va por estancia): saldo, estado
 *  y cuántos días alcanza al consumo de la última semana. */
function infoInsumo(i, s, c7, estancia) {
  const k = claveSaldo(i.nombre, estancia);
  const x = s[k] || { cantidad: 0 };
  const prom = (c7[k] || 0) / 7;
  const bajo = i.minimo != null && x.cantidad < i.minimo;
  return {
    x, prom, bajo,
    dias: prom && x.cantidad > 0 ? Math.floor(x.cantidad / prom) : null,
    cls: x.cantidad < 0 ? 'negativo' : bajo ? 'bajo' : (!x.ultimoConteo && !x.cantidad ? 'sin' : ''),
    kg: i.kgUnidad && i.unidad !== 'kg' ? num(x.cantidad * i.kgUnidad, 0) + ' kg' : '',
  };
}

function htmlSaldo() {
  const s = saldos();
  const c7 = consumo7();
  const ins = stockDatos().insumos.filter((i) => i.activo || (s[i.nombre] && s[i.nombre].cantidad));
  const sinFactura = movimientos().filter(esSinFactura).length;
  return (sinFactura ? '<button class="aviso amarillo aviso-btn" data-a="vista" data-v="sinFactura">🧾 Hay <b>' + sinFactura +
    (sinFactura === 1 ? ' ingreso' : ' ingresos') + ' sin factura</b>. Tocá para verlos.</button>' : '') +
    (ins.length ? '<div class="saldos">' + ins.map((i) => {
      if (i.porEstancia) {
        // Un renglón por estancia, con su propio saldo.
        const partes = ESTANCIAS.map(([e, nom]) => ({ nom, n: infoInsumo(i, s, c7, e) }));
        const alerta = partes.some((p) => p.n.cls === 'negativo' || p.n.cls === 'bajo');
        return '<button class="saldo ' + (alerta ? 'bajo' : '') + '" data-a="verInsumo" data-i="' + esc(i.nombre) + '">' +
          '<h3>' + esc(i.nombre) + ' ' + (partes.some((p) => p.n.x.pendiente) ? '<span class="chip pend">sin enviar</span>' : '') + '</h3>' +
          partes.map((p) => '<div class="por-estancia"><span>' + esc(p.nom) + '</span><b class="' +
            (p.n.x.cantidad < 0 ? 'rojo' : '') + '">' + num(p.n.x.cantidad) + '</b></div>').join('') +
          '<div class="det">' + esc(unidadTxt(i.unidad, 2)) +
          (partes.some((p) => !p.n.x.ultimoConteo) ? '<br><span class="chip">Falta conteo inicial</span>' : '') + '</div></button>';
      }
      const n = infoInsumo(i, s, c7);
      const linea = [n.kg, n.dias != null ? 'alcanza ~' + n.dias + (n.dias === 1 ? ' día' : ' días') : ''].filter(Boolean).join(' · ');
      return '<button class="saldo ' + n.cls + '" data-a="verInsumo" data-i="' + esc(i.nombre) + '">' +
        '<h3>' + esc(i.nombre) + ' ' + (n.x.pendiente ? '<span class="chip pend">sin enviar</span>' : '') + '</h3>' +
        '<div class="cant">' + num(n.x.cantidad) + '<small>' + esc(unidadTxt(i.unidad, n.x.cantidad)) + '</small></div>' +
        '<div class="det">' + (linea || '&nbsp;') +
        (n.bajo ? '<br><span class="chip alerta">Bajo el mínimo</span>' : '') +
        (n.x.cantidad < 0 ? '<br><span class="chip alerta">Saldo negativo</span>' : '') +
        (!n.x.ultimoConteo ? '<br><span class="chip">Sin conteo inicial</span>' : '') +
        '</div></button>';
    }).join('') + '</div>' : '<p class="vacio">Todavía no hay insumos cargados.</p>') +
    (sesion.configura ? '<div style="text-align:center;margin-top:22px"><button class="btn sec chico" data-a="vista" data-v="config">⚙ Configurar insumos y corrales</button></div>' : '');
}

/** Ficha de un insumo: saldo, cómo viene el consumo, botones para cargar y sus movimientos. */
/** Caja con el saldo grande y sus datos (una por estancia si el insumo va por estancia). */
function cajaSaldo(i, n, titulo) {
  const datosFicha = [
    n.kg ? ['Equivale a', n.kg] : null,
    ['Consumo', n.prom ? num(n.prom, 1) + ' ' + unidadTxt(i.unidad, Math.round(n.prom * 10) / 10) + ' por día (últimos 7 días)' : 'Sin consumos en 7 días'],
    n.dias != null ? ['Alcanza para', '~' + n.dias + (n.dias === 1 ? ' día' : ' días')] : null,
    ['Último conteo', n.x.ultimoConteo ? fechaTxt(n.x.ultimoConteo) : 'Nunca (cargá un conteo)'],
    i.minimo != null ? ['Stock mínimo', num(i.minimo) + ' ' + unidadTxt(i.unidad, i.minimo)] : null,
  ].filter(Boolean);
  return '<div class="saldo ' + n.cls + '">' + (titulo ? '<h3>' + esc(titulo) + '</h3>' : '') +
    '<div class="cant">' + num(n.x.cantidad) + '<small>' + esc(unidadTxt(i.unidad, n.x.cantidad)) + '</small>' +
    (n.x.pendiente ? ' <span class="chip pend">sin enviar</span>' : '') + '</div>' +
    (n.bajo ? '<span class="chip alerta">Bajo el mínimo</span> ' : '') + (n.x.cantidad < 0 ? '<span class="chip alerta">Saldo negativo: falta un ingreso o un conteo</span>' : '') +
    '<table class="detalle" style="margin-top:8px">' + datosFicha.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table></div>';
}

function htmlFicha(nombre) {
  const i = stockDatos().insumos.find((x) => x.nombre === nombre);
  const s = saldos();
  const c7 = consumo7();
  const movs = movimientos().filter((m) => m.insumo === nombre);
  const botones = [];
  if (puede('Stock', 'CARGAR') && i.activo) {
    botones.push(['Consumo', 'consumo', '⬆ Consumo'], ['Ingreso', 'ingreso', '⬇ Ingreso']);
    if (puede('Stock', 'ADMINISTRAR')) botones.push(['Conteo', 'conteo', '✔ Conteo']);
  }
  let cajas;
  if (i.porEstancia) {
    cajas = '<div class="cajas-estancia">' + ESTANCIAS.map(([e, nom]) => cajaSaldo(i, infoInsumo(i, s, c7, e), nom)).join('') + '</div>';
    // Lo cargado antes de separar por estancia queda aparte: se avisa para corregirlo.
    const viejo = s[i.nombre];
    if (viejo && viejo.cantidad) {
      cajas += '<div class="aviso amarillo">Hay ' + num(viejo.cantidad) + ' ' + esc(unidadTxt(i.unidad, viejo.cantidad)) +
        ' cargados antes, <b>sin estancia</b>. Anulá esos movimientos (abajo) y cargá el conteo de cada estancia.</div>';
    }
  } else {
    cajas = cajaSaldo(i, infoInsumo(i, s, c7));
  }
  const mostrar = ui.movsVisibles || 15;
  return '<div class="form">' +
    '<div style="margin-bottom:12px">' + cajas + '</div>' +
    (botones.length ? '<div class="segmento" style="margin-bottom:18px">' + botones.map(([c, cls, t]) =>
      '<button class="' + cls + ' activo" data-a="cargarDesde" data-c="' + c + '">' + t + '</button>').join('') + '</div>' : '') +
    '<h3 style="margin:0 0 8px">Movimientos</h3>' +
    (movs.length ? movs.slice(0, mostrar).map((m) => htmlMov(m, true)).join('') +
      (movs.length > mostrar ? '<button class="btn sec" data-a="masMovs">Ver más</button>' : '')
      : '<p class="vacio">Sin movimientos en los últimos ' + DIAS_HISTORIAL + ' días.</p>') +
    '</div>';
}

function htmlSinFactura() {
  const movs = movimientos().filter(esSinFactura);
  if (!movs.length) return '<p class="vacio">No hay ingresos sin factura. 👍</p>';
  return '<div class="form"><div class="aviso">Tocá un ingreso para asociarle la factura cuando llegue.</div>' +
    movs.map((m) => htmlMov(m)).join('') + '</div>';
}

function nuevoForm(clase, insumo) {
  const prev = ui.form || {};
  return { clase, insumo, estancia: '', fecha: prev.fecha || hoyISO(), cantidad: '', destino: '', proveedor: '', remito: '', factura: '', nota: '' };
}

/** Formulario de un solo tipo de carga para el insumo de la ficha (ya elegidos). */
function htmlCargar() {
  const f = ui.form;
  const s = stockDatos();
  const ins = s.insumos.find((i) => i.nombre === f.insumo);
  const saldo = (saldos()[claveSaldo(f.insumo, f.estancia)] || {}).cantidad || 0;
  const rel = fechaRelativa(f.fecha);
  let h = '<div class="form">';
  if (f.corrige) h += '<div class="aviso amarillo">Estás <b>corrigiendo</b> un movimiento. Al guardar, el anterior queda anulado (tachado en el historial) y queda este.</div>';
  // Insumo con stock por estancia: primero se elige de cuál (no hay una elegida de antemano).
  if (ins.porEstancia) {
    h += '<div class="campo"><span class="etq">Estancia</span><div class="segmento">' + ESTANCIAS.map(([e, nom]) =>
      '<button class="neutro' + (f.estancia === e ? ' activo' : '') + '" data-a="estancia" data-e="' + e + '">' + nom + '</button>').join('') + '</div></div>';
  }
  if (f.clase === 'Conteo' && (!ins.porEstancia || f.estancia)) {
    h += '<div class="aviso">El conteo <b>reemplaza el saldo</b>' + (f.estancia ? ' de ' + nombreEstancia(f.estancia) : '') +
      ' (hoy ' + num(saldo) + ' ' + esc(unidadTxt(ins.unidad, saldo)) + ') por lo que hay en el depósito.</div>';
  }
  h += '<div class="campo"><span class="etq">Fecha</span><div class="fecha-fila">' +
    '<button class="nav" data-a="fecha" data-d="-1" aria-label="Día anterior">‹</button>' +
    '<label class="fecha">' + fechaTxt(f.fecha, true) + (rel ? '<span class="hoy">' + rel + '</span>' : '') +
    '<input type="date" id="f-fecha" value="' + f.fecha + '" max="' + hoyISO() + '"></label>' +
    '<button class="nav" data-a="fecha" data-d="1" aria-label="Día siguiente"' + (f.fecha >= hoyISO() ? ' disabled' : '') + '>›</button></div></div>';
  h += '<div class="campo"><span class="etq">' + (f.clase === 'Conteo' ? 'Cantidad contada' : 'Cantidad') + ' <small>(en ' + esc(unidadTxt(ins.unidad, 2)) + ')</small></span>' +
    '<div class="cantidad"><button data-a="mas" data-d="-1" aria-label="Menos">−</button>' +
    '<input id="f-cantidad" inputmode="decimal" autocomplete="off" value="' + esc(f.cantidad) + '" placeholder="0">' +
    '<button data-a="mas" data-d="1" aria-label="Más">+</button></div>' +
    '<div class="equivale" id="f-equivale">' + equivale() + '</div></div>';
  if (f.clase === 'Consumo') {
    const dest = s.destinos.filter((d) => d.activo);
    h += '<div class="campo"><label for="f-destino">Destino <small>(opcional)</small></label><select class="txt grande" id="f-destino">' +
      '<option value="">Sin destino</option>' +
      dest.map((d) => '<option' + (f.destino === d.nombre ? ' selected' : '') + '>' + esc(d.nombre) + '</option>').join('') +
      '</select></div>';
  }
  if (f.clase === 'Ingreso' && ins.propia) {
    h += '<div class="aviso">Producción propia: sin proveedor, remito ni factura.</div>';
  } else if (f.clase === 'Ingreso') {
    h += '<div class="campo"><label for="f-proveedor">Proveedor</label>' +
      '<input class="txt" id="f-proveedor" list="lista-prov" value="' + esc(f.proveedor) + '" autocomplete="off">' +
      '<datalist id="lista-prov">' + (s.proveedores || []).map((p) => '<option value="' + esc(p) + '">').join('') + '</datalist></div>' +
      '<div class="fila2"><div class="campo"><label for="f-remito">Remito N° <small>(opc.)</small></label><input class="txt" id="f-remito" value="' + esc(f.remito) + '"></div>' +
      '<div class="campo"><label for="f-factura">Factura N° <small>(opc.)</small></label><input class="txt" id="f-factura" value="' + esc(f.factura) + '" placeholder="si ya llegó"></div></div>';
  }
  h += '<div class="campo"><label for="f-nota">Nota <small>(opcional)</small></label><input class="txt" id="f-nota" value="' + esc(f.nota) + '"></div>';
  h += '<button class="btn ' + f.clase.toLowerCase() + '" data-a="guardarMov">Guardar ' + f.clase.toLowerCase() + '</button></div>';
  return h;
}

function equivale() {
  const f = ui.form;
  if (!f) return '';
  const ins = stockDatos().insumos.find((i) => i.nombre === f.insumo);
  const n = leerNumero(f.cantidad);
  if (!ins || !isFinite(n)) return '';
  if (ins.kgUnidad && ins.unidad !== 'kg') return '= ' + num(n * ins.kgUnidad) + ' kg';
  return '';
}

function leerCamposForm() {
  const f = ui.form;
  if (!f || ui.vistaStock !== 'form') return;
  ['cantidad', 'proveedor', 'remito', 'factura', 'nota', 'destino'].forEach((k) => {
    const el = $('#f-' + k);
    if (el) f[k] = el.value;
  });
}

async function guardarMov() {
  leerCamposForm();
  const f = ui.form;
  const cantidad = leerNumero(f.cantidad);
  if (!isFinite(cantidad) || cantidad < 0 || (f.clase !== 'Conteo' && cantidad === 0)) { toast('Poné una cantidad válida.', 3000); return; }
  if (f.fecha > hoyISO()) { toast('La fecha no puede ser futura.', 3000); return; }
  const ins = stockDatos().insumos.find((i) => i.nombre === f.insumo);
  if (ins.porEstancia && !f.estancia) { toast('Elegí la estancia: La Prudencia o La Paciencia.', 3000); return; }
  // Cantidades que suelen ser un error de tipeo: se confirma antes de guardar.
  const saldo = (saldos()[claveSaldo(f.insumo, f.estancia)] || {}).cantidad || 0;
  if (f.clase === 'Consumo' && cantidad > saldo && saldo >= 0) {
    const ok = await cartel({
      icono: '🤔', titulo: '¿Seguro?', si: 'Guardar igual', no: 'Revisar',
      html: '<p>Estás cargando un consumo de <b>' + num(cantidad) + ' ' + esc(unidadTxt(ins.unidad, cantidad)) + '</b> y el saldo es de ' +
        num(saldo) + '. El stock va a quedar negativo.</p>',
    });
    if (!ok) return;
  }
  const op = { tipo: 'mov', clase: f.clase, fecha: f.fecha, insumo: f.insumo, cantidad };
  if (ins.porEstancia) op.estancia = f.estancia;
  if (f.clase === 'Consumo' && f.destino) op.destino = f.destino;
  if (f.clase === 'Ingreso' && !ins.propia) { op.proveedor = f.proveedor.trim(); op.remito = f.remito.trim(); op.factura = f.factura.trim(); }
  if (f.nota.trim()) op.nota = f.nota.trim();
  if (f.corrige) {
    // Si el original todavía no se había enviado, se saca de la cola y listo; si ya estaba en
    // Google, se anula (queda tachado) y se carga el corregido.
    const pendiente = cola.some((o) => o.tipo === 'mov' && o.id === f.corrige);
    if (pendiente) { cola = cola.filter((o) => o.id !== f.corrige && o.ref !== f.corrige); guardarTodo(); }
    else agregarACola({ tipo: 'anular', ref: f.corrige, motivo: 'Corregido' });
  }
  agregarACola(op);
  toast((f.corrige ? '✓ Corregido: ' : '✓ Guardado: ') + f.clase.toLowerCase() + ' de ' + num(cantidad) + ' ' + unidadTxt(ins.unidad, cantidad) +
    (op.estancia ? ' en ' + nombreEstancia(op.estancia) : '') + (navigator.onLine ? '' : ' (se envía cuando haya señal)'), 3200);
  // Vuelve a la ficha, que ya muestra el saldo nuevo. La fecha elegida queda para la próxima carga.
  ui.form = { fecha: f.fecha };
  ui.vistaStock = 'ficha';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function abreviar(nombre) {
  return nombre.replace(/^(Concentrado|Balanceado|Suplemento)\s+/i, '');
}

function htmlMov(m, conFecha) {
  const signo = { Consumo: '−', Ingreso: '+', Conteo: '=' }[m.tipo] || '';
  const ico = { Consumo: '⬆', Ingreso: '⬇', Conteo: '✔' }[m.tipo] || '•';
  const extra = [];
  if (m.estancia) extra.push('<span class="chip azul">' + esc(nombreEstancia(m.estancia).replace('La ', '')) + '</span>');
  if (m.tipo === 'Consumo') extra.push(m.destino || 'sin destino');
  if (m.tipo === 'Ingreso') {
    if (esPropio(m.insumo)) extra.push('producción propia');
    else {
      if (m.proveedor) extra.push(m.proveedor);
      extra.push(m.factura ? 'Fact. ' + m.factura : '<span class="chip naranja">sin factura</span>');
    }
  }
  extra.push(esc(String(m.usuario || '').split(' ')[0]));
  return '<button class="mov' + (m.anulado ? ' anulado' : '') + '" data-a="verMov" data-id="' + esc(m.id) + '">' +
    '<span class="tipo ' + m.tipo + '">' + ico + '</span>' +
    '<span class="cuerpo"><b>' + esc(conFecha ? fechaTxt(m.fecha, true) : m.insumo) + '</b><small>' + m.tipo + ' · ' + extra.map((x) => (/^</.test(x) ? x : esc(x))).join(' · ') +
    (m.pendiente ? ' <span class="chip pend">sin enviar</span>' : '') + (m.anulado ? ' <span class="chip">anulado</span>' : '') + '</small></span>' +
    '<span class="num">' + signo + num(m.cantidad) + '<br><small style="font-weight:600;color:var(--gris)">' + esc(unidadTxt(m.unidad, m.cantidad)) + '</small></span></button>';
}

async function verMov(id) {
  const m = movimientos().find((x) => x.id === id);
  if (!m) return;
  const filas = [
    ['Tipo', m.tipo], ['Fecha', fechaTxt(m.fecha, true)], ['Insumo', m.insumo],
  ];
  if (m.estancia) filas.push(['Estancia', nombreEstancia(m.estancia)]);
  filas.push(
    ['Cantidad', num(m.cantidad) + ' ' + unidadTxt(m.unidad, m.cantidad) + (m.kg != null && m.unidad !== 'kg' ? ' (' + num(m.kg) + ' kg)' : '')]);
  if (m.tipo === 'Consumo') filas.push(['Destino', m.destino || 'Sin destino']);
  if (m.tipo === 'Ingreso' && !esPropio(m.insumo)) {
    filas.push(['Proveedor', m.proveedor || '—'], ['Remito', m.remito || '—'], ['Factura', m.factura || 'Sin factura']);
  }
  if (m.nota) filas.push(['Nota', m.nota]);
  filas.push(['Cargado por', m.usuario + (m.pendiente ? ' (sin enviar)' : '')]);
  if (m.anulado) filas.push(['Anulado', m.anuladoPor || 'sí']);
  const admin = puede('Stock', 'ADMINISTRAR');
  // Quien carga corrige/anula lo suyo de los últimos 7 días; quien administra, cualquier cosa.
  // Un conteo solo lo corrige quien administra (es quien puede cargarlo).
  const puedeAnular = !m.anulado && puede('Stock', 'CARGAR') &&
    (admin || (m.usuario === sesion.nombre && m.fecha >= sumarDias(hoyISO(), -7)));
  const puedeCorregir = puedeAnular && (m.tipo !== 'Conteo' || admin);
  const puedeFactura = !m.anulado && m.tipo === 'Ingreso' && !esPropio(m.insumo) && puede('Stock', 'CARGAR');
  const acciones = [];
  if (puedeCorregir) acciones.push({ id: 'corregir', texto: '✏️ Corregir', cls: '' });
  if (puedeFactura) acciones.push({ id: 'factura', texto: m.factura ? '🧾 Cambiar factura' : '🧾 Asociar factura', cls: 'ingreso' });
  if (puedeAnular) acciones.push({ id: 'anular', texto: '🗑️ Anular', cls: 'sec rojo-txt' });
  acciones.push({ id: 'cerrar', texto: 'Cerrar', cls: 'sec' });
  const r = await cartel({
    titulo: m.tipo + ' · ' + m.insumo,
    html: '<table class="detalle">' + filas.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table>',
    acciones,
  });
  if (r === 'corregir') {
    // Abre el formulario con los datos del movimiento; al guardar se anula este y queda el nuevo.
    ui.form = {
      clase: m.tipo, insumo: m.insumo, estancia: m.estancia || '', fecha: m.fecha,
      cantidad: String(m.cantidad).replace('.', ','), destino: m.destino || '', proveedor: m.proveedor || '',
      remito: m.remito || '', factura: m.factura || '', nota: m.nota || '', corrige: m.id,
    };
    ui.insumoVer = m.insumo;
    ui.pantalla = 'stock';
    ui.vistaStock = 'form';
    render();
    window.scrollTo(0, 0);
  } else if (r === 'factura') {
    const fac = await cartel({
      icono: '🧾', titulo: 'Factura del ingreso', si: 'Guardar',
      html: '<p>' + esc(m.insumo) + ' · ' + num(m.cantidad) + ' ' + esc(unidadTxt(m.unidad, m.cantidad)) + ' · ' + fechaTxt(m.fecha) + '</p>',
      input: { placeholder: 'Número de factura (ej. 001-001-0012345)', valor: m.factura },
      validar: (v) => (v ? '' : 'Escribí el número de factura.'),
    });
    if (fac) { agregarACola({ tipo: 'factura', ref: m.id, factura: fac }); toast('✓ Factura asociada'); render(); }
  } else if (r === 'anular') {
    const motivo = await cartel({
      icono: '🗑️', titulo: 'Anular movimiento', si: 'Anular', peligro: true,
      html: '<p>' + esc(m.tipo) + ' de <b>' + num(m.cantidad) + ' ' + esc(unidadTxt(m.unidad, m.cantidad)) + '</b> de ' + esc(m.insumo) + ' (' + fechaTxt(m.fecha) + ').</p>' +
        '<p>No se borra: queda tachado en el historial. Si solo estaba mal un dato, usá <b>Corregir</b>.</p>',
      input: { placeholder: 'Motivo (ej. cantidad equivocada)' },
      validar: (v) => (v ? '' : 'Escribí el motivo.'),
    });
    if (motivo) { agregarACola({ tipo: 'anular', ref: m.id, motivo }); toast('Movimiento anulado'); render(); }
  }
}

// ------ configurar insumos y destinos (solo quien administra Stock; necesita señal)
function htmlConfig() {
  const s = stockDatos();
  if (!ui.cfg) ui.cfg = { insumos: s.insumos.map((i) => Object.assign({}, i)), destinos: s.destinos.map((d) => Object.assign({}, d)) };
  const c = ui.cfg;
  return '<div class="form">' +
    '<div class="aviso">Los cambios de la lista necesitan señal. Un insumo o destino que ya tiene movimientos no se borra: se desactiva (deja de aparecer para cargar pero queda en el historial).</div>' +
    '<div class="tarjeta"><h3 style="margin-top:0">Insumos</h3>' +
    c.insumos.map((i, n) => '<div class="item-cfg"><div class="grilla">' +
      '<div><span class="mini-etq">Nombre</span><input class="txt" data-cfg="insumos" data-n="' + n + '" data-k="nombre" value="' + esc(i.nombre) + '"></div>' +
      '<div><span class="mini-etq">Unidad</span><select class="txt" data-cfg="insumos" data-n="' + n + '" data-k="unidad">' +
      UNIDADES.map((u) => '<option ' + (i.unidad === u ? 'selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div><span class="mini-etq">Kg por unidad</span><input class="txt" inputmode="decimal" data-cfg="insumos" data-n="' + n + '" data-k="kgUnidad" value="' + esc(i.kgUnidad == null ? '' : i.kgUnidad) + '"></div>' +
      '<div><span class="mini-etq">Stock mínimo</span><input class="txt" inputmode="decimal" data-cfg="insumos" data-n="' + n + '" data-k="minimo" value="' + esc(i.minimo == null ? '' : i.minimo) + '"></div>' +
      '</div><div><label class="interruptor"><input type="checkbox" data-cfg="insumos" data-n="' + n + '" data-k="activo" ' + (i.activo ? 'checked' : '') + '> Activo</label>' +
      '<label class="interruptor" style="margin-top:6px"><input type="checkbox" data-cfg="insumos" data-n="' + n + '" data-k="porEstancia" ' + (i.porEstancia ? 'checked' : '') + '> Por estancia</label>' +
      '<label class="interruptor" style="margin-top:6px"><input type="checkbox" data-cfg="insumos" data-n="' + n + '" data-k="propia" ' + (i.propia ? 'checked' : '') + '> Producción propia</label></div></div>').join('') +
    '<button class="btn sec chico" data-a="cfgAgregar" data-cfg="insumos" style="margin-top:10px">+ Agregar insumo</button> ' +
    '<button class="btn chico" data-a="cfgGuardar" data-cfg="insumos" style="margin-top:10px">Guardar insumos</button></div>' +
    '<div class="tarjeta"><h3 style="margin-top:0">Destinos (corrales)</h3>' +
    c.destinos.map((d, n) => '<div class="item-cfg"><input class="txt" data-cfg="destinos" data-n="' + n + '" data-k="nombre" value="' + esc(d.nombre) + '">' +
      '<label class="interruptor"><input type="checkbox" data-cfg="destinos" data-n="' + n + '" data-k="activo" ' + (d.activo ? 'checked' : '') + '> Activo</label></div>').join('') +
    '<button class="btn sec chico" data-a="cfgAgregar" data-cfg="destinos" style="margin-top:10px">+ Agregar destino</button> ' +
    '<button class="btn chico" data-a="cfgGuardar" data-cfg="destinos" style="margin-top:10px">Guardar destinos</button></div>' +
    '</div>';
}

async function cfgGuardar(tipo) {
  if (!navigator.onLine) { toast('Sin señal: los cambios de la lista necesitan señal.', 3500); return; }
  let lista;
  if (tipo === 'insumos') {
    lista = ui.cfg.insumos.filter((i) => String(i.nombre).trim()).map((i) => ({
      nombre: String(i.nombre).trim(), unidad: i.unidad,
      kgUnidad: i.unidad === 'kg' ? 1 : (i.kgUnidad === '' || i.kgUnidad == null ? '' : leerNumero(i.kgUnidad)),
      minimo: i.minimo === '' || i.minimo == null ? '' : leerNumero(i.minimo), activo: !!i.activo, porEstancia: !!i.porEstancia, propia: !!i.propia,
    }));
    const malo = lista.find((i) => (i.kgUnidad !== '' && !(i.kgUnidad > 0)) || (i.minimo !== '' && !(i.minimo >= 0)));
    if (malo) { toast('Revisá los números de ' + malo.nombre + '.', 3500); return; }
  } else {
    lista = ui.cfg.destinos.filter((d) => String(d.nombre).trim()).map((d) => ({ nombre: String(d.nombre).trim(), activo: !!d.activo }));
  }
  try {
    toast('Guardando…', 10000);
    await llamar({ accion: 'catalogo', pin: sesion.pin, tipo, lista });
    ui.cfg = null;
    toast('✓ Lista de ' + tipo + ' guardada');
    await sincronizar();
  } catch (e) {
    toast('No se pudo guardar: ' + ((e && e.message) || e), 5000);
  }
}

// ---------------------------------------------------------------- lluvias
function lluviasDatos() {
  return (datos && datos.lluvias) || { sectores: { 'LA PRUDENCIA': ['A', 'C', 'D', 'F'], 'LA PACIENCIA': ['A', 'B', 'C', 'E', 'F'] }, registros: [], resumen: [] };
}

/** Registros de lluvia de Google más los que siguen en la cola (lo último cargado manda). */
function registrosLluvia() {
  const mapa = {};
  lluviasDatos().registros.forEach((r) => { mapa[r.fecha + '|' + r.finca + '|' + r.sector] = Object.assign({}, r); });
  cola.filter((op) => op.tipo === 'lluvia').forEach((op) => {
    op.registros.forEach((r) => {
      mapa[op.fecha + '|' + op.finca + '|' + r.sector] = { fecha: op.fecha, finca: op.finca, sector: r.sector, mm: r.mm, usuario: op.usuario, pendiente: true };
    });
  });
  return Object.keys(mapa).map((k) => mapa[k]);
}

function htmlLluvias() {
  const lista = [['cargar', 'Cargar'], ['resumen', 'Resumen']];
  if (!puede('Lluvias', 'CARGAR')) { lista.shift(); ui.tabLluvias = 'resumen'; }
  const cuerpo = ui.tabLluvias === 'cargar' ? htmlLluviaCargar() : htmlLluviaResumen();
  return barra('Lluvias', true) + tabs(lista, ui.tabLluvias, 'tabLluvias') + '<div class="contenido">' + cuerpo + '</div>';
}

function htmlLluviaCargar() {
  if (!ui.lluvia) ui.lluvia = { finca: 'LA PRUDENCIA', fecha: hoyISO(), mm: {} };
  const l = ui.lluvia;
  const sectores = lluviasDatos().sectores[l.finca] || [];
  const actuales = {};
  registrosLluvia().forEach((r) => { if (r.fecha === l.fecha && r.finca === l.finca) actuales[r.sector] = r; });
  const rel = fechaRelativa(l.fecha);
  return '<div class="form">' +
    '<div class="campo"><div class="segmento">' + ['LA PRUDENCIA', 'LA PACIENCIA'].map((f) =>
      '<button class="neutro' + (l.finca === f ? ' activo' : '') + '" data-a="finca" data-f="' + f + '">' + f.replace('LA ', 'La ').replace('PRUDENCIA', 'Prudencia').replace('PACIENCIA', 'Paciencia') + '</button>').join('') + '</div></div>' +
    '<div class="campo"><span class="etq">Fecha de la lluvia</span><div class="fecha-fila">' +
    '<button class="nav" data-a="fechaLluvia" data-d="-1">‹</button>' +
    '<label class="fecha">' + fechaTxt(l.fecha, true) + (rel ? '<span class="hoy">' + rel + '</span>' : '') +
    '<input type="date" id="l-fecha" value="' + l.fecha + '" max="' + hoyISO() + '"></label>' +
    '<button class="nav" data-a="fechaLluvia" data-d="1"' + (l.fecha >= hoyISO() ? ' disabled' : '') + '>›</button></div></div>' +
    '<div class="campo"><span class="etq">Milímetros por sector <small>(dejá vacío el que no se midió)</small></span><div class="sectores">' +
    sectores.map((s) => {
      const a = actuales[s];
      const val = l.mm[s] != null ? l.mm[s] : '';
      return '<div class="sector"><b>Sector ' + s + '</b><input inputmode="decimal" data-sector="' + s + '" value="' + esc(val) + '" placeholder="mm">' +
        '<small>' + (a ? 'Cargado: ' + num(a.mm) + ' mm' + (a.pendiente ? ' (sin enviar)' : '') : '') + '</small></div>';
    }).join('') + '</div></div>' +
    '<div class="aviso">Si un sector ya tenía mm cargados ese día, se reemplazan por lo nuevo (igual que en ZehirutApp).</div>' +
    '<button class="btn" data-a="guardarLluvia" style="background:var(--azul)">Guardar lluvia</button></div>';
}

function guardarLluvia() {
  const l = ui.lluvia;
  document.querySelectorAll('[data-sector]').forEach((el) => { l.mm[el.dataset.sector] = el.value; });
  const registros = [];
  const malos = [];
  Object.keys(l.mm).forEach((s) => {
    const txt = String(l.mm[s]).trim();
    if (!txt) return;
    const n = leerNumero(txt);
    if (!isFinite(n) || n < 0 || n > 500) malos.push(s); else registros.push({ sector: s, mm: n });
  });
  if (malos.length) { toast('Revisá el sector ' + malos.join(', ') + ': número inválido.', 3500); return; }
  if (!registros.length) { toast('Cargá los mm de al menos un sector.', 3000); return; }
  agregarACola({ tipo: 'lluvia', finca: l.finca, fecha: l.fecha, registros });
  toast('✓ Lluvia guardada: ' + registros.map((r) => r.sector + ' ' + num(r.mm) + ' mm').join(', '), 3200);
  ui.lluvia = { finca: l.finca, fecha: l.fecha, mm: {} };
  render();
}

function htmlLluviaResumen() {
  const d = lluviasDatos();
  const regs = registrosLluvia();
  let h = '';
  if (d.resumen && d.resumen.length) {
    h += '<h3>Acumulado por sector</h3><div class="tabla-scroll"><table class="tabla"><tr><th>Estancia · Sector</th><th>Año ' + (d.anio || '') + '</th><th>Temporada ' + esc(d.temporada || '') + '</th></tr>' +
      d.resumen.map((r) => '<tr><td>' + esc(r.finca.replace('LA ', '')) + ' · ' + esc(r.sector) + '</td><td class="mm">' + num(r.anio, 1) + ' mm</td><td class="mm">' + num(r.temporada, 1) + ' mm</td></tr>').join('') +
      '</table></div>';
  }
  const fechas = regs.map((r) => r.fecha).filter((f, i, a) => a.indexOf(f) === i).sort().reverse().slice(0, 20);
  if (!fechas.length) return h + '<p class="vacio">No hay lluvias registradas en los últimos ' + DIAS_HISTORIAL + ' días.</p>';
  h += '<h3>Últimas lluvias</h3>';
  ['LA PRUDENCIA', 'LA PACIENCIA'].forEach((finca) => {
    const sect = d.sectores[finca] || [];
    const fs = fechas.filter((f) => regs.some((r) => r.fecha === f && r.finca === finca));
    if (!fs.length) return;
    h += '<div class="tabla-scroll"><table class="tabla"><tr><th>' + esc(finca) + '</th>' + sect.map((s) => '<th>' + s + '</th>').join('') + '</tr>' +
      fs.map((f) => '<tr><td>' + fechaTxt(f) + '</td>' + sect.map((s) => {
        const r = regs.find((x) => x.fecha === f && x.finca === finca && x.sector === s);
        return '<td class="mm">' + (r ? num(r.mm, 1) + (r.pendiente ? '*' : '') : '—') + '</td>';
      }).join('') + '</tr>').join('') + '</table></div>';
  });
  if (regs.some((r) => r.pendiente)) h += '<p style="color:var(--gris);font-size:14px">* sin enviar todavía</p>';
  return h;
}

// ---------------------------------------------------------------- eventos
function despuesDeRender() {
  const cant = $('#f-cantidad');
  if (cant) cant.addEventListener('input', () => { ui.form.cantidad = cant.value; $('#f-equivale').textContent = equivale(); });
  ['proveedor', 'remito', 'factura', 'nota'].forEach((k) => {
    const el = $('#f-' + k);
    if (el) el.addEventListener('input', () => { ui.form[k] = el.value; });
  });
  const fdes = $('#f-destino');
  if (fdes) fdes.addEventListener('change', () => { ui.form.destino = fdes.value; });
  const ff = $('#f-fecha');
  if (ff) ff.addEventListener('change', () => { if (ff.value && ff.value <= hoyISO()) { leerCamposForm(); ui.form.fecha = ff.value; render(); } });
  const lf = $('#l-fecha');
  if (lf) lf.addEventListener('change', () => { if (lf.value && lf.value <= hoyISO()) { ui.lluvia.fecha = lf.value; ui.lluvia.mm = {}; render(); } });
  document.querySelectorAll('[data-sector]').forEach((el) => el.addEventListener('input', () => { ui.lluvia.mm[el.dataset.sector] = el.value; }));
  document.querySelectorAll('[data-cfg][data-k]').forEach((el) => {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const item = ui.cfg[el.dataset.cfg][Number(el.dataset.n)];
      item[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    });
  });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const a = b.dataset.a;
  switch (a) {
    case 'tecla': {
      const k = b.dataset.k;
      if (k === '⌫') ui.pin = ui.pin.slice(0, -1);
      else if (k === 'Entrar') { entrar(); return; }
      else if (ui.pin.length < 8) ui.pin += k;
      ui.errorPin = '';
      render();
      break;
    }
    case 'ir':
      // La flecha de Stock vuelve un paso (formulario → ficha → tarjetas → inicio).
      if (ui.pantalla === 'stock' && b.dataset.p === 'inicio') { atrasStock(); break; }
      ui.pantalla = b.dataset.p;
      ui.cfg = null;
      ui.insumoVer = null;
      ui.vistaStock = 'lista';
      render();
      window.scrollTo(0, 0);
      break;
    case 'estado': {
      const t = textoSync();
      const msg = (ui.errorSync ? '<p>Último error: ' + esc(ui.errorSync) + '</p>' : '') +
        '<p>Cargas sin enviar: <b>' + cola.length + '</b></p><p>Datos de Google: ' + haceCuanto(ultimaSync) + '</p>';
      cartel({ icono: '📶', titulo: t.txt, html: msg, si: 'Sincronizar ahora', no: 'Cerrar' }).then((ok) => { if (ok) sincronizar(); });
      break;
    }
    case 'sync': sincronizar(); break;
    case 'salir': salir(); break;
    case 'tabLluvias': ui.tabLluvias = b.dataset.t; render(); break;
    case 'verInsumo': ui.insumoVer = b.dataset.i; ui.vistaStock = 'ficha'; ui.movsVisibles = 15; render(); window.scrollTo(0, 0); break;
    case 'vista': ui.vistaStock = b.dataset.v; render(); window.scrollTo(0, 0); break;
    case 'masMovs': ui.movsVisibles = (ui.movsVisibles || 15) + 30; render(); break;
    case 'cargarDesde':
      ui.form = nuevoForm(b.dataset.c, ui.insumoVer);
      ui.vistaStock = 'form';
      render();
      window.scrollTo(0, 0);
      break;
    case 'fecha': {
      leerCamposForm();
      const f = sumarDias(ui.form.fecha, Number(b.dataset.d));
      if (f <= hoyISO()) { ui.form.fecha = f; render(); }
      break;
    }
    case 'estancia': leerCamposForm(); ui.form.estancia = b.dataset.e; render(); break;
    case 'mas': {
      leerCamposForm();
      const n = leerNumero(ui.form.cantidad);
      const nuevo = Math.max(0, (isFinite(n) ? n : 0) + Number(b.dataset.d));
      ui.form.cantidad = String(nuevo).replace('.', ',');
      $('#f-cantidad').value = ui.form.cantidad;
      $('#f-equivale').textContent = equivale();
      break;
    }
    case 'guardarMov': guardarMov(); break;
    case 'verMov': verMov(b.dataset.id); break;
    case 'cfgAgregar':
      if (b.dataset.cfg === 'insumos') ui.cfg.insumos.push({ nombre: '', unidad: 'bolsa', kgUnidad: 40, minimo: '', activo: true });
      else ui.cfg.destinos.push({ nombre: '', activo: true });
      render();
      break;
    case 'cfgGuardar': cfgGuardar(b.dataset.cfg); break;
    case 'finca': ui.lluvia.finca = b.dataset.f; ui.lluvia.mm = {}; render(); break;
    case 'fechaLluvia': {
      const f = sumarDias(ui.lluvia.fecha, Number(b.dataset.d));
      if (f <= hoyISO()) { ui.lluvia.fecha = f; ui.lluvia.mm = {}; render(); }
      break;
    }
    case 'guardarLluvia': guardarLluvia(); break;
    default: break;
  }
});

// ---------------------------------------------------------------- arranque
window.addEventListener('online', () => { renderSync(); programarSync(500); });
window.addEventListener('offline', renderSync);
document.addEventListener('visibilitychange', () => {
  // Al volver a la app después de un rato, se trae lo último de Google.
  if (document.visibilityState === 'visible' && sesion && Date.now() - ultimaSync > 60 * 1000) programarSync(300);
});
setInterval(() => { if (sesion && document.visibilityState === 'visible' && (cola.length || Date.now() - ultimaSync > 5 * 60 * 1000)) sincronizar(); }, 60 * 1000);

render();
if (sesion) sincronizar();

if ('serviceWorker' in navigator) {
  // Cuando se publica una versión nueva, la app se recarga sola una vez para tomarla.
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaVersion && !recargado && !$('#modal').innerHTML) { recargado = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
