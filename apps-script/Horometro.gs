// Registros Zehirut — Horómetro: partes de trabajo de tractores y generadores (30/09/2026).
//
// Un parte = fecha, máquina, trabajo (con cantidad opcional en ha o km), unidad de negocio (CRÍA o
// RECRÍA) y el horómetro al empezar y al terminar; las horas se calculan. No mueve ningún stock:
// la carga de combustible es otro evento (Combustible). El vínculo es el control litros ÷ horas
// por máquina y período. Máquinas: las de la hoja Máquinas con "Horómetro" tildado. Trabajos: la
// hoja Trabajos (la misma lista de Combustible). Permisos: los de la columna Combustible.
//
// Hoja "Horómetro": nunca se borra; una corrección anula el parte y carga uno nuevo.

const COLS_HORAS = ['ID', 'Fecha', 'Código máquina', 'Máquina', 'Trabajo', 'Cantidad', 'Unidad cantidad', 'Unidad de negocio',
  'Inicio', 'Fin', 'Horas', 'Nota', 'Cargado por', 'Hora en el teléfono', 'Recibido', 'Anulado', 'Anulado por / motivo', 'Marca de tiempo'];
const UNIDADES_NEGOCIO_HORAS = ['CRÍA', 'RECRÍA'];
const UNIDADES_CANTIDAD_HORAS = ['ha', 'km'];
const MODULO_HORAS = 'Combustible';   // permisos
const CODIGOS_HOROMETRO = ['TRAC-Val', 'TRAC-Mas', 'TRAC-LS', 'GEN-Cat', 'GEN-Yan 1', 'GEN-Yan 2', 'GEN-Yan 3'];

/** Versión 8: columna "Horómetro" en Máquinas (tildada en tractores y generadores Cat y Yanmar),
 *  la lista nueva de trabajos (reemplaza la vieja, una sola vez) y la hoja Horómetro. */
function asegurarHorometro_(ss) {
  const maq = ss.getSheetByName('Máquinas');
  const col = COLS_MAQUINAS.indexOf('Horómetro') + 1;
  if (String(maq.getRange(1, col).getValue()) !== 'Horómetro') {
    maq.getRange(1, col).setValue('Horómetro').setFontWeight('bold').setBackground('#eeeeee');
    const n = maq.getLastRow();
    if (n > 1) {
      maq.getRange(2, col, n - 1, 1).setValues(maq.getRange(2, 1, n - 1, 1).getValues()
        .map((f) => [CODIGOS_HOROMETRO.indexOf(String(f[0]).trim()) !== -1]));
    }
    // Una sola vez (junto con la columna nueva): la lista de trabajos depurada por el usuario.
    const tra = ss.getSheetByName('Trabajos');
    if (tra.getLastRow() > 1) tra.getRange(2, 1, tra.getLastRow() - 1, 1).clearContent();
    tra.getRange(2, 1, TRABAJOS_INICIALES.length, 1).setValues(TRABAJOS_INICIALES.map((t) => [t]));
  }
  maq.getRange(2, col, 200, 1).insertCheckboxes();
  hoja_(ss, 'Horómetro', COLS_HORAS).getRange('B:B').setNumberFormat('@');
}

function leerPartes_(ss) {
  const sh = ss.getSheetByName('Horómetro');
  const n = sh ? sh.getLastRow() : 0;
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS_HORAS.length).getValues().map((f, i) => ({
    fila: i + 2,
    id: String(f[0]),
    fecha: iso_(f[1]),
    codigo: String(f[2]),
    maquina: String(f[3]),
    trabajo: String(f[4]),
    cantidad: f[5] === '' ? null : Number(f[5]),
    unidadCantidad: String(f[6] || ''),
    unidadNegocio: String(f[7]),
    inicio: Number(f[8]) || 0,
    fin: Number(f[9]) || 0,
    horas: Number(f[10]) || 0,
    nota: String(f[11] || ''),
    usuario: String(f[12]),
    anulado: f[15] === true || String(f[15]).toUpperCase() === 'TRUE',
    anuladoPor: String(f[16] || ''),
    ts: Number(f[17]) || 0,
  })).filter((p) => p.id);
}

