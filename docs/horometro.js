// Registros Zehirut — Horómetro: partes de trabajo de tractores y generadores.
//
// Recorrido (igual que Stock, sin pestañas): lista de máquinas → ficha de la máquina (último
// horómetro, horas del mes, litros por hora, sus partes) → formulario del parte. Un parte:
// fecha, trabajo (con cantidad opcional en ha o km), unidad de negocio, horómetro inicial y
// final; las horas se calculan solas. El inicial viene con el final del último parte de esa
// máquina. Permisos: los de Combustible. Se guarda en la cola como todo lo demás (anda sin señal).
'use strict';

const hor = { vista: 'lista', codigo: null, form: null, excel: null, cfg: null };

function horDatos() {
  return (datos && datos.horometro) || { maquinas: [], trabajos: [], unidadesNegocio: ['CRÍA', 'RECRÍA'], ultimo: {}, partes: [] };
}

/** Partes: los de Google más los que siguen en la cola (marcados "pendiente"). */
function partesHor() {
  const lista = horDatos().partes.map((p) => Object.assign({}, p));
  const porId = {};
  lista.forEach((p) => { porId[p.id] = p; });
  cola.forEach((op) => {
    if (op.tipo === 'horas') {
      const q = horDatos().maquinas.find((x) => x.codigo === op.codigo) || {};
      const p = { id: op.id, fecha: op.fecha, codigo: op.codigo, maquina: q.nombre || op.codigo, trabajo: op.trabajo,
        cantidad: op.cantidad === '' || op.cantidad == null ? null : op.cantidad, unidadCantidad: op.unidadCantidad || '',
        unidadNegocio: op.unidadNegocio, inicio: op.inicio, fin: op.fin, horas: Math.round((op.fin - op.inicio) * 10) / 10,
        nota: op.nota || '', usuario: op.usuario, anulado: false, ts: op.ts, pendiente: true };
      lista.push(p);
      porId[p.id] = p;
    } else if (op.tipo === 'anular' && porId[op.ref]) {
      porId[op.ref].anulado = true;
      porId[op.ref].anuladoPor = op.usuario + ' (pendiente)';
    }
  });
  return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.fin - a.fin));
}

/** Último horómetro conocido de una máquina (Google o partes todavía sin enviar). */
function ultimoHor(codigo) {
  const g = horDatos().ultimo[codigo] || null;
  let r = g ? { fin: g.fin, fecha: g.fecha } : null;
  partesHor().forEach((p) => { if (p.codigo === codigo && !p.anulado && (!r || p.fin > r.fin)) r = { fin: p.fin, fecha: p.fecha }; });
  return r;
}

/** Horas del mes actual por máquina, y litros cargados en Combustible a esa máquina (control l/h). */
function mesHor(codigo) {
  const desde = hoyISO().slice(0, 8) + '01';
  const horas = partesHor().filter((p) => p.codigo === codigo && !p.anulado && p.fecha >= desde).reduce((a, p) => a + p.horas, 0);
  const litros = movimientos().filter((m) => m.maquina === codigo && m.tipo === 'Consumo' && !m.anulado && m.fecha >= desde)
    .reduce((a, m) => a + m.cantidad, 0);
  return { horas: Math.round(horas * 10) / 10, litros, lh: horas > 0 && litros > 0 ? litros / horas : null };
}

function htmlHorometro() {
  const q = hor.codigo && horDatos().maquinas.find((x) => x.codigo === hor.codigo);
  if ((hor.vista === 'maquina' || hor.vista === 'form') && !q) hor.vista = 'lista';
  const vistas = {
    lista: ['Horómetro', htmlHorLista],
    maquina: [q ? q.nombre : '', htmlHorMaquina],
    form: [hor.form && hor.form.corrige ? 'Corregir horas' : 'Cargar horas', htmlHorForm],
    excel: ['Bajar Excel', htmlHorExcel],
    trabajos: ['Configurar trabajos', htmlHorTrabajos],
  };
  if (hor.vista === 'trabajos' && !sesion.configura) hor.vista = 'lista';
  const [titulo, fn] = vistas[hor.vista] || vistas.lista;
  return barra(titulo, true) + '<div class="contenido">' + fn(q) + '</div>';
}

