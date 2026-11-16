// ---------------------------------------------------------------- Facturas → stock (16/11/2026)
// Pedido del usuario: al cargar la foto de una factura de medicamentos/insumos veterinarios, sus ítems
// entran solos al stock de Sanidad, sin cargarlos de nuevo a mano.
//
// - Equivalencias (hoja "Equivalencias de facturas"): proveedor + ítem de la factura (código, o la
//   descripción normalizada) → producto del stock y factor (1 en la factura = N unidades del stock;
//   p. ej. caja de 100 vainas cargada por vaina). Se aprenden la primera vez que alguien con Sanidad
//   ≥ Cargar asigna el ítem en el detalle de la factura; desde ahí, ese ítem de ese proveedor va solo.
//   "(no es stock)" también se aprende (flete, consulta del veterinario…).
// - "Facturas al stock" (hoja): una fila por ítem de cada factura "activa" (estado, producto, cantidad,
//   ID del ingreso). Que haya filas = la factura participa del stock; se reescribe en cada sincronización.
//   Las facturas cargadas antes de esto no se tocan solas (ya se contaron a mano): en su detalle está
//   "Pasar ítems al stock".
// - Ingresos: Movimientos con ID FAC-<facturaId>-<ítem>-<marca>. Corregir la factura vuelve a calcularlos
//   (lo que cambió se anula y se carga de nuevo); eliminarla anula los suyos.
// - No duplica: si ya hay un Ingreso a mano del producto con el mismo N° de factura, o uno "sin factura"
//   con la misma cantidad y ±20 días, no se carga otro (al segundo se le asocia el N° de factura).
// Gancho: zehirut_ (Code.gs) llama a facturaStockTrasZA_ después de guardar / corregir / eliminar /
// ver una factura. Pantalla: docs/facturas.js (tarjeta Ítems del detalle).

const HOJA_EQUIV = 'Equivalencias de facturas';
const COLS_EQUIV = ['Proveedor (clave)', 'Ítem (clave)', 'Proveedor', 'Descripción en la factura', 'Insumo', 'Factor', 'Cargado por', 'Fecha'];
const HOJA_FACSTOCK = 'Facturas al stock';
const COLS_FACSTOCK = ['Factura ID', 'Fecha factura', 'N° factura', 'Proveedor', 'Ítem', 'Código', 'Descripción', 'Cantidad factura',
  'Insumo', 'Factor', 'Cantidad stock', 'Estado', 'Movimiento', 'Fecha ingreso', 'Actualizado', 'Sugerido'];
const NO_ES_STOCK = '(no es stock)';
const PREFIJO_FAC = 'FAC-';
const MODULOS_FAC_STOCK = ['Sanidad'];
const ESTADOS_FAC = { cargado: 'Cargado', aMano: 'Ya cargado a mano', porAsignar: 'Por asignar', noStock: 'No es stock', ignorado: '' };
const PALABRAS_VACIAS = { X: 1, DE: 1, ML: 1, CC: 1, UN: 1, UND: 1, UNID: 1, LT: 1, LTS: 1, L: 1, KG: 1, GR: 1, G: 1, FRASCO: 1, FCO: 1,
  CAJA: 1, CJ: 1, BIDON: 1, POR: 1, CON: 1, Y: 1, LA: 1, EL: 1, P: 1, DOSIS: 1, PAQUETE: 1, PAQ: 1, SOBRE: 1, ENVASE: 1 };

