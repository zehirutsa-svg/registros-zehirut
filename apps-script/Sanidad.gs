// Registros Zehirut — lista inicial de productos de Sanidad (se agrega una sola vez, ver
// asegurarSanidad_ en Code.gs). Sale de la hoja INVENTARIO de la planilla "Inventario y stock de
// medicamentos" (30/09/2026). Después se editan desde la app (Configurar productos).
// [Producto, Rubro, Unidad, Contenido por unidad, Unidad del contenido, Principio activo, Indicación, Laboratorio,
//  Proveedor, Dosis base, Peso base (kg)]
const PRODUCTOS_SANIDAD = [
  ['4 x 2', 'Medicamentos', 'frasco', 1000, 'ml', 'IVERMECTINA 1%', 'ANTIPARASITARIO INTERNO Y EXTERNO', 'CIBELES', 'CORONADO SRL', 1, 50],
  ['ACUPRIN', 'Medicamentos', 'frasco', 500, 'ml', 'MINERALES', 'TÓNICO', 'RICHMOND', 'MARKET SRL', 4, 500],
  ['AD3E', 'Medicamentos', 'frasco', 250, 'ml', 'VITAMINAS', 'VITAMÍNICO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 3, 500],
  ['ADAPTADOR MIN', 'Medicamentos', 'frasco', 500, 'ml', 'SUPLEMENTO MINERAL', 'TÓNICO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 4, 500],
  ['ADAPTADOR VIT', 'Medicamentos', 'frasco', 500, 'ml', 'SUPLEMENTO MINERAL', 'TÓNICO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 4, 500],
  ['ADE', 'Medicamentos', 'frasco', 500, 'ml', 'VITAMINAS', 'VITAMÍNICO', 'CHINFIELD S.A.', 'MARKET SRL', 1, 50],
  ['ALCOHOL', 'Materiales sanitarios', 'frasco', 1000, 'ml', '', 'DESINFECTANTE', 'FARMACIA', 'CONSULTPEC SRL', '', ''],
  ['ALGIMINE', 'Medicamentos', 'frasco', 100, 'ml', 'FLUNIXIN', 'ANTIFLAMATORIO', 'ZOOVET', 'AGROFIELD S.A.', 1, 10],
  ['ANTOTOXICO', 'Medicamentos', 'frasco', 100, 'ml', 'SUPLEMENTO VITAMÍNICO', 'DESINTOXICANTE', 'UCB', 'MARKET SRL', 1, 20],
  ['ASCINDEL PLUS 2,5L', 'Medicamentos', 'bidón', 2500, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 1, 10],
  ['B12', 'Medicamentos', 'frasco', 50, 'ml', 'B12', 'VITAMÍNICO', 'CHINFIELD S.A.', 'MARKET SRL', 5, 200],
  ['BAGODRYL', 'Materiales sanitarios', 'bidón', 5000, 'ml', 'AMONIO CUATERNARIO', 'DESINFECTANTE', 'BIOGÉNESIS', 'CONSULTPEC SRL', '', ''],
  ['BAGODRYL 1L', 'Materiales sanitarios', 'frasco', 1000, 'ml', 'AMONIO CUATERNARIO', 'DESINFECTANTE', 'BIOGÉNESIS', 'CONSULTPEC SRL', '', ''],
  ['BERTAC', 'Medicamentos', 'frasco', 1000, 'ml', 'TRICLORFON', 'LARVICIDA LIQUIDA', 'PEARSON', 'COVEPA', '', ''],
  ['BIOXAN', 'Medicamentos', 'frasco', 500, 'ml', 'CALCIO, MAGNESIO, POTASIO', 'SUERO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 500, 500],
  ['BOVISAN TOTAL 100 ml', 'Medicamentos', 'frasco', 100, 'ml', 'VACUNA REPRODUCTIVA', 'ANTIABORTIVA', 'VIRBAC', 'CONSULTPEC SRL', 5, 500],
  ['BOVISAN TOTAL 250 ml', 'Medicamentos', 'frasco', 250, 'ml', 'VACUNA REPRODUCTIVA', 'ANTIABORTIVA', 'VIRBAC', 'CONSULTPEC SRL', 5, 500],
  ['BUMERANG 3,15%', 'Medicamentos', 'frasco', 500, 'ml', 'IVERMECTINA', 'ANTIPARASITARIO INTERNO', 'CIBELES', 'CORONADO SRL', 1, 50],
  ['CIDENTAL 250 ml', 'Medicamentos', 'frasco', 250, 'ml', 'CIHALOTRINA', 'ANTIPARASITARIO EXTERNO', 'BIMEDA', 'AZURES S.A.', '', ''],
  ['CIDENTAL 500 ml', 'Medicamentos', 'frasco', 500, 'ml', 'CIHALOTRINA', 'ANTIPARASITARIO EXTERNO', 'BIMEDA', 'AZURES S.A.', '', ''],
  ['CIPERSIN', 'Medicamentos', 'bidón', 5000, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', '', ''],
  ['CLOSTRISAN 11 100 ml', 'Medicamentos', 'frasco', 100, 'ml', 'CLOSTRIDIOSIS', 'VACUNA ANTI CLOSTRIDIUM', 'VIRBAC', 'CONSULTPEC SRL', 5, ''],
  ['CLOSTRISAN 11 250 ml', 'Medicamentos', 'frasco', 250, 'ml', 'CLOSTRIDIOSIS', 'VACUNA ANTI CLOSTRIDIUM', 'VIRBAC', 'CONSULTPEC SRL', 5, ''],
  ['COLIRIOS SPRY', 'Medicamentos', 'frasco', 125, 'ml', 'OXITETRACICLINA', 'ANTIBIÓTICO', 'ZOETIS', 'CONSULTPEC SRL', '', ''],
  ['COMPLEVIT', 'Medicamentos', 'frasco', 500, 'ml', 'MINERALES', 'TÓNICO', 'VIRBAC', 'CONSULTPEC SRL', 5, 200],
  ['CURACEF DUO', 'Medicamentos', 'frasco', 100, 'ml', 'CEFTIFOUR', 'ANTIBIÓTICO', 'VIRBAC', 'CONSULTPEC SRL', 1, 50],
  ['DICLOFENACO 50', 'Medicamentos', 'frasco', 50, 'ml', 'DICLOFENAC', 'ANTI INFLAMATORIO', 'OUROFINO', 'MARKET SRL', 1, 50],
  ['ECTOLINE', 'Medicamentos', 'bidón', 5000, 'ml', 'FIPRONIL', 'ANTIPARASITARIO EXTERNO', 'BOEHRINGER', 'CONSULTPEC SRL', 10, 100],
  ['ECTOLINE SPRY', 'Medicamentos', 'frasco', 500, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'BOEHRINGER', 'CONSULTPEC SRL', '', ''],
  ['EQUIMAX', 'Medicamentos', 'frasco', 100, 'ml', 'IVERMECTINA', 'ANTIPARASITARIO INTERNO Y EXTERNO', 'VIRBAC', 'CONSULTPEC SRL', 100, 400],
  ['FLOK', 'Medicamentos', 'frasco', 500, 'ml', 'DORAMCTINA', 'ANTIPARASITARIO INTERNO Y EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 1, 50],
  ['FOR BOX 2,5 L', 'Medicamentos', 'bidón', 2500, 'ml', 'FLUAZURON', 'ANTIPARASITARIO EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 10, 100],
  ['FORT UP', 'Medicamentos', 'frasco', 500, 'ml', 'IVERMECTINA 1% / MINERALES', 'ANTIPARASITARIO INTERNO / TÓNICO', 'VIRBAC', 'CONSULTPEC SRL', 1, 50],
  ['FORTIBIOTICO', 'Medicamentos', 'frasco', 20, 'ml', 'ESTREPTOMICINA', 'ANTIBIÓTICO', 'UCBVET', 'MARKET SRL', 1, 20],
  ['FOSFOSAN', 'Medicamentos', 'frasco', 500, 'ml', 'FÓSFORO', 'TÓNICO', 'VIRBAC', 'CONSULTPEC SRL', 5, 200],
  ['GALMETRIN PLUS SPRY', 'Medicamentos', 'frasco', 440, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', '', ''],
  ['GALMETRIN POMADA', 'Medicamentos', 'frasco', 1000, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', '', ''],
  ['GEMICIN SPRY', 'Medicamentos', 'frasco', 250, 'ml', 'GENTAMICINA', 'ANTIBIÓTICO', 'OVER', 'CONSULTPEC SRL', '', ''],
  ['GUANTE LATEX', 'Materiales sanitarios', 'caja', 100, 'un', '', '', '', '', '', ''],
  ['HEPATONIC', 'Medicamentos', 'frasco', 100, 'ml', 'ÁCIDO GENABÍLICO', 'DESINTOXICANTE', 'VIRBAC', 'CONSULTPEC SRL', 1, 10],
  ['IMIDOGAN', 'Medicamentos', 'frasco', 100, 'ml', 'IMIDOCARB', 'ANAPLASMOSIS', 'VIRBAC', 'CONSULTPEC SRL', 2.5, 100],
  ['IMPACTO 5L', 'Medicamentos', 'bidón', 5000, 'ml', 'CIPERMETRINA', 'ANTIPARASITARIO EXTERNO', 'OUROFINO', 'MARKET SRL', 10, 50],
  ['JERINGA DESECHABLE 10 ml', 'Materiales sanitarios', 'unidad', '', '', '', '', '', '', '', ''],
  ['JERINGA DESECHABLE 20 ml', 'Materiales sanitarios', 'unidad', '', '', '', '', '', '', '', ''],
  ['JERINGA DESECHABLE 3 ml', 'Materiales sanitarios', 'unidad', '', '', '', '', '', '', '', ''],
  ['JERINGA DESECHABLE 50 ml', 'Materiales sanitarios', 'unidad', '', '', '', '', '', '', '', ''],
  ['LEPTO 8 240 ml', 'Medicamentos', 'frasco', 240, 'ml', 'VACUNA REPRODUCTIVA', 'LEPTOSPIROSIS', 'VIRBAC', 'CONSULTPEC SRL', 3, 500],
  ['LEPTO 8 45 ml', 'Medicamentos', 'frasco', 45, 'ml', 'VACUNA REPRODUCTIVA', 'LEPTOSPIROSIS', 'VIRBAC', 'CONSULTPEC SRL', 3, 500],
  ['MAGNECAL PLUS', 'Medicamentos', 'frasco', 500, 'ml', 'MINERALES', 'TÓNICO', 'AGROINSUMOS', 'ASISTENCIA GANADERA', 1, 20],
  ['MASTER LP 4%', 'Medicamentos', 'frasco', 1000, 'ml', 'IVERMECTINA', 'ANTIPARASITARIO INTERNO', 'OURO FINO', 'MARKET SRL', 1, 50],
  ['MAXFLOR L.A.', 'Medicamentos', 'frasco', 50, 'ml', 'FLOFENICOL', 'ANTIBIÓTICO', 'VIRBAC', 'CONSULTPEC SRL', 1, 30],
  ['MAXIBIOTIC', 'Medicamentos', 'frasco', 250, 'ml', 'OXITETRACICLINA', 'ANTIBIÓTICO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 1, 10],
  ['MEXIVER MAX 1%', 'Medicamentos', 'frasco', 500, 'ml', 'IVERMECTINA 1%', 'ANTIPARASITARIO INTERNO Y EXTERNO', 'VIRBAC', 'CONSULTPEC SRL', 1, 50],
  ['MEXIVER TOP 3.15%', 'Medicamentos', 'frasco', 500, 'ml', 'IVERMECTINA 3,15 %', 'ANTIPARASITARIO INTERNO Y EXTERNO', 'VIRBAC', 'CONSULTPEC SRL', 1, 50],
  ['NEUMOSAN', 'Medicamentos', 'frasco', 250, 'ml', 'PASTEURELLA', 'VACUNA', 'VIRBAC', 'CONSULTPEC SRL', 5, ''],
  ['NOPIETIN', 'Medicamentos', 'frasco', 500, 'ml', 'SULFATO DE COBRE', 'ANTIPARASITARIO EXTERNO', 'GUAYAKI', 'GUAYAKI', '', ''],
  ['OVERBIOTIC', 'Medicamentos', 'frasco', 100, 'ml', 'LOPERAMIDA', 'ANTIDIARREICO', 'OVER', '', 1, 10],
  ['PARAXANE', 'Medicamentos', 'frasco', 1000, 'ml', 'RICOBENDAZOL', 'ANTIPARASITARIO INTERNO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 1, 40],
  ['PHARMAPRIM', 'Medicamentos', 'frasco', 100, 'ml', 'TRIMETOPRIM', 'ANTIDIARREICO', 'PHARMAVET', 'BIENESTAR ANIMAL', 1, 10],
  ['POLICALCINA FORTE', 'Medicamentos', 'frasco', 500, 'ml', 'CALCIO, MAGNESIO', 'SUERO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 500, 500],
  ['RABATVAC', 'Medicamentos', 'frasco', 100, 'ml', 'VIRUS ANTI RABICO', 'VACUNA ANTI RABICA', 'VIRBAC', 'CONSULTPEC SRL', 2, 500],
  ['ROTATEC J5', 'Medicamentos', 'frasco', 120, 'ml', 'ROTAVIRUS BOVINO SEROTIPOS 6 Y 10, ESCHERICHIA COLI J5', 'VACUNA NEONATAL DE TERNERO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 3, 500],
  ['SELENIE', 'Medicamentos', 'frasco', 250, 'ml', 'SELENIO', 'TÓNICO', 'VIRBAC', 'CONSULTPEC SRL', 1, 90],
  ['SHOTAPEN', 'Medicamentos', 'frasco', 100, 'ml', 'PENICILINA', 'ANTIBIÓTICO', 'VIRBAC', 'CONSULTPEC SRL', 1, 20],
  ['SKIPPER', 'Medicamentos', 'frasco', 500, 'ml', 'RICOBENDAZOL', 'ANTIPARASITARIO INTERNO', 'CIBELES', 'CORONADO SRL', 1, 40],
  ['SOROVITA COMPLEX', 'Medicamentos', 'frasco', 500, 'ml', 'POLIVITAMINICO, POLIMINERAL', 'SUERO', 'UCBVET', 'MARKET SRL', 500, 500],
  ['STAND UP', 'Medicamentos', 'frasco', 100, 'ml', 'IMIDOCARB', 'ANAPLASMOSIS', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2.5, 100],
  ['SUIFERRO FUERTE', 'Medicamentos', 'frasco', 50, 'ml', 'MINERALES', 'TÓNICO', 'CHINFIELD S.A.', 'MARKET SRL', 5, 400],
  ['SUPLENUT', 'Medicamentos', 'frasco', 500, 'ml', 'SUPLEMENTO MINERAL', 'TÓNICO', 'BIOGÉNESIS', 'CONSULTPEC SRL', 4, 500],
  ['SUPRATICK', 'Medicamentos', 'frasco', 1000, 'ml', 'FLUAZURON', 'ANTIPARASITARIO EXTERNO', 'OUROFINO', 'MARKET SRL', 10, 100],
  ['TINTURA DE YODO', 'Medicamentos', 'frasco', 1000, 'ml', 'YODO', 'DESINFECTANTE', 'FARMACIA', 'CONSULTPEC SRL', '', ''],
  ['TRISTEZINA', 'Medicamentos', 'frasco', 20, 'ml', 'DIACETURATO DE DIMINAZENO', 'TRISTEZA BOVINA', 'UCBVET', 'MARKET SRL', 1, 20],
  ['UMBICURA', 'Medicamentos', 'frasco', 250, 'ml', 'DICLORVOS', 'ANTIPARASITARIO EXTERNO', 'UMBICURA', 'CONSULTPEC SRL', '', ''],
  ['VERRUGAL', 'Medicamentos', 'frasco', 20, 'ml', 'CLOROBUTANOL', 'VERRUGAS', 'GALMEDIC', 'CONSULTPEC SRL', 1, 20],
  ['ZUPREVO', 'Medicamentos', 'frasco', 100, 'ml', 'TILDIPIROSINA', 'ANTIBIOTICO', 'MSD SAUDE ANIMAL', 'COVEPA', 1, 45],
  ['ZURONTOP', 'Medicamentos', 'bidón', 5000, 'ml', 'FLUAZURON', 'ANTIPARASITARIO EXTERNO', 'CIBELES', 'CORONADO SRL', 1, 10],
  ['APLICADOR DIB', 'Materiales sanitarios', 'unidad', '', '', '', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 0.002, 500],
  ['BIOESTROGEN', 'Medicamentos', 'frasco', 100, 'ml', 'BENZOATO DE ESTRADIOL', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['BURESELINA', 'Medicamentos', 'frasco', 50, 'ml', 'GnRH', 'REPRODUCCIÓN', 'ZOOVET', 'ZOOVET', 2.5, 500],
  ['CRONI-CIP', 'Medicamentos', 'frasco', 100, 'ml', 'CIPIONATO DE ESTRADIOL', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['ECEGON 100 ml', 'Medicamentos', 'frasco', 100, 'ml', 'ECG', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['ECEGON 20 ml', 'Medicamentos', 'frasco', 20, 'ml', 'ECG', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['ENZAPROST 100 ml', 'Medicamentos', 'frasco', 100, 'ml', 'PROSTAGLANDINA', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['ENZAPROST 20 ml', 'Medicamentos', 'frasco', 20, 'ml', 'PROSTAGLANDINA', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2, 500],
  ['GONAXAL', 'Medicamentos', 'frasco', 50, 'ml', 'GnRH', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 2.5, 500],
  ['GUANTE DE TACTO', 'Materiales sanitarios', 'caja', 100, 'un', '', 'REPRODUCCIÓN', '', '', '', ''],
  ['PROGESTAR (DISPOSITIVO)', 'Medicamentos', 'caja', 10, 'un', 'PROGESTERONA', 'REPRODUCCIÓN', 'BIOGÉNESIS', 'CONSULTPEC SRL', 1, 500],
  ['VAINAS', 'Materiales sanitarios', 'unidad', '', '', '', 'REPRODUCCIÓN', 'MINITUBE', 'CONSULTPEC SRL', 1, 500],
  ['SEMEN BN LEBRON', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'BUDEGUER', 'DEBERNARDI', 1, 500],
  ['SEMEN BR BAQUEANO', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN BR CAPITANEJO', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN BR EFICIENTE', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN BR MATE', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN BR PROFESOR', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN BR RON', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', 'LAS LILAS', 'SEMCOM SRL', 1, 500],
  ['SEMEN MISSOURI BR', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', '', 'GENETIX', 1, 500],
  ['SEMEN RA BORAN', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', '', 'GENETIX', 1, 500],
  ['SEMEN ROBUSTO BN', 'Semen', 'pajuela', '', '', 'SEMEN', 'REPRODUCCIÓN', '', 'GENETIX', 1, 500],
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
      productos: insumos.map((i) => ({ nombre: i.nombre, rubro: i.rubro, unidad: i.unidad, contenido: i.contenido, unidadContenido: i.unidadContenido,
        // Los materiales sanitarios se dan de baja a mano acá: no se ofrecen en la estancia (no van a animales).
        activo: i.activo && i.rubro !== RUBRO_MATERIALES })),
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

/** Versión 11: la ficha del producto (principio activo, indicación, laboratorio, proveedor, dosis
 *  base, peso base) en Insumos. Al agregar las columnas se completan una sola vez con la planilla de
 *  inventario (PRODUCTOS_SANIDAD); después se editan desde "⚙ Configurar productos". */
function asegurarFichaSanidad_(ss, ins) {
  const primera = COLS_INSUMOS.indexOf('Principio activo') + 1;
  if (String(ins.getRange(1, primera).getValue()) === 'Principio activo') return;
  ins.getRange(1, primera, 1, 6).setValues([COLS_INSUMOS.slice(primera - 1, primera + 5)]).setFontWeight('bold').setBackground('#eeeeee');
  const n = ins.getLastRow();
  if (n < 2) return;
  const porNombre = {};
  PRODUCTOS_SANIDAD.forEach((p) => { porNombre[p[0].toUpperCase()] = p.slice(5, 11); });
  const nombres = ins.getRange(2, 1, n - 1, 1).getValues();
  const modulos = ins.getRange(2, COLS_INSUMOS.indexOf('Módulo') + 1, n - 1, 1).getValues();
  ins.getRange(2, primera, n - 1, 6).setValues(nombres.map((f, i) =>
    (String(modulos[i][0]).trim() === 'Sanidad' && porNombre[String(f[0]).trim().toUpperCase()]) || ['', '', '', '', '', '']));
}

/** Versión 13 (01/10/2026): los stocks se separan por CÓMO se descuentan, no por para qué se usan.
 *  "Insumos IATF" desaparece: hormonas y Progestar pasan a Medicamentos (se aplican a animales);
 *  guante de tacto, vainas y aplicador DIB, más alcohol, jeringas, guante latex y Bagodryl, a Materiales
 *  sanitarios (consumo a mano). Lo de IATF queda como Indicación "Reproducción". Se borra la columna
 *  "Baja en Registros" (versión 12), que pasa a ser el rubro. Una sola vez. */
const MATERIALES_V13 = /^(ALCOHOL|JERINGA|GUANTE|VAINAS|APLICADOR DIB|BAGODRYL)/i;
/** Esquema 15 (pedido 03/10/2026): desactivar de una vez los productos de Semen con stock 0, para que no
 *  aparezcan (siguen en la hoja y el buscador los encuentra para reactivarlos). Corre una sola vez. */
function desactivarSemenEnCero_(ss, ins) {
  if (props_().getProperty('SEMEN_CERO_V15')) return;
  const n = ins.getLastRow();
  if (n > 1) {
    const saldos = calcularStock_(leerInsumos_(ss), leerMovimientos_(ss));
    const cRubro = COLS_INSUMOS.indexOf('Rubro');
    const cActivo = COLS_INSUMOS.indexOf('Activo');
    const filas = ins.getRange(2, 1, n - 1, COLS_INSUMOS.length).getValues();
    const apagados = [];
    filas.forEach((f, k) => {
      const nombre = String(f[0]).trim();
      if (String(f[8]).trim() !== 'Sanidad' || String(f[cRubro]).trim() !== 'Semen' || f[cActivo] !== true) return;
      if (saldos[nombre] && saldos[nombre].cantidad) return;
      ins.getRange(k + 2, cActivo + 1).setValue(false);
      apagados.push(nombre);
    });
    if (apagados.length) registrar_(ss, [[new Date(), 'Sistema', 'Desactivar semen en 0', apagados.join(', '), 'Aplicado', '']]);
  }
  props_().setProperty('SEMEN_CERO_V15', '1');
}

/** Esquema 16 (pedido 03/10/2026): factura Genetyx S.A. 001-001-0005446 (kit IATF, entregado el 22/09/2026).
 *  Crea los productos que falten y carga, por producto, un Conteo 0 (stock inicial: desde ahí cuentan los
 *  consumos de la app de la estancia) y el Ingreso. El semen de la factura ya estaba cargado. Corre una sola vez. */
const FACTURA_GENETYX = [
  // [Producto, Rubro, Unidad, Contenido, Unidad del contenido, Principio activo, Dosis base, Ingreso]
  ['REPRO ONE 0,5 g (DISPOSITIVO)', 'Medicamentos', 'paquete', 10, 'un', 'PROGESTERONA - DIV', 1, 140],
  ['SYNCROGEN 100 ml', 'Medicamentos', 'frasco', 100, 'ml', 'PROSTAGLANDINA - CLOPROSTENOL', '', 28],
  ['CIPION 10 ml', 'Medicamentos', 'frasco', 10, 'ml', 'CIPIONATO DE ESTRADIOL', '', 70],
  ['INDUSCIO 50 ml', 'Medicamentos', 'frasco', 50, 'ml', 'BENZOATO DE ESTRADIOL', '', 56],
  ['ECGEN 5000 UI', 'Medicamentos', 'frasco', '', '', 'ECG', '', 112],
  ['MAXRELIN 50 ml', 'Medicamentos', 'frasco', 50, 'ml', 'GnRH', '', 28],
  ['APLICADOR DIV-P4', RUBRO_MATERIALES, 'unidad', '', '', '', '', 3],
];

function cargarFacturaGenetyx_(ss, ins) {
  if (props_().getProperty('GENETYX_V16')) return;
  const fecha = '2026-09-22';
  const proveedor = 'GENETYX S.A.';
  const factura = '001-001-0005446';
  const usuario = 'Enrique Delfante';
  const existentes = {};
  leerInsumos_(ss).forEach((i) => { existentes[i.nombre.toUpperCase()] = i.nombre; });
  const nuevosProd = [];
  const movs = [];
  const ahora = new Date();
  let ts = new Date(2026, 8, 22, 12, 0, 0).getTime();
  FACTURA_GENETYX.forEach((p, k) => {
    const nombre = existentes[p[0].toUpperCase()] || p[0];
    if (!existentes[p[0].toUpperCase()]) {
      nuevosProd.push([nombre, p[2], '', '', true, false, false, '', 'Sanidad', p[1], p[3], p[4],
        p[5], 'REPRODUCCIÓN', '', proveedor, p[6], '']);
    }
    const id = 'GTX5446-' + (k + 1);
    const hora = Utilities.formatDate(new Date(ts), ZONA, 'dd/MM/yyyy HH:mm:ss');
    movs.push([id + '-C', fecha, 'Conteo', nombre, 0, p[2], '', '', '', '', '', 'Stock inicial (producto nuevo, factura Genetyx)',
      usuario, hora, ahora, false, '', ts++, '', '', '', '', '']);
    movs.push([id + '-I', fecha, 'Ingreso', nombre, p[7], p[2], '', '', proveedor, '', factura, 'Kit IATF (entregado 22/09/2026)',
      usuario, hora, ahora, false, '', ts++, '', '', '', '', '']);
  });
  if (nuevosProd.length) ins.getRange(ins.getLastRow() + 1, 1, nuevosProd.length, COLS_INSUMOS.length).setValues(nuevosProd);
  const shM = ss.getSheetByName('Movimientos');
  shM.getRange(shM.getLastRow() + 1, 1, movs.length, COLS_MOV.length).setValues(movs);
  registrar_(ss, [[ahora, 'Sistema', 'Factura Genetyx ' + factura, nuevosProd.length + ' productos nuevos, ' +
    FACTURA_GENETYX.length + ' ingresos del ' + ddmmaaaa_(fecha), 'Aplicado', '']]);
  props_().setProperty('GENETYX_V16', '1');
}

function migrarRubrosSanidad_(ss, ins) {
  if (props_().getProperty('RUBROS_V13')) return;
  const n = ins.getLastRow();
  if (n > 1) {
    const cRubro = COLS_INSUMOS.indexOf('Rubro');
    const cInd = COLS_INSUMOS.indexOf('Indicación');
    const filas = ins.getRange(2, 1, n - 1, COLS_INSUMOS.length).getValues();
    filas.forEach((f) => {
      if (String(f[8]).trim() !== 'Sanidad' || String(f[cRubro]).trim() === 'Semen') return;
      const nombre = String(f[0]).trim();
      if (MATERIALES_V13.test(nombre)) f[cRubro] = RUBRO_MATERIALES;
      else if (String(f[cRubro]).trim() === 'Insumos IATF') f[cRubro] = 'Medicamentos';
      if (/^GUANTE DE TACTO/i.test(nombre) && !String(f[cInd]).trim()) f[cInd] = 'REPRODUCCIÓN';
    });
    ins.getRange(2, 1, n - 1, COLS_INSUMOS.length).setValues(filas);
  }
  const vieja = COLS_INSUMOS.length + 1;   // columna "Baja en Registros"
  if (ins.getLastColumn() >= vieja && String(ins.getRange(1, vieja).getValue()) === 'Baja en Registros') {
    ins.getRange(1, vieja, Math.max(ins.getMaxRows(), 1), 1).clearDataValidations().clearContent().clearFormat();
  }
  props_().setProperty('RUBROS_V13', '1');
}

// ---------------------------------------------------------------- un producto (alta o edición)
// Desde la ficha del producto ("✏️ Editar datos") o "➕ Nuevo producto" (solo quien tiene Configurar).
// Se escribe solo su fila de Insumos. Cambiar el nombre de un producto con movimientos: en Semen y
// Materiales sanitarios se renombran también sus movimientos (no pasan por la app de la estancia);
// en Medicamentos no, porque la estancia lo nombra así (se desactiva y se crea otro).
function guardarProducto_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (!u.configura) throw new Error('no tenés permiso para cambiar la lista de productos');
  const x = body.producto || {};
  return conLock_(() => {
    const sh = ss.getSheetByName('Insumos');
    const insumos = leerInsumos_(ss);
    const original = texto_(body.original, 60);
    const nombre = texto_(x.nombre, 60);
    if (!nombre) throw new Error('falta el nombre comercial');
    const actual = original ? insumos.find((i) => i.nombre === original && i.modulo === 'Sanidad') : null;
    if (original && !actual) throw new Error('ese producto ya no existe');
    const otro = insumos.find((i) => i.nombre.toUpperCase() === nombre.toUpperCase() && i !== actual);
    if (otro) throw new Error('ya existe "' + otro.nombre + '"' + (otro.modulo === 'Sanidad' ? ' en ' + otro.rubro : ''));
    const movsViejos = actual && nombre !== actual.nombre ? leerMovimientos_(ss).filter((m) => m.insumo === actual.nombre) : [];
    if (movsViejos.length && actual.rubro === 'Medicamentos') {
      throw new Error('"' + actual.nombre + '" ya tiene movimientos y la app de la estancia lo nombra así: no se le cambia el nombre (desactivalo y creá uno nuevo)');
    }
    const rubro = RUBROS_SANIDAD.indexOf(x.rubro) !== -1 ? x.rubro : '';
    if (!rubro) throw new Error('elegí el stock (Medicamentos, Materiales sanitarios o Semen)');
    const num = (v, que, cero) => {
      if (v === '' || v == null) return '';
      const n = Number(v);
      if (!(cero ? n >= 0 : n > 0)) throw new Error(que + ' inválido');
      return n;
    };
    const cont = num(x.contenido, 'contenido');
    const fila = [nombre, texto_(x.unidad, 20) || 'frasco', '', num(x.minimo, 'stock mínimo', true), x.activo !== false, false, false, '', 'Sanidad',
      rubro, cont, cont === '' ? '' : (x.unidadContenido === 'un' ? 'un' : 'ml'),
      texto_(x.principio, 80), texto_(x.indicacion, 80), texto_(x.laboratorio, 80), texto_(x.proveedor, 80),
      num(x.dosisBase, 'dosis base'), num(x.pesoBase, 'peso base')];
    let n = 0;
    if (actual) {
      const nombres = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
      n = nombres.findIndex((f) => String(f[0]).trim() === actual.nombre) + 2;
    }
    if (n >= 2) sh.getRange(n, 1, 1, COLS_INSUMOS.length).setValues([fila]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, COLS_INSUMOS.length).setValues([fila]);   // las casillas ya están (200 filas)
    if (movsViejos.length) {
      // Renombrar en Movimientos (columna Insumo), fila por fila: son pocas.
      const shM = ss.getSheetByName('Movimientos');
      const col = COLS_MOV.indexOf('Insumo') + 1;
      movsViejos.forEach((m) => shM.getRange(m.fila, col).setValue(nombre));
    }
    registrar_(ss, [[new Date(), u.nombre, actual ? 'Editar producto' : 'Nuevo producto', nombre + ' (' + rubro + ')' +
      (movsViejos.length ? ' — antes "' + actual.nombre + '", ' + movsViejos.length + ' movimientos renombrados' : ''), 'Aplicado', '']]);
    reconstruirStock_(ss);
    return { ok: true, producto: leerInsumos_(ss).find((i) => i.nombre === nombre) };
  });
}

/** Producto de IATF: la Indicación "Reproducción" de la planilla de inventario (hormonas, dispositivos,
 *  vainas, guante de tacto, semen). Es una etiqueta para filtrar, no un stock. */
function esIatf_(i) {
  return /REPRODUC/i.test(String(i.indicacion || ''));
}