/** Un paso atrás (formulario → máquina → lista → Stocks). Devuelve false si ya está en la lista. */
function atrasHorometro() {
  leerCamposHor();
  if (hor.vista === 'form') hor.vista = 'maquina';
  else if (hor.vista === 'maquina' || hor.vista === 'excel' || hor.vista === 'trabajos') { hor.vista = 'lista'; hor.codigo = null; hor.cfg = null; }
  else return false;
  render();
  window.scrollTo(0, 0);
  return true;
}

function htmlHorLista() {
  const maqs = horDatos().maquinas;
  if (!maqs.length) return '<p class="vacio">No hay máquinas con horómetro (hoja Máquinas, columna Horómetro).</p>';
  // Mismas tarjetas que Stock y Combustible: el número grande es el último horómetro.
  return '<div class="saldos">' + maqs.map((q) => {
    const u = ultimoHor(q.codigo);
    const m = mesHor(q.codigo);
    const pend = partesHor().some((p) => p.codigo === q.codigo && p.pendiente);
    return '<button class="saldo' + (u ? '' : ' sin') + '" data-a="hor" data-h="maquina" data-c="' + esc(q.codigo) + '">' +
      '<h3>' + esc(q.nombre) + (pend ? ' <span class="chip pend">sin enviar</span>' : '') + '</h3>' +
      '<div class="cant">' + (u ? num(u.fin, 1) : '—') + '<small>h</small></div>' +
      '<div class="det">' + (m.horas ? 'Este mes ' + num(m.horas, 1) + ' h' + (m.lh ? ' · ' + num(m.lh, 1) + ' l/h' : '') : 'Sin horas este mes') +
      (u ? '' : '<br><span class="chip">Sin horas cargadas</span>') + '</div></button>';
  }).join('') + '</div>' +
    '<div class="pie-stock"><button class="btn sec chico" data-a="hor" data-h="excel">📥 Bajar Excel</button>' +
    (sesion.configura ? '<button class="btn sec chico" data-a="hor" data-h="trabajos">⚙ Configurar trabajos</button>' : '') + '</div>';
}

/** Lista de trabajos (la misma de Combustible): solo quien tiene Configurar la edita. Sacar un
 *  trabajo no cambia lo ya cargado; solo deja de aparecer en el desplegable. */
function htmlHorTrabajos() {
  if (!hor.cfg) hor.cfg = horDatos().trabajos.slice();
  return '<div class="form"><div class="aviso">Esta lista es el desplegable de <b>Horómetro</b> y de <b>Combustible</b>; nadie puede escribir otro trabajo a mano. ' +
    'Sacar uno no cambia lo ya cargado. Los cambios necesitan señal.</div><div class="tarjeta">' +
    hor.cfg.map((t, n) => '<div class="item-cfg"><input class="txt" data-trab="' + n + '" value="' + esc(t) + '">' +
      '<button class="btn sec chico rojo-txt" data-a="hor" data-h="trabQuitar" data-n="' + n + '" aria-label="Quitar">✕</button></div>').join('') +
    '<button class="btn sec chico" data-a="hor" data-h="trabAgregar" style="margin-top:10px">+ Agregar trabajo</button> ' +
    '<button class="btn chico" data-a="hor" data-h="trabGuardar" style="margin-top:10px">Guardar trabajos</button></div></div>';
}

async function guardarTrabajos() {
  if (!navigator.onLine) { toast('Sin señal: los cambios de la lista necesitan señal.', 3500); return; }
  const lista = hor.cfg.map((t) => String(t).trim()).filter(Boolean);
  if (!lista.length) { toast('La lista no puede quedar vacía.', 3000); return; }
  try {
    toast('Guardando…', 10000);
    await llamar({ accion: 'catalogo', pin: sesion.pin, tipo: 'trabajos', lista });
    if (datos && datos.horometro) datos.horometro.trabajos = lista;
    if (datos && datos.stock) datos.stock.trabajos = lista;
    hor.cfg = null;
    hor.vista = 'lista';
    render();
    toast('✓ Lista de trabajos guardada');
    sincronizar();
  } catch (e) {
    toast('No se pudo guardar: ' + ((e && e.message) || e), 5000);
  }
}

