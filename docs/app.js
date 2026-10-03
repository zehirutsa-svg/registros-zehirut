// Registros Zehirut — app del teléfono.
//
// Todo lo que se carga queda primero en el teléfono (localStorage) y entra en una cola
// que se manda al Apps Script cuando hay señal. Cada cambio lleva un id propio: si se
// manda dos veces (reintento con mala señal), el script lo guarda una sola vez.
// Lo que se ve (saldos, movimientos, lluvias) es lo último que bajó de Google más lo
// que todavía está en la cola, así la app se usa igual sin señal.
'use strict';

const VERSION = '1.20.6';


const DIAS_HISTORIAL = 60;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const NIVELES = { '': 0, VER: 1, PROPIAS: 2, CARGAR: 2, ADMINISTRAR: 3 };
const PLURAL = { bolsa: 'bolsas', fardo: 'fardos', litro: 'litros', unidad: 'unidades', kg: 'kg', frasco: 'frascos', 'bidón': 'bidones', caja: 'cajas', paquete: 'paquetes', pajuela: 'pajuelas' };
const UNIDADES = ['bolsa', 'kg', 'fardo', 'litro', 'unidad'];
// Sanidad: tres stocks separados (cada producto es de un rubro) y sus unidades de depósito.
// Íconos propios (docs/icons): no hay emoji de frasco de vacuna ni de pistola de inseminación.
// El stock dice cómo se descuenta: Medicamentos desde la app de la estancia, Materiales sanitarios a mano acá.
const RUBROS_SANIDAD = [['Medicamentos', '<img src="icons/vacuna.svg" alt="">'], ['Materiales sanitarios', '<img src="icons/materiales.svg" alt="">'], ['Semen', '🧬']];
const RUBRO_MATERIALES = 'Materiales sanitarios';
/** Producto de IATF: Indicación "Reproducción" (hormonas, dispositivos, vainas, guante de tacto). Es un filtro, no un stock. */
const esIatf = (i) => /REPRODUC/i.test(String(i.indicacion || ''));
const UNIDADES_SAN = ['frasco', 'bidón', 'caja', 'paquete', 'unidad', 'pajuela'];
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
  modStock: 'Stock',    // módulo que se está viendo con el recorrido de stock: Stock | Combustible | Sanidad
  rubro: null,          // en Sanidad: Medicamentos | Materiales sanitarios | Semen
  filtroIatf: false,    // en Sanidad: mostrar solo lo de IATF
  sinStockSan: false,   // en Sanidad: mostrar también los productos en cero
  vistaStock: 'lista',  // lista | ficha | form | sinFactura | config
  insumoVer: null,      // insumo de la ficha abierta
  movsVisibles: 15,
  tf: null,             // informe de Tapfeed en lectura / vista previa
  excel: null,          // período elegido para bajar el Excel
  grupo: null,          // grupo abierto desde el inicio (stocks | comprobantes): ahí vuelve la flecha
  fac: null,            // pantallas de Facturas (facturas.js)
  ff: null,             // pantallas de Fondo fijo (facturas.js)
  vistaLluvia: 'dia',   // dia | cargar
  lluviaDia: null,      // día que se muestra en Lluvias
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
  if (op.tipo === 'horas') return 'Horas de ' + op.codigo + ' ' + fechaTxt(op.fecha);
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
        maquina: op.maquina || '', equipo: op.equipo || '', trabajo: op.trabajo || '', finca: op.finca || '',
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

// Stock y Combustible usan el mismo recorrido; cada insumo dice a qué módulo pertenece.
const moduloDe = (nombre) => (stockDatos().insumos.find((i) => i.nombre === nombre) || {}).modulo || 'Stock';
const esCombustible = () => ui.modStock === 'Combustible';
const esSanidad = () => ui.modStock === 'Sanidad';
// Lo que se ve en pantalla: los insumos del módulo (en Sanidad, solo los del rubro abierto).
const insumosMod = () => stockDatos().insumos.filter((i) => (i.modulo || 'Stock') === ui.modStock && (!esSanidad() || i.rubro === ui.rubro));
const enVista = (nombre) => insumosMod().some((i) => i.nombre === nombre);
// Sanidad se cuenta en frascos con un decimal (medio frasco usado); lo demás, en unidades enteras.
const decimales = (i) => ((i.modulo || 'Stock') === 'Sanidad' ? 1 : 0);
/** Lo que hay adentro de un saldo de Sanidad, ej. "4.250 ml" (frascos) o "300 un" (cajas). */
const contenidoTxt = (i, cant) => (i.contenido ? num(cant * i.contenido, 0) + ' ' + i.unidadContenido : '');
const COMBUSTIBLE_DESDE = '2026-10-01';
const OTRO_DESTINO = 'OTRO';

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
  const pantallas = { inicio: htmlInicio, grupo: htmlGrupo, stock: htmlStock, lluvias: htmlLluvias, facturas: htmlFacturas, fondofijo: htmlFondoFijo, horometro: htmlHorometro };
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
/** Tarjetas de cada módulo que el usuario puede ver, ya agrupadas. */
function tarjetasModulos() {
  const g = { stocks: [], comprobantes: [], lluvias: [] };
  const tarjeta = (cls, attrs, ico, titulo, sub) =>
    '<button class="modulo ' + cls + '" data-a="ir" ' + attrs + '><span class="ico">' + ico + '</span><span><b>' + titulo + '</b><small>' + sub + '</small></span></button>';
  let bajos = 0;
  if (puede('Stock', 'VER')) {
    const s = saldos();
    const ins = stockDatos().insumos.filter((i) => i.activo && (i.modulo || 'Stock') === 'Stock');
    bajos = ins.filter((i) => i.minimo != null && (i.porEstancia ? ESTANCIAS.map(([e]) => claveSaldo(i.nombre, e)) : [i.nombre])
      .some((k) => s[k] && s[k].cantidad < i.minimo)).length;
    g.stocks.push(tarjeta('insumos', 'data-p="stock"', '📦', 'Insumos',
      ins.length + ' insumos' + (bajos ? ' · <span class="chip alerta">' + bajos + ' bajo mínimo</span>' : '')));
  }
  if (puede('Combustible', 'VER')) {
    const s = saldos();
    const txt = ['Nafta', 'Diesel'].map((n) => n + ' ' + num((s[n] || {}).cantidad || 0, 0) + ' L').join(' · ');
    g.stocks.push(tarjeta('combustible', 'data-p="stock" data-m="Combustible"', '⛽', 'Combustible', txt));
    if (datos && datos.horometro) {
      const partes = partesHor().filter((p) => !p.anulado);
      g.stocks.push(tarjeta('combustible', 'data-p="horometro"', '⏱️', 'Horómetro',
        partes.length ? 'Última carga de horas: ' + fechaTxt(partes[0].fecha) : 'Horas de uso de tractores y generadores'));
    }
  }
  if (puede('Sanidad', 'VER')) {
    // Un stock por rubro (medicamentos, insumos de IATF, semen): cada uno con su tarjeta.
    const s = saldos();
    RUBROS_SANIDAD.forEach(([r, ico]) => {
      const ins = stockDatos().insumos.filter((i) => i.activo && i.modulo === 'Sanidad' && i.rubro === r);
      const bajosR = ins.filter((i) => i.minimo != null && s[i.nombre] && s[i.nombre].cantidad < i.minimo).length;
      g.stocks.push(tarjeta('sanidad', 'data-p="stock" data-m="Sanidad" data-r="' + esc(r) + '"', ico, r,
        ins.length + ' productos' + (bajosR ? ' · <span class="chip alerta">' + bajosR + ' bajo mínimo</span>' : '')));
    });
  }
  const za = datos && datos.za && datos.za.ok ? datos.za : null;
  // Registros contables: cargar comprobantes (factura, anticipo, pago sin factura) y ver facturas, por separado.
  if (za && za.puedeFacturas) g.comprobantes.push(tarjeta('facturas', 'data-p="facturas" data-fv="tipo"', '🧾', 'Comprobantes', 'Factura, anticipo o pago sin factura'));
  if (za && (za.puedeFacturas || za.puedeVerFacturas)) g.comprobantes.push(tarjeta('facturas', 'data-p="facturas" data-fv="lista"', '🔎', 'Ver facturas', 'Buscar las facturas cargadas'));
  if (za && za.puedeFondoFijo) g.comprobantes.push(tarjeta('fondofijo', 'data-p="fondofijo"', '💵', 'Fondo fijo', 'Caja chica'));
  ['Facturas', 'Fondo fijo'].filter((m) => puede(m, 'VER') && !za).forEach((m) => {
    g.comprobantes.push('<div class="modulo pronto"><span class="ico">' + ({ Facturas: '🧾', 'Fondo fijo': '💵' }[m]) +
      '</span><span><b>' + m + '</b><small>Próximamente (por ahora en ZehirutApp)</small></span></div>');
  });
  if (puede('Lluvias', 'VER')) {
    const regs = registrosLluvia();
    const ult = regs.length ? regs.map((r) => r.fecha).sort().pop() : null;
    g.lluvias.push(tarjeta('lluvias', 'data-p="lluvias"', '🌧️', 'Lluvias', ult ? 'Último registro: ' + fechaTxt(ult) : 'Registro de lluvias por sector'));
  }
  g.bajos = bajos;
  return g;
}

const GRUPOS = {
  stocks: { titulo: 'Stocks', ico: '📦', sub: 'Insumos · Combustible · Horómetro · Sanidad' },
  comprobantes: { titulo: 'Registros contables', ico: '🗂️', sub: 'Comprobantes · Ver facturas · Fondo fijo' },
};

