// Facturas y Fondo fijo — pantallas de la app. Todo lo hace el script de ZehirutApp (agregado
// como biblioteca en el Apps Script de esta app, acción "za"): misma planilla de Facturas, mismas
// carpetas de Drive, misma lectura con Gemini y mismos permisos. Necesita señal (Gemini y Drive).
// Mientras se prueba lo ve solo quien tiene tildado Configurar (ver FACTURAS_BETA en Code.gs).
'use strict';

// Listas de ZehirutApp (Index.html): mismo texto y mismos códigos que se guardan en la planilla.
const UNIDADES_NEGOCIO = ['ADMINISTRACIÓN', 'CRÍA', 'ESTRUCTURA', 'FEEDLOT', 'FINANCIERO', 'MAQUINARIA', 'PATRIMONIAL', 'RECRÍA', 'ZP - BPY'];
const BIENES_USO = [
  ['CAM-1', 'Camioneta Toyota Hilux 2022'], ['CAM-2', 'Camioneta Isuzu D-Max 2019'], ['CAM-3', 'Camioneta Isuzu D-Max 2023'],
  ['CAM-4', 'Camioneta Mazda BT-50 2027'], ['MOTO', 'Motos'], ['TRAC-Val', 'Tractor Valtra BM110'], ['TRAC-Mas', 'Tractor Massey 291'],
  ['TRAC-LS', 'Tractor LS Plus100'], ['IMPL-Mix', 'Mixer Banman 10m3'], ['IMPL-Niv', 'Implemento Niveladora Siemmens'],
  ['IMPL-Tra', 'Implemento Traila'], ['IMPL-Rol 1', 'Implemento Rollo Aireador'], ['IMPL-Rol 2', 'Implemento Rollo Aireador chico'],
  ['IMPL-Ras', 'Implemento Rastrillo frontal'], ['IMPL-Pal 1', 'Implemento Pala Frontal'], ['IMPL-Pal 2', 'Implemento Palita Tatu'],
  ['IMPL-Hoy', 'Implemento Hoyadora de Postes'], ['IMPL-Fum', 'Implemento Yumbo'], ['IMPL-Cac 1', 'Implemento Cachape 1'],
  ['IMPL-Cac 2', 'Implemento Cachape 2'], ['IMPL-Mez', 'Implemento Mezcladora Tracto'], ['GEN-Cat', 'Generador Caterpillar'],
  ['GEN-Yan 1', 'Generador Yanmar 1'], ['GEN-Yan 2', 'Generador Yanmar 2'], ['GEN-Yan 3', 'Generador Yanmar 3'],
  ['GEN-Lifan', 'Generador Lifan'], ['HM-Ms', 'Motosierras'], ['HM-Fum', 'Mochilas Fumigadoras'], ['HM-Mb', 'Motobombas'],
  ['HM-Des', 'Desmalezadoras Husqvarna'], ['INF-Tc', 'Tanque Combustible (Estático)'], ['BPY', 'Beechcraft Bonanza A36'], ['VARIOS', 'Varios'],
];
const FORMAS_PAGO_BASE = ['Fondo Fijo', 'Contado', 'Tarjeta de Crédito', 'Transferencia Bancaria', 'Pago QR'];
const TIPOS_ASOCIADO = [['Nota de Crédito', '📄 Nota de crédito'], ['Comprobante de Transferencia', '🏦 Transferencia'], ['Recibo', '🧾 Recibo']];
const FF_INICIO = '2026-09-01';
const FOTO_MAX_PX = 2400;      // las fotos se achican solo si pasan de esto (queda bien legible)
const FOTO_CALIDAD = 0.88;

// ---------------------------------------------------------------- llamada al script
/** Llama a una función de ZehirutApp. "__PIN__" en los argumentos lo completa el script. Las que
 *  guardan algo van una sola vez (un reintento podría cargar dos veces la misma factura). */
async function za(fn, args, repetible) {
  if (!navigator.onLine) throw new Error('Sin señal: Facturas y Fondo fijo necesitan señal.');
  const payload = { accion: 'za', pin: sesion.pin, fn, args };
  const r = repetible ? await llamar(payload) : await llamarUnaVez(payload);
  if (!r.ok) throw new Error(r.error || 'error del servidor');
  return r.resultado;
}

/** Permisos de ZehirutApp de esta persona (vienen con los datos), o null si no lo ve. */
function zaP() {
  return datos && datos.za && datos.za.ok ? datos.za : null;
}