function htmlHorMaquina(q) {
  const u = ultimoHor(q.codigo);
  const m = mesHor(q.codigo);
  const desde = hoyISO().slice(0, 8) + '01';
  const partes = partesHor().filter((p) => p.codigo === q.codigo);
  const porUn = horDatos().unidadesNegocio.map((x) => [x, partes.filter((p) => !p.anulado && p.fecha >= desde && p.unidadNegocio === x)
    .reduce((a, p) => a + p.horas, 0)]).filter((x) => x[1]);
  const filas = [
    ['Último horómetro', u ? num(u.fin, 1) + ' h (' + fechaTxt(u.fecha) + ')' : 'Sin horas cargadas todavía'],
    ['Horas este mes', num(m.horas, 1) + ' h' + (porUn.length ? ' (' + porUn.map(([x, h]) => x + ' ' + num(h, 1)).join(' · ') + ')' : '')],
    ['Litros cargados este mes', num(m.litros, 0) + ' L (Combustible)'],
    m.lh ? ['Litros por hora', num(m.lh, 1) + ' l/h'] : null,
  ].filter(Boolean);
  const mostrar = hor.visibles || 15;
  return '<div class="form"><div class="saldo"><h3>' + esc(q.nombre) + '</h3>' +
    '<table class="detalle">' + filas.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table></div>' +
    (puede('Combustible', 'CARGAR') ? '<button class="btn" style="margin:14px 0 18px" data-a="hor" data-h="nuevo">⏱️ Cargar horas</button>' : '<div style="height:14px"></div>') +
    '<h3 style="margin:0 0 8px">Horas cargadas</h3>' +
    (partes.length ? partes.slice(0, mostrar).map(htmlParte).join('') +
      (partes.length > mostrar ? '<button class="btn sec" data-a="hor" data-h="mas">Ver más</button>' : '')
      : '<p class="vacio">Sin horas cargadas en los últimos ' + DIAS_HISTORIAL + ' días.</p>') + '</div>';
}

function htmlParte(p) {
  const extra = [p.unidadNegocio, esc(String(p.usuario || '').split(' ')[0])];
  if (p.cantidad != null) extra.unshift(num(p.cantidad) + ' ' + p.unidadCantidad);
  return '<button class="mov' + (p.anulado ? ' anulado' : '') + '" data-a="hor" data-h="ver" data-id="' + esc(p.id) + '">' +
    '<span class="tipo Conteo">⏱</span>' +
    '<span class="cuerpo"><b>' + esc(fechaTxt(p.fecha, true)) + ' · ' + esc(p.trabajo) + '</b><small>' + num(p.inicio, 1) + ' → ' + num(p.fin, 1) + ' · ' +
    extra.map(esc).join(' · ') + (p.pendiente ? ' <span class="chip pend">sin enviar</span>' : '') + (p.anulado ? ' <span class="chip">anulado</span>' : '') + '</small></span>' +
    '<span class="num">' + num(p.horas, 1) + '<br><small style="font-weight:600;color:var(--gris)">horas</small></span></button>';
}

function nuevoParte(codigo) {
  const u = ultimoHor(codigo);
  return { codigo, fecha: (hor.form && hor.form.fecha) || hoyISO(), trabajo: '', cantidad: '', unidadCantidad: '', unidadNegocio: '',
    inicio: u ? String(u.fin).replace('.', ',') : '', fin: '', nota: '' };
}

function horasForm() {
  const f = hor.form;
  const i = leerNumero(f.inicio);
  const x = leerNumero(f.fin);
  return isFinite(i) && isFinite(x) ? Math.round((x - i) * 10) / 10 : null;
}

function htmlHorasCalc() {
  const h = horasForm();
  if (h == null) return 'Horas: —';
  return h > 0 ? 'Horas: <b>' + num(h, 1) + '</b>' : '<span class="rojo">El final tiene que ser mayor que el inicio</span>';
}