// Inicio: Comprobantes, Stocks y Lluvias. Un grupo con un solo módulo muestra ese módulo
// directo (sin un toque de más).
function htmlInicio() {
  const g = tarjetasModulos();
  const mods = [];
  ['comprobantes', 'stocks', 'lluvias'].forEach((k) => {
    if (g[k].length > 1 && GRUPOS[k]) {
      const extra = k === 'stocks' && g.bajos ? ' · <span class="chip alerta">' + g.bajos + ' bajo mínimo</span>' : '';
      mods.push('<button class="modulo grupo ' + k + '" data-a="ir" data-p="grupo" data-g="' + k + '"><span class="ico">' + GRUPOS[k].ico +
        '</span><span><b>' + GRUPOS[k].titulo + '</b><small>' + GRUPOS[k].sub + extra + '</small></span><span class="flecha">›</span></button>');
    } else mods.push.apply(mods, g[k]);
  });
  return barra('Registros Zehirut', false) +
    '<div class="contenido">' +
    '<div class="saludo">Hola, ' + esc(String(sesion.nombre).split(' ')[0]) + ' 👋</div>' +
    (mods.length ? '<div class="modulos">' + mods.join('') + '</div>' : '<p class="vacio">Tu usuario todavía no tiene acceso a ningún módulo.</p>') +
    // Sincronizar y ver el estado: solo desde el cartel de arriba a la derecha (no duplicar).
    '<div class="pie">' +
    '<button class="btn sec chico" data-a="salir">Salir</button>' +
    '<span>v' + VERSION + ' · ' + esc(sesion.nombre) + '</span></div>' +
    '</div>';
}

/** Pantalla de un grupo (Stocks o Comprobantes): las tarjetas de sus módulos. */
function htmlGrupo() {
  const k = ui.grupo;
  const tarjetas = (GRUPOS[k] && tarjetasModulos()[k]) || [];
  return barra(GRUPOS[k] ? GRUPOS[k].titulo : '', true) + '<div class="contenido"><div class="modulos">' + tarjetas.join('') + '</div></div>';
}

// ---------------------------------------------------------------- stock
// Un solo camino, sin pestañas: tarjetas → ficha del insumo → formulario de lo que se
// quiere cargar. La flecha de arriba vuelve siempre un paso.
function htmlStock() {
  const i = ui.insumoVer && stockDatos().insumos.find((x) => x.nombre === ui.insumoVer);
  if ((ui.vistaStock === 'ficha' || ui.vistaStock === 'form') && !i) ui.vistaStock = 'lista';
  if (ui.vistaStock === 'form' && !(ui.form && ui.form.clase)) ui.vistaStock = 'ficha';
  if (((ui.vistaStock === 'config' || ui.vistaStock === 'producto') && (!sesion.configura || esCombustible())) ||
    (ui.vistaStock === 'config' && esSanidad()) || (ui.vistaStock === 'producto' && !ui.prod) ||
    (ui.vistaStock === 'tapfeed' && (!sesion.configura || ui.modStock !== 'Stock'))) ui.vistaStock = 'lista';
  const vistas = {
    lista: [esSanidad() ? ui.rubro : esCombustible() ? 'Combustible' : 'Stock de insumos', htmlSaldo],
    ficha: [ui.insumoVer, () => htmlFicha(ui.insumoVer)],
    form: [ui.form ? (ui.form.corrige ? 'Corregir ' + ui.form.clase.toLowerCase() : ui.form.clase) + ' · ' + ui.form.insumo : '', htmlCargar],
    sinFactura: ['Ingresos sin factura', htmlSinFactura],
    config: ['Configurar', htmlConfig],
    producto: [ui.prod && ui.prod.original ? 'Editar producto' : 'Nuevo producto', htmlProducto],
    tapfeed: ['Informe TAP Feed', htmlTapfeed],
    excel: ['Bajar Excel', htmlExcel],
  };
  const [titulo, fn] = vistas[ui.vistaStock] || vistas.lista;
  return barra(titulo, true) + '<div class="contenido">' + fn() + '</div>';
}

/** Un paso atrás dentro de Stock (o al inicio si ya está en las tarjetas). */
function atrasStock() {
  leerCamposForm();
  const v = ui.vistaStock;
  if (v === 'form') ui.vistaStock = 'ficha';
  else if (v === 'producto') { ui.vistaStock = ui.prod && ui.prod.original ? 'ficha' : 'lista'; ui.prod = null; }
  else if (v === 'ficha' || v === 'sinFactura' || v === 'config' || v === 'tapfeed' || v === 'excel') { ui.vistaStock = 'lista'; ui.insumoVer = null; ui.cfg = null; ui.tf = null; }
  else ui.pantalla = ui.grupo ? 'grupo' : 'inicio';
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
    kg: i.contenido ? contenidoTxt(i, x.cantidad) : i.kgUnidad && i.unidad !== 'kg' ? num(x.cantidad * i.kgUnidad, 0) + ' kg' : '',
  };
}

function htmlSaldo() {
  const s = saldos();
  const c7 = consumo7();
  const ins = insumosMod().filter((i) => i.activo || (s[i.nombre] && s[i.nombre].cantidad));
  const sinFactura = movimientos().filter((m) => esSinFactura(m) && enVista(m.insumo)).length;
  return (sinFactura ? '<button class="aviso amarillo aviso-btn" data-a="vista" data-v="sinFactura">🧾 Hay <b>' + sinFactura +
    (sinFactura === 1 ? ' ingreso' : ' ingresos') + ' sin factura</b>. Tocá para verlos.</button>' : '') +
    (esSanidad() ? htmlListaSanidad(ins, s, c7) : ins.length ? '<div class="saldos">' + ins.map((i) => {
      if (i.porEstancia) {
        // Un renglón por estancia, con su propio saldo.
        const partes = ESTANCIAS.map(([e, nom]) => ({ nom, n: infoInsumo(i, s, c7, e) }));
        const alerta = partes.some((p) => p.n.cls === 'negativo' || p.n.cls === 'bajo');
        return '<button class="saldo ' + (alerta ? 'bajo' : '') + '" data-a="verInsumo" data-i="' + esc(i.nombre) + '">' +
          '<h3>' + esc(i.nombre) + ' ' + (partes.some((p) => p.n.x.pendiente) ? '<span class="chip pend">sin enviar</span>' : '') + '</h3>' +
          partes.map((p) => '<div class="por-estancia"><span>' + esc(p.nom) + '</span><b class="' +
            (p.n.x.cantidad < 0 ? 'rojo' : '') + '">' + num(p.n.x.cantidad, 0) + '</b></div>').join('') +
          '<div class="det">' + esc(unidadTxt(i.unidad, 2)) +
          (partes.some((p) => !p.n.x.ultimoConteo) ? '<br><span class="chip">Falta conteo inicial</span>' : '') + '</div></button>';
      }
      const n = infoInsumo(i, s, c7);
      const linea = [n.kg, n.dias != null ? 'alcanza ~' + n.dias + (n.dias === 1 ? ' día' : ' días') : ''].filter(Boolean).join(' · ');
      return '<button class="saldo ' + n.cls + '" data-a="verInsumo" data-i="' + esc(i.nombre) + '">' +
        '<h3>' + esc(i.nombre) + ' ' + (n.x.pendiente ? '<span class="chip pend">sin enviar</span>' : '') + '</h3>' +
        '<div class="cant">' + num(n.x.cantidad, 0) + '<small>' + esc(unidadTxt(i.unidad, n.x.cantidad)) + '</small></div>' +
        '<div class="det">' + (linea || '&nbsp;') +
        (n.bajo ? '<br><span class="chip alerta">Bajo el mínimo</span>' : '') +
        (n.x.cantidad < 0 ? '<br><span class="chip alerta">Saldo negativo</span>' : '') +
        (!n.x.ultimoConteo ? '<br><span class="chip">Sin conteo inicial</span>' : '') +
        '</div></button>';
    }).join('') + '</div>' : '<p class="vacio">Todavía no hay insumos cargados.</p>') +
    '<div class="pie-stock"><button class="btn sec chico" data-a="vista" data-v="excel">📥 Bajar Excel</button>' +
    (sesion.configura && ui.modStock === 'Stock' ? '<button class="btn sec chico" data-a="vista" data-v="tapfeed">📄 Subir informe TAP Feed</button>' +
      '<button class="btn sec chico" data-a="vista" data-v="config">⚙ Configurar insumos y corrales</button>' : '') +
    (sesion.configura && esSanidad() ? '<button class="btn sec chico" data-a="nuevoProducto">➕ Nuevo producto</button>' : '') + '</div>';
}

/** Lo aplicado a los animales llega solo desde la app de la estancia: cuándo fue la última vez y
 *  qué no se pudo descontar (producto que no está en la lista o cargado en otra unidad). */
function htmlEstadoEstancia() {
  if (ui.rubro !== 'Medicamentos') return '';
  const e = stockDatos().estancia || { ultima: 0, errores: [] };
  const errores = (e.errores || []).length ? '<div class="aviso amarillo">⚠️ Desde la app de la estancia llegaron aplicaciones que <b>no se descontaron</b>:<ul>' +
    e.errores.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>Corregilas allá o revisá el producto en Configurar.</div>' : '';
  return '<p class="nota-estancia">🔄 Lo aplicado a los animales se descuenta solo desde la app de la estancia' +
    (e.ultima ? ' (última actualización ' + haceCuanto(e.ultima) + ')' : ' (todavía no se conectó)') + '.</p>' + errores;
}

/** Sanidad: son casi cien productos, así que van en lista corta (nombre y saldo) con un buscador
 *  (nombre comercial, principio activo, laboratorio, proveedor o indicación); la ficha se abre al tocar. */