/** Valida un parte que llega del teléfono y devuelve la fila para la hoja. */
function validarParte_(op, u, maquinas, trabajos, hoy) {
  const fecha = String(op.fecha || '');
  if (!esFecha_(fecha)) throw new Error('fecha inválida');
  if (fecha > sumarDias_(hoy, 1)) throw new Error('fecha futura');
  const q = maquinas[texto_(op.codigo, 30)];
  if (!q || !q.horometro) throw new Error('elegí la máquina');
  const trabajo = texto_(op.trabajo, 60);
  if (trabajos.indexOf(trabajo) === -1) throw new Error('elegí el trabajo de la lista');
  const un = String(op.unidadNegocio || '');
  if (UNIDADES_NEGOCIO_HORAS.indexOf(un) === -1) throw new Error('elegí la unidad de negocio (CRÍA o RECRÍA)');
  const inicio = Number(op.inicio);
  const fin = Number(op.fin);
  if (!isFinite(inicio) || inicio < 0 || !isFinite(fin)) throw new Error('horómetro inválido');
  if (!(fin > inicio)) throw new Error('el horómetro final tiene que ser mayor que el inicial');
  let cantidad = '';
  let unidadCantidad = '';
  if (op.cantidad !== '' && op.cantidad != null) {
    cantidad = Number(op.cantidad);
    unidadCantidad = String(op.unidadCantidad || '');
    if (!(cantidad > 0)) throw new Error('cantidad inválida');
    if (UNIDADES_CANTIDAD_HORAS.indexOf(unidadCantidad) === -1) throw new Error('elegí ha o km para la cantidad');
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  return { fecha, codigo: q.codigo, maquina: q.nombre, trabajo, cantidad, unidadCantidad, unidadNegocio: un,
    inicio: r1(inicio), fin: r1(fin), horas: r1(fin - inicio), nota: texto_(op.nota, 200) };
}

/** Partes para la app: los del período y, por máquina, el último horómetro (de todo el historial). */
function datosHorometro_(ss, desde) {
  const partes = leerPartes_(ss);
  const ultimo = {};
  partes.filter((p) => !p.anulado).forEach((p) => {
    const x = ultimo[p.codigo];
    if (!x || p.fin > x.fin) ultimo[p.codigo] = { fin: p.fin, fecha: p.fecha };
  });
  return {
    maquinas: leerMaquinas_(ss).filter((q) => q.activo && q.horometro).map((q) => ({ codigo: q.codigo, nombre: q.nombre })),
    trabajos: leerTrabajos_(ss),
    unidadesNegocio: UNIDADES_NEGOCIO_HORAS,
    ultimo,
    partes: partes.filter((p) => p.fecha >= desde).map((p) => { const x = Object.assign({}, p); delete x.fila; return x; }),
  };
}

// ---------------------------------------------------------------- Excel
// Una hoja por máquina con el formato de la hoja "Hora Tractor" de la planilla de rendición (más la
// cantidad y la unidad de negocio) y un Resumen: horas por unidad de negocio y el control de litros
// por hora con lo cargado en Combustible (mismo código de máquina).
function exportarHorasExcel_(u, body) {
  const ss = SpreadsheetApp.getActive();
  exigir_(u, MODULO_HORAS, 'VER');
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const desde = esFecha_(body.desde) ? body.desde : hoy.slice(0, 8) + '01';
  const hasta = esFecha_(body.hasta) ? body.hasta : hoy;
  if (hasta < desde) throw new Error('la fecha "hasta" es anterior a "desde"');
  const partes = leerPartes_(ss).filter((p) => !p.anulado && p.fecha >= desde && p.fecha <= hasta)
    .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.inicio - b.inicio));
  const litros = {};
  leerMovimientos_(ss).forEach((m) => {
    if (!m.anulado && m.tipo === 'Consumo' && m.maquina && m.fecha >= desde && m.fecha <= hasta) litros[m.maquina] = (litros[m.maquina] || 0) + m.cantidad;
  });
  const maquinas = leerMaquinas_(ss).filter((q) => q.horometro && (q.activo || partes.some((p) => p.codigo === q.codigo)));
  const aDate = (iso) => { const p = iso.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };
  const r1 = (n) => Math.round(n * 10) / 10;

  const nombre = 'Horómetro ' + ddmmaaaa_(desde).replace(/\//g, '-') + ' al ' + ddmmaaaa_(hasta).replace(/\//g, '-');
  const tmp = SpreadsheetApp.create(nombre);
  try {
    tmp.setSpreadsheetTimeZone(ZONA);
    const res = tmp.getSheets()[0];
    res.setName('Resumen');
    const filas = [['Código', 'Máquina'].concat(UNIDADES_NEGOCIO_HORAS.map((x) => 'Horas ' + x), ['Horas total', 'Litros cargados', 'Litros por hora'])];
    maquinas.forEach((q) => {
      const suyas = partes.filter((p) => p.codigo === q.codigo);
      const porUn = UNIDADES_NEGOCIO_HORAS.map((x) => r1(suyas.filter((p) => p.unidadNegocio === x).reduce((a, p) => a + p.horas, 0)));
      const total = r1(porUn.reduce((a, b) => a + b, 0));
      const lts = litros[q.codigo] || 0;
      filas.push([q.codigo, q.nombre].concat(porUn, [total, lts, total ? Math.round((lts / total) * 100) / 100 : '']));
    });
    res.getRange(1, 1).setValue('HORÓMETRO – del ' + ddmmaaaa_(desde) + ' al ' + ddmmaaaa_(hasta)).setFontSize(14).setFontWeight('bold');
    res.getRange(3, 1, filas.length, filas[0].length).setValues(filas).setBorder(true, true, true, true, true, true);
    res.getRange(3, 1, 1, filas[0].length).setFontWeight('bold').setBackground('#eeeeee');
    res.getRange(3 + filas.length + 1, 1).setValue('Litros por hora: control con lo cargado en Combustible a esa máquina en el período (si no cierra, falta algún parte o alguna carga).');
    res.autoResizeColumns(1, filas[0].length);

    maquinas.forEach((q) => {
      const suyas = partes.filter((p) => p.codigo === q.codigo);
      const h = tmp.insertSheet(q.nombre.slice(0, 90));
      h.getRange('A1:H1').merge().setValue('HORAS ' + q.nombre.toUpperCase()).setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
      h.getRange('A2:H2').setValues([['Fecha', 'Trabajo', 'Cantidad', 'Unidad de negocio', 'Inicio', 'Final', 'Horas', 'Cargado por']])
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#eeeeee');
      if (suyas.length) {
        h.getRange(3, 1, suyas.length, 8).setValues(suyas.map((p, n) => [aDate(p.fecha), p.trabajo,
          p.cantidad == null ? '' : p.cantidad + ' ' + p.unidadCantidad, p.unidadNegocio, p.inicio, p.fin, '=F' + (n + 3) + '-E' + (n + 3), p.usuario]));
        h.getRange(3, 1, suyas.length, 1).setNumberFormat('d/m/yy');
        h.getRange(3, 5, suyas.length, 3).setNumberFormat('#,##0.0');
        h.getRange(3 + suyas.length, 6, 1, 2).setValues([['Total', '=SUM(G3:G' + (2 + suyas.length) + ')']]).setFontWeight('bold');
      }
      h.getRange(2, 1, Math.max(1, suyas.length + 1), 8).setBorder(true, true, true, true, true, true);
      [80, 240, 90, 120, 90, 90, 80, 130].forEach((a, n) => h.setColumnWidth(n + 1, a));
      h.setFrozenRows(2);
    });

    SpreadsheetApp.flush();
    const r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) throw new Error('no se pudo generar el Excel');
    return { ok: true, nombre: nombre + '.xlsx', base64: Utilities.base64Encode(r.getBlob().getBytes()) };
  } finally {
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
}
