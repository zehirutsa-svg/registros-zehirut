// Registros Zehirut — lista inicial de productos de Sanidad (se agrega una sola vez, ver
// asegurarSanidad_ en Code.gs). Sale de la hoja INVENTARIO de la planilla "Inventario y stock de
// medicamentos" (30/09/2026). Después se editan desde la app (Configurar productos).
// [Producto, Rubro, Unidad, Contenido por unidad, Unidad del contenido]
const PRODUCTOS_SANIDAD = [
  ['4 x 2', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['ACUPRIN', 'Medicamentos', 'frasco', 500, 'ml'],
  ['AD3E', 'Medicamentos', 'frasco', 250, 'ml'],
  ['ADAPTADOR MIN', 'Medicamentos', 'frasco', 500, 'ml'],
  ['ADAPTADOR VIT', 'Medicamentos', 'frasco', 500, 'ml'],
  ['ADE', 'Medicamentos', 'frasco', 500, 'ml'],
  ['ALCOHOL', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['ALGIMINE', 'Medicamentos', 'frasco', 100, 'ml'],
  ['ANTOTOXICO', 'Medicamentos', 'frasco', 100, 'ml'],
  ['ASCINDEL PLUS 2,5L', 'Medicamentos', 'bidón', 2500, 'ml'],
  ['B12', 'Medicamentos', 'frasco', 50, 'ml'],
  ['BAGODRYL', 'Medicamentos', 'bidón', 5000, 'ml'],
  ['BAGODRYL 1L', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['BERTAC', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['BIOXAN', 'Medicamentos', 'frasco', 500, 'ml'],
  ['BOVISAN TOTAL 100 ml', 'Medicamentos', 'frasco', 100, 'ml'],
  ['BOVISAN TOTAL 250 ml', 'Medicamentos', 'frasco', 250, 'ml'],
  ['BUMERANG 3,15%', 'Medicamentos', 'frasco', 500, 'ml'],
  ['CIDENTAL 250 ml', 'Medicamentos', 'frasco', 250, 'ml'],
  ['CIDENTAL 500 ml', 'Medicamentos', 'frasco', 500, 'ml'],
  ['CIPERSIN', 'Medicamentos', 'bidón', 5000, 'ml'],
  ['CLOSTRISAN 11 100 ml', 'Medicamentos', 'frasco', 100, 'ml'],
  ['CLOSTRISAN 11 250 ml', 'Medicamentos', 'frasco', 250, 'ml'],
  ['COLIRIOS SPRY', 'Medicamentos', 'frasco', 125, 'ml'],
  ['COMPLEVIT', 'Medicamentos', 'frasco', 500, 'ml'],
  ['CURACEF DUO', 'Medicamentos', 'frasco', 100, 'ml'],
  ['DICLOFENACO 50', 'Medicamentos', 'frasco', 50, 'ml'],
  ['ECTOLINE', 'Medicamentos', 'bidón', 5000, 'ml'],
  ['ECTOLINE SPRY', 'Medicamentos', 'frasco', 500, 'ml'],
  ['EQUIMAX', 'Medicamentos', 'frasco', 100, 'ml'],
  ['FLOK', 'Medicamentos', 'frasco', 500, 'ml'],
  ['FOR BOX 2,5 L', 'Medicamentos', 'bidón', 2500, 'ml'],
  ['FORT UP', 'Medicamentos', 'frasco', 500, 'ml'],
  ['FORTIBIOTICO', 'Medicamentos', 'frasco', 20, 'ml'],
  ['FOSFOSAN', 'Medicamentos', 'frasco', 500, 'ml'],
  ['GALMETRIN PLUS SPRY', 'Medicamentos', 'frasco', 440, 'ml'],
  ['GALMETRIN POMADA', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['GEMICIN SPRY', 'Medicamentos', 'frasco', 250, 'ml'],
  ['GUANTE LATEX', 'Medicamentos', 'caja', 100, 'un'],
  ['HEPATONIC', 'Medicamentos', 'frasco', 100, 'ml'],
  ['IMIDOGAN', 'Medicamentos', 'frasco', 100, 'ml'],
  ['IMPACTO 5L', 'Medicamentos', 'bidón', 5000, 'ml'],
  ['JERINGA DESECHABLE 10 ml', 'Medicamentos', 'unidad', '', ''],
  ['JERINGA DESECHABLE 20 ml', 'Medicamentos', 'unidad', '', ''],
  ['JERINGA DESECHABLE 3 ml', 'Medicamentos', 'unidad', '', ''],
  ['JERINGA DESECHABLE 50 ml', 'Medicamentos', 'unidad', '', ''],
  ['LEPTO 8 240 ml', 'Medicamentos', 'frasco', 240, 'ml'],
  ['LEPTO 8 45 ml', 'Medicamentos', 'frasco', 45, 'ml'],
  ['MAGNECAL PLUS', 'Medicamentos', 'frasco', 500, 'ml'],
  ['MASTER LP 4%', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['MAXFLOR L.A.', 'Medicamentos', 'frasco', 50, 'ml'],
  ['MAXIBIOTIC', 'Medicamentos', 'frasco', 250, 'ml'],
  ['MEXIVER MAX 1%', 'Medicamentos', 'frasco', 500, 'ml'],
  ['MEXIVER TOP 3.15%', 'Medicamentos', 'frasco', 500, 'ml'],
  ['NEUMOSAN', 'Medicamentos', 'frasco', 250, 'ml'],
  ['NOPIETIN', 'Medicamentos', 'frasco', 500, 'ml'],
  ['OVERBIOTIC', 'Medicamentos', 'frasco', 100, 'ml'],
  ['PARAXANE', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['PHARMAPRIM', 'Medicamentos', 'frasco', 100, 'ml'],
  ['POLICALCINA FORTE', 'Medicamentos', 'frasco', 500, 'ml'],
  ['RABATVAC', 'Medicamentos', 'frasco', 100, 'ml'],
  ['ROTATEC J5', 'Medicamentos', 'frasco', 120, 'ml'],
  ['SELENIE', 'Medicamentos', 'frasco', 250, 'ml'],
  ['SHOTAPEN', 'Medicamentos', 'frasco', 100, 'ml'],
  ['SKIPPER', 'Medicamentos', 'frasco', 500, 'ml'],
  ['SOROVITA COMPLEX', 'Medicamentos', 'frasco', 500, 'ml'],
  ['STAND UP', 'Medicamentos', 'frasco', 100, 'ml'],
  ['SUIFERRO FUERTE', 'Medicamentos', 'frasco', 50, 'ml'],
  ['SUPLENUT', 'Medicamentos', 'frasco', 500, 'ml'],
  ['SUPRATICK', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['TINTURA DE YODO', 'Medicamentos', 'frasco', 1000, 'ml'],
  ['TRISTEZINA', 'Medicamentos', 'frasco', 20, 'ml'],
  ['UMBICURA', 'Medicamentos', 'frasco', 250, 'ml'],
  ['VERRUGAL', 'Medicamentos', 'frasco', 20, 'ml'],
  ['ZUPREVO', 'Medicamentos', 'frasco', 100, 'ml'],
  ['ZURONTOP', 'Medicamentos', 'bidón', 5000, 'ml'],
  ['APLICADOR DIB', 'Insumos IATF', 'unidad', '', ''],
  ['BIOESTROGEN', 'Insumos IATF', 'frasco', 100, 'ml'],
  ['BURESELINA', 'Insumos IATF', 'frasco', 50, 'ml'],
  ['CRONI-CIP', 'Insumos IATF', 'frasco', 100, 'ml'],
  ['ECEGON 100 ml', 'Insumos IATF', 'frasco', 100, 'ml'],
  ['ECEGON 20 ml', 'Insumos IATF', 'frasco', 20, 'ml'],
  ['ENZAPROST 100 ml', 'Insumos IATF', 'frasco', 100, 'ml'],
  ['ENZAPROST 20 ml', 'Insumos IATF', 'frasco', 20, 'ml'],
  ['GONAXAL', 'Insumos IATF', 'frasco', 50, 'ml'],
  ['GUANTE DE TACTO', 'Insumos IATF', 'caja', 100, 'un'],
  ['PROGESTAR (DISPOSITIVO)', 'Insumos IATF', 'caja', 10, 'un'],
  ['VAINAS', 'Insumos IATF', 'unidad', '', ''],
  ['SEMEN BN LEBRON', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR BAQUEANO', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR CAPITANEJO', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR EFICIENTE', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR MATE', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR PROFESOR', 'Semen', 'pajuela', '', ''],
  ['SEMEN BR RON', 'Semen', 'pajuela', '', ''],
  ['SEMEN MISSOURI BR', 'Semen', 'pajuela', '', ''],
  ['SEMEN RA BORAN', 'Semen', 'pajuela', '', ''],
  ['SEMEN ROBUSTO BN', 'Semen', 'pajuela', '', ''],
];

// ---------------------------------------------------------------- conexión con la app de la estancia
// La sanidad se carga por animal en la app de la estancia (app.laprudencia.com.py). Su servidor
// llama acá cada 15 minutos (scripts/sincronizar_sanidad.py de ese proyecto) con una clave
// compartida (propiedad CLAVE_ESTANCIA del script, nunca en el código: el repositorio es público):
//   manda  { accion: 'estancia', clave, desde, hasta, consumos: [{ fecha, producto, unidad: ml|un, total, animales }] }
//          (total por día y producto de los últimos 30 días, ya sumado)
//   recibe { productos: [...] } — la lista de Sanidad, para el desplegable de allá.
// Cada día × producto es UN consumo con ID "SAN-AAAA-MM-DD-<producto>", que se reescribe en cada
// llamada (si allá se corrige o se borra una sanidad, acá se corrige solo). Cuenta recién desde el
// primer conteo del producto (su stock inicial): lo aplicado antes ya está en ese conteo.

const PREFIJO_ESTANCIA = 'SAN-';
const USUARIO_ESTANCIA = 'App de la estancia';

/** Una sola vez: guarda la clave compartida con el servidor de la estancia. Si ya hay una no la
 *  cambia (para cambiarla, borrar la propiedad CLAVE_ESTANCIA desde el editor del script). */
function fijarClaveEstancia_(body) {
  const c = String(body.clave || '');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(c)) throw new Error('clave inválida');
  return conLock_(() => {
    if (props_().getProperty('CLAVE_ESTANCIA')) throw new Error('la clave ya está configurada');
    props_().setProperty('CLAVE_ESTANCIA', c);
    return { ok: true };
  });
}

function estancia_(body) {
  const clave = props_().getProperty('CLAVE_ESTANCIA');
  if (!clave || String(body.clave || '') !== clave) throw new Error('clave incorrecta');
  const ss = SpreadsheetApp.getActive();
  return conLock_(() => {
    const insumos = leerInsumos_(ss).filter((i) => i.modulo === 'Sanidad');
    const r = aplicarConsumosEstancia_(ss, insumos, body);
    return {
      ok: true, cambios: r.cambios, errores: r.errores,
      productos: insumos.map((i) => ({ nombre: i.nombre, rubro: i.rubro, unidad: i.unidad, contenido: i.contenido, unidadContenido: i.unidadContenido, activo: i.activo })),
    };
  });
}

/** Deja los consumos "SAN-" del período igual a lo que mandó la estancia. */
function aplicarConsumosEstancia_(ss, insumos, body) {
  const ahora = new Date();
  const hoy = Utilities.formatDate(ahora, ZONA, 'yyyy-MM-dd');
  const desde = String(body.desde || '');
  const hasta = esFecha_(body.hasta) ? String(body.hasta) : hoy;
  if (!esFecha_(desde) || hasta < desde) throw new Error('período inválido');
  const porNombre = {};
  insumos.forEach((i) => { porNombre[i.nombre.toUpperCase()] = i; });
  const movs = leerMovimientos_(ss);
  // Stock inicial de cada producto = su primer conteo.
  const inicio = {};
  movs.forEach((m) => {
    if (!m.anulado && m.tipo === 'Conteo' && (!inicio[m.insumo] || m.fecha < inicio[m.insumo])) inicio[m.insumo] = m.fecha;
  });

  const errores = [];
  const deseados = {};
  (Array.isArray(body.consumos) ? body.consumos : []).forEach((c) => {
    const fecha = String(c.fecha || '');
    const total = Number(c.total);
    const unidad = c.unidad === 'un' ? 'un' : 'ml';
    if (!esFecha_(fecha) || fecha < desde || fecha > hasta || !(total > 0)) return;
    const i = porNombre[String(c.producto || '').trim().toUpperCase()];
    if (!i) { errores.push(c.producto + ': no está en la lista de Sanidad'); return; }
    let cant;
    if (i.contenido && i.unidadContenido === unidad) cant = total / i.contenido;
    else if (!i.contenido && unidad === 'un') cant = total;
    else { errores.push(i.nombre + ': se aplicó en ' + unidad + ' y el producto se cuenta en ' + (i.unidadContenido || 'unidades')); return; }
    if (!inicio[i.nombre] || fecha < inicio[i.nombre]) return;   // antes del stock inicial
    const id = PREFIJO_ESTANCIA + fecha + '-' + i.nombre;
    const d = deseados[id] || (deseados[id] = { fecha, insumo: i, cantidad: 0, total: 0, animales: 0, unidad });
    d.cantidad += cant;
    d.total += total;
    d.animales += Number(c.animales) || 0;
  });
  const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const notaDe = (d) => miles(d.total) + ' ' + d.unidad + ' · ' + d.animales + (d.animales === 1 ? ' animal' : ' animales');
  const r3 = (n) => Math.round(n * 1000) / 1000;

  const sh = ss.getSheetByName('Movimientos');
  let cambios = 0;
  movs.filter((m) => m.id.indexOf(PREFIJO_ESTANCIA) === 0 && m.fecha >= desde && m.fecha <= hasta).forEach((m) => {
    const d = deseados[m.id];
    delete deseados[m.id];
    if (!d) {
      if (!m.anulado) { sh.getRange(m.fila, 16, 1, 2).setValues([[true, USUARIO_ESTANCIA + ': ya no hay aplicaciones ese día']]); cambios++; }
      return;
    }
    const cant = r3(d.cantidad);
    const nota = notaDe(d);
    if (m.anulado || Math.abs(m.cantidad - cant) > 1e-9 || m.nota !== nota) {
      sh.getRange(m.fila, 5).setValue(cant);
      sh.getRange(m.fila, 12).setValue(nota);
      sh.getRange(m.fila, 16, 1, 2).setValues([[false, '']]);
      cambios++;
    }
  });
  const nuevas = Object.keys(deseados).sort().map((id, n) => {
    const d = deseados[id];
    return filaMov_([id, d.fecha, 'Consumo', d.insumo.nombre, r3(d.cantidad), d.insumo.unidad, '', '', '', '', '', notaDe(d),
      USUARIO_ESTANCIA, '', ahora, false, '', ahora.getTime() + n]);
  });
  if (nuevas.length) sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, COLS_MOV.length).setValues(nuevas);
  cambios += nuevas.length;

  props_().setProperty('ESTANCIA_ULTIMA', String(ahora.getTime()));
  const firma = errores.slice().sort().join('\n');
  const log = [];
  if (cambios) log.push([ahora, USUARIO_ESTANCIA, 'Consumos de sanidad', cambios + ' día(s) × producto actualizados', 'Aplicado', '']);
  if (firma !== (props_().getProperty('ESTANCIA_ERRORES') || '')) {
    props_().setProperty('ESTANCIA_ERRORES', firma);
    if (firma) log.push([ahora, USUARIO_ESTANCIA, 'Consumos de sanidad', firma.slice(0, 1000), 'Rechazado: no se descontaron', '']);
  }
  registrar_(ss, log);
  if (cambios) reconstruirStock_(ss);
  return { cambios, errores };
}

/** Para la app: cuándo llamó la estancia por última vez y qué no pudo descontar. */
function estadoEstancia_() {
  const ultima = Number(props_().getProperty('ESTANCIA_ULTIMA')) || 0;
  const errores = props_().getProperty('ESTANCIA_ERRORES') || '';
  return { ultima, errores: errores ? errores.split('\n') : [] };
}