function htmlListaSanidad(ins, s, c7) {
  if (!insumosMod().length) return '<p class="vacio">Todavía no hay productos en ' + esc(ui.rubro) + '.</p>';
  const bajos = ins.filter((i) => infoInsumo(i, s, c7).bajo).length;
  return htmlEstadoEstancia() +
    '<div class="buscar-fila"><input class="txt buscar" id="buscar-san" type="search" placeholder="' + (ui.rubro === 'Semen' ? '🔍 Toro o cabaña…' : '🔍 Nombre, principio activo, laboratorio…') + '" autocomplete="off" value="' + esc(ui.buscarSan || '') + '">' +
    (ui.rubro !== 'Semen' ? '<button class="chip-filtro' + (ui.filtroIatf ? ' activo' : '') + '" data-a="filtroIatf">🏷 IATF</button>' : '') + '</div>' +
    '<div id="res-san">' + htmlResultadosSanidad() + '</div>' +
    '<p class="nota-estancia" style="margin-top:12px">' + ins.length + ' productos en ' + esc(ui.rubro) +
    (bajos ? ' · <span class="chip alerta">' + bajos + ' bajo mínimo</span>' : '') + '</p>';
}

/** Mayúsculas de la planilla a texto normal ("CONSULTPEC SRL" → "Consultpec SRL"); siglas cortas quedan. */
function lindo(t) {
  const s = String(t || '').trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.split(/(\s+|\/|,)/).map((p, n) => (n && /^(Y|E|O|DE|DEL|LA|EL|CON)$/.test(p) ? p.toLowerCase()
    : /^([A-ZÁÉÍÓÚÑ]{4,}|LAS|LOS|SAN)$/.test(p) ? p.charAt(0) + p.slice(1).toLowerCase() : p)).join('');
}

/** Dosis base, ej. "4 ml cada 500 kg" (la planilla la da por kg de peso vivo). */
function dosisTxt(i) {
  if (i.dosisBase == null) return '';
  return num(i.dosisBase) + ' ' + (i.unidadContenido || 'un') + (i.pesoBase ? ' cada ' + num(i.pesoBase, 0) + ' kg' : '');
}

/** En Semen el "Laboratorio" es la cabaña o centro genético. */
const esSemen = (i) => i.rubro === 'Semen';

/** Datos del producto, ordenados como la planilla de inventario. */
function fichaSanidad(i) {
  return [
    ['Indicación', lindo(i.indicacion)],
    [esSemen(i) ? 'Cabaña' : 'Laboratorio', lindo(i.laboratorio)],
    ['Proveedor', lindo(i.proveedor)],
    ['Dosis', dosisTxt(i)],
    ['Presentación', i.contenido ? i.unidad + ' de ' + num(i.contenido) + ' ' + i.unidadContenido : i.unidad],
  ].filter((x) => x[1]);
}

/** Lista corta de Sanidad: una línea por producto (nombre y saldo); tocándola se abre la ficha.
 *  Sin buscar se ven los que tienen stock (y los negativos); los que están en cero, a pedido. */