// ---- normalización
function normalFac_(s) {
  return String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const numFac_ = (n) => String(n || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
function provClave_(f) {
  const ruc = String(f.ruc || '').split('-')[0].replace(/\D/g, '');
  return ruc ? 'RUC:' + ruc : 'N:' + normalFac_(f.proveedor);
}
function itemClaves_(it) {
  const c = [];
  const cod = normalFac_(it.codigo);
  if (cod) c.push('C:' + cod);
  const d = normalFac_(it.descripcion);
  if (d) c.push('D:' + d);
  return c;
}
/** Cantidad de la factura ("2", "2,00", "1.000", "1.5") → número. */
function cantFac_(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
function isoDeDdmm_(t) {
  const m = String(t || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function marcaFac_(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}
const redondeoFac_ = (n) => Math.round(n * 1000) / 1000;

// ---- hojas
function leerEquivalencias_(ss) {
  const sh = hoja_(ss, HOJA_EQUIV, COLS_EQUIV);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS_EQUIV.length).getValues().map((f, i) => ({
    fila: i + 2, prov: String(f[0]), item: String(f[1]), insumo: String(f[4]), factor: Number(f[5]) || 1,
  })).filter((e) => e.prov && e.item && e.insumo);
}

/** Guarda (o reemplaza) la equivalencia de un ítem de este proveedor, con todas sus claves. */
function aprenderEquivalencia_(ss, u, factura, item, insumo, factor) {
  const sh = hoja_(ss, HOJA_EQUIV, COLS_EQUIV);
  const prov = provClave_(factura);
  const claves = itemClaves_(item);
  const equivs = leerEquivalencias_(ss);
  const ahora = new Date();
  claves.forEach((k) => {
    const fila = [prov, k, factura.proveedor, item.descripcion || '', insumo, factor, u.nombre, ahora];
    const ya = equivs.find((e) => e.prov === prov && e.item === k);
    if (ya) sh.getRange(ya.fila, 1, 1, COLS_EQUIV.length).setValues([fila]);
    else sh.appendRow(fila);
  });
}

function leerFilasFacStock_(ss, facturaId) {
  const sh = hoja_(ss, HOJA_FACSTOCK, COLS_FACSTOCK);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const id = String(facturaId);
  return sh.getRange(2, 1, n - 1, COLS_FACSTOCK.length).getValues()
    .map((f, i) => ({ fila: i + 2, v: f }))
    .filter((x) => facturaId == null || String(x.v[0]) === id);
}

function borrarFilasFacStock_(ss, facturaId) {
  const sh = hoja_(ss, HOJA_FACSTOCK, COLS_FACSTOCK);
  leerFilasFacStock_(ss, facturaId).map((x) => x.fila).sort((a, b) => b - a).forEach((f) => sh.deleteRow(f));
}

// ---- sugerencia de producto (para los ítems que todavía no se asignaron)
function tokensFac_(s) {
  return normalFac_(s).split(' ').filter((t) => t && !PALABRAS_VACIAS[t]);
}
/** Producto del stock cuyo nombre aparece en la descripción del ítem: el nombre seguido ("AD3E", "B12"),
 *  o todas sus palabras sueltas si alguna tiene 3+ letras ("CIDENTAL 500 ml" en "CIDENTAL X 500ML").
 *  Si hay varios, el de nombre más largo; con la presentación como desempate. */
function sugerirProducto_(item, productos) {
  const tk = {};
  tokensFac_(item.descripcion).concat(tokensFac_(item.codigo)).forEach((t) => { tk[t] = true; });
  const texto = ' ' + normalFac_(item.descripcion) + ' ' + normalFac_(item.codigo) + ' ';
  let mejor = null;
  productos.forEach((p) => {
    const pt = tokensFac_(p.nombre);
    const nom = normalFac_(p.nombre);
    const seguido = nom.replace(/ /g, '').length >= 3 && texto.indexOf(' ' + nom + ' ') !== -1;
    const sueltas = pt.length && pt.some((t) => /[A-Z]{3,}/.test(t)) && pt.every((t) => tk[t]);
    if (!seguido && !sueltas) return;
    const puntos = pt.length * 10 + (p.contenido && tk[String(p.contenido)] ? 5 : 0) + (p.activo ? 1 : 0);
    if (!mejor || puntos > mejor.puntos) mejor = { nombre: p.nombre, puntos };
  });
  return mejor ? mejor.nombre : '';
}

// ---- plan: qué debería haber en el stock por esta factura
function productosFacStock_(insumos) {
  return insumos.filter((i) => MODULOS_FAC_STOCK.indexOf(i.modulo) !== -1);
}

function planFacturaStock_(ss, det, insumos, equivs) {
  const f = det.factura;
  const prov = provClave_(f);
  const productos = productosFacStock_(insumos);
  const porNombre = {};
  productos.forEach((p) => { porNombre[p.nombre] = p; });
  const delProv = equivs.filter((e) => e.prov === prov);
  const provSanitario = delProv.some((e) => e.insumo !== NO_ES_STOCK) ||
    productos.some((p) => p.proveedor && normalFac_(p.proveedor) && normalFac_(f.proveedor).indexOf(normalFac_(p.proveedor).split(' ')[0]) !== -1);
  return (det.items || []).map((it, i) => {
    const claves = itemClaves_(it);
    let eq = null;
    claves.some((k) => (eq = delProv.find((e) => e.item === k)));
    const cant = cantFac_(it.cantidad);
    const r = { i, codigo: String(it.codigo || ''), descripcion: String(it.descripcion || ''), cantidadFactura: cant, insumo: '', factor: 1,
      cantidad: 0, estado: 'ignorado', sugerido: '' };
    if (eq && eq.insumo === NO_ES_STOCK) { r.estado = 'noStock'; return r; }
    if (eq && porNombre[eq.insumo]) {
      r.insumo = eq.insumo; r.factor = eq.factor; r.cantidad = redondeoFac_(cant * eq.factor); r.estado = 'cargado';
      if (!(r.cantidad > 0)) { r.estado = 'porAsignar'; r.sugerido = eq.insumo; }
      return r;
    }
    r.sugerido = sugerirProducto_(it, productos);
    if (r.sugerido || provSanitario) r.estado = 'porAsignar';
    return r;
  });
}

// ---- sincronizar: deja Movimientos y "Facturas al stock" como dice el plan
/** det = { factura, items } (lo que devuelve ZA.obtenerDetalleFactura). fechaIngreso opcional (ISO) la fija. */
function sincronizarFacturaStock_(ss, u, det, fechaIngreso) {
  return conLock_(() => {
    const f = det.factura;
    const fid = String(f.id);
    const insumos = leerInsumos_(ss);
    const porNombre = {};
    insumos.forEach((i) => { porNombre[i.nombre] = i; });
    const previas = leerFilasFacStock_(ss, fid);
    const fecha = esFecha_(fechaIngreso) ? fechaIngreso
      : (previas.length && esFecha_(iso_(previas[0].v[13])) ? iso_(previas[0].v[13]) : '') || isoDeDdmm_(f.fecha) ||
        Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    const plan = planFacturaStock_(ss, det, insumos, leerEquivalencias_(ss));
    const shM = ss.getSheetByName('Movimientos');
    const movs = leerMovimientos_(ss);
    const prefijo = PREFIJO_FAC + fid + '-';
    const propios = movs.filter((m) => m.id.indexOf(prefijo) === 0);
    const numero = numFac_(f.numeroFactura);
    const usados = {};
    const deseados = {};
    const nuevas = [];
    const ahora = new Date();
    const ts = ahora.getTime();
    const log = [];
    let cambio = false;

    plan.forEach((p) => {
      if (p.estado !== 'cargado') return;
      // ¿Ya está cargado a mano? (mismo producto y N° de factura, o "sin factura" con igual cantidad y fecha cercana)
      const aMano = movs.find((m) => !m.anulado && m.tipo === 'Ingreso' && m.insumo === p.insumo && m.id.indexOf(PREFIJO_FAC) !== 0 &&
        !usados[m.id] && numero && numFac_(m.factura) === numero);
      const sinFac = aMano ? null : movs.find((m) => !m.anulado && m.tipo === 'Ingreso' && m.insumo === p.insumo && m.id.indexOf(PREFIJO_FAC) !== 0 &&
        !usados[m.id] && !m.factura && Math.abs(m.cantidad - p.cantidad) < 0.001 &&
        Math.abs((new Date(m.fecha) - new Date(fecha)) / 86400000) <= 20);
      const ya = aMano || sinFac;
      if (ya) {
        usados[ya.id] = true;
        p.estado = 'aMano';
        p.mov = ya.id;
        p.nota = 'Ingreso del ' + ddmmaaaa_(ya.fecha) + ' cargado por ' + ya.usuario;
        if (sinFac) {
          shM.getRange(sinFac.fila, 11).setValue(f.numeroFactura);
          log.push([ahora, u.nombre, 'Factura al stock', 'Factura "' + f.numeroFactura + '" asociada al ingreso a mano de ' + p.insumo + ' (' + ddmmaaaa_(ya.fecha) + ')', 'Aplicado', ya.id]);
        }
        return;
      }
      const id = prefijo + (p.i + 1) + '-' + marcaFac_(p.insumo + '|' + p.cantidad + '|' + fecha);
      p.mov = id;
      deseados[id] = p;
    });

    // Anular lo que ya no corresponde; reactivar lo que vuelve a corresponder.
    propios.forEach((m) => {
      if (deseados[m.id]) {
        if (m.anulado) { shM.getRange(m.fila, 16, 1, 2).setValues([[false, '']]); cambio = true; }
        delete deseados[m.id];
      } else if (!m.anulado) {
        shM.getRange(m.fila, 16, 1, 2).setValues([[true, u.nombre + ': la factura cambió']]);
        log.push([ahora, u.nombre, 'Factura al stock', 'Anula ingreso ' + m.insumo + ' ' + m.cantidad + ' (factura ' + f.numeroFactura + ' corregida)', 'Aplicado', m.id]);
        cambio = true;
      }
    });
    Object.keys(deseados).forEach((id) => {
      const p = deseados[id];
      const ins = porNombre[p.insumo];
      nuevas.push(filaMov_([id, fecha, 'Ingreso', p.insumo, p.cantidad, ins ? ins.unidad : '', '', '', f.proveedor, '', f.numeroFactura,
        'Desde la factura: ' + texto_(p.descripcion, 150), u.nombre, '', ahora, false, '', ts, '', '', '', '', '']));
      log.push([ahora, u.nombre, 'Factura al stock', 'Ingreso ' + p.insumo + ' ' + p.cantidad + ' ' + (ins ? ins.unidad : '') + ' (' + ddmmaaaa_(fecha) +
        ') de la factura ' + f.numeroFactura + ' de ' + f.proveedor, 'Aplicado', id]);
    });
    if (nuevas.length) {
      shM.getRange(shM.getLastRow() + 1, 1, nuevas.length, COLS_MOV.length).setValues(nuevas);
      cambio = true;
    }

    // Estado de la factura
    borrarFilasFacStock_(ss, fid);
    const sh = hoja_(ss, HOJA_FACSTOCK, COLS_FACSTOCK);
    const filas = plan.map((p) => [fid, f.fecha, f.numeroFactura, f.proveedor, p.i + 1, p.codigo, p.descripcion, p.cantidadFactura,
      p.insumo, p.insumo ? p.factor : '', p.insumo ? p.cantidad : '', ESTADOS_FAC[p.estado], p.mov || '', fecha, ahora, p.sugerido]);
    if (filas.length) {
      // Fechas como texto (si no, Sheets puede leer 03/11 como 11 de marzo).
      sh.getRange('B:B').setNumberFormat('@');
      sh.getRange('N:N').setNumberFormat('@');
      sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS_FACSTOCK.length).setValues(filas);
    }
    registrar_(ss, log);
    if (cambio) { reconstruirStock_(ss); publicarDatosInforme_(ss); }
    return vistaDesdePlan_(plan, fecha, true, insumos);
  });
}

/** Factura eliminada: se anulan sus ingresos y se borra su estado. */
function anularFacturaStock_(ss, u, facturaId) {
  return conLock_(() => {
    const prefijo = PREFIJO_FAC + facturaId + '-';
    const shM = ss.getSheetByName('Movimientos');
    const ahora = new Date();
    const log = [];
    leerMovimientos_(ss).forEach((m) => {
      if (m.id.indexOf(prefijo) !== 0 || m.anulado) return;
      shM.getRange(m.fila, 16, 1, 2).setValues([[true, u.nombre + ': factura eliminada']]);
      log.push([ahora, u.nombre, 'Factura al stock', 'Anula ingreso ' + m.insumo + ' ' + m.cantidad + ' (factura eliminada)', 'Aplicado', m.id]);
    });
    borrarFilasFacStock_(ss, facturaId);
    registrar_(ss, log);
    if (log.length) { reconstruirStock_(ss); publicarDatosInforme_(ss); }
  });
}

function vistaDesdePlan_(plan, fecha, activo, insumos) {
  const unidad = {};
  insumos.forEach((i) => { unidad[i.nombre] = i.unidad; });
  return {
    activo, fechaIngreso: fecha,
    items: plan.map((p) => ({ i: p.i, estado: p.estado, insumo: p.insumo, factor: p.factor, cantidad: p.cantidad,
      unidad: unidad[p.insumo] || '', sugerido: p.sugerido, nota: p.nota || '' })),
    hayParaStock: plan.some((p) => p.estado !== 'ignorado'),
  };
}

/** Lo que ve el detalle: si la factura ya participa del stock, su estado guardado; si no, lo que pasaría. */
function vistaFacturaStock_(ss, det) {
  const insumos = leerInsumos_(ss);
  const filas = leerFilasFacStock_(ss, det.factura.id);
  if (!filas.length) {
    return vistaDesdePlan_(planFacturaStock_(ss, det, insumos, leerEquivalencias_(ss)), isoDeDdmm_(det.factura.fecha), false, insumos);
  }
  const clave = {};
  Object.keys(ESTADOS_FAC).forEach((k) => { clave[ESTADOS_FAC[k]] = k; });
  const plan = filas.map((x) => ({ i: Number(x.v[4]) - 1, insumo: String(x.v[8]), factor: Number(x.v[9]) || 1, cantidad: Number(x.v[10]) || 0,
    estado: clave[String(x.v[11])] || 'ignorado', mov: String(x.v[12]), sugerido: String(x.v[15] || '') }));
  // nota de los "ya cargado a mano"
  const conMano = plan.filter((p) => p.estado === 'aMano');
  if (conMano.length) {
    const porId = {};
    leerMovimientos_(ss).forEach((m) => { porId[m.id] = m; });
    conMano.forEach((p) => { const m = porId[p.mov]; if (m) p.nota = 'Ingreso del ' + ddmmaaaa_(m.fecha) + ' cargado por ' + m.usuario; });
  }
  return vistaDesdePlan_(plan, iso_(filas[0].v[13]) || isoDeDdmm_(det.factura.fecha), true, insumos);
}

// ---- gancho desde zehirut_ (Code.gs)
function puedeFacStock_(u) {
  return MODULOS_FAC_STOCK.some((m) => nivel_(u, m) >= NIVELES.CARGAR);
}

/** Después de una función de ZehirutApp: sincroniza el stock si corresponde. Nunca hace fallar la
 *  factura: si algo sale mal, queda en Registro y la respuesta lo avisa. */
function facturaStockTrasZA_(ss, u, fn, args, resultado, pin) {
  try {
    if (fn === 'guardarFactura') {
      const d = args[0] || {};
      // Primero con lo que se mandó (rápido): si ningún ítem tiene que ver con el stock, no se busca nada más.
      const previa = planFacturaStock_(ss, { factura: d, items: d.items || [] }, leerInsumos_(ss), leerEquivalencias_(ss));
      if (!previa.some((p) => p.estado !== 'ignorado')) return null;
      const det = detalleRecienGuardada_(pin, d);
      if (!det) return null;
      return resumenFacStock_(sincronizarFacturaStock_(ss, u, det), det.factura.id);
    }
    if (fn === 'actualizarFactura') {
      const fid = args[1];
      if (!leerFilasFacStock_(ss, fid).length) return null;   // no participa del stock
      return resumenFacStock_(sincronizarFacturaStock_(ss, u, ZA.obtenerDetalleFactura(pin, fid)), fid);
    }
    if (fn === 'eliminarFactura') {
      anularFacturaStock_(ss, u, String(args[1]));
      return null;
    }
    if (fn === 'obtenerDetalleFactura' && resultado && resultado.factura) {
      const v = vistaFacturaStock_(ss, resultado);
      v.puede = puedeFacStock_(u);
      if (!v.activo && !v.puede) return null;
      resultado.stock = v;
    }
  } catch (e) {
    registrar_(ss, [[new Date(), u.nombre, 'Factura al stock', fn, 'Rechazado: ' + String(e.message || e), '']]);
    return { error: String(e.message || e) };
  }
  return null;
}

/** La factura que se acaba de guardar (guardarFactura no devuelve el ID): la última con ese N° y proveedor. */
function detalleRecienGuardada_(pin, d) {
  const r = ZA.listarFacturas(pin, { query: String(d.numeroFactura || ''), limite: 20 });
  const n = numFac_(d.numeroFactura);
  const cand = ((r && r.filas) || []).filter((x) => numFac_(x.numeroFactura) === n && normalFac_(x.proveedor) === normalFac_(d.proveedor))
    .sort((a, b) => Number(b.id) - Number(a.id));
  return cand.length ? ZA.obtenerDetalleFactura(pin, cand[0].id) : null;
}

function resumenFacStock_(v, fid) {
  const c = (e) => v.items.filter((x) => x.estado === e).length;
  return { facturaId: fid, cargados: c('cargado'), porAsignar: c('porAsignar'), aMano: c('aMano') };
}

// ---- acción 'facturaStock' (desde el detalle de la factura)
// body: { pin, facturaId, op: 'asignar' | 'fecha' | 'activar', item, insumo, factor, fecha }
function facturaStock_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (!facturasVisibles_(u)) throw new Error('no ves facturas');
  if (!puedeFacStock_(u)) throw new Error('no tenés permiso para cargar en Sanidad');
  // Pasa por ZehirutApp: controla que esta persona pueda ver la factura y trae sus ítems.
  const det = ZA.obtenerDetalleFactura(String(body.pin), body.facturaId);
  const op = String(body.op || '');
  let fecha = null;
  if (op === 'asignar') {
    const it = (det.items || [])[Number(body.item)];
    if (!it) throw new Error('ese ítem no existe');
    const insumo = texto_(body.insumo, 80);
    let factor = 1;
    if (insumo !== NO_ES_STOCK) {
      const ins = leerInsumos_(ss).find((i) => i.nombre === insumo);
      if (!ins || MODULOS_FAC_STOCK.indexOf(ins.modulo) === -1) throw new Error('ese producto no está en el stock');
      exigir_(u, ins.modulo, 'CARGAR');
      factor = Number(String(body.factor || '1').replace(',', '.'));
      if (!(factor > 0) || factor > 100000) throw new Error('el factor tiene que ser un número mayor que 0');
    }
    aprenderEquivalencia_(ss, u, det.factura, it, insumo, factor);
  } else if (op === 'fecha') {
    if (!esFecha_(body.fecha)) throw new Error('fecha inválida');
    const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    if (body.fecha > hoy) throw new Error('la fecha no puede ser futura');
    fecha = body.fecha;
  } else if (op !== 'activar') {
    throw new Error('operación desconocida');
  }
  const v = sincronizarFacturaStock_(ss, u, det, fecha);
  v.puede = true;
  return { ok: true, stock: v };
}

/** Para el aviso de Sanidad: facturas con ítems "Por asignar". */
function facturasPorAsignar_(ss) {
  const sh = ss.getSheetByName(HOJA_FACSTOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  const por = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, COLS_FACSTOCK.length).getValues().forEach((f) => {
    if (String(f[11]) !== ESTADOS_FAC.porAsignar) return;
    const id = String(f[0]);
    (por[id] = por[id] || { id, fecha: iso_(f[1]) ? ddmmaaaa_(iso_(f[1])) : String(f[1]), numero: String(f[2]), proveedor: String(f[3]), n: 0 }).n++;
  });
  return Object.keys(por).map((k) => por[k]);
}