// ---------------------------------------------------------------- montos (mismo criterio que ZehirutApp)
const esGs = (moneda) => /PYG|GUARAN/i.test(moneda || '');
function fmtMonto(valor, moneda) {
  const n = parseFloat(valor);
  if (isNaN(n)) return '';
  if (esGs(moneda)) return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const p = n.toFixed(2).split('.');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1];
}
const montoParaGuardar = (texto) => (texto ? String(texto).replace(/\./g, '').replace(',', '.') : '');
function monedaNormal(m) {
  const x = String(m || '').toUpperCase();
  if (/USD|DOLAR|U\$S/.test(x)) return 'USD';
  if (/PYG|GUARAN|GS/.test(x)) return 'PYG';
  return x ? 'OTRA' : 'PYG';
}
const isoADdmm = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// ---------------------------------------------------------------- archivos (foto o PDF)
function blobABase64(blob) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => mal(new Error('no se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

/** Foto o PDF listo para mandar. Las fotos grandes se achican a FOTO_MAX_PX del lado más largo
 *  (JPEG de calidad alta); las chicas y los PDF van tal cual. */
async function prepararArchivo(file) {
  let blob = file;
  let tipo = file.type || 'application/octet-stream';
  let nombre = file.name || 'archivo';
  if (/^image\/(jpeg|png|webp)$/i.test(tipo)) {
    try {
      const img = await createImageBitmap(file);
      const lado = Math.max(img.width, img.height);
      if (lado > FOTO_MAX_PX) {
        const k = FOTO_MAX_PX / lado;
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', FOTO_CALIDAD));
        tipo = 'image/jpeg';
        nombre = nombre.replace(/\.[^.]+$/, '') + '.jpg';
      }
    } catch (e) { /* si no se puede achicar (formato raro), va el original */ }
  }
  return { base64: await blobABase64(blob), tipo, nombre, vista: /^image\//.test(tipo) ? URL.createObjectURL(blob) : '' };
}

/** Botones para sacar una foto o elegir una foto/PDF. El archivo queda en ui.fac.archivos[clave]. */
function htmlElegirArchivo(clave, texto) {
  const a = (ui.fac.archivos || {})[clave];
  return '<div class="elegir-archivo">' +
    '<label class="btn sec">📷 Sacar foto<input type="file" accept="image/*" capture="environment" data-archivo="' + clave + '" hidden></label>' +
    '<label class="btn sec">📎 ' + (texto || 'Elegir foto o PDF') + '<input type="file" accept="image/*,application/pdf" data-archivo="' + clave + '" hidden></label>' +
    (a ? '<div class="archivo-elegido">✅ ' + esc(a.name) + (/^image\//.test(a.type) ? '<img src="' + URL.createObjectURL(a) + '" alt="">' : '') + '</div>' : '') +
    '</div>';
}

function descargarBase64(r, nombreSugerido) {
  const bin = atob(r.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url; a.download = r.nombre || nombreSugerido || 'archivo';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); } catch (e) {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e2) { /* nada */ }
    t.remove();
  }
  toast('✓ Copiado', 1200);
}

// ================================================================ FACTURAS
function estadoFac() {
  if (!ui.fac) ui.fac = { vista: 'lista', raiz: 'lista', lista: null, q: '', mes: '', archivos: {} };
  return ui.fac;
}

function htmlFacturas() {
  const f = estadoFac();
  const p = zaP();
  const titulos = { lista: 'Ver facturas', tipo: 'Comprobantes', carga: 'Cargar factura', form: f.form && f.form.modo === 'editar' ? 'Corregir factura' : 'Revisá los datos',
    detalle: 'Factura', comprobante: 'Agregar comprobante', vincular: 'Vincular anticipo', anticipo: 'Anticipo a proveedor', pagoSF: 'Pago sin factura' };
  let cuerpo;
  if (!p) cuerpo = '<div class="aviso amarillo">' + esc((datos && datos.za && datos.za.error) || 'No se pudo conectar con los permisos de ZehirutApp.') + '</div>';
  else cuerpo = ({ lista: htmlFacLista, tipo: htmlFacTipo, carga: htmlFacCarga, form: htmlFacForm, detalle: htmlFacDetalle,
    comprobante: htmlFacComprobante, vincular: htmlFacVincular, anticipo: htmlFacAnticipo, pagoSF: htmlFacPagoSF }[f.vista] || htmlFacLista)();
  return barra(titulos[f.vista] || 'Comprobantes', true) + '<div class="contenido"><div class="form">' + cuerpo + '</div></div>';
}

/** Flecha de arriba: un paso atrás. Devuelve true si se quedó dentro (en la pantalla de entrada vuelve al grupo). */
function atrasFacturas() {
  const f = estadoFac();
  if (f.vista === f.raiz) return false;
  const antes = { carga: 'tipo', anticipo: 'tipo', pagoSF: 'tipo', detalle: 'lista', comprobante: 'detalle', vincular: 'detalle' };
  if (f.vista === 'form') {
    if (f.form && f.form.modo === 'editar') { f.vista = 'detalle'; render(); return true; }
    descartarCargaFac(); return true;
  }
  if (antes[f.vista]) { f.vista = antes[f.vista]; f.archivos = {}; render(); window.scrollTo(0, 0); return true; }
  return false;
}

// ---- lista
function htmlFacLista() {
  const f = estadoFac();
  const p = zaP();
  // No se trae nada hasta que se busca algo o se elige un mes (antes cargaba todas al entrar).
  const buscando = !!(f.q || f.mes);
  if (buscando && !f.lista && !f.cargando) setTimeout(() => cargarListaFac(true), 0);
  let h = '';
  h += '<div class="filtros"><input class="txt" id="fac-q" placeholder="Buscar N°, proveedor o RUC" value="' + esc(f.q) + '" autocomplete="off">' +
    '<input class="txt" type="month" id="fac-mes" value="' + esc(f.mes) + '" style="flex:0 1 170px"></div>';
  if (!buscando) return h + '<p class="vacio" style="padding:20px 8px">Escribí un N°, proveedor o RUC, o elegí un mes.</p>';
  if (!f.lista) return h + '<p class="vacio">' + (f.error ? '⚠️ ' + esc(f.error) : 'Buscando…') + '</p>';
  if (!f.lista.filas.length) h += '<p class="vacio">No hay facturas con ese filtro.</p>';
  h += f.lista.filas.map((x) =>
    '<button class="mov factura' + (x.cargadoAlbor ? ' albor' : '') + '" data-a="fac" data-x="abrir" data-id="' + esc(x.id) + '">' +
    '<span class="cuerpo"><b>' + esc(x.proveedor || '(sin proveedor)') + '</b><small>' + esc(x.numeroFactura) + ' · ' + esc(x.fecha) +
    (x.detalle ? ' · ' + esc(x.detalle) : '') + ' · ' + esc(String(x.usuario || '').split(' ')[0]) +
    (x.cargadoAlbor ? ' <span class="chip verde">✓ Albor</span>' : '') + '</small></span>' +
    '<span class="num">' + fmtMonto(x.monto, x.moneda) + '<br><small style="font-weight:600;color:var(--gris)">' + esc(x.moneda) + '</small></span></button>').join('');
  if (f.lista.hayMas) h += '<button class="btn sec" data-a="fac" data-x="mas">Ver más (' + (f.lista.total - f.lista.filas.length) + ')</button>';
  if (f.lista.filas.length) h += '<div class="pie-stock"><button class="btn sec chico" data-a="fac" data-x="excel">📥 Bajar Excel (con este filtro)</button></div>';
  return h;
}

async function cargarListaFac(reiniciar) {
  const f = estadoFac();
  f.cargando = true;
  f.error = '';
  try {
    const offset = reiniciar || !f.lista ? 0 : f.lista.filas.length;
    const r = await za('listarFacturas', ['__PIN__', { query: f.q, mes: f.mes, offset, limite: 30 }], true);
    f.lista = reiniciar || !f.lista ? r : { filas: f.lista.filas.concat(r.filas), total: r.total, hayMas: r.hayMas };
  } catch (e) {
    f.error = e.message;
  } finally {
    f.cargando = false;
    if (ui.pantalla === 'facturas' && f.vista === 'lista') render();
  }
}

// ---- elegir qué cargar
function htmlFacTipo() {
  return '<h3 style="margin:0 0 10px">Carga de comprobantes</h3>' +
    '<input type="file" id="fac-elegir" accept="image/*,application/pdf" hidden>' +
    '<div class="opciones-grandes">' +
    '<button class="modulo" data-a="fac" data-x="elegir" data-v="carga"><span class="ico">🧾</span><span><b>Factura</b><small>Sacale una foto o elegí el archivo: la lee Gemini y revisás los datos</small></span></button>' +
    '<button class="modulo" data-a="fac" data-x="elegir" data-v="anticipo"><span class="ico">💸</span><span><b>Anticipo a proveedor</b><small>Foto o archivo del comprobante del adelanto</small></span></button>' +
    '<button class="modulo" data-a="fac" data-x="ir" data-v="pagoSF"><span class="ico">💵</span><span><b>Pago sin factura</b><small>Gastos que nunca van a tener factura</small></span></button></div>';
}

// ---- cargar factura (Gemini)
function htmlFacCarga() {
  const f = estadoFac();
  if (f.leyendo) {
    return (f.leyendo.vista ? '<img class="vista-factura" src="' + f.leyendo.vista + '" alt="">' : '') +
      '<p class="vacio">⏳ Subiendo y leyendo la factura…<br><small>Puede tardar unos segundos.</small></p>';
  }
  return '<div class="aviso">Sacale una foto a la factura o elegí la foto/PDF. Gemini lee los datos y después los revisás antes de guardar.</div>' +
    htmlElegirArchivo('factura', 'Elegir foto o PDF');
}

async function leerFacturaElegida(file) {
  const f = estadoFac();
  f.leyendo = { vista: /^image\//.test(file.type) ? URL.createObjectURL(file) : '' };
  render();
  let r;
  try {
    const a = await prepararArchivo(file);
    r = await za('procesarFactura', [a.base64, a.tipo, a.nombre, '__PIN__']);
  } catch (e) {
    f.leyendo = null; f.archivos = {};
    render();
    cartel({ icono: '⚠️', titulo: 'No se pudo leer la factura', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
    return;
  }
  f.leyendo = null;
  f.archivos = {};
  render();
  const descartar = () => { za('descartarArchivo', [r.archivoId, '__PIN__']).catch(() => {}); toast('Carga descartada'); };
  // Mismos avisos que ZehirutApp, de a uno.
  if (!r.clienteCoincide) {
    const ok = await cartel({ icono: '⚠️', titulo: 'Esta factura no parece ser de Zehirut S.A.', si: 'Sí, es de Zehirut', no: 'No, descartar',
      html: '<p>Cliente detectado: "<b>' + esc(r.clienteDetectado) + '</b>".</p><p>Puede ser un error de lectura (por ejemplo, en facturas manuscritas).</p>' });
    if (!ok) { descartar(); return; }
  }
  if (r.duplicado && r.facturaExistente) {
    const d = r.facturaExistente;
    const ok = await cartel({ icono: '⚠️', titulo: 'Esta factura ya está cargada', si: 'Sí, cargar igual', no: 'No, descartar',
      html: '<p>N° <b>' + esc(d.numeroFactura) + '</b> de ' + esc(d.proveedor) + ', cargada el ' + esc(d.fechaCarga) + ' por ' + esc(d.usuario) + '.</p>' });
    if (!ok) { descartar(); return; }
  }
  const elegidos = [];
  if (r.anticiposPendientes && r.anticiposPendientes.length) {
    const promesa = cartel({ icono: '💸', titulo: 'Este proveedor tiene anticipos', si: 'Continuar', no: '',
      html: '<p>Tildá los que correspondan a esta factura (podés no tildar ninguno).</p>' + r.anticiposPendientes.map((a) =>
        '<label class="check-linea"><input type="checkbox" value="' + esc(a.id) + '"><span>' + fmtMonto(a.monto, a.moneda) + ' ' + esc(a.moneda) + ' — ' +
        esc(a.motivo || '(sin motivo)') + ' · cargado el ' + esc(a.fechaCarga) + (a.facturasVinculadas ? ' (ya vinculado a ' + a.facturasVinculadas + ')' : '') + '</span></label>').join('') });
    document.querySelectorAll('#modal .check-linea input').forEach((c) => c.addEventListener('change', () => {
      const i = elegidos.indexOf(c.value);
      if (c.checked && i === -1) elegidos.push(c.value); else if (!c.checked && i !== -1) elegidos.splice(i, 1);
    }));
    await promesa;
  }
  const d = r.datos || {};
  const moneda = monedaNormal(d.moneda);
  f.form = {
    modo: 'nueva', archivoUrl: r.archivoUrl, archivoId: r.archivoId, anticipos: elegidos,
    unidadNegocio: '', bienUso: '', formaPago: '', detalle: d.detalle || '',
    tipoComprobante: d.tipo_comprobante === 'Factura Crédito' ? 'Factura Crédito' : 'Factura Contado', diasCredito: d.dias_credito || '30 días',
    fecha: d.fecha_factura || '', numeroFactura: d.numero_factura || '', proveedor: d.proveedor || '', ruc: d.ruc || '',
    electronico: d.electronico || 'No', timbrado: d.timbrado || '', vtoTimbrado: d.vto_timbrado || '',
    moneda, monto: fmtMonto(d.monto, moneda), iva5: fmtMonto(d.iva5, moneda), iva10: fmtMonto(d.iva10, moneda), items: d.items || [],
  };
  f.vista = 'form';
  render();
  window.scrollTo(0, 0);
}

function descartarCargaFac() {
  const f = estadoFac();
  if (f.form && f.form.modo === 'nueva' && f.form.archivoId) za('descartarArchivo', [f.form.archivoId, '__PIN__']).catch(() => {});
  f.form = null;
  f.vista = f.raiz;
  render();
  toast('Carga descartada');
}

// ---- formulario (nueva o corregir)
const opcion = (valor, texto, elegido) => '<option value="' + esc(valor) + '"' + (valor === elegido ? ' selected' : '') + '>' + esc(texto) + '</option>';

function htmlFacForm() {
  const x = estadoFac().form;
  const credito = x.tipoComprobante === 'Factura Crédito';
  const campo = (id, label, valor, extra) => '<div class="campo"><label for="ff-' + id + '">' + label + '</label><input class="txt" id="ff-' + id + '" value="' + esc(valor) + '"' + (extra || '') + '></div>';
  let h = x.modo === 'nueva' && x.anticipos.length ? '<div class="aviso">💸 Se van a vincular ' + x.anticipos.length + ' anticipo(s) a esta factura.</div>' : '';
  h += '<div class="tarjeta"><h3 class="subt">Datos contables</h3>' +
    '<div class="campo"><label for="ff-unidadNegocio">Unidad de negocio</label><select class="txt" id="ff-unidadNegocio">' + opcion('', 'Elegí…', x.unidadNegocio) +
    UNIDADES_NEGOCIO.map((u) => opcion(u, u, x.unidadNegocio)).join('') + '</select></div>' +
    '<div class="campo"><label for="ff-bienUso">Bien de uso</label><select class="txt" id="ff-bienUso">' + opcion('', 'No aplica', x.bienUso) +
    BIENES_USO.map(([c, n]) => opcion(c, n, x.bienUso)).join('') + '</select></div>' +
    '<div class="campo"><label for="ff-formaPago">Forma de pago</label>' + (credito ? '<input class="txt" value="Crédito" disabled>' :
      '<select class="txt" id="ff-formaPago">' + opcion('', 'Elegí…', x.formaPago) + FORMAS_PAGO_BASE.map((p) => opcion(p, p, x.formaPago)).join('') + '</select>') + '</div>' +
    campo('detalle', 'Detalle <small>(resumen corto)</small>', x.detalle, ' placeholder="Ej: Desayuno, Peaje, Repuestos"') + '</div>';
  h += '<div class="tarjeta"><h3 class="subt">Datos de la factura</h3>' +
    '<div class="campo"><div class="segmento">' + ['Factura Contado', 'Factura Crédito'].map((t) =>
      '<button class="neutro' + (x.tipoComprobante === t ? ' activo' : '') + '" data-a="fac" data-x="tipoComp" data-v="' + t + '">' + t.replace('Factura ', '') + '</button>').join('') + '</div></div>' +
    (credito ? campo('diasCredito', 'Días de crédito', x.diasCredito) : '') +
    campo('fecha', 'Fecha de la factura', x.fecha, ' placeholder="DD/MM/AAAA" inputmode="numeric"') +
    campo('numeroFactura', 'N° de factura', x.numeroFactura) + campo('proveedor', 'Proveedor', x.proveedor) + campo('ruc', 'RUC proveedor', x.ruc) +
    '<div class="campo"><label for="ff-monto">Monto</label><div class="fila-monto"><select class="txt" id="ff-moneda">' +
    ['PYG', 'USD', 'OTRA'].map((m) => opcion(m, m, x.moneda)).join('') + '</select><input class="txt" id="ff-monto" inputmode="decimal" value="' + esc(x.monto) + '"></div></div>';
  if (x.modo === 'editar') {
    h += '<div class="fila2">' + campo('iva5', 'IVA 5%', x.iva5, ' inputmode="decimal"') + campo('iva10', 'IVA 10%', x.iva10, ' inputmode="decimal"') + '</div>' +
      '<div class="fila2">' + campo('timbrado', 'Timbrado', x.timbrado) + campo('vtoTimbrado', 'Vto. timbrado', x.vtoTimbrado) + '</div>';
  }
  h += '</div>';
  if (x.modo === 'editar') {
    h += '<div class="tarjeta"><h3 class="subt">Ítems</h3>' + (x.items || []).map((it, i) =>
      '<div class="item-edit"><input class="txt" data-item="' + i + '" data-k="descripcion" value="' + esc(it.descripcion) + '" placeholder="Descripción">' +
      '<div class="fila4"><input class="txt" data-item="' + i + '" data-k="cantidad" value="' + esc(it.cantidad) + '" placeholder="Cant.">' +
      '<input class="txt" data-item="' + i + '" data-k="precioUnitario" value="' + esc(fmtMonto(it.precioUnitario, x.moneda)) + '" placeholder="P. unit.">' +
      '<input class="txt" data-item="' + i + '" data-k="subtotal" value="' + esc(fmtMonto(it.subtotal, x.moneda)) + '" placeholder="Subtotal">' +
      '<input class="txt" data-item="' + i + '" data-k="iva" value="' + esc(fmtMonto(it.iva, x.moneda)) + '" placeholder="IVA"></div>' +
      '<button class="btn sec chico rojo-txt" data-a="fac" data-x="quitarItem" data-i="' + i + '">✕ Quitar</button></div>').join('') +
      '<button class="btn sec chico" data-a="fac" data-x="agregarItem">+ Agregar ítem</button></div>';
  }
  h += '<div class="acciones"><button class="btn" data-a="fac" data-x="guardarForm"' + (x.guardando ? ' disabled' : '') + '>' +
    (x.guardando ? 'Guardando…' : x.modo === 'editar' ? 'Guardar cambios' : 'Confirmar y guardar') + '</button>' +
    '<button class="btn sec" data-a="fac" data-x="cancelarForm">Cancelar</button></div>';
  return h;
}

function leerFormFac() {
  const x = estadoFac().form;
  if (!x) return;
  ['unidadNegocio', 'bienUso', 'formaPago', 'detalle', 'diasCredito', 'fecha', 'numeroFactura', 'proveedor', 'ruc', 'moneda', 'monto',
    'iva5', 'iva10', 'timbrado', 'vtoTimbrado'].forEach((k) => { const el = $('#ff-' + k); if (el) x[k] = el.value; });
  document.querySelectorAll('[data-item]').forEach((el) => {
    const it = x.items[Number(el.dataset.item)];
    if (!it) return;
    it[el.dataset.k] = /precioUnitario|subtotal|iva/.test(el.dataset.k) ? montoParaGuardar(el.value) : el.value;
  });
}

async function guardarFormFac() {
  leerFormFac();
  const f = estadoFac();
  const x = f.form;
  const credito = x.tipoComprobante === 'Factura Crédito';
  if (x.modo === 'nueva' && !x.unidadNegocio) { toast('Elegí la Unidad de negocio.', 3000); return; }
  if (x.modo === 'nueva' && !credito && !x.formaPago) { toast('Elegí la Forma de pago.', 3000); return; }
  if (!x.numeroFactura.trim() || !x.proveedor.trim()) { toast('N° de factura y Proveedor son obligatorios.', 3000); return; }
  const d = {
    unidadNegocio: x.unidadNegocio, bienUso: x.bienUso, formaPago: credito ? 'Crédito' : x.formaPago, detalle: x.detalle.trim(),
    tipoComprobante: x.tipoComprobante, diasCredito: x.diasCredito, fecha: x.fecha.trim(), numeroFactura: x.numeroFactura.trim(),
    proveedor: x.proveedor.trim(), ruc: x.ruc.trim(), electronico: x.electronico, timbrado: x.timbrado, vtoTimbrado: x.vtoTimbrado,
    moneda: x.moneda, monto: montoParaGuardar(x.monto), iva5: montoParaGuardar(x.iva5), iva10: montoParaGuardar(x.iva10), items: x.items || [],
  };
  x.guardando = true;
  render();
  try {
    if (x.modo === 'editar') {
      await za('actualizarFactura', ['__PIN__', x.id, d]);
      toast('✓ Factura corregida');
      f.form = null;
      await abrirDetalleFac(x.id);
    } else {
      d.archivoUrl = x.archivoUrl;
      d.anticiposVinculados = x.anticipos;
      await za('guardarFactura', [d, '__PIN__']);
      toast('✓ Factura guardada', 3000);
      f.form = null;
      f.lista = null;
      f.vista = f.raiz;
      render();
      window.scrollTo(0, 0);
    }
  } catch (e) {
    x.guardando = false;
    render();
    cartel({ icono: '⚠️', titulo: 'No se pudo guardar', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
  }
}

// ---- detalle
async function abrirDetalleFac(id) {
  const f = estadoFac();
  f.vista = 'detalle';
  f.det = null;
  f.detId = id;
  render();
  window.scrollTo(0, 0);
  try {
    f.det = await za('obtenerDetalleFactura', ['__PIN__', id], true);
  } catch (e) {
    f.det = { error: e.message };
  }
  if (ui.pantalla === 'facturas' && f.vista === 'detalle') render();
}

function htmlFacDetalle() {
  const f = estadoFac();
  const p = zaP();
  if (!f.det) return '<p class="vacio">Cargando…</p>';
  if (f.det.error) return '<p class="vacio">⚠️ ' + esc(f.det.error) + '</p>';
  const x = f.det.factura;
  f.copiables = [];
  const fila = (etq, valor) => {
    if (valor === '' || valor == null) return '';
    f.copiables.push(etq + ': ' + valor);
    return '<tr><td>' + esc(etq) + '</td><td>' + esc(valor) + '</td><td><button class="copiar" data-a="fac" data-x="copiar" data-i="' + (f.copiables.length - 1) + '" aria-label="Copiar">📋</button></td></tr>';
  };
  const bien = (BIENES_USO.find((b) => b[0] === x.bienUso) || [x.bienUso, x.bienUso])[1];
  let h = '<div class="tarjeta' + (x.cargadoAlbor ? ' albor' : '') + '"><div class="cab-factura"><div><b>' + esc(x.proveedor) + '</b><br><small>N° ' + esc(x.numeroFactura) + ' · ' + esc(x.fecha) + '</small></div>' +
    '<div class="monto-grande">' + fmtMonto(x.monto, x.moneda) + ' <small>' + esc(x.moneda) + '</small></div></div>' +
    '<label class="check-linea albor-check"><input type="checkbox" data-albor="1"' + (x.cargadoAlbor ? ' checked' : '') + '><span>Cargado a Albor</span></label></div>';
  h += '<div class="tarjeta"><h3 class="subt">Datos contables</h3><table class="detalle copiable">' +
    fila('Unidad de negocio', x.unidadNegocio) + fila('Bien de uso', x.bienUso ? bien + ' (' + x.bienUso + ')' : '') + fila('Forma de pago', x.formaPago) + fila('Detalle', x.detalle || '—') + '</table>';
  h += '<h3 class="subt">Datos de la factura</h3><table class="detalle copiable">' +
    fila('Tipo de comprobante', x.tipoComprobante) + fila('Días de crédito', x.diasCredito) + fila('Fecha de la factura', x.fecha) +
    fila('N° de factura', x.numeroFactura) + fila('Proveedor', x.proveedor) + fila('RUC proveedor', x.ruc) + fila('Factura electrónica', x.electronico) +
    fila('Timbrado', x.timbrado) + fila('Vto. timbrado', x.vtoTimbrado) + fila('Monto', fmtMonto(x.monto, x.moneda) + ' ' + x.moneda) +
    fila('IVA 5%', fmtMonto(x.iva5, x.moneda)) + fila('IVA 10%', fmtMonto(x.iva10, x.moneda)) + fila('Cargado por', x.usuario) + fila('Fecha de carga', x.fechaCarga) +
    '</table><button class="btn sec chico" data-a="fac" data-x="copiarTodo">📋 Copiar todos los datos</button></div>';
  const items = f.det.items || [];
  if (items.length) {
    f.itemsTexto = items.map((it) => [it.descripcion || '', it.cantidad || '', fmtMonto(it.precioUnitario, x.moneda), fmtMonto(it.subtotal, x.moneda)].join('\t'));
    h += '<div class="tarjeta"><h3 class="subt">Ítems</h3>' + items.map((it, i) =>
      '<div class="item-det"><div><b>' + esc(it.descripcion || '(sin descripción)') + '</b><br><small>Cant: ' + esc(it.cantidad || '-') + ' · P. unit: ' +
      fmtMonto(it.precioUnitario, x.moneda) + ' · Subtotal: ' + fmtMonto(it.subtotal, x.moneda) + '</small></div>' +
      '<button class="copiar" data-a="fac" data-x="copiarItem" data-i="' + i + '" aria-label="Copiar">📋</button></div>').join('') +
      '<button class="btn sec chico" data-a="fac" data-x="copiarItems">📋 Copiar todos los ítems</button></div>';
  }
  const archivos = f.det.archivos || [];
  h += '<div class="tarjeta"><h3 class="subt">Archivos</h3>' + (archivos.length ? archivos.map((a) =>
    '<div class="item-det"><div><b>' + esc(a.nombre) + '</b><br><small>' + a.tamanioKB + ' KB</small></div>' +
    '<button class="btn sec chico" data-a="fac" data-x="bajarArchivo" data-id="' + esc(a.id) + '" data-n="' + esc(a.nombre) + '">📥</button></div>').join('')
    : '<p class="vacio">Sin archivos.</p>');
  const docs = f.det.documentos || [];
  h += '<h3 class="subt">Comprobantes asociados</h3>' + (docs.length ? docs.map((d) =>
    '<div class="item-det"><div><b>' + esc(d.tipo) + '</b><br><small>Cargado el ' + esc(d.fechaCarga) + ' por ' + esc(d.usuario) + '</small></div></div>').join('')
    : '<p class="vacio">Sin comprobantes asociados.</p>') + '</div>';
  const acciones = [];
  if (p.puedeFacturas) {
    acciones.push('<button class="btn" data-a="fac" data-x="editar">✏️ Corregir datos</button>',
      '<button class="btn sec" data-a="fac" data-x="ir" data-v="comprobante">📎 Agregar comprobante (NC, transferencia, recibo)</button>',
      '<button class="btn sec" data-a="fac" data-x="ir" data-v="vincular">💸 Vincular anticipo</button>');
  }
  if (p.puedeEliminarFacturas) acciones.push('<button class="btn sec rojo-txt" data-a="fac" data-x="eliminar">🗑️ Eliminar factura</button>');
  return h + (acciones.length ? '<div class="acciones">' + acciones.join('') + '</div>' : '');
}

// ---- agregar comprobante asociado
function htmlFacComprobante() {
  const f = estadoFac();
  const c = f.comp || (f.comp = { tipo: '', otras: null, verOtras: false, elegidas: [] });
  const x = f.det && f.det.factura;
  let h = '<div class="campo"><span class="etq">¿Qué comprobante es?</span><div class="opciones">' + TIPOS_ASOCIADO.map(([v, t]) =>
    '<button class="' + (c.tipo === v ? 'activo' : '') + '" data-a="fac" data-x="compTipo" data-v="' + v + '">' + t + '</button>').join('') + '</div></div>' +
    '<div class="campo"><span class="etq">Archivo</span>' + htmlElegirArchivo('comprobante') + '</div>';
  h += '<label class="check-linea"><input type="checkbox" data-otras="1"' + (c.verOtras ? ' checked' : '') + '><span>Este comprobante paga también otras facturas de ' + esc(x ? x.proveedor : 'este proveedor') + '</span></label>';
  if (c.verOtras) {
    if (!c.otras) h += '<p class="vacio">Buscando facturas del proveedor…</p>';
    else if (!c.otras.length) h += '<p class="vacio">No hay otras facturas cargadas de este proveedor.</p>';
    else h += c.otras.map((o) => '<label class="check-linea"><input type="checkbox" data-otra="' + esc(o.id) + '"' + (c.elegidas.indexOf(String(o.id)) !== -1 ? ' checked' : '') + '><span><b>' +
      esc(o.numeroFactura || '(sin número)') + '</b> · ' + esc(o.fecha) + ' · ' + fmtMonto(o.monto, o.moneda) + ' ' + esc(o.moneda) + '</span></label>').join('');
  }
  return h + '<button class="btn" data-a="fac" data-x="guardarComp" style="margin-top:14px"' + (c.guardando ? ' disabled' : '') + '>' + (c.guardando ? 'Subiendo…' : 'Guardar comprobante') + '</button>';
}

async function guardarCompFac() {
  const f = estadoFac();
  const c = f.comp;
  const file = f.archivos.comprobante;
  if (!c.tipo) { toast('Elegí qué comprobante es.', 3000); return; }
  if (!file) { toast('Elegí el archivo.', 3000); return; }
  c.guardando = true;
  render();
  try {
    const a = await prepararArchivo(file);
    const ids = [f.detId].concat(c.verOtras ? c.elegidas : []);
    await za('procesarComprobanteAsociado', [a.base64, a.tipo, a.nombre, ids, c.tipo, '__PIN__']);
    toast(ids.length > 1 ? '✓ Comprobante cargado en ' + ids.length + ' facturas' : '✓ Comprobante cargado', 3000);
    f.comp = null;
    f.archivos = {};
    await abrirDetalleFac(f.detId);
  } catch (e) {
    c.guardando = false;
    render();
    cartel({ icono: '⚠️', titulo: 'No se pudo subir', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
  }
}

// ---- vincular anticipo a mano
function htmlFacVincular() {
  const f = estadoFac();
  const v = f.vinc || (f.vinc = { q: '', res: null });
  return '<div class="aviso">Buscá el anticipo por proveedor, motivo o RUC (mínimo 3 letras) y tocalo para vincularlo a esta factura.</div>' +
    '<input class="txt" id="fac-vinc" placeholder="Buscar anticipo…" value="' + esc(v.q) + '" autocomplete="off" style="margin-bottom:12px">' +
    (v.buscando ? '<p class="vacio">Buscando…</p>' : !v.res ? '' : !v.res.length ? '<p class="vacio">Sin resultados.</p>' :
      v.res.map((a) => '<button class="mov" data-a="fac" data-x="vincular" data-id="' + esc(a.id) + '"><span class="cuerpo"><b>' + esc(a.proveedor || '(sin proveedor)') +
        '</b><small>' + esc(a.motivo || '(sin motivo)') + ' · cargado el ' + esc(a.fechaCarga) + (a.facturasVinculadas ? ' · ya vinculado a ' + a.facturasVinculadas : '') +
        '</small></span><span class="num">' + fmtMonto(a.monto, a.moneda) + '<br><small style="color:var(--gris)">' + esc(a.moneda) + '</small></span></button>').join(''));
}

let timerVinc = null;
function buscarAnticipoFac(q) {
  const v = estadoFac().vinc;
  v.q = q;
  clearTimeout(timerVinc);
  if (q.trim().length < 3) { v.res = null; return; }
  timerVinc = setTimeout(async () => {
    v.buscando = true; render();
    try { v.res = await za('buscarAnticiposPendientes', [q, '__PIN__'], true); } catch (e) { v.res = []; toast(e.message, 3000); }
    v.buscando = false;
    render();
    const i = $('#fac-vinc'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }, 400);
}

// ---- anticipo y pago sin factura
function htmlFacAnticipo() {
  const a = estadoFac().ant || (estadoFac().ant = { fecha: hoyISO(), moneda: 'PYG' });
  return '<div class="aviso">Para un adelanto pagado sin tener todavía la factura. Cuando llegue la factura, se vincula.</div>' +
    '<div class="campo"><label for="fa-proveedor">Proveedor</label><input class="txt" id="fa-proveedor" value="' + esc(a.proveedor || '') + '"></div>' +
    '<div class="campo"><label for="fa-ruc">RUC proveedor <small>(opcional, recomendado)</small></label><input class="txt" id="fa-ruc" value="' + esc(a.ruc || '') + '"></div>' +
    '<div class="campo"><label for="fa-fecha">Fecha del anticipo</label><input class="txt" type="date" id="fa-fecha" value="' + esc(a.fecha) + '" max="' + hoyISO() + '"></div>' +
    '<div class="campo"><label for="fa-monto">Monto</label><div class="fila-monto"><select class="txt" id="fa-moneda">' + ['PYG', 'USD', 'OTRA'].map((m) => opcion(m, m, a.moneda)).join('') +
    '</select><input class="txt" id="fa-monto" inputmode="decimal" value="' + esc(a.monto || '') + '"></div></div>' +
    '<div class="campo"><label for="fa-motivo">Motivo</label><input class="txt" id="fa-motivo" value="' + esc(a.motivo || '') + '" placeholder="Ej: Adelanto repuestos camioneta"></div>' +
    '<div class="campo"><span class="etq">Comprobante</span>' + htmlElegirArchivo('anticipo') + '</div>' +
    '<button class="btn" data-a="fac" data-x="guardarAnticipo"' + (a.guardando ? ' disabled' : '') + '>' + (a.guardando ? 'Guardando…' : 'Guardar anticipo') + '</button>';
}

function htmlFacPagoSF() {
  const a = estadoFac().psf || (estadoFac().psf = { fecha: hoyISO(), moneda: 'PYG' });
  return '<div class="aviso">Para gastos que nunca van a tener factura. Se guarda con las facturas, con un N° automático "SinFC".</div>' +
    '<div class="campo"><label for="fp-proveedor">Proveedor o beneficiario</label><input class="txt" id="fp-proveedor" value="' + esc(a.proveedor || '') + '"></div>' +
    '<div class="campo"><label for="fp-fecha">Fecha</label><input class="txt" type="date" id="fp-fecha" value="' + esc(a.fecha) + '" max="' + hoyISO() + '"></div>' +
    '<div class="campo"><label for="fp-item">Ítem / descripción</label><input class="txt" id="fp-item" value="' + esc(a.item || '') + '" placeholder="Ej: Compra de repuestos varios"></div>' +
    '<div class="campo"><label for="fp-monto">Monto</label><div class="fila-monto"><select class="txt" id="fp-moneda">' + ['PYG', 'USD', 'OTRA'].map((m) => opcion(m, m, a.moneda)).join('') +
    '</select><input class="txt" id="fp-monto" inputmode="decimal" value="' + esc(a.monto || '') + '"></div></div>' +
    '<div class="campo"><label for="fp-unidad">Unidad de negocio</label><select class="txt" id="fp-unidad">' + opcion('', 'Elegí…', a.unidad || '') + UNIDADES_NEGOCIO.map((u) => opcion(u, u, a.unidad)).join('') + '</select></div>' +
    '<div class="campo"><label for="fp-forma">Forma de pago</label><select class="txt" id="fp-forma">' + opcion('', 'Elegí…', a.forma || '') + FORMAS_PAGO_BASE.map((u) => opcion(u, u, a.forma)).join('') + '</select></div>' +
    '<div class="campo"><span class="etq">Comprobante <small>(opcional)</small></span>' + htmlElegirArchivo('pagoSF') + '</div>' +
    '<button class="btn" data-a="fac" data-x="guardarPagoSF"' + (a.guardando ? ' disabled' : '') + '>' + (a.guardando ? 'Guardando…' : 'Guardar pago sin factura') + '</button>';
}

function leerCampos(prefijo, obj, claves) {
  claves.forEach((k) => { const el = $('#' + prefijo + k); if (el) obj[k] = el.value; });
}

async function guardarAnticipoFac() {
  const f = estadoFac();
  const a = f.ant;
  leerCampos('fa-', a, ['proveedor', 'ruc', 'fecha', 'moneda', 'monto', 'motivo']);
  if (!String(a.proveedor || '').trim()) { toast('Ingresá el proveedor.', 3000); return; }
  if (!String(a.monto || '').trim()) { toast('Ingresá el monto.', 3000); return; }
  if (!f.archivos.anticipo) { toast('Elegí el comprobante.', 3000); return; }
  a.guardando = true; render();
  try {
    const x = await prepararArchivo(f.archivos.anticipo);
    await za('guardarAnticipo', [x.base64, x.tipo, x.nombre, { proveedor: a.proveedor.trim(), ruc: String(a.ruc || '').trim(), fecha: isoADdmm(a.fecha),
      moneda: a.moneda, monto: montoParaGuardar(a.monto), motivo: String(a.motivo || '').trim() }, '__PIN__']);
    toast('✓ Anticipo guardado', 3000);
    f.ant = null; f.archivos = {}; f.vista = f.raiz; f.lista = null;
    render();
  } catch (e) {
    a.guardando = false; render();
    cartel({ icono: '⚠️', titulo: 'No se pudo guardar', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
  }
}

async function guardarPagoSFFac() {
  const f = estadoFac();
  const a = f.psf;
  leerCampos('fp-', a, ['proveedor', 'fecha', 'item', 'moneda', 'monto']);
  a.unidad = ($('#fp-unidad') || {}).value || a.unidad;
  a.forma = ($('#fp-forma') || {}).value || a.forma;
  if (!String(a.proveedor || '').trim()) { toast('Ingresá el proveedor.', 3000); return; }
  if (!a.fecha) { toast('Ingresá la fecha.', 3000); return; }
  if (!String(a.monto || '').trim()) { toast('Ingresá el monto.', 3000); return; }
  a.guardando = true; render();
  try {
    const x = f.archivos.pagoSF ? await prepararArchivo(f.archivos.pagoSF) : { base64: '', tipo: '', nombre: '' };
    await za('guardarPagoSinFactura', [x.base64, x.tipo, x.nombre, { proveedor: a.proveedor.trim(), fecha: isoADdmm(a.fecha), item: String(a.item || '').trim(),
      moneda: a.moneda, monto: montoParaGuardar(a.monto), unidadNegocio: a.unidad || '', formaPago: a.forma || '' }, '__PIN__']);
    toast('✓ Pago sin factura guardado', 3000);
    f.psf = null; f.archivos = {}; f.vista = f.raiz; f.lista = null;
    render();
  } catch (e) {
    a.guardando = false; render();
    cartel({ icono: '⚠️', titulo: 'No se pudo guardar', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
  }
}

// ---- acciones (botones con data-a="fac")
async function accionFac(b) {
  const f = estadoFac();
  const x = b.dataset.x;
  if (x === 'elegir') {
    // Se abre el selector en el mismo toque (si no, el navegador lo bloquea): en el celular ofrece sacar
    // foto o elegir archivo; en la compu, el explorador. Al elegir, sigue en la pantalla que corresponde.
    const inp = $('#fac-elegir');
    inp.dataset.destino = b.dataset.v;
    inp.value = '';
    inp.click();
    return;
  }
  if (x === 'ir') {
    if (b.dataset.v === 'comprobante') f.comp = null;
    if (b.dataset.v === 'vincular') f.vinc = null;
    f.archivos = {};
    f.vista = b.dataset.v; render(); window.scrollTo(0, 0);
    if (b.dataset.v === 'carga') setTimeout(() => { /* el usuario elige cámara o archivo */ }, 0);
    return;
  }
  if (x === 'abrir') { abrirDetalleFac(b.dataset.id); return; }
  if (x === 'mas') { cargarListaFac(false); return; }
  if (x === 'excel') {
    toast('Armando el Excel…', 15000);
    try { descargarBase64(await za('exportarFacturasExcel', ['__PIN__', { query: f.q, mes: f.mes }], true), 'Facturas.xlsx'); toast('✓ Excel descargado'); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
    return;
  }
  if (x === 'tipoComp') { leerFormFac(); f.form.tipoComprobante = b.dataset.v; if (b.dataset.v === 'Factura Crédito' && !f.form.diasCredito) f.form.diasCredito = '30 días'; render(); return; }
  if (x === 'agregarItem') { leerFormFac(); f.form.items.push({ codigo: '', descripcion: '', cantidad: '', precioUnitario: '', subtotal: '', iva: '' }); render(); return; }
  if (x === 'quitarItem') { leerFormFac(); f.form.items.splice(Number(b.dataset.i), 1); render(); return; }
  if (x === 'guardarForm') { guardarFormFac(); return; }
  if (x === 'cancelarForm') { if (f.form && f.form.modo === 'editar') { f.form = null; f.vista = 'detalle'; render(); } else descartarCargaFac(); return; }
  if (x === 'copiar') { copiar(String(f.copiables[Number(b.dataset.i)] || '').replace(/^[^:]+: /, '')); return; }
  if (x === 'copiarTodo') { copiar(f.copiables.join('\n')); return; }
  if (x === 'copiarItem') { copiar(f.itemsTexto[Number(b.dataset.i)]); return; }
  if (x === 'copiarItems') { copiar(f.itemsTexto.join('\n')); return; }
  if (x === 'bajarArchivo') {
    toast('Bajando…', 10000);
    try { descargarBase64(await za('descargarArchivoAdjunto', ['__PIN__', b.dataset.id], true), b.dataset.n); toast('✓ Descargado'); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
    return;
  }
  if (x === 'editar') {
    const d = f.det.factura;
    f.form = Object.assign({ modo: 'editar', id: d.id, anticipos: [] }, d, {
      moneda: monedaNormal(d.moneda), monto: fmtMonto(d.monto, d.moneda), iva5: fmtMonto(d.iva5, d.moneda), iva10: fmtMonto(d.iva10, d.moneda),
      diasCredito: d.diasCredito || '30 días', items: (f.det.items || []).map((it) => Object.assign({}, it)),
    });
    f.vista = 'form'; render(); window.scrollTo(0, 0);
    return;
  }
  if (x === 'eliminar') {
    const d = f.det.factura;
    const ok = await cartel({ icono: '🗑️', titulo: 'Eliminar factura', si: 'Eliminar', peligro: true,
      html: '<p>Se borra la factura N° <b>' + esc(d.numeroFactura) + '</b> de ' + esc(d.proveedor) + ', sus ítems, sus comprobantes asociados y su carpeta de Drive (va a la papelera).</p>' });
    if (!ok) return;
    try { await za('eliminarFactura', ['__PIN__', d.id]); toast('Factura eliminada'); f.vista = 'lista'; f.lista = null; render(); cargarListaFac(true); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
    return;
  }
  if (x === 'compTipo') { f.comp.tipo = b.dataset.v; render(); return; }
  if (x === 'guardarComp') { guardarCompFac(); return; }
  if (x === 'vincular') {
    const ok = await cartel({ icono: '💸', titulo: 'Vincular este anticipo', html: '<p>Se vincula a la factura N° ' + esc(f.det.factura.numeroFactura) + '.</p>', si: 'Vincular' });
    if (!ok) return;
    try { await za('vincularAnticipoManual', ['__PIN__', f.detId, b.dataset.id]); toast('✓ Anticipo vinculado'); f.vinc = null; abrirDetalleFac(f.detId); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
    return;
  }
  if (x === 'guardarAnticipo') { guardarAnticipoFac(); return; }
  if (x === 'guardarPagoSF') { guardarPagoSFFac(); return; }
}

// ================================================================ FONDO FIJO
function estadoFF() {
  if (!ui.ff) ui.ff = { vista: 'resumen', res: null, archivos: {} };
  return ui.ff;
}

function htmlFondoFijo() {
  const f = estadoFF();
  const cuerpo = !zaP() ? '<div class="aviso amarillo">No se pudo conectar con ZehirutApp.</div>'
    : f.vista === 'fondeo' ? htmlFFFondeo() : f.vista === 'excel' ? htmlFFExcel() : htmlFFResumen();
  return barra({ fondeo: 'Registrar fondeo', excel: 'Bajar Excel' }[f.vista] || 'Fondo fijo', true) + '<div class="contenido"><div class="form">' + cuerpo + '</div></div>';
}

function atrasFondoFijo() {
  const f = estadoFF();
  if (f.vista !== 'resumen') { f.vista = 'resumen'; f.archivos = {}; render(); return true; }
  return false;
}

async function cargarFF() {
  const f = estadoFF();
  f.cargando = true;
  try { f.res = await za('obtenerResumenFondoFijo', ['__PIN__'], true); f.error = ''; } catch (e) { f.error = e.message; }
  f.cargando = false;
  if (ui.pantalla === 'fondofijo') render();
}

function htmlFFResumen() {
  const f = estadoFF();
  if (!f.res && !f.cargando && !f.error) setTimeout(cargarFF, 0);
  if (!f.res) return '<p class="vacio">' + (f.error ? '⚠️ ' + esc(f.error) : 'Cargando…') + '</p>';
  const s = f.res.saldo;
  let h = '<div class="saldo ' + (s < 0 ? 'negativo' : '') + '" style="margin-bottom:14px"><h3>Saldo de la caja chica</h3><div class="cant">' +
    (s < 0 ? '−' : '') + fmtMonto(Math.abs(s), 'PYG') + '<small>Gs.</small></div></div>' +
    // Con "Ver" en Fondo fijo (hoja Usuarios) no se registran ni eliminan fondeos.
    (puede('Fondo fijo', 'CARGAR') ? '<button class="btn" data-a="ff" data-x="fondeo" style="margin-bottom:16px">➕ Registrar fondeo</button>' : '') +
    '<h3 class="subt">Últimos movimientos</h3>';
  h += (f.res.ultimos || []).map((m, i) => '<button class="mov" data-a="ff" data-x="mov" data-i="' + i + '"><span class="tipo ' + (m.tipo === 'fondeo' ? 'Ingreso' : 'Consumo') + '">' +
    (m.tipo === 'fondeo' ? '⬇' : '⬆') + '</span><span class="cuerpo"><b>' + esc(m.tipo === 'fondeo' ? 'Fondeo' : (m.proveedor || '')) + '</b><small>' + esc(m.fecha) +
    (m.detalle ? ' · ' + esc(m.detalle) : '') + (m.numero ? ' · ' + esc(m.numero) : '') + '</small></span><span class="num">' + (m.tipo === 'fondeo' ? '+' : '−') +
    fmtMonto(m.haber || m.debe, 'PYG') + (m.moneda && m.moneda !== 'PYG' ? '<br><small>' + esc(m.moneda) + '</small>' : '') + '</span></button>').join('') || '<p class="vacio">Sin movimientos.</p>';
  return h + '<div class="pie-stock"><button class="btn sec chico" data-a="ff" data-x="excel">📥 Bajar Excel</button></div>';
}

function htmlFFFondeo() {
  const f = estadoFF();
  const a = f.fon || (f.fon = { fecha: hoyISO(), descripcion: 'Reposición FF' });
  return '<div class="campo"><label for="fo-fecha">Fecha</label><input class="txt" type="date" id="fo-fecha" value="' + esc(a.fecha) + '" max="' + hoyISO() + '"></div>' +
    '<div class="campo"><label for="fo-monto">Monto (Gs.)</label><input class="txt" id="fo-monto" inputmode="decimal" value="' + esc(a.monto || '') + '"></div>' +
    '<div class="campo"><label for="fo-descripcion">Descripción</label><input class="txt" id="fo-descripcion" value="' + esc(a.descripcion) + '"></div>' +
    '<div class="campo"><span class="etq">Comprobante de la transferencia <small>(opcional)</small></span>' + htmlElegirArchivo('fondeo') + '</div>' +
    '<button class="btn" data-a="ff" data-x="guardarFondeo"' + (a.guardando ? ' disabled' : '') + '>' + (a.guardando ? 'Guardando…' : 'Guardar fondeo') + '</button>';
}

function htmlFFExcel() {
  const f = estadoFF();
  const e = f.xls || (f.xls = { desde: hoyISO().slice(0, 8) + '01' < FF_INICIO ? FF_INICIO : hoyISO().slice(0, 8) + '01', hasta: hoyISO() });
  return '<div class="aviso">Mismo formato que la planilla del Fondo Fijo: saldo anterior, gastos (debe), fondeos (haber) y saldo con fórmula.</div>' +
    '<div class="fila2"><div class="campo"><label for="fx-desde">Desde</label><input class="txt" type="date" id="fx-desde" value="' + e.desde + '" min="' + FF_INICIO + '"></div>' +
    '<div class="campo"><label for="fx-hasta">Hasta</label><input class="txt" type="date" id="fx-hasta" value="' + e.hasta + '" min="' + FF_INICIO + '"></div></div>' +
    '<button class="btn" data-a="ff" data-x="bajarExcel">📥 Bajar Excel</button>';
}

async function accionFF(b) {
  const f = estadoFF();
  const x = b.dataset.x;
  if (x === 'fondeo') { f.fon = null; f.archivos = {}; f.vista = 'fondeo'; render(); return; }
  if (x === 'excel') { f.vista = 'excel'; render(); return; }
  if (x === 'bajarExcel') {
    f.xls.desde = $('#fx-desde').value; f.xls.hasta = $('#fx-hasta').value;
    toast('Armando el Excel…', 15000);
    try { descargarBase64(await za('exportarFondoFijoExcel', ['__PIN__', f.xls.desde, f.xls.hasta], true), 'Fondo Fijo.xlsx'); toast('✓ Excel descargado'); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
    return;
  }
  if (x === 'guardarFondeo') {
    const a = f.fon;
    leerCampos('fo-', a, ['fecha', 'monto', 'descripcion']);
    const monto = montoParaGuardar(a.monto);
    if (!a.fecha) { toast('Ingresá la fecha.', 3000); return; }
    if (!(Number(monto) > 0)) { toast('Ingresá el monto.', 3000); return; }
    a.guardando = true; render();
    try {
      const arch = f.archivos.fondeo ? await prepararArchivo(f.archivos.fondeo) : { base64: '', tipo: '', nombre: '' };
      await za('registrarFondeoFondoFijo', [arch.base64, arch.tipo, arch.nombre, { fecha: isoADdmm(a.fecha), monto, descripcion: String(a.descripcion || '').trim() || 'Reposición FF' }, '__PIN__']);
      toast('✓ Fondeo registrado', 3000);
      f.fon = null; f.archivos = {}; f.vista = 'resumen'; f.res = null;
      render();
    } catch (e) {
      a.guardando = false; render();
      cartel({ icono: '⚠️', titulo: 'No se pudo guardar', html: '<p>' + esc(e.message) + '</p>', si: 'Entendido', no: '' });
    }
    return;
  }
  if (x === 'mov') {
    const m = f.res.ultimos[Number(b.dataset.i)];
    if (m.tipo !== 'fondeo') { toast('Es un gasto: se corrige desde la factura, en Facturas.', 3000); return; }
    if (!puede('Fondo fijo', 'CARGAR')) return;
    const ok = await cartel({ icono: '🗑️', titulo: 'Eliminar fondeo', si: 'Eliminar', peligro: true,
      html: '<p>Fondeo del ' + esc(m.fecha) + ' por <b>' + fmtMonto(m.haber, 'PYG') + ' Gs.</b>' + (m.usuario ? ', cargado por ' + esc(m.usuario) : '') + '.</p>' });
    if (!ok) return;
    try { await za('eliminarFondeoFondoFijo', ['__PIN__', m.id]); toast('Fondeo eliminado'); f.res = null; render(); }
    catch (e) { toast('No se pudo: ' + e.message, 4000); }
  }
}

// ---------------------------------------------------------------- campos que se leen al escribir
function despuesDeRenderFac() {
  document.querySelectorAll('[data-archivo]').forEach((inp) => inp.addEventListener('change', () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const clave = inp.dataset.archivo;
    if (ui.pantalla === 'facturas' && clave === 'factura') { estadoFac().vista = 'carga'; leerFacturaElegida(file); return; }
    const st = ui.pantalla === 'fondofijo' ? estadoFF() : estadoFac();
    // Antes de redibujar, se guarda lo escrito en el formulario de la pantalla.
    if (st.ant) leerCampos('fa-', st.ant, ['proveedor', 'ruc', 'fecha', 'moneda', 'monto', 'motivo']);
    if (st.psf) { leerCampos('fp-', st.psf, ['proveedor', 'fecha', 'item', 'moneda', 'monto']); st.psf.unidad = ($('#fp-unidad') || {}).value; st.psf.forma = ($('#fp-forma') || {}).value; }
    if (st.fon) leerCampos('fo-', st.fon, ['fecha', 'monto', 'descripcion']);
    st.archivos = st.archivos || {};
    st.archivos[clave] = file;
    render();
  }));
  const elegir = $('#fac-elegir');
  if (elegir) elegir.addEventListener('change', () => {
    const file = elegir.files && elegir.files[0];
    if (!file) return;
    const f = estadoFac();
    f.archivos = {};
    if (elegir.dataset.destino === 'anticipo') { f.ant = null; f.archivos.anticipo = file; f.vista = 'anticipo'; render(); window.scrollTo(0, 0); }
    else { f.vista = 'carga'; render(); leerFacturaElegida(file); }
  });
  const q = $('#fac-q');
  if (q) {
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estadoFac().q = q.value.trim(); cargarListaFac(true); }, 500); });
  }
  const mes = $('#fac-mes');
  if (mes) mes.addEventListener('change', () => { estadoFac().mes = mes.value; cargarListaFac(true); });
  const albor = document.querySelector('[data-albor]');
  if (albor) albor.addEventListener('change', async () => {
    const f = estadoFac();
    const valor = albor.checked;
    f.det.factura.cargadoAlbor = valor;
    if (f.lista) f.lista.filas.forEach((r) => { if (String(r.id) === String(f.detId)) r.cargadoAlbor = valor; });
    try { await za('marcarCargadoAlbor', ['__PIN__', f.detId, valor]); toast(valor ? '✓ Marcada como cargada a Albor' : 'Desmarcada de Albor'); }
    catch (e) { f.det.factura.cargadoAlbor = !valor; toast('No se pudo: ' + e.message, 4000); }
    render();
  });
  const otras = document.querySelector('[data-otras]');
  if (otras) otras.addEventListener('change', async () => {
    const c = estadoFac().comp;
    c.verOtras = otras.checked;
    render();
    if (c.verOtras && !c.otras) {
      try { c.otras = await za('listarFacturasMismoProveedor', ['__PIN__', estadoFac().detId], true); } catch (e) { c.otras = []; toast(e.message, 3000); }
      render();
    }
  });
  document.querySelectorAll('[data-otra]').forEach((c) => c.addEventListener('change', () => {
    const l = estadoFac().comp.elegidas;
    const i = l.indexOf(c.dataset.otra);
    if (c.checked && i === -1) l.push(c.dataset.otra); else if (!c.checked && i !== -1) l.splice(i, 1);
  }));
  const vinc = $('#fac-vinc');
  if (vinc) vinc.addEventListener('input', () => buscarAnticipoFac(vinc.value));
  // Montos: al salir del campo se muestran con el formato de la moneda.
  [['ff-monto', 'ff-moneda'], ['ff-iva5', 'ff-moneda'], ['ff-iva10', 'ff-moneda'], ['fa-monto', 'fa-moneda'], ['fp-monto', 'fp-moneda'], ['fo-monto', null]].forEach(([c, m]) => {
    const el = $('#' + c);
    if (el) el.addEventListener('blur', () => { el.value = fmtMonto(montoParaGuardar(el.value), m && $('#' + m) ? $('#' + m).value : 'PYG'); });
  });
}