function htmlResultadosSanidad() {
  const q = String(ui.buscarSan || '').trim().toUpperCase();
  const s = saldos();
  const c7 = consumo7();
  // Buscando aparecen también los desactivados (para poder abrirlos y reactivarlos).
  const ins = insumosMod().filter((i) => (q || i.activo || (s[i.nombre] && s[i.nombre].cantidad)) && (!ui.filtroIatf || esIatf(i)) &&
    (!q || [i.nombre, i.principio, i.laboratorio, i.proveedor, i.indicacion].join(' ').toUpperCase().indexOf(q) !== -1))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const filtro = (q ? ' con "' + esc(ui.buscarSan.trim()) + '"' : '') + (ui.filtroIatf ? ' de IATF' : '');
  if (!ins.length) return '<p class="vacio">No hay productos' + (filtro || ' con stock') + '.</p>';
  const conStock = ins.filter((i) => (s[i.nombre] || {}).cantidad);
  const enCero = ins.filter((i) => !(s[i.nombre] || {}).cantidad);
  // Buscando se ve todo lo que coincide; sin buscar, lo que está en cero queda detrás de un botón.
  const verCero = q || ui.sinStockSan;
  const fila = (i) => {
    const n = infoInsumo(i, s, c7);
    // Línea gris: principio activo (en Semen, que todo es semen, la cabaña) y el proveedor.
    const sub = [esSemen(i) ? i.laboratorio : i.principio, i.proveedor].filter(Boolean).map(lindo).join(' · ');
    return '<button class="fila-san ' + n.cls + '" data-a="verInsumo" data-i="' + esc(i.nombre) + '">' +
      '<span class="nom">' + esc(i.nombre) + (esIatf(i) && ui.rubro !== 'Semen' ? ' <span class="chip azul">IATF</span>' : '') +
      (!i.activo ? ' <span class="chip">Desactivado</span>' : '') +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
      '<span class="val"><b class="' + (n.x.cantidad < 0 ? 'rojo' : '') + '">' + num(n.x.cantidad, 1) + '</b> ' + esc(unidadTxt(i.unidad, n.x.cantidad)) +
      (n.kg && n.x.cantidad ? '<small>' + esc(n.kg) + '</small>' : '') + '</span></button>';
  };
  return (conStock.length ? '<div class="lista-san">' + conStock.map(fila).join('') + '</div>'
    : '<p class="vacio">No hay productos con stock' + filtro + '.</p>') +
    (enCero.length ? (verCero
      ? '<h4 class="tit-cero">Sin stock (' + enCero.length + ')</h4><div class="lista-san">' + enCero.map(fila).join('') + '</div>' +
        (q ? '' : '<button class="link-cero" data-a="sinStockSan">Ocultar los que están sin stock</button>')
      : '<button class="link-cero" data-a="sinStockSan">Ver también sin stock (' + enCero.length + ')</button>') : '');
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
    '<div class="cant">' + num(n.x.cantidad, decimales(i)) + '<small>' + esc(unidadTxt(i.unidad, n.x.cantidad)) + '</small>' +
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
  if (puede(ui.modStock, 'CARGAR') && i.activo) {
    // Sanidad: el uso (consumo) se carga solo en la app de la estancia; acá, ingresos y conteos.
    // Excepción: los materiales sanitarios (no van a animales) se dan de baja acá.
    if (!esSanidad() || i.rubro === RUBRO_MATERIALES) botones.push(['Consumo', 'consumo', '⬆ Consumo']);
    botones.push(['Ingreso', 'ingreso', '⬇ Ingreso']);
    if (puede(ui.modStock, 'ADMINISTRAR')) botones.push(['Conteo', 'conteo', '✔ Conteo']);
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
    if ((i.modulo || 'Stock') === 'Sanidad') {
      const f = fichaSanidad(i);
      if (i.principio) f.unshift(['Principio activo', lindo(i.principio)]);
      cajas += '<table class="detalle" style="margin-top:10px">' + f.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table>' +
        (i.rubro === RUBRO_MATERIALES ? '<p class="nota-estancia" style="margin-top:8px">No se aplica a animales: el uso se carga acá, con Consumo.</p>'
          : ui.rubro !== 'Semen' ? '<p class="nota-estancia" style="margin-top:8px">El uso se carga en la app de la estancia (Sanidades) y se descuenta solo.</p>' : '') +
        (sesion.configura ? '<button class="btn sec chico" data-a="editarProducto" style="margin-top:4px">✏️ Editar datos del producto</button>' : '');
    }
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
  const movs = movimientos().filter((m) => esSinFactura(m) && enVista(m.insumo));
  if (!movs.length) return '<p class="vacio">No hay ingresos sin factura. 👍</p>';
  return '<div class="form"><div class="aviso">Tocá un ingreso para asociarle la factura cuando llegue.</div>' +
    movs.map((m) => htmlMov(m)).join('') + '</div>';
}

function nuevoForm(clase, insumo) {
  const prev = ui.form || {};
  const fecha = prev.fecha || hoyISO();
  // En Sanidad el proveedor viene de la ficha del producto (se puede cambiar).
  const ins = stockDatos().insumos.find((i) => i.nombre === insumo) || {};
  return { clase, insumo, estancia: '', fecha: esCombustible() && fecha < COMBUSTIBLE_DESDE ? hoyISO() : fecha, cantidad: '', destino: '',
    proveedor: clase === 'Ingreso' && ins.proveedor ? lindo(ins.proveedor) : '', remito: '', factura: '', nota: '', maquina: '', equipo: '', trabajo: '', finca: '' };
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
    '<input type="date" id="f-fecha" value="' + f.fecha + '" max="' + hoyISO() + '"' + (esCombustible() ? ' min="' + COMBUSTIBLE_DESDE + '"' : '') + '></label>' +
    '<button class="nav" data-a="fecha" data-d="1" aria-label="Día siguiente"' + (f.fecha >= hoyISO() ? ' disabled' : '') + '>›</button></div></div>';
  if (esCombustible() && hoyISO() < COMBUSTIBLE_DESDE) h += '<div class="aviso amarillo">El registro de combustible arranca el 1° de octubre.</div>';
  h += '<div class="campo"><span class="etq">' + (f.clase === 'Conteo' ? 'Cantidad contada' : 'Cantidad') + ' <small>(en ' + esc(unidadTxt(ins.unidad, 2)) +
    (ins.contenido ? '; un frasco empezado va con coma, ej. 3,5' : '') + ')</small></span>' +
    '<div class="cantidad"><button data-a="mas" data-d="-1" aria-label="Menos">−</button>' +
    '<input id="f-cantidad" inputmode="decimal" autocomplete="off" value="' + esc(f.cantidad) + '" placeholder="0">' +
    '<button data-a="mas" data-d="1" aria-label="Más">+</button></div>' +
    '<div class="equivale" id="f-equivale">' + equivale() + '</div></div>';
  if (f.clase === 'Consumo' && esCombustible()) {
    h += htmlCamposMaquina(f, s);
  } else if (f.clase === 'Consumo' && !esSanidad()) {
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

/** Consumo de combustible: a qué máquina (de las que usan ese combustible) u otro destino, el
 *  equipo (Motos, Motosierras...), el trabajo (obligatorio en tractores) y la estancia. */
function htmlCamposMaquina(f, s) {
  const maqs = (s.maquinas || []).filter((q) => !q.combustible || q.combustible === f.insumo);
  const q = maqs.find((x) => x.codigo === f.maquina);
  let h = '<div class="campo"><label for="f-maquina">Máquina</label><select class="txt grande" id="f-maquina">' +
    '<option value="">Elegí la máquina…</option>' +
    maqs.map((x) => '<option value="' + esc(x.codigo) + '"' + (f.maquina === x.codigo ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') +
    '<option value="' + OTRO_DESTINO + '"' + (f.maquina === OTRO_DESTINO ? ' selected' : '') + '>Otro destino (taller, entrega, contratista…)</option></select></div>';
  if (f.maquina === OTRO_DESTINO) {
    h += '<div class="campo"><label for="f-destinoTxt">¿A dónde fue?</label><input class="txt" id="f-destinoTxt" value="' + esc(f.destino) + '"></div>';
  }
  if (q && q.agrupa) {
    h += '<div class="campo"><label for="f-equipo">¿Cuál? <small>(opcional)</small></label><input class="txt" id="f-equipo" list="lista-equipos" value="' + esc(f.equipo) + '" autocomplete="off">' +
      '<datalist id="lista-equipos">' + (q.equipos || []).map((e) => '<option value="' + esc(e) + '">').join('') + '</datalist></div>';
  }
  if (q) {
    // Solo de la lista (la edita quien tiene Configurar, desde Horómetro). Si se corrige un
    // movimiento con un trabajo que ya no está, se muestra igual para no perderlo.
    const lista = (s.trabajos || []).slice();
    if (f.trabajo && lista.indexOf(f.trabajo) === -1) lista.unshift(f.trabajo);
    h += '<div class="campo"><label for="f-trabajo">Trabajo ' + (q.pideTrabajo ? '' : '<small>(opcional)</small>') + '</label>' +
      '<select class="txt grande" id="f-trabajo"><option value="">' + (q.pideTrabajo ? 'Elegí el trabajo…' : 'Sin trabajo') + '</option>' +
      lista.map((t) => '<option' + (f.trabajo === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>';
  }
  h += '<div class="campo"><span class="etq">Estancia <small>(opcional)</small></span><div class="segmento">' + ESTANCIAS.map(([e, nom]) =>
    '<button class="neutro' + (f.finca === e ? ' activo' : '') + '" data-a="finca-comb" data-e="' + e + '">' + nom + '</button>').join('') + '</div></div>';
  return h;
}

function equivale() {
  const f = ui.form;
  if (!f) return '';
  const ins = stockDatos().insumos.find((i) => i.nombre === f.insumo);
  const n = leerNumero(f.cantidad);
  if (!ins || !isFinite(n)) return '';
  if (ins.contenido) return '= ' + contenidoTxt(ins, n);
  if (ins.kgUnidad && ins.unidad !== 'kg') return '= ' + num(n * ins.kgUnidad) + ' kg';
  return '';
}

function leerCamposForm() {
  const f = ui.form;
  if (!f || ui.vistaStock !== 'form') return;
  ['cantidad', 'proveedor', 'remito', 'factura', 'nota', 'destino', 'maquina', 'equipo', 'trabajo'].forEach((k) => {
    const el = $('#f-' + k);
    if (el) f[k] = el.value;
  });
  const otro = $('#f-destinoTxt');
  if (otro) f.destino = otro.value;
}

async function guardarMov() {
  leerCamposForm();
  const f = ui.form;
  const cantidad = leerNumero(f.cantidad);
  if (!isFinite(cantidad) || cantidad < 0 || (f.clase !== 'Conteo' && cantidad === 0)) { toast('Poné una cantidad válida.', 3000); return; }
  if (f.fecha > hoyISO()) { toast('La fecha no puede ser futura.', 3000); return; }
  const ins = stockDatos().insumos.find((i) => i.nombre === f.insumo);
  if (ins.porEstancia && !f.estancia) { toast('Elegí la estancia: La Prudencia o La Paciencia.', 3000); return; }
  const comb = (ins.modulo || 'Stock') === 'Combustible';
  if (comb && f.fecha < COMBUSTIBLE_DESDE) { toast('El registro de combustible arranca el 1° de octubre.', 3500); return; }
  if (comb && f.clase === 'Consumo') {
    const q = (stockDatos().maquinas || []).find((x) => x.codigo === f.maquina);
    if (!f.maquina) { toast('Elegí la máquina.', 3000); return; }
    if (f.maquina === OTRO_DESTINO && !String(f.destino).trim()) { toast('Escribí a dónde fue el combustible.', 3000); return; }
    if (q && q.pideTrabajo && !String(f.trabajo).trim()) { toast('En los tractores hay que cargar el trabajo.', 3000); return; }
  }
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
  if (comb && f.clase === 'Consumo') {
    op.maquina = f.maquina;
    if (f.maquina === OTRO_DESTINO) op.destino = String(f.destino).trim();
    else {
      const q = (stockDatos().maquinas || []).find((x) => x.codigo === f.maquina) || {};
      op.destino = q.nombre || '';
      if (q.agrupa && String(f.equipo).trim()) op.equipo = String(f.equipo).trim();
      if (String(f.trabajo).trim()) op.trabajo = String(f.trabajo).trim();
    }
    if (f.finca) op.finca = f.finca;
  } else if (f.clase === 'Consumo' && f.destino) op.destino = f.destino;
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
  if (m.tipo === 'Consumo' && moduloDe(m.insumo) === 'Sanidad') { if (m.nota) extra.push(m.nota); }
  else if (m.tipo === 'Consumo') extra.push((m.destino || 'sin destino') + (m.equipo ? ' ' + m.equipo : '') + (m.trabajo ? ' · ' + m.trabajo : ''));
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
  const insM = stockDatos().insumos.find((i) => i.nombre === m.insumo) || {};
  const san = insM.modulo === 'Sanidad';
  const filas = [
    ['Tipo', m.tipo], ['Fecha', fechaTxt(m.fecha, true)], [san ? 'Producto' : 'Insumo', m.insumo],
  ];
  if (m.estancia) filas.push(['Estancia', nombreEstancia(m.estancia)]);
  filas.push(
    ['Cantidad', num(m.cantidad) + ' ' + unidadTxt(m.unidad, m.cantidad) + (insM.contenido ? ' (' + contenidoTxt(insM, m.cantidad) + ')'
      : m.kg != null && m.unidad !== 'kg' ? ' (' + num(m.kg) + ' kg)' : '')]);
  if (m.tipo === 'Consumo' && !san) filas.push([m.maquina ? 'Máquina' : 'Destino', (m.destino || 'Sin destino') + (m.equipo ? ' (' + m.equipo + ')' : '')]);
  if (m.trabajo) filas.push(['Trabajo', m.trabajo]);
  if (m.finca) filas.push(['Estancia', nombreEstancia(m.finca)]);
  if (m.tipo === 'Ingreso' && !esPropio(m.insumo)) {
    filas.push(['Proveedor', m.proveedor || '—'], ['Remito', m.remito || '—'], ['Factura', m.factura || 'Sin factura']);
  }
  if (m.nota) filas.push(['Nota', m.nota]);
  filas.push(['Cargado por', m.usuario + (m.pendiente ? ' (sin enviar)' : '')]);
  // Consumos que manda la app de la estancia: se corrigen allá (acá se reescriben solos).
  const deEstancia = String(m.id).indexOf('SAN-') === 0;
  if (deEstancia) filas.push(['Origen', 'Sanidades de la app de la estancia. Si hay un error, corregilo allá: acá se actualiza solo.']);
  if (m.anulado) filas.push(['Anulado', m.anuladoPor || 'sí']);
  const mod = moduloDe(m.insumo);
  const admin = puede(mod, 'ADMINISTRAR');
  // Quien carga corrige/anula lo suyo de los últimos 7 días; quien administra, cualquier cosa.
  // Un conteo solo lo corrige quien administra (es quien puede cargarlo).
  const puedeAnular = !m.anulado && !deEstancia && puede(mod, 'CARGAR') &&

    (admin || (m.usuario === sesion.nombre && m.fecha >= sumarDias(hoyISO(), -7)));
  const puedeCorregir = puedeAnular && (m.tipo !== 'Conteo' || admin);
  const puedeFactura = !m.anulado && m.tipo === 'Ingreso' && !esPropio(m.insumo) && puede(mod, 'CARGAR');
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
      maquina: m.maquina || '', equipo: m.equipo || '', trabajo: m.trabajo || '', finca: m.finca || '',
    };
    ui.insumoVer = m.insumo;
    ui.pantalla = 'stock';
    ui.modStock = mod;
    if (san) ui.rubro = insM.rubro;
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

// ---------------------------------------------------------------- lector del PDF de Tapfeed
// "Uso de ingredientes por grupo": se lee en el teléfono/PC con pdf.js (se baja solo la
// primera vez que se usa). Arma las líneas del PDF juntando los textos que están a la misma
// altura, y de ahí saca el período, cada corral (con sus cabezas) y los kg de cada ingrediente.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

function cargarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => mal(new Error('no se pudo bajar el lector de PDF (¿hay señal?)'));
    document.head.appendChild(s);
  });
}

async function lineasPdf(buffer) {
  const pdfjs = await cargarPdfJs();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const lineas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const contenido = await (await doc.getPage(p)).getTextContent();
    const filas = [];
    contenido.items.forEach((it) => {
      if (!it.str.trim()) return;
      const y = it.transform[5];
      let f = filas.find((x) => Math.abs(x.y - y) < 2.5);
      if (!f) { f = { y, items: [] }; filas.push(f); }
      f.items.push({ x: it.transform[4], s: it.str.trim() });
    });
    filas.sort((a, b) => b.y - a.y).forEach((f) => lineas.push(f.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
  }
  return lineas;
}

const numTapfeed = (s) => Number(String(s).replace(/,/g, ''));

/** { desde, hasta (AAAA-MM-DD), corrales: [{ nombre, cabezas, items: [{ nombre, kg, ms }] }], total: [...] } */
function interpretarTapfeed(lineas) {
  const r = { desde: '', hasta: '', corrales: [], total: [] };
  let grupo = null;
  lineas.forEach((l) => {
    const p = l.match(/Desde (\d{2})\/(\d{2})\/(\d{4}) a (\d{2})\/(\d{2})\/(\d{4})/);
    if (p) { r.desde = p[3] + '-' + p[2] + '-' + p[1]; r.hasta = p[6] + '-' + p[5] + '-' + p[4]; return; }
    const g = l.match(/^(.+?) \((\d*)\)$/);
    if (g) {
      if (/^TOTAL$/i.test(g[1].trim())) grupo = { total: true };
      else { grupo = { nombre: g[1].trim(), cabezas: Number(g[2]) || 0, items: [] }; r.corrales.push(grupo); }
      return;
    }
    const i = l.match(/^(.+?)\s+(-?[\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+Kg\b/);
    if (!i || !grupo || /^Total$/i.test(i[1].trim())) return;
    const item = { nombre: i[1].trim(), kg: numTapfeed(i[2]), ms: numTapfeed(i[3]) };
    if (grupo.total) r.total.push(item); else grupo.items.push(item);
  });
  return r;
}

/** Problemas que impiden cargar el informe (lista vacía = está bien). */
function problemasTapfeed(r) {
  const p = [];
  if (!r.desde) p.push('no se encontró el período ("Desde … a …"). ¿Es el informe "Uso de ingredientes por grupo"?');
  else if (r.desde !== r.hasta) p.push('el informe abarca varios días (' + fechaTxt(r.desde) + ' a ' + fechaTxt(r.hasta) + '). Exportalo de a un día.');
  if (!r.corrales.length) p.push('no se encontró ningún corral.');
  if (!r.total.length) p.push('no se encontró el TOTAL del informe.');
  // Control: la suma de los corrales tiene que dar el total de cada ingrediente.
  r.total.forEach((t) => {
    const suma = r.corrales.reduce((a, c) => a + c.items.filter((x) => x.nombre === t.nombre).reduce((b, x) => b + x.kg, 0), 0);
    if (Math.abs(suma - t.kg) > 1) p.push('la suma de los corrales de ' + t.nombre + ' (' + num(suma) + ' kg) no da el total (' + num(t.kg) + ' kg).');
  });
  return p;
}

// ------ subir informe de Tapfeed (solo quien configura; necesita señal)
// El PDF se lee acá (lector de arriba); se muestra lo encontrado y al confirmar va al script,
// que registra un consumo por ingrediente (destino Confinamiento) y guarda el PDF en Drive.
function htmlTapfeed() {
  const tf = ui.tf;
  const dias = (datos && datos.tapfeedDias) || [];
  let h = '<div class="form">';
  if (!tf || tf.estado === 'error') {
    if (tf && tf.estado === 'error') {
      h += '<div class="aviso rojo-fondo"><b>No se puede cargar este PDF:</b><ul>' + tf.problemas.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul></div>';
    }
    h += '<div class="aviso">Elegí el PDF <b>"Uso de ingredientes por grupo"</b> de TAP Feed, de <b>un solo día</b>.</div>' +
      '<label class="btn">📄 Elegir PDF de TAP Feed<input type="file" id="tf-archivo" accept="application/pdf,.pdf" hidden></label>';
    if (dias.length) {
      const ultimo = dias[dias.length - 1];
      const faltan = [];
      for (let f = dias[0]; f < sumarDias(hoyISO(), -1); f = sumarDias(f, 1)) if (dias.indexOf(f) === -1) faltan.push(f);
      h += '<div class="tarjeta" style="margin-top:16px"><b>Último día cargado:</b> ' + fechaTxt(ultimo, true) +
        (faltan.length ? '<br><span class="rojo"><b>Faltan:</b> ' + faltan.map((f) => fechaTxt(f)).join(', ') + '</span>' : '') + '</div>';
    }
    return h + '</div>';
  }
  if (tf.estado === 'leyendo' || tf.estado === 'enviando') {
    return h + '<p class="vacio">' + (tf.estado === 'leyendo' ? 'Leyendo el PDF…' : 'Cargando en Google…') + '</p></div>';
  }
  // Vista previa de lo que se va a registrar.
  const ins = stockDatos().insumos;
  const cabezas = tf.r.corrales.reduce((a, c) => a + c.cabezas, 0);
  const ya = dias.indexOf(tf.r.desde) !== -1;
  h += '<div class="tarjeta"><div style="font-size:20px;font-weight:800">' + fechaTxt(tf.r.desde, true) + '</div>' +
    '<div style="color:var(--gris)">' + tf.r.corrales.length + ' corrales · ' + num(cabezas, 0) + ' cabezas · ' + esc(tf.archivo.name) + '</div>' +
    '<table class="detalle" style="margin-top:10px">' + tf.r.total.map((t) => {
      const i = ins.find((x) => esDeTapfeed(x, t.nombre));
      const cant = i && i.kgUnidad && i.unidad !== 'kg' ? ' = ' + num(t.kg / i.kgUnidad, 1) + ' ' + unidadTxt(i.unidad, 2) : '';
      return '<tr><td>' + esc(i ? i.nombre : t.nombre) + '</td><td><b>' + num(t.kg, 0) + ' kg</b>' + esc(cant) + '</td></tr>';
    }).join('') + '</table></div>';
  if (ya) h += '<div class="aviso amarillo">Ese día <b>ya está cargado</b>. Si confirmás, se reemplaza por este informe.</div>';
  h += '<div class="acciones"><button class="btn" data-a="tfConfirmar">' + (ya ? 'Reemplazar' : 'Confirmar y cargar') + '</button>' +
    '<button class="btn sec" data-a="tfOtro">Elegir otro PDF</button></div></div>';
  return h;
}

/** Un insumo puede tener varios nombres en Tapfeed, separados por punto y coma (Tapfeed a veces los
 *  renombra, ej. "Concentrado Desarrollo" → "Concen Desarrollo"; la coma no sirve: "Maiz Molido DGM 1,2"). */
const esDeTapfeed = (i, nombre) => String(i.tapfeed || '').split(';').some((x) => x.trim() && x.trim().toUpperCase() === String(nombre).trim().toUpperCase());

async function tfLeer(archivo) {
  ui.tf = { estado: 'leyendo', archivo };
  render();
  try {
    const buffer = await archivo.arrayBuffer();
    const r = interpretarTapfeed(await lineasPdf(buffer.slice(0)));
    const problemas = problemasTapfeed(r);
    const ins = stockDatos().insumos;
    r.total.forEach((t) => {
      if (!ins.some((i) => esDeTapfeed(i, t.nombre))) {
        problemas.push('"' + t.nombre + '" no corresponde a ningún insumo: agregá ese nombre en la columna "Nombre en Tapfeed" de la hoja Insumos (si ya tiene otro, separalos con punto y coma).');
      }
    });
    if (r.desde && r.desde > hoyISO()) problemas.push('la fecha del informe es futura.');
    ui.tf = problemas.length ? { estado: 'error', problemas } : { estado: 'listo', archivo, r, buffer };
  } catch (e) {
    ui.tf = { estado: 'error', problemas: ['no se pudo leer el PDF: ' + ((e && e.message) || e)] };
  }
  render();
}

async function tfConfirmar() {
  const tf = ui.tf;
  if (!navigator.onLine) { toast('Sin señal: para cargar el informe hace falta señal.', 3500); return; }
  const ya = ((datos && datos.tapfeedDias) || []).indexOf(tf.r.desde) !== -1;
  ui.tf = Object.assign({}, tf, { estado: 'enviando' });
  render();
  try {
    let bin = '';
    const bytes = new Uint8Array(tf.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    // Una sola vez, sin reintento: si el primero llegó y se perdió la respuesta, un reintento
    // vería el día como ya cargado y confundiría.
    const r = await llamarUnaVez({
      accion: 'tapfeed', pin: sesion.pin, reemplazar: ya, nombreArchivo: tf.archivo.name, pdf: btoa(bin),
      datos: { fecha: tf.r.desde, corrales: tf.r.corrales, total: tf.r.total },
    });
    if (!r.ok) throw new Error(r.error || 'error del servidor');
    if (r.yaCargado) throw new Error('ese día ya estaba cargado');
    ui.tf = null;
    toast('✓ TAP Feed del ' + fechaTxt(r.fecha) + ' cargado (' + r.consumos + ' consumos)', 3500);
    await sincronizar();
  } catch (e) {
    ui.tf = Object.assign({}, tf, { estado: 'listo' });
    render();
    cartel({ icono: '⚠️', titulo: 'No se pudo cargar', html: '<p>' + esc((e && e.message) || e) + '</p><p>Revisá "Último día cargado" antes de volver a intentar.</p>', si: 'Entendido', no: '' });
  }
}

// ------ bajar Excel de lo registrado (necesita señal: lo arma Google)
function htmlExcel() {
  if (!ui.excel) ui.excel = { desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() };
  const e = ui.excel;
  const min = esCombustible() ? ' min="' + COMBUSTIBLE_DESDE + '"' : '';
  return '<div class="form"><div class="aviso">' + (esSanidad()
    ? 'Baja lo registrado de <b>' + esc(ui.rubro) + '</b> en el período: un <b>Resumen</b> (saldo de cada producto) y la tabla de <b>Movimientos</b>, todo con la unidad de negocio PATRIMONIAL.'
    : 'Baja todo lo registrado en el período: un <b>Resumen</b>, una hoja por ' +
    (esCombustible() ? 'combustible' : 'insumo') + ' (saldo con fórmula) y la tabla de <b>Movimientos</b> con el código del bien de uso (para Albor).') + '</div>' +
    '<div class="fila2"><div class="campo"><label for="x-desde">Desde</label><input class="txt" type="date" id="x-desde" value="' + e.desde + '"' + min + ' max="' + hoyISO() + '"></div>' +
    '<div class="campo"><label for="x-hasta">Hasta</label><input class="txt" type="date" id="x-hasta" value="' + e.hasta + '"' + min + ' max="' + hoyISO() + '"></div></div>' +
    '<button class="btn" data-a="bajarExcel"' + (e.bajando ? ' disabled' : '') + '>' + (e.bajando ? 'Armando el Excel…' : '📥 Bajar Excel') + '</button></div>';
}

async function bajarExcel() {
  const e = ui.excel;
  e.desde = $('#x-desde').value || e.desde;
  e.hasta = $('#x-hasta').value || e.hasta;
  if (e.hasta < e.desde) { toast('"Hasta" es anterior a "Desde".', 3000); return; }
  if (!navigator.onLine) { toast('Sin señal: el Excel lo arma Google, hace falta señal.', 3500); return; }
  e.bajando = true;
  render();
  try {
    const r = await llamar({ accion: 'excel', pin: sesion.pin, modulo: ui.modStock, rubro: ui.rubro, desde: e.desde, hasta: e.hasta });
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = r.nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('✓ Excel descargado: ' + r.nombre, 3500);
  } catch (err) {
    toast('No se pudo bajar el Excel: ' + ((err && err.message) || err), 5000);
  } finally {
    e.bajando = false;
    render();
  }
}

// ------ configurar insumos y destinos (solo quien administra Stock; necesita señal)
function htmlConfig() {
  const s = stockDatos();
  // Solo los insumos de Stock: Nafta y Diesel son de Combustible y el script los conserva aparte.
  if (!ui.cfg) ui.cfg = { insumos: s.insumos.filter((i) => (i.modulo || 'Stock') === 'Stock').map((i) => Object.assign({}, i)), destinos: s.destinos.map((d) => Object.assign({}, d)) };
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

/** Sanidad: alta o edición de UN producto (desde "➕ Nuevo producto" o la ficha). Solo quien tiene
 *  Configurar; necesita señal. Un Medicamento con movimientos no cambia de nombre (lo controla el script). */
function productoForm(i) {
  const v = (x) => (x == null ? '' : String(x).replace('.', ','));
  return i ? { original: i.nombre, nombre: i.nombre, principio: i.principio || '', rubro: i.rubro, unidad: i.unidad, contenido: v(i.contenido),
    unidadContenido: i.unidadContenido || 'ml', indicacion: i.indicacion || '', laboratorio: i.laboratorio || '', proveedor: i.proveedor || '',
    dosisBase: v(i.dosisBase), pesoBase: v(i.pesoBase), minimo: v(i.minimo), activo: !!i.activo }
    : Object.assign({ original: '', nombre: '', principio: '', rubro: ui.rubro, contenido: '', indicacion: '',
      laboratorio: '', proveedor: '', dosisBase: '', pesoBase: '', minimo: '', activo: true }, unidadesPorDefecto(ui.rubro));
}

/** Unidades con que arranca un producto nuevo: el semen va en pajuelas (un), lo demás en frascos (ml). */
const unidadesPorDefecto = (rubro) => (rubro === 'Semen' ? { unidad: 'pajuela', unidadContenido: 'un' } : { unidad: 'frasco', unidadContenido: 'ml' });

function htmlProducto() {
  const p = ui.prod;
  const txt = (k, etq, extra) => '<div class="campo"><label for="p-' + k + '">' + etq + '</label><input class="txt" id="p-' + k + '" data-prod="' + k + '" value="' +
    esc(p[k]) + '"' + (extra || '') + '></div>';
  const sel = (k, etq, lista) => '<div class="campo"><label for="p-' + k + '">' + etq + '</label><select class="txt" id="p-' + k + '" data-prod="' + k + '">' +
    lista.map((x) => '<option' + (p[k] === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>';
  const chk = (k, etq, ayuda) => '<label class="interruptor"><input type="checkbox" data-prod="' + k + '"' + (p[k] ? ' checked' : '') + '> ' + etq +
    (ayuda ? ' <small style="color:var(--gris)">' + ayuda + '</small>' : '') + '</label>';
  const dec = ' inputmode="decimal" autocomplete="off"';
  return '<div class="form">' +
    txt('nombre', 'Nombre comercial') + txt('principio', 'Principio activo <small>(opcional)</small>') +
    '<div class="fila2">' + sel('rubro', 'Stock', RUBROS_SANIDAD.map((r) => r[0])) + sel('unidad', 'Se guarda en', UNIDADES_SAN) + '</div>' +
    '<div class="fila2">' + txt('contenido', 'Contenido <small>(opc.)</small>', dec) + sel('unidadContenido', 'ml / un', ['ml', 'un']) + '</div>' +
    txt('indicacion', 'Indicación <small>(opcional)</small>') +
    '<div class="fila2">' + txt('laboratorio', (p.rubro === 'Semen' ? 'Cabaña' : 'Laboratorio') + ' <small>(opc.)</small>') + txt('proveedor', 'Proveedor <small>(opc.)</small>') + '</div>' +
    '<div class="fila2">' + txt('dosisBase', 'Dosis base <small>(opc.)</small>', dec) + txt('pesoBase', 'Cada … kg <small>(opc.)</small>', dec) + '</div>' +
    txt('minimo', 'Stock mínimo <small>(opcional)</small>', dec) +
    '<div style="margin:6px 0 16px">' + chk('activo', 'Activo', '') +
    '<p class="nota-estancia" style="margin-top:8px"><b>Stock</b>: en Medicamentos el uso llega desde la app de la estancia; en Materiales sanitarios se carga acá. ' +
    'Para que aparezca en el filtro 🏷 IATF, poné Indicación <b>Reproducción</b>.</p></div>' +
    '<button class="btn" data-a="guardarProducto"' + (p.guardando ? ' disabled' : '') + '>' + (p.guardando ? 'Guardando…' : (p.original ? 'Guardar cambios' : 'Crear producto')) + '</button></div>';
}

async function guardarProducto() {
  const p = ui.prod;
  if (!String(p.nombre).trim()) { toast('Escribí el nombre comercial.', 3000); return; }
  if (!navigator.onLine) { toast('Sin señal: los cambios de productos necesitan señal.', 3500); return; }
  const n = (x) => (String(x).trim() ? leerNumero(x) : '');
  const prod = { nombre: String(p.nombre).trim(), principio: p.principio.trim(), rubro: p.rubro, unidad: p.unidad, contenido: n(p.contenido),
    unidadContenido: p.unidadContenido, indicacion: p.indicacion.trim(), laboratorio: p.laboratorio.trim(), proveedor: p.proveedor.trim(),
    dosisBase: n(p.dosisBase), pesoBase: n(p.pesoBase), minimo: n(p.minimo), activo: !!p.activo };
  if (['contenido', 'dosisBase', 'pesoBase', 'minimo'].some((k) => prod[k] !== '' && !(prod[k] >= 0))) { toast('Revisá los números.', 3000); return; }
  p.guardando = true;
  render();
  try {
    const r = await llamar({ accion: 'producto', pin: sesion.pin, original: p.original, producto: prod });
    // Se ve enseguida; los datos completos bajan después.
    const s = datos && datos.stock;
    if (s && r.producto) s.insumos = s.insumos.filter((i) => i.nombre !== (p.original || r.producto.nombre)).concat([r.producto]);
    // Cambio de nombre (Semen, Materiales): el script renombró sus movimientos; acá también, hasta que bajen los datos.
    if (s && r.producto && p.original && p.original !== r.producto.nombre) s.movimientos.forEach((m) => { if (m.insumo === p.original) m.insumo = r.producto.nombre; });
    toast(p.original ? '✓ Producto guardado' : '✓ Producto creado', 3000);
    ui.prod = null;
    ui.rubro = r.producto ? r.producto.rubro : ui.rubro;
    ui.insumoVer = r.producto ? r.producto.nombre : null;
    ui.vistaStock = ui.insumoVer ? 'ficha' : 'lista';
    render();
    window.scrollTo(0, 0);
    sincronizar();
  } catch (e) {
    p.guardando = false;
    render();
    toast('No se pudo guardar: ' + ((e && e.message) || e), 5000);
  }
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
    // Se ve enseguida: la lista guardada se aplica acá y los datos completos bajan después.
    const s = datos && datos.stock;
    if (s && tipo === 'insumos') {
      const antes = {};
      s.insumos.forEach((i) => { antes[i.nombre.toUpperCase()] = i; });
      s.insumos = lista.map((i) => Object.assign({ tapfeed: (antes[i.nombre.toUpperCase()] || {}).tapfeed || '' }, i, { kgUnidad: i.kgUnidad === '' ? null : i.kgUnidad, minimo: i.minimo === '' ? null : i.minimo, modulo: 'Stock' }))
        .concat(s.insumos.filter((i) => (i.modulo || 'Stock') !== 'Stock'));
    } else if (s) s.destinos = lista;
    ui.cfg = null;
    render();
    toast('✓ Lista de ' + tipo + ' guardada');
    sincronizar();
  } catch (e) {
    toast('No se pudo guardar: ' + ((e && e.message) || e), 5000);
  }
}

// ---------------------------------------------------------------- lluvias
// Una sola pantalla: el día elegido (las dos estancias, con barras), compartir por WhatsApp y
// los acumulados con barras (mes, temporada set-ago y año). "Cargar lluvia" abre el formulario y
// al guardar vuelve al día cargado.
const FINCAS = [['LA PRUDENCIA', 'La Prudencia'], ['LA PACIENCIA', 'La Paciencia']];
// Referencia de cada sector, igual que en ZehirutApp.
const REF_SECTOR = { 'LA PRUDENCIA': { C: 'Central', D: 'Retiro' }, 'LA PACIENCIA': { B: 'Retiro', E: 'Central' } };
const nombreSector = (finca, s) => 'Sector ' + s + (REF_SECTOR[finca] && REF_SECTOR[finca][s] ? ' (' + REF_SECTOR[finca][s] + ')' : '');
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

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

/** Acumulados por sector: mes actual (de los registros de los últimos días), temporada actual (de
 *  Google, corregida con lo que está en la cola) y total de la temporada anterior, para comparar. */
function acumuladosLluvia() {
  const d = lluviasDatos();
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const anio = hoy.slice(0, 4);
  const iniTemp = (Number(hoy.slice(5, 7)) >= 9 ? Number(anio) : Number(anio) - 1) + '-09-01';
  const acum = {};
  const clave = (f, s) => f + '|' + s;
  FINCAS.forEach(([f]) => (d.sectores[f] || []).forEach((s) => { acum[clave(f, s)] = { mes: 0, temporada: 0, anio: 0, anterior: 0 }; }));
  (d.resumen || []).forEach((r) => {
    const a = acum[clave(r.finca, r.sector)] || (acum[clave(r.finca, r.sector)] = { mes: 0, temporada: 0, anio: 0, anterior: 0 });
    a.temporada = r.temporada; a.anio = r.anio; a.anterior = r.anterior || 0;
  });
  const servidor = {};
  d.registros.forEach((r) => { servidor[r.fecha + '|' + r.finca + '|' + r.sector] = r.mm; });
  registrosLluvia().forEach((r) => {
    const a = acum[clave(r.finca, r.sector)];
    if (!a) return;
    if (r.fecha.slice(0, 7) === mes) a.mes += Number(r.mm) || 0;
    if (r.pendiente) {
      // Lo que todavía no llegó a Google se suma (descontando lo que reemplaza, si ya había).
      const dif = (Number(r.mm) || 0) - (Number(servidor[r.fecha + '|' + r.finca + '|' + r.sector]) || 0);
      if (r.fecha >= iniTemp) a.temporada += dif;
      if (r.fecha.slice(0, 4) === anio) a.anio += dif;
    }
  });
  const yy = (n) => String(n).slice(-2);
  const ini = Number(iniTemp.slice(0, 4));
  return {
    acum, mesTxt: MESES_LARGO[Number(mes.slice(5)) - 1],
    actual: d.temporadaCorta || yy(ini) + '-' + yy(ini + 1), anterior: d.temporadaAnterior || yy(ini - 1) + '-' + yy(ini),
  };
}

function htmlLluvias() {
  if (ui.vistaLluvia === 'cargar' && puede('Lluvias', 'CARGAR')) {
    return barra('Cargar lluvia', true) + '<div class="contenido">' + htmlLluviaCargar() + '</div>';
  }
  ui.vistaLluvia = 'dia';
  return barra('Lluvias', true) + '<div class="contenido"><div class="form">' + htmlLluviaDia() + htmlLluviaAcumulados() + '</div></div>';
}

/** Días con lluvia registrada (el más reciente primero). */
function diasConLluvia() {
  return registrosLluvia().map((r) => r.fecha).filter((f, i, a) => a.indexOf(f) === i).sort().reverse();
}

function htmlLluviaDia() {
  const dias = diasConLluvia();
  if (!ui.lluviaDia || dias.indexOf(ui.lluviaDia) === -1) ui.lluviaDia = dias[0] || null;
  let h = puede('Lluvias', 'CARGAR') ? '<button class="btn azul" data-a="lluviaCargar" style="margin-bottom:14px">🌧️ Cargar lluvia</button>' : '';
  if (!ui.lluviaDia) return h + '<p class="vacio">No hay lluvias registradas en los últimos ' + DIAS_HISTORIAL + ' días.</p>';
  const i = dias.indexOf(ui.lluviaDia);
  const regs = registrosLluvia().filter((r) => r.fecha === ui.lluviaDia);
  const max = Math.max(1, ...regs.map((r) => Number(r.mm) || 0));
  const rel = fechaRelativa(ui.lluviaDia);
  h += '<div class="fecha-fila" style="margin-bottom:10px">' +
    '<button class="nav" data-a="lluviaDia" data-d="1"' + (i >= dias.length - 1 ? ' disabled' : '') + ' aria-label="Lluvia anterior">‹</button>' +
    '<div class="fecha">' + fechaTxt(ui.lluviaDia, true) + (rel ? '<span class="hoy">' + rel + '</span>' : '') + '</div>' +
    '<button class="nav" data-a="lluviaDia" data-d="-1"' + (i <= 0 ? ' disabled' : '') + ' aria-label="Lluvia siguiente">›</button></div>';
  h += '<div class="tarjeta">' + FINCAS.map(([f, nom]) => {
    const sect = lluviasDatos().sectores[f] || [];
    return '<div class="lluvia-finca"><b>' + nom + '</b>' + sect.map((s) => {
      const r = regs.find((x) => x.finca === f && x.sector === s);
      const mm = r ? Number(r.mm) || 0 : null;
      return '<div class="barra-fila"><span class="barra-nombre">' + esc(nombreSector(f, s)) + '</span>' +
        '<span class="barra-fondo"><span class="barra-relleno dia" style="width:' + (mm ? Math.max(4, (mm / max) * 100) : 0) + '%"></span></span>' +
        '<span class="barra-valor">' + (mm == null ? '—' : num(mm, 1) + ' mm' + (r.pendiente ? '*' : '')) + '</span></div>';
    }).join('') + '</div>';
  }).join('') + (regs.some((r) => r.pendiente) ? '<small style="color:var(--gris)">* sin enviar todavía</small>' : '') + '</div>';
  h += '<button class="btn whatsapp" data-a="lluviaWhatsapp">📲 Compartir por WhatsApp</button>';
  return h;
}

function htmlLluviaAcumulados() {
  const a = acumuladosLluvia();
  const valores = Object.keys(a.acum).map((k) => a.acum[k]);
  const max = Math.max(1, ...valores.map((v) => Math.max(v.mes, v.temporada, v.anterior)));
  const mes = a.mesTxt.charAt(0).toUpperCase() + a.mesTxt.slice(1);
  const barra = (cls, etiqueta, v) => '<div class="barra-fila chica"><span class="barra-nombre">' + etiqueta + '</span>' +
    '<span class="barra-fondo"><span class="barra-relleno ' + cls + '" style="width:' + (v > 0 ? Math.max(3, (v / max) * 100) : 0) + '%"></span></span>' +
    '<span class="barra-valor">' + num(v, 0) + ' mm</span></div>';
  return '<h3 style="margin:22px 0 8px">Acumulados</h3>' +
    FINCAS.map(([f, nom]) => '<div class="tarjeta"><b>' + nom + '</b>' + (lluviasDatos().sectores[f] || []).map((s) => {
      const v = a.acum[f + '|' + s] || { mes: 0, temporada: 0, anterior: 0 };
      return '<div class="lluvia-sector"><span class="lluvia-sector-nombre">' + esc(nombreSector(f, s)) + '</span>' +
        barra('mes', mes, v.mes) + barra('temporada', 'Temporada ' + a.actual, v.temporada) + barra('anterior', 'Temporada ' + a.anterior, v.anterior) + '</div>';
    }).join('') + '</div>').join('');
}

/** Texto para WhatsApp: la lluvia del día y los acumulados de la temporada con barras de texto.
 *  Las tablas van entre ``` para que WhatsApp las muestre alineadas. */
function textoWhatsappLluvia() {
  const dia = ui.lluviaDia;
  const regs = registrosLluvia().filter((r) => r.fecha === dia);
  const a = acumuladosLluvia();
  const corto = (f, s) => s + (REF_SECTOR[f] && REF_SECTOR[f][s] ? ' ' + REF_SECTOR[f][s] : '');
  const barraTxt = (v, max) => { const n = max > 0 ? Math.round((v / max) * 10) : 0; return '▓'.repeat(n) + '░'.repeat(10 - n); };
  const lineas = ['🌧️ *Lluvia del ' + fechaTxt(dia, true) + '*', ''];
  FINCAS.forEach(([f, nom]) => {
    lineas.push('*' + nom + '*');
    (lluviasDatos().sectores[f] || []).forEach((s) => {
      const r = regs.find((x) => x.finca === f && x.sector === s);
      lineas.push(nombreSector(f, s) + ': ' + (r ? num(r.mm, 1) + ' mm' : 'sin registro'));
    });
    lineas.push('');
  });
  // Misma escala para las dos temporadas, así las barras se comparan entre sí.
  const max = Math.max(1, ...Object.keys(a.acum).map((k) => Math.max(a.acum[k].temporada, a.acum[k].anterior)));
  ['temporada', 'anterior'].forEach((campo) => {
    lineas.push('📊 *Temporada ' + (campo === 'temporada' ? a.actual + '* (hasta hoy)' : a.anterior + '* (total)'));
    lineas.push('```');
    FINCAS.forEach(([f, nom], n) => {
      if (n) lineas.push('');
      lineas.push(nom);
      (lluviasDatos().sectores[f] || []).forEach((s) => {
        const v = (a.acum[f + '|' + s] || {})[campo] || 0;
        lineas.push((corto(f, s) + '          ').slice(0, 10) + barraTxt(v, max) + ' ' + num(v, 0) + ' mm');
      });
    });
    lineas.push('```');
    lineas.push('');
  });
  return lineas.join('\n').trim();
}

async function compartirLluvia() {
  const texto = textoWhatsappLluvia();
  // En el celular se abre el menú de compartir (WhatsApp y sus grupos); en la PC, WhatsApp Web.
  if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}

function htmlLluviaCargar() {
  if (!ui.lluvia) ui.lluvia = { finca: 'LA PRUDENCIA', fecha: hoyISO(), mm: {} };
  const l = ui.lluvia;
  const sectores = lluviasDatos().sectores[l.finca] || [];
  const actuales = {};
  registrosLluvia().forEach((r) => { if (r.fecha === l.fecha && r.finca === l.finca) actuales[r.sector] = r; });
  const rel = fechaRelativa(l.fecha);
  return '<div class="form">' +
    '<div class="campo"><div class="segmento">' + FINCAS.map(([f, nom]) =>
      '<button class="neutro' + (l.finca === f ? ' activo' : '') + '" data-a="finca" data-f="' + f + '">' + nom + '</button>').join('') + '</div></div>' +
    '<div class="campo"><span class="etq">Fecha de la lluvia</span><div class="fecha-fila">' +
    '<button class="nav" data-a="fechaLluvia" data-d="-1">‹</button>' +
    '<label class="fecha">' + fechaTxt(l.fecha, true) + (rel ? '<span class="hoy">' + rel + '</span>' : '') +
    '<input type="date" id="l-fecha" value="' + l.fecha + '" max="' + hoyISO() + '"></label>' +
    '<button class="nav" data-a="fechaLluvia" data-d="1"' + (l.fecha >= hoyISO() ? ' disabled' : '') + '>›</button></div></div>' +
    '<div class="campo"><span class="etq">Milímetros por sector <small>(dejá vacío el que no se midió)</small></span><div class="sectores">' +
    sectores.map((s) => {
      const a = actuales[s];
      const val = l.mm[s] != null ? l.mm[s] : '';
      return '<div class="sector"><b>' + esc(nombreSector(l.finca, s)) + '</b><input inputmode="decimal" data-sector="' + s + '" value="' + esc(val) + '" placeholder="mm">' +
        '<small>' + (a ? 'Ya cargado: ' + num(a.mm) + ' mm' + (a.pendiente ? ' (sin enviar)' : '') : '') + '</small></div>';
    }).join('') + '</div></div>' +
    (Object.keys(actuales).length ? '<div class="aviso amarillo">Ese día ya tiene lluvia cargada en algún sector: lo que escribas lo reemplaza.</div>' : '') +
    '<button class="btn azul" data-a="guardarLluvia">Guardar lluvia</button></div>';
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
  // Vuelve a la pantalla principal mostrando ese día.
  ui.lluviaDia = l.fecha;
  ui.lluvia = null;
  ui.vistaLluvia = 'dia';
  render();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- eventos
function despuesDeRender() {
  if (ui.pantalla === 'facturas' || ui.pantalla === 'fondofijo') despuesDeRenderFac();
  if (ui.pantalla === 'horometro') despuesDeRenderHor();
  const cant = $('#f-cantidad');
  if (cant) cant.addEventListener('input', () => { ui.form.cantidad = cant.value; $('#f-equivale').textContent = equivale(); });
  ['proveedor', 'remito', 'factura', 'nota'].forEach((k) => {
    const el = $('#f-' + k);
    if (el) el.addEventListener('input', () => { ui.form[k] = el.value; });
  });
  // Buscador de Sanidad: filtra la lista sin volver a dibujar la pantalla (no pierde el teclado).
  const bus = $('#buscar-san');
  if (bus) {
    bus.addEventListener('input', () => { ui.buscarSan = bus.value; $('#res-san').innerHTML = htmlResultadosSanidad(); });

  }
  const tfa = $('#tf-archivo');

  if (tfa) tfa.addEventListener('change', () => { if (tfa.files[0]) tfLeer(tfa.files[0]); });
  const fmaq = $('#f-maquina');
  if (fmaq) fmaq.addEventListener('change', () => { leerCamposForm(); ui.form.maquina = fmaq.value; ui.form.equipo = ''; render(); });
  const fdes = $('#f-destino');
  if (fdes) fdes.addEventListener('change', () => { ui.form.destino = fdes.value; });
  const ff = $('#f-fecha');
  if (ff) ff.addEventListener('change', () => { if (ff.value && ff.value <= hoyISO()) { leerCamposForm(); ui.form.fecha = ff.value; render(); } });
  const lf = $('#l-fecha');
  if (lf) lf.addEventListener('change', () => { if (lf.value && lf.value <= hoyISO()) { ui.lluvia.fecha = lf.value; ui.lluvia.mm = {}; render(); } });
  document.querySelectorAll('[data-sector]').forEach((el) => el.addEventListener('input', () => { ui.lluvia.mm[el.dataset.sector] = el.value; }));
  // Formulario de producto (Sanidad): cada campo se guarda en ui.prod al tocarlo.
  document.querySelectorAll('[data-prod]').forEach((el) => {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      ui.prod[el.dataset.prod] = el.type === 'checkbox' ? el.checked : el.value;
      // Producto nuevo al que se le cambia el stock: toma las unidades de ese stock (pajuela/un en Semen).
      if (el.dataset.prod === 'rubro' && !ui.prod.original) { Object.assign(ui.prod, unidadesPorDefecto(el.value)); render(); }
    });
  });
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
      if (b.dataset.p === 'stock') { ui.modStock = b.dataset.m || 'Stock'; ui.rubro = b.dataset.r || null; ui.excel = null; ui.buscarSan = ''; ui.filtroIatf = false; ui.sinStockSan = false; }
      // La flecha de Stock vuelve un paso (formulario → ficha → tarjetas → inicio).
      if (ui.pantalla === 'stock' && b.dataset.p === 'inicio') { atrasStock(); break; }
      if (ui.pantalla === 'facturas' && b.dataset.p === 'inicio' && atrasFacturas()) break;
      if (ui.pantalla === 'fondofijo' && b.dataset.p === 'inicio' && atrasFondoFijo()) break;
      if (ui.pantalla === 'horometro' && b.dataset.p === 'inicio' && atrasHorometro()) break;
      if (b.dataset.p === 'horometro') { hor.vista = 'lista'; hor.codigo = null; hor.form = null; hor.excel = null; }
      if (b.dataset.p === 'facturas') { ui.fac = null; estadoFac().vista = estadoFac().raiz = b.dataset.fv || 'lista'; }
      if (b.dataset.p === 'fondofijo') { ui.ff = null; }
      if (ui.pantalla === 'lluvias' && ui.vistaLluvia === 'cargar' && b.dataset.p === 'inicio') { ui.vistaLluvia = 'dia'; ui.lluvia = null; render(); break; }
      if (b.dataset.p === 'grupo') ui.grupo = b.dataset.g;
      ui.pantalla = b.dataset.p === 'inicio' && ui.pantalla !== 'grupo' && ui.grupo ? 'grupo' : b.dataset.p;
      if (ui.pantalla === 'inicio') ui.grupo = null;
      ui.cfg = null;
      ui.insumoVer = null;
      ui.vistaStock = 'lista';
      ui.vistaLluvia = 'dia';
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
    case 'salir': salir(); break;
    case 'verInsumo': ui.insumoVer = b.dataset.i; ui.vistaStock = 'ficha'; ui.movsVisibles = 15; render(); window.scrollTo(0, 0); break;
    case 'vista': ui.vistaStock = b.dataset.v; render(); window.scrollTo(0, 0); break;
    case 'tfConfirmar': tfConfirmar(); break;
    case 'bajarExcel': bajarExcel(); break;
    case 'fac': accionFac(b); break;
    case 'ff': accionFF(b); break;
    case 'hor': accionHor(b); break;

    case 'tfOtro': ui.tf = null; render(); break;
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
    case 'finca-comb': leerCamposForm(); ui.form.finca = ui.form.finca === b.dataset.e ? '' : b.dataset.e; render(); break;
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
    case 'sinStockSan': ui.sinStockSan = !ui.sinStockSan; $('#res-san').innerHTML = htmlResultadosSanidad(); break;
    case 'filtroIatf': ui.filtroIatf = !ui.filtroIatf; b.classList.toggle('activo', ui.filtroIatf); $('#res-san').innerHTML = htmlResultadosSanidad(); break;
    case 'nuevoProducto': ui.prod = productoForm(null); ui.vistaStock = 'producto'; render(); window.scrollTo(0, 0); break;
    case 'editarProducto': ui.prod = productoForm(stockDatos().insumos.find((x) => x.nombre === ui.insumoVer)); ui.vistaStock = 'producto'; render(); window.scrollTo(0, 0); break;
    case 'guardarProducto': guardarProducto(); break;
    case 'finca': ui.lluvia.finca = b.dataset.f; ui.lluvia.mm = {}; render(); break;
    case 'fechaLluvia': {
      const f = sumarDias(ui.lluvia.fecha, Number(b.dataset.d));
      if (f <= hoyISO()) { ui.lluvia.fecha = f; ui.lluvia.mm = {}; render(); }
      break;
    }
    case 'guardarLluvia': guardarLluvia(); break;
    case 'lluviaCargar': ui.lluvia = null; ui.vistaLluvia = 'cargar'; render(); window.scrollTo(0, 0); break;
    case 'lluviaWhatsapp': compartirLluvia(); break;
    case 'lluviaDia': {
      const dias = diasConLluvia();
      const i = dias.indexOf(ui.lluviaDia) + Number(b.dataset.d);
      if (dias[i]) { ui.lluviaDia = dias[i]; render(); }
      break;
    }
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