function htmlHorForm(q) {
  const f = hor.form;
  const d = horDatos();
  const rel = fechaRelativa(f.fecha);
  const seg = (campo, lista) => '<div class="segmento">' + lista.map((x) =>
    '<button class="neutro' + (f[campo] === x ? ' activo' : '') + '" data-a="hor" data-h="seg" data-k="' + campo + '" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>';
  return '<div class="form">' +
    (f.corrige ? '<div class="aviso amarillo">Estás <b>corrigiendo</b> una carga de horas. Al guardar, el anterior queda anulado y queda este.</div>' : '') +
    '<div class="campo"><span class="etq">Máquina</span><div class="fecha-fila"><span class="fecha">' + esc(q.nombre) + '</span></div></div>' +
    '<div class="campo"><span class="etq">Fecha</span><div class="fecha-fila">' +
    '<button class="nav" data-a="hor" data-h="fecha" data-d="-1" aria-label="Día anterior">‹</button>' +
    '<label class="fecha">' + fechaTxt(f.fecha, true) + (rel ? '<span class="hoy">' + rel + '</span>' : '') +
    '<input type="date" id="h-fecha" value="' + f.fecha + '" max="' + hoyISO() + '"></label>' +
    '<button class="nav" data-a="hor" data-h="fecha" data-d="1" aria-label="Día siguiente"' + (f.fecha >= hoyISO() ? ' disabled' : '') + '>›</button></div></div>' +
    '<div class="campo"><label for="h-trabajo">Trabajo</label><select class="txt grande" id="h-trabajo"><option value="">Elegí el trabajo…</option>' +
    d.trabajos.map((t) => '<option' + (f.trabajo === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>' +
    '<div class="campo"><span class="etq">Cantidad <small>(opcional)</small></span><div class="fila2">' +
    '<input class="txt" id="h-cantidad" inputmode="decimal" autocomplete="off" placeholder="ej. 12" value="' + esc(f.cantidad) + '">' +
    seg('unidadCantidad', ['ha', 'km']) + '</div></div>' +
    '<div class="campo"><span class="etq">Unidad de negocio</span>' + seg('unidadNegocio', d.unidadesNegocio) + '</div>' +
    '<div class="fila2"><div class="campo"><label for="h-inicio">Horómetro inicio</label><input class="txt grande" id="h-inicio" inputmode="decimal" autocomplete="off" value="' + esc(f.inicio) + '"></div>' +
    '<div class="campo"><label for="h-fin">Horómetro final</label><input class="txt grande" id="h-fin" inputmode="decimal" autocomplete="off" value="' + esc(f.fin) + '"></div></div>' +
    '<div class="equivale" id="h-horas" style="font-size:18px;margin:-4px 0 12px">' + htmlHorasCalc() + '</div>' +
    '<div class="campo"><label for="h-nota">Nota <small>(opcional)</small></label><input class="txt" id="h-nota" value="' + esc(f.nota) + '"></div>' +
    '<button class="btn conteo" data-a="hor" data-h="guardar">Guardar horas</button></div>';
}

function leerCamposHor() {
  const f = hor.form;
  if (!f || hor.vista !== 'form') return;
  ['trabajo', 'cantidad', 'inicio', 'fin', 'nota'].forEach((k) => { const el = $('#h-' + k); if (el) f[k] = el.value; });
}

async function guardarParte() {
  leerCamposHor();
  const f = hor.form;
  const inicio = leerNumero(f.inicio);
  const fin = leerNumero(f.fin);
  if (!f.trabajo) { toast('Elegí el trabajo.', 3000); return; }
  if (!f.unidadNegocio) { toast('Elegí la unidad de negocio.', 3000); return; }
  if (!isFinite(inicio) || inicio < 0 || !isFinite(fin)) { toast('Poné el horómetro de inicio y el final.', 3000); return; }
  if (!(fin > inicio)) { toast('El horómetro final tiene que ser mayor que el inicio.', 3500); return; }
  const cant = String(f.cantidad).trim() ? leerNumero(f.cantidad) : '';
  if (cant !== '' && !(cant > 0)) { toast('La cantidad no es válida.', 3000); return; }
  if (cant !== '' && !f.unidadCantidad) { toast('Elegí si la cantidad es en ha o km.', 3000); return; }
  // Controles que suelen ser un error de tipeo o un parte que falta: se confirma antes de guardar.
  const avisos = [];
  const u = ultimoHor(f.codigo);
  if (u && !f.corrige && Math.abs(inicio - u.fin) > 0.05) {
    avisos.push(inicio > u.fin
      ? 'La última carga terminó en <b>' + num(u.fin, 1) + '</b>: quedan <b>' + num(inicio - u.fin, 1) + ' h sin cargar</b>.'
      : 'El inicio es <b>menor</b> que el final de la última carga (' + num(u.fin, 1) + '): se superponen.');
  }
  if (fin - inicio > 24) avisos.push('Son <b>' + num(fin - inicio, 1) + ' horas</b> en una sola carga.');
  if (avisos.length) {
    const ok = await cartel({ icono: '🤔', titulo: '¿Seguro?', si: 'Guardar igual', no: 'Revisar', html: avisos.map((a) => '<p>' + a + '</p>').join('') });
    if (!ok) return;
  }
  const op = { tipo: 'horas', fecha: f.fecha, codigo: f.codigo, trabajo: f.trabajo, unidadNegocio: f.unidadNegocio, inicio, fin };
  if (cant !== '') { op.cantidad = cant; op.unidadCantidad = f.unidadCantidad; }
  if (String(f.nota).trim()) op.nota = String(f.nota).trim();
  if (f.corrige) {
    const pendiente = cola.some((o) => o.tipo === 'horas' && o.id === f.corrige);
    if (pendiente) { cola = cola.filter((o) => o.id !== f.corrige && o.ref !== f.corrige); guardarTodo(); }
    else agregarACola({ tipo: 'anular', ref: f.corrige, motivo: 'Corregido' });
  }
  agregarACola(op);
  toast((f.corrige ? '✓ Corregido: ' : '✓ Guardado: ') + num(fin - inicio, 1) + ' h' + (navigator.onLine ? '' : ' (se envía cuando haya señal)'), 3200);
  hor.form = { fecha: f.fecha };
  hor.vista = 'maquina';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function verParte(id) {
  const p = partesHor().find((x) => x.id === id);
  if (!p) return;
  const filas = [['Fecha', fechaTxt(p.fecha, true)], ['Máquina', p.maquina], ['Trabajo', p.trabajo]];
  if (p.cantidad != null) filas.push(['Cantidad', num(p.cantidad) + ' ' + p.unidadCantidad]);
  filas.push(['Unidad de negocio', p.unidadNegocio], ['Horómetro', num(p.inicio, 1) + ' → ' + num(p.fin, 1)], ['Horas', num(p.horas, 1)]);
  if (p.nota) filas.push(['Nota', p.nota]);
  filas.push(['Cargado por', p.usuario + (p.pendiente ? ' (sin enviar)' : '')]);
  if (p.anulado) filas.push(['Anulado', p.anuladoPor || 'sí']);
  const admin = puede('Combustible', 'ADMINISTRAR');
  const puedeAnular = !p.anulado && puede('Combustible', 'CARGAR') && (admin || (p.usuario === sesion.nombre && p.fecha >= sumarDias(hoyISO(), -7)));
  const acciones = [];
  if (puedeAnular) acciones.push({ id: 'corregir', texto: '✏️ Corregir', cls: '' }, { id: 'anular', texto: '🗑️ Anular', cls: 'sec rojo-txt' });
  acciones.push({ id: 'cerrar', texto: 'Cerrar', cls: 'sec' });
  const r = await cartel({ titulo: 'Horas · ' + p.maquina, acciones,
    html: '<table class="detalle">' + filas.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table>' });
  if (r === 'corregir') {
    hor.form = { codigo: p.codigo, fecha: p.fecha, trabajo: p.trabajo, cantidad: p.cantidad == null ? '' : String(p.cantidad).replace('.', ','),
      unidadCantidad: p.unidadCantidad, unidadNegocio: p.unidadNegocio, inicio: String(p.inicio).replace('.', ','),
      fin: String(p.fin).replace('.', ','), nota: p.nota, corrige: p.id };
    hor.codigo = p.codigo;
    hor.vista = 'form';
    render();
    window.scrollTo(0, 0);
  } else if (r === 'anular') {
    const motivo = await cartel({
      icono: '🗑️', titulo: 'Anular carga de horas', si: 'Anular', peligro: true,
      html: '<p>' + esc(p.maquina) + ' · ' + fechaTxt(p.fecha) + ' · ' + num(p.horas, 1) + ' h.</p><p>No se borra: queda tachado. Si solo estaba mal un dato, usá <b>Corregir</b>.</p>',
      input: { placeholder: 'Motivo (ej. horómetro equivocado)' },
      validar: (v) => (v ? '' : 'Escribí el motivo.'),
    });
    if (motivo) { agregarACola({ tipo: 'anular', ref: p.id, motivo }); toast('Carga de horas anulada'); render(); }
  }
}

function htmlHorExcel() {
  if (!hor.excel) hor.excel = { desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() };
  const e = hor.excel;
  return '<div class="form"><div class="aviso">Baja las horas cargadas en el período: un <b>Resumen</b> (horas por unidad de negocio y litros por hora de cada máquina) y una hoja por máquina con el formato de "Hora Tractor".</div>' +
    '<div class="fila2"><div class="campo"><label for="hx-desde">Desde</label><input class="txt" type="date" id="hx-desde" value="' + e.desde + '" max="' + hoyISO() + '"></div>' +
    '<div class="campo"><label for="hx-hasta">Hasta</label><input class="txt" type="date" id="hx-hasta" value="' + e.hasta + '" max="' + hoyISO() + '"></div></div>' +
    '<button class="btn" data-a="hor" data-h="bajar"' + (e.bajando ? ' disabled' : '') + '>' + (e.bajando ? 'Armando el Excel…' : '📥 Bajar Excel') + '</button></div>';
}

async function bajarExcelHor() {
  const e = hor.excel;
  e.desde = $('#hx-desde').value || e.desde;
  e.hasta = $('#hx-hasta').value || e.hasta;
  if (e.hasta < e.desde) { toast('"Hasta" es anterior a "Desde".', 3000); return; }
  if (!navigator.onLine) { toast('Sin señal: el Excel lo arma Google, hace falta señal.', 3500); return; }
  e.bajando = true;
  render();
  try {
    const r = await llamar({ accion: 'excel', pin: sesion.pin, modulo: 'Horómetro', desde: e.desde, hasta: e.hasta });
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

/** Botones de la pantalla (data-a="hor", data-h = qué hacer). */
function accionHor(b) {
  const h = b.dataset.h;
  if (h === 'maquina') { hor.codigo = b.dataset.c; hor.vista = 'maquina'; hor.visibles = 15; render(); window.scrollTo(0, 0); }
  else if (h === 'excel') { hor.vista = 'excel'; render(); }
  else if (h === 'trabajos') { hor.cfg = null; hor.vista = 'trabajos'; render(); window.scrollTo(0, 0); }
  else if (h === 'trabAgregar') { hor.cfg.push(''); render(); const els = document.querySelectorAll('[data-trab]'); els[els.length - 1].focus(); }
  else if (h === 'trabQuitar') { hor.cfg.splice(Number(b.dataset.n), 1); render(); }
  else if (h === 'trabGuardar') guardarTrabajos();
  else if (h === 'nuevo') { hor.form = nuevoParte(hor.codigo); hor.vista = 'form'; render(); window.scrollTo(0, 0); }
  else if (h === 'mas') { hor.visibles = (hor.visibles || 15) + 30; render(); }
  else if (h === 'ver') verParte(b.dataset.id);
  else if (h === 'guardar') guardarParte();
  else if (h === 'bajar') bajarExcelHor();
  else if (h === 'fecha') {
    leerCamposHor();
    const f = sumarDias(hor.form.fecha, Number(b.dataset.d));
    if (f <= hoyISO()) { hor.form.fecha = f; render(); }
  } else if (h === 'seg') {
    leerCamposHor();
    const k = b.dataset.k;
    // La cantidad es opcional: tocar de nuevo ha/km la desmarca.
    hor.form[k] = k === 'unidadCantidad' && hor.form[k] === b.dataset.v ? '' : b.dataset.v;
    render();
  }
}

function despuesDeRenderHor() {
  const ff = $('#h-fecha');
  if (ff) ff.addEventListener('change', () => { if (ff.value && ff.value <= hoyISO()) { leerCamposHor(); hor.form.fecha = ff.value; render(); } });
  ['inicio', 'fin'].forEach((k) => {
    const el = $('#h-' + k);
    if (el) el.addEventListener('input', () => { hor.form[k] = el.value; $('#h-horas').innerHTML = htmlHorasCalc(); });
  });
  ['cantidad', 'nota'].forEach((k) => { const el = $('#h-' + k); if (el) el.addEventListener('input', () => { hor.form[k] = el.value; }); });
  document.querySelectorAll('[data-trab]').forEach((el) => el.addEventListener('input', () => { hor.cfg[Number(el.dataset.trab)] = el.value; }));
  const tr = $('#h-trabajo');

  if (tr) tr.addEventListener('change', () => { hor.form.trabajo = tr.value; });
}
