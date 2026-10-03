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
const ESQUEMA = '14';   // subir cuando cambien hojas: la próxima llamada vuelve a preparar todo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const MODULOS = ['Stock', 'Lluvias', 'Facturas', 'Combustible', 'Fondo fijo', 'Sanidad'];
const NIVELES = { '': 0, 'VER': 1, 'PROPIAS': 2, 'CARGAR': 2, 'ADMINISTRAR': 3 };
// "Configurar" (casilla): editar las listas de insumos y destinos. Aparte de los niveles
// porque quien administra Stock (conteos, anular) no necesariamente arma las listas.
const COLS_USUARIOS = ['Nombre', 'PIN', 'Activo'].concat(MODULOS, ['Configurar']);
// Una sola planilla de usuarios para todo (01/10/2026): esta. ZehirutApp (biblioteca de Facturas / Fondo fijo y
// el mail diario de comprobantes) también lee los permisos y los correos de acá. "Email" + "Recibe avisos":
// quién recibe el mail diario. Están al final de la hoja (se leen por encabezado).
// "Por estancia": el insumo lleva un stock separado para cada estancia (ej. Fardos).
// "Producción propia": se produce en la estancia; sus ingresos no llevan proveedor, remito ni factura.
// "Nombre en Tapfeed": cómo aparece el insumo en el PDF de Tapfeed (ej. "Maiz Molido DGM 1,2").
// "Módulo": en qué módulo de la app aparece el insumo (Stock, Combustible o Sanidad); los permisos son los de ese módulo.
// "Rubro" (solo Sanidad): Medicamentos, Materiales sanitarios o Semen, cada uno con su propio stock. El rubro
// dice cómo se descuenta: Medicamentos desde la app de la estancia (por animal), Materiales sanitarios a mano
// acá (Consumo). Lo de IATF no es un rubro: es la Indicación "Reproducción" (filtro 🏷 IATF en la app).
// "Contenido por unidad" / "Unidad del contenido" (solo Sanidad): ej. frasco de 500 ml, caja de 100 un.
// Ficha del producto (solo Sanidad, de la planilla "Inventario y stock de medicamentos"): principio activo,
// indicación, laboratorio, proveedor y dosis base (cantidad cada tantos kg de peso vivo).
const COLS_INSUMOS = ['Insumo', 'Unidad', 'Kg por unidad', 'Stock mínimo', 'Activo', 'Por estancia', 'Producción propia', 'Nombre en Tapfeed', 'Módulo',
  'Rubro', 'Contenido por unidad', 'Unidad del contenido',
  'Principio activo', 'Indicación', 'Laboratorio', 'Proveedor', 'Dosis base', 'Peso base (kg)'];
const CAMPOS_FICHA = ['principio', 'indicacion', 'laboratorio', 'proveedor', 'dosisBase', 'pesoBase'];
const COLS_TAPFEED = ['Fecha', 'Corral', 'Cabezas', 'Insumo', 'Nombre en Tapfeed', 'Kg tal cual', 'Kg MS', 'Archivo', 'Cargado por', 'Recibido'];
const COLS_DESTINOS = ['Destino', 'Activo'];
const COLS_MOV = ['ID', 'Fecha', 'Tipo', 'Insumo', 'Cantidad', 'Unidad', 'Kg', 'Destino', 'Proveedor',
  'Remito', 'Factura', 'Nota', 'Cargado por', 'Hora en el teléfono', 'Recibido', 'Anulado', 'Anulado por / motivo', 'Marca de tiempo',
  'Estancia', 'Máquina', 'Equipo', 'Trabajo', 'Finca'];
const COLS_REGISTRO = ['Recibido', 'Usuario', 'Acción', 'Detalle', 'Resultado', 'ID'];
const TIPOS_MOV = ['Ingreso', 'Consumo', 'Conteo'];

// Cargas iniciales (decididas con el usuario el 28/09/2026). Después se editan desde la app.
const INSUMOS_INICIALES = [
  ['Fardos', 'fardo', '', '', true, true, true, '', 'Stock', '', '', ''],
  ['Maíz molido', 'kg', 1, '', true, false, false, 'Maiz Molido DGM 1,2', 'Stock', '', '', ''],
  ['Concentrado Desarrollo', 'bolsa', 40, '', true, false, false, 'Concentrado Desarrollo; Concen Desarrollo', 'Stock', '', '', ''],
  ['Balanceado Pre destete', 'bolsa', 40, '', true, false, false, 'Balan Pre destete', 'Stock', '', '', ''],
  ['Suplemento E-PRO 35', 'bolsa', 30, '', true, false, false, '', 'Stock', '', '', ''],
  ['Concentrado Beef 1.000 M', 'bolsa', 40, '', true, false, false, '', 'Stock', '', '', ''],
  ['Silo micropicado Gatton', 'kg', 1, '', true, false, false, 'Micropicado Gatton', 'Stock', '', '', ''],
  ['Maíz quebrado', 'kg', 1, '', true, false, false, '', 'Stock', '', '', ''],
  ['Nafta', 'litro', '', '', true, false, false, '', 'Combustible', '', '', ''],
  ['Diesel', 'litro', '', '', true, false, false, '', 'Combustible', '', '', ''],
].map((f) => f.concat(new Array(COLS_INSUMOS.length - f.length).fill('')));
const DESTINOS_INICIALES = ['AC D Norte', 'AC Torta Frente', 'AC Torta Fondo', 'AC B Norte Frente',
  'AC B Norte Fondo', 'AC B Medio Frente', 'AC B Medio Fondo', 'Confinamiento'];
// Los PIN se completan a mano en la hoja (los mismos que en ZehirutApp).
const USUARIOS_INICIALES = [
  ['Enrique Delfante', '', true, 'Administrar', 'Administrar', 'Administrar', 'Administrar', 'Administrar', 'Administrar', true],
  ['Osmar Acosta', '', true, 'Administrar', 'Administrar', 'Propias', 'Cargar', 'Cargar', '', false],
];

// Lluvias: la planilla de siempre (compartida con ZehirutApp, ver Lluvias.js de ese proyecto).
const LLUVIAS_PLANILLA_ID = '1DXk0c3HOAsjoPwmfZzqSCUEZ9ByAOL9XlkmRdEBT7Ds';
const LLUVIAS_HOJA = 'Lluvias';
const ESTANCIAS = ['LA PRUDENCIA', 'LA PACIENCIA'];

// ---- Combustible (tanques de Nafta y Diesel). Arranca el 01/10/2026 (reemplaza al módulo de
// ZehirutApp). Las máquinas son los Bienes de Uso de las facturas (mismo código y nombre); se
// editan en la hoja Máquinas. Trabajo obligatorio solo donde "Pide trabajo" (los tractores).
const COMBUSTIBLE_DESDE = '2026-10-01';
const OTRO_DESTINO = 'OTRO';
// "Horómetro": la máquina lleva partes de horómetro (tractores y generadores, ver Horometro.gs).
const COLS_MAQUINAS = ['Código', 'Nombre', 'Combustible', 'Pide trabajo', 'Agrupa', 'Equipos (separados por coma)', 'Activo', 'Horómetro'];
const MAQUINAS_INICIALES = [
  ['TRAC-Val', 'Tractor Valtra BM110', 'Diesel', true, false, '', true, true],
  ['TRAC-Mas', 'Tractor Massey 291', 'Diesel', true, false, '', true, true],
  ['TRAC-LS', 'Tractor LS Plus100', 'Diesel', true, false, '', true, true],
  ['CAM-1', 'Camioneta Toyota Hilux 2022', 'Diesel', false, false, '', true, false],
  ['CAM-2', 'Camioneta Isuzu D-Max 2019', 'Diesel', false, false, '', true, false],
  ['CAM-3', 'Camioneta Isuzu D-Max 2023', 'Diesel', false, false, '', true, false],
  ['CAM-4', 'Camioneta Mazda BT-50 2027', 'Diesel', false, false, '', true, false],
  ['GEN-Cat', 'Generador Caterpillar', 'Diesel', false, false, '', true, true],
  ['GEN-Yan 1', 'Generador Yanmar 1', 'Diesel', false, false, '', true, true],
  ['GEN-Yan 2', 'Generador Yanmar 2', 'Diesel', false, false, '', true, true],
  ['GEN-Yan 3', 'Generador Yanmar 3', 'Diesel', false, false, '', true, true],
  ['GEN-Lifan', 'Generador Lifan', 'Diesel', false, false, '', true, false],
  ['MOTO', 'Motos', 'Nafta', false, true, 'Yamaha, Honda, Moto carro, Kenton', true, false],
  ['HM-Ms', 'Motosierras', 'Nafta', false, true, '', true, false],
  ['HM-Mb', 'Motobombas', 'Nafta', false, true, '', true, false],
  ['HM-Des', 'Desmalezadoras Husqvarna', 'Nafta', false, true, '', true, false],
  ['HM-Fum', 'Mochilas Fumigadoras', 'Nafta', false, false, '', true, false],
  ['INF-Tc', 'Tanque Combustible (Estático)', 'Diesel', false, false, '', true, false],
];
// ---- Sanidad (medicamentos, insumos de IATF y semen). La sanidad se aplica por animal en la app de
// la estancia (app.laprudencia.com.py); acá se lleva el stock del depósito (uno solo). La lista
// inicial de productos (PRODUCTOS_SANIDAD, en Sanidad.gs) sale de la planilla "Inventario y stock de
// medicamentos" (30/09/2026). Todo va a la unidad de negocio PATRIMONIAL (decisión del contador).
const RUBROS_SANIDAD = ['Medicamentos', 'Materiales sanitarios', 'Semen'];
const RUBRO_MATERIALES = 'Materiales sanitarios';   // el único con consumo a mano
const UNIDAD_NEGOCIO_SANIDAD = 'PATRIMONIAL';

// Lista depurada por el usuario el 30/09/2026 (una sola para Combustible y Horómetro).
const TRABAJOS_INICIALES = ['Caminería', 'Trabajos varios con traila', 'Trabajos varios con niveladora', 'Cargada de corral',
  'Acarreo de fardos', 'Acarreos varios', 'Fumigación', 'Generador (energía)', 'Bombeo', 'Aviación', 'Uso general', 'Trabajos de carpida',
  'Recorrida', 'Aserraje', 'Trabajos de limpieza'];
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
// "Datos base confinamiento" (misma carpeta; la edita el usuario): Corrales (categoría de cada corral),
// Parámetros y "Consumo esperado" (la dieta de cada grupo, en kg tal cual por cabeza y día). Con el
// consumo esperado se calculan los días de stock (pedido del usuario 03/10/2026).
const DATOS_BASE_ID = '1N3COBD95uByGGjO72KsL8FphIiRFz9-Y0FAOaVdnceY';
const HOJA_ESPERADO = 'Consumo esperado';
const PARAM_KG_FARDO = 'Kg por fardo (estimado)';   // ya no se usa: los fardos se cuentan por unidad (03/10/2026)
const PARAM_FUERA_INFORME = 'Insumos fuera del informe (separados por ;)';
// Insumos con stock por estancia (Fardos): el informe muestra solo esta estancia (pedido 03/10/2026).
const PARAM_ESTANCIA_INFORME = 'Estancia de los insumos por estancia (Fardos)';
// Valores iniciales (Proyeccion_comida_60_dias.xlsx, hojas Dietas y Grupos, con los ajustes del usuario del 03/10/2026).
// Después se editan en la hoja. Con Categoría, las cabezas salen de Tapfeed (corrales de esa categoría en Corrales).
const ESPERADO_INSUMOS = ['Silo micropicado Gatton', 'Maíz molido', 'Maíz quebrado', 'Balanceado Pre destete', 'Concentrado Desarrollo',
  'Concentrado Beef 1.000 M', 'Suplemento E-PRO 35', 'Fardos'];
const ESPERADO_INICIAL = [
  ['Desmamantes C6O', 'C6O', '', '', 6.6, 0.5, '', 2.4, '', '', '', '', 'Dieta C6O (peso de referencia 190 kg)'],
  ['Machos C6P', 'C6P', '', '', 11.6, 2, '', '', 1.1, '', '', '', 'Dieta C6P (peso de referencia 277,5 kg)'],
  // El silo del autoconsumo sale de otro lado (no del stock de Gatton); los BEEF comen maíz quebrado, no molido.
  ['Toretones C4/C5 – autoconsumo BEEF', '', 160, '28/09/2026', '', '', 5.1, '', '', 1.04, '', '', 'Ración Beef 1.000 M (peso de referencia 470 kg) con maíz quebrado. Silo: de otro lado, no cuenta'],
  ['Toretones C4/C5 – Concentrado Desarrollo', '', 790, '28/09/2026', '', '', '', '', 1.85, '', '', '', 'Desarrollo 0,5 % del PV, al peso medio de 370 kg. Silo: de otro lado, no cuenta'],
  ['Hembras C6P – E-PRO 35', '', 853, '', '', '', '', '', '', '', 0.3, '', 'E-PRO 35 (tope 300 g), al peso medio de 226 kg'],
  // Fardos: en fardos (no kg). Esta fila es el total del grupo (Cabezas = 1).
  ['Hembras C6P – fardo', '', 1, '', '', '', '', '', '', '', '', 9, 'Fardos por día para todo el grupo (6 a 9). Todavía no se empezó a dar'],
];
const ESPERADO_NOTA = 'Kg tal cual por cabeza y por día; Fardos en fardos (no kg). Con Cabezas = 1 el valor es el total del grupo. Con Categoría, ' +
  'las cabezas salen del último Tapfeed (corrales de esa categoría en la hoja Corrales); si no, de la columna Cabezas. "Desde" es ' +
  'opcional. Los nombres de las columnas de insumos tienen que ser los de Registros.';

/** Escribe la hoja "Consumo esperado" entera con los valores de arriba. */
function escribirConsumoEsperado_(h) {
  const enc = ['Grupo', 'Categoría (cabezas de Tapfeed)', 'Cabezas', 'Desde'].concat(ESPERADO_INSUMOS, ['Nota']);
  h.clear();
  h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#eeeeee').setWrap(true);
  h.getRange(2, 1, ESPERADO_INICIAL.length, enc.length).setValues(ESPERADO_INICIAL);
  h.getRange(ESPERADO_INICIAL.length + 3, 1).setValue(ESPERADO_NOTA);
  h.setFrozenRows(1);
}

// Una sola vez (03/10/2026, tercer ajuste): maíz quebrado (BEEF) y fardos por unidad (9 fardos/día del grupo).
function ajustarConsumoEsperado_(h) {
  const props = props_();
  if (props.getProperty('esperadoAjuste3')) return;
  escribirConsumoEsperado_(h);
  props.setProperty('esperadoAjuste3', '1');
}
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
  asegurarCombustible_(ss, ins, mov);
  asegurarSanidad_(ss, ins, usu);
  asegurarHorometro_(ss);
  asegurarRecorrida_(ss);
  agregarNombreTapfeed_(ins, 'Concentrado Desarrollo', 'Concen Desarrollo');   // Tapfeed lo renombró (02/10/2026)
  asegurarFichaSanidad_(ss, ins);
  migrarRubrosSanidad_(ss, ins);
  agregarTrabajos_(ss, 'TRABAJOS_V10', ['Aserraje', 'Trabajos de limpieza']);
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
    if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS_MOV.length).setValues(filas.map(filaMov_));
    registrar_(ss, [[ahora, 'Carga inicial', 'Importar ' + CARGA_INICIAL, filas.length + ' movimientos', 'Aplicado', '']]);
    reconstruirStock_(ss);
    publicarDatosInforme_(ss);
  });
  archivo.setName(CARGA_INICIAL.replace('.csv', ' (importado).csv'));
}

/** Una sola vez (pedido 03/10/2026): el ajuste para sincerar el stock de Fardos se cargó como Consumo el
 *  02/10. Se anula y en su lugar queda un Conteo por estancia con el mismo saldo de ese día. */
function fardosAjusteAConteo_(ss) {
  const props = props_();
  if (props.getProperty('fardosConteo1')) return;
  conLock_(() => {
    const fecha = '2026-10-02';
    const movs = leerMovimientos_(ss).filter((m) => !m.anulado);
    const ajustes = movs.filter((m) => m.insumo === 'Fardos' && m.tipo === 'Consumo' && m.fecha === fecha);
    if (!ajustes.length) { props.setProperty('fardosConteo1', 'sin consumos'); return; }
    const insumos = leerInsumos_(ss);
    const saldos = calcularStock_(insumos, movs.filter((m) => m.fecha <= fecha));
    const ahora = new Date();
    let ts = Math.max.apply(null, movs.map((m) => m.ts).concat([ahora.getTime()]));
    const sh = ss.getSheetByName('Movimientos');
    ajustes.forEach((m) => sh.getRange(m.fila, 16, 1, 2).setValues([[true, 'Pasado a conteo (ajuste de stock, no fue consumo)']]));
    const filas = ESTANCIAS.map((e) => {
      const x = saldos[claveStock_('Fardos', e)];
      return filaMov_(['AJ-' + fecha + '-Fardos-' + e, fecha, 'Conteo', 'Fardos', x ? x.cantidad : 0, 'fardo', '', '', '', '', '',
        'Ajuste de stock (antes cargado como consumo)', ajustes[0].usuario, '', ahora, false, '', ++ts, e]);
    });
    sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS_MOV.length).setValues(filas);
    registrar_(ss, [[ahora, 'Sistema', 'Fardos: ajuste a conteo', ajustes.length + ' consumos anulados; conteos ' +
      filas.map((f) => nombreEstancia_(f[18]) + ' ' + f[4]).join(', '), 'Aplicado', '']]);
    reconstruirStock_(ss);
    props.setProperty('fardosConteo1', ahora.toISOString());
  });
}

/** Una sola vez (03/10/2026, pedido del usuario): a la papelera las versiones reemplazadas del informe del 02/10
 *  (las creó la conexión de la tarea; la de Claude no las puede borrar). Solo si el nombre empieza con "(reemplazado". */
function papeleraInformesViejos_() {
  const props = props_();
  if (props.getProperty('papeleraInf0210c')) return;
  // 1AJY…: fardos en kg; 1hzQ…: fardos de las dos estancias (reemplazados; solo La Paciencia desde 03/10).
  ['1Nza1NT4Zg31IE2OaFJAkefPkukoMZ-wa', '11TNiKi3JOgsVRJR5RRNAkZ5KW10CEQ9R', '1AJYInHIJJfi2d_l_n5c7ffhuA1mQ4uVH',
    '1hzQsruV3-XAAq0DOzZEmjQiFhICdW3qR'].forEach((id) => {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed() && /02 OCT 26\.pdf$/.test(f.getName())) f.setTrashed(true);
    } catch (e) { console.error('No se pudo mandar a la papelera ' + id + ': ' + e); }
  });
  props.setProperty('papeleraInf0210c', '1');
}

/** Una sola vez (03/10/2026): la bolsa de E-PRO 35 es de 30 kg, no de 40. Corrige Insumos y los kg de sus movimientos. */
function eproBolsa30_(ss) {
  const props = props_();
  if (props.getProperty('eproBolsa30')) return;
  conLock_(() => {
    const insumo = 'Suplemento E-PRO 35';
    const ins = ss.getSheetByName('Insumos');
    const n = ins.getLastRow();
    const fila = n > 1 ? ins.getRange(2, 1, n - 1, 1).getValues().findIndex((f) => String(f[0]).trim() === insumo) : -1;
    if (fila !== -1) ins.getRange(fila + 2, COLS_INSUMOS.indexOf('Kg por unidad') + 1).setValue(30);
    const sh = ss.getSheetByName('Movimientos');
    const movs = leerMovimientos_(ss).filter((m) => m.insumo === insumo);
    movs.forEach((m) => sh.getRange(m.fila, COLS_MOV.indexOf('Kg') + 1).setValue(Math.round(m.cantidad * 30 * 100) / 100));
    registrar_(ss, [[new Date(), 'Sistema', 'E-PRO 35: bolsa de 30 kg', movs.length + ' movimientos recalculados', 'Aplicado', '']]);
    reconstruirStock_(ss);
    props.setProperty('eproBolsa30', '1');
  });
}

/** Versión 6: Combustible. Columna "Módulo" en Insumos (Stock para los de antes), Nafta y
 *  Diesel (los agrega asegurarTapfeed_ desde INSUMOS_INICIALES), columnas nuevas de Movimientos
 *  y las hojas Máquinas y Trabajos con sus listas iniciales. */
function asegurarCombustible_(ss, ins, mov) {
  const col = COLS_INSUMOS.indexOf('Módulo') + 1;
  if (String(ins.getRange(1, col).getValue()) !== 'Módulo') {
    ins.getRange(1, col).setValue('Módulo').setFontWeight('bold').setBackground('#eeeeee');
  }
  const n = ins.getLastRow();
  if (n > 1) {
    const vals = ins.getRange(2, 1, n - 1, col).getValues();
    vals.forEach((f, i) => { if (f[0] && !String(f[col - 1]).trim()) ins.getRange(i + 2, col).setValue('Stock'); });
  }
  ['Máquina', 'Equipo', 'Trabajo', 'Finca'].forEach((t) => {
    const c = COLS_MOV.indexOf(t) + 1;
    if (String(mov.getRange(1, c).getValue()) !== t) mov.getRange(1, c).setValue(t).setFontWeight('bold').setBackground('#eeeeee');
  });
  const maq = hoja_(ss, 'Máquinas', COLS_MAQUINAS);
  if (maq.getLastRow() < 2) maq.getRange(2, 1, MAQUINAS_INICIALES.length, COLS_MAQUINAS.length).setValues(MAQUINAS_INICIALES);
  maq.getRange(2, 4, 200, 2).insertCheckboxes();
  maq.getRange(2, 7, 200, 1).insertCheckboxes();
  const tra = hoja_(ss, 'Trabajos', ['Trabajo']);
  if (tra.getLastRow() < 2) tra.getRange(2, 1, TRABAJOS_INICIALES.length, 1).setValues(TRABAJOS_INICIALES.map((t) => [t]));
}

/** Versión 7: Sanidad. Columnas Rubro / Contenido por unidad / Unidad del contenido en Insumos, la
 *  lista inicial de productos (PRODUCTOS_SANIDAD, una sola vez) y la columna Sanidad en Usuarios
 *  (Administrar solo para Enrique; a los demás se les da el permiso a mano en la hoja). */
function asegurarSanidad_(ss, ins, usu) {
  ['Rubro', 'Contenido por unidad', 'Unidad del contenido'].forEach((t) => {
    const c = COLS_INSUMOS.indexOf(t) + 1;
    if (String(ins.getRange(1, c).getValue()) !== t) ins.getRange(1, c).setValue(t).setFontWeight('bold').setBackground('#eeeeee');
  });
  if (!leerInsumos_(ss).some((i) => i.modulo === 'Sanidad')) {
    const filas = PRODUCTOS_SANIDAD.map((p) => [p[0], p[2], '', '', true, false, false, '', 'Sanidad', p[1], p[3], p[4]].concat(p.slice(5, 11)));
    ins.getRange(ins.getLastRow() + 1, 1, filas.length, COLS_INSUMOS.length).setValues(filas);
  }
  const ancho = usu.getLastColumn();
  const enc = usu.getRange(1, 1, 1, ancho).getValues()[0].map(String);
  if (enc.indexOf('Sanidad') === -1) {
    const col = ancho + 1;
    usu.getRange(1, col).setValue('Sanidad').setFontWeight('bold').setBackground('#eeeeee');
    const n = usu.getLastRow();
    if (n > 1) {
      usu.getRange(2, col, n - 1, 1).setValues(usu.getRange(2, 1, n - 1, 1).getValues()
        .map((f) => [String(f[0]).trim() === 'Enrique Delfante' ? 'Administrar' : '']));
    }
    usu.getRange(2, col, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Administrar', 'Cargar', 'Ver'], true).setAllowInvalid(false).build());
  }
}

/** Agrega un nombre de Tapfeed a un insumo (sin borrar los que ya tiene), si todavía no lo tiene. */
function agregarNombreTapfeed_(ins, insumo, nombreTf) {
  const col = COLS_INSUMOS.indexOf('Nombre en Tapfeed') + 1;
  const n = ins.getLastRow();
  if (n < 2) return;
  const nombres = ins.getRange(2, 1, n - 1, 1).getValues();
  const fila = nombres.findIndex((f) => String(f[0]).trim() === insumo);
  if (fila === -1) return;
  const celda = ins.getRange(fila + 2, col);
  const actuales = String(celda.getValue() || '').split(';').map((x) => x.trim()).filter(Boolean);
  if (actuales.some((x) => x.toUpperCase() === nombreTf.toUpperCase())) return;
  celda.setValue(actuales.concat([nombreTf]).join('; '));
}

function leerMaquinas_(ss) {
  const sh = ss.getSheetByName('Máquinas');
  const n = sh ? sh.getLastRow() : 0;
  if (n < 2) return [];
  const si = (v) => v === true || /^(SI|SÍ|TRUE)$/i.test(String(v).trim());
  return sh.getRange(2, 1, n - 1, COLS_MAQUINAS.length).getValues().filter((f) => String(f[0]).trim()).map((f) => ({
    codigo: String(f[0]).trim(), nombre: String(f[1]).trim(), combustible: String(f[2]).trim(),
    pideTrabajo: si(f[3]), agrupa: si(f[4]),
    equipos: String(f[5] || '').split(',').map((x) => x.trim()).filter(Boolean), activo: si(f[6]), horometro: si(f[7]),

  }));
}

function leerTrabajos_(ss) {
  const sh = ss.getSheetByName('Trabajos');
  const n = sh ? sh.getLastRow() : 0;
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues().map((f) => String(f[0]).trim()).filter(Boolean);
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
  fardosAjusteAConteo_(SpreadsheetApp.getActive());
  eproBolsa30_(SpreadsheetApp.getActive());
  papeleraInformesViejos_();
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
    limpiarObsoletos_();
    switch (body.accion) {
      case 'entrar': return json_(entrar_(body));
      case 'guardar': return json_(guardar_(body));
      case 'datos': return json_(datos_(body));
      case 'catalogo': return json_(guardarCatalogo_(body));
      case 'tapfeed': return json_(cargarTapfeed_(body));
      case 'excel': return json_(exportarExcel_(body));
      case 'za': return json_(zehirut_(body));
      case 'estancia': return json_(estancia_(body));
      case 'claveEstancia': return json_(fijarClaveEstancia_(body));
      case 'producto': return json_(guardarProducto_(body));
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
      modulo: String(f[8] || '').trim() || 'Stock',
      rubro: String(f[9] || '').trim(),
      contenido: f[10] === '' || f[10] == null ? null : Number(f[10]),
      unidadContenido: String(f[11] || '').trim(),
      principio: String(f[12] || '').trim(),
      indicacion: String(f[13] || '').trim(),
      laboratorio: String(f[14] || '').trim(),
      proveedor: String(f[15] || '').trim(),
      dosisBase: f[16] === '' || f[16] == null ? null : Number(f[16]),
      pesoBase: f[17] === '' || f[17] == null ? null : Number(f[17]),
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
  if (!u.configura) throw new Error('no tenés permiso para cambiar las listas (insumos, destinos, trabajos)');
  return conLock_(() => {
    const usados = {};
    leerMovimientos_(ss).forEach((m) => { usados[m.insumo] = true; usados['D:' + m.destino] = true; });
    let filas, sh, ancho;
    if (body.tipo === 'insumos') {
      // La lista de Stock (los de Combustible y Sanidad se conservan: Sanidad se edita de a un producto).
      const enAlcance = (i) => i.modulo === 'Stock';
      const vistos = {};
      const previos = leerInsumos_(ss);   // una sola lectura de la hoja (antes se leía una vez por insumo)
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
        const antes = previos.find((i) => i.nombre.toUpperCase() === nombre.toUpperCase());
        return [nombre, unidad, kg, minimo, x.activo !== false, x.porEstancia === true, x.propia === true, antes ? antes.tapfeed : '', 'Stock', '', '', '',
          '', '', '', '', '', ''];
      });
      const filaDe = (i, activo) => [i.nombre, i.unidad, i.kgUnidad == null ? '' : i.kgUnidad, i.minimo == null ? '' : i.minimo, activo, !!i.porEstancia, !!i.propia, i.tapfeed, i.modulo,
        i.rubro, i.contenido == null ? '' : i.contenido, i.unidadContenido]
        .concat(CAMPOS_FICHA.map((k) => (i[k] == null ? '' : i[k])));
      previos.forEach((i) => {
        if (!enAlcance(i)) {
          if (vistos[i.nombre.toUpperCase()]) throw new Error('"' + i.nombre + '" ya existe en ' + (i.modulo === 'Sanidad' ? i.rubro : 'el módulo ' + i.modulo));
          filas.push(filaDe(i, i.activo));
        } else if (usados[i.nombre] && !vistos[i.nombre.toUpperCase()]) filas.push(filaDe(i, false));
      });
      sh = ss.getSheetByName('Insumos'); ancho = COLS_INSUMOS.length;
    } else if (body.tipo === 'trabajos') {
      // Lista de trabajos (Combustible y Horómetro). Sacar uno no toca lo ya cargado: solo deja de
      // aparecer en el desplegable.
      const vistos = {};
      filas = (Array.isArray(body.lista) ? body.lista : []).map((x) => {
        const nombre = texto_(x, 60);
        if (!nombre) throw new Error('hay un trabajo sin nombre');
        if (vistos[nombre.toUpperCase()]) throw new Error('el trabajo "' + nombre + '" está repetido');
        vistos[nombre.toUpperCase()] = true;
        return [nombre];
      });
      sh = ss.getSheetByName('Trabajos'); ancho = 1;
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
/** Completa una fila de Movimientos hasta el ancho de la hoja: si se agregan columnas, las que
 *  armaban filas más cortas siguen andando (la carga de Tapfeed se rompió así al sumar Combustible). */
function filaMov_(f) {
  return f.length >= COLS_MOV.length ? f : f.concat(new Array(COLS_MOV.length - f.length).fill(''));
}

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
    maquina: String(f[19] || ''),
    equipo: String(f[20] || ''),
    trabajo: String(f[21] || ''),
    finca: String(f[22] || ''),
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
  // "Equivale a": en kg (bolsas), o en ml / unidades sueltas en Sanidad (frascos, cajas).
  const valores = [['Insumo', 'Stock', 'Unidad', 'Equivale a', 'Consumo últimos 7 días', 'Promedio por día', 'Alcanza para (días)', 'Stock mínimo', 'Último conteo', 'Último movimiento']];
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
        x.cantidad, i.unidad, i.contenido ? Math.round(x.cantidad * i.contenido) + ' ' + i.unidadContenido
          : i.kgUnidad ? x.cantidad * i.kgUnidad : (i.unidad === 'kg' ? x.cantidad : ''),

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
    const maquinas = {};
    leerMaquinas_(ss).forEach((q) => { maquinas[q.codigo] = q; });
    const moduloDe = (insumo) => (insumos[insumo] ? insumos[insumo].modulo : 'Stock');
    // Partes de horómetro (hoja propia): se leen solo si llega alguno o una anulación.
    let partes = null;
    const parteDe = (id) => {
      if (!partes) { partes = {}; leerPartes_(ss).forEach((p) => { partes[p.id] = p; }); }
      return partes[id];
    };
    const shH = ss.getSheetByName('Horómetro');
    const nuevasHoras = [];
    let trabajos = null;
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
      if (porId[id] || yaProcesados[id] || (op.tipo === 'horas' && parteDe(id))) return res('duplicado');
      try {
        if (op.tipo === 'mov') {
          exigir_(u, moduloDe(texto_(op.insumo, 60)), 'CARGAR');
          trabajos = trabajos || leerTrabajos_(ss);
          const m = validarMov_(op, u, insumos, destinos, hoy, maquinas, trabajos);
          const fila = [id, m.fecha, m.tipo, m.insumo, m.cantidad, m.unidad, m.kg == null ? '' : m.kg, m.destino,
            m.proveedor, m.remito, m.factura, m.nota, u.nombre, horaTel, ahora, false, '', ts, m.estancia,
            m.maquina, m.equipo, m.trabajo, m.finca];
          nuevas.push(fila);
          porId[id] = { id, fecha: m.fecha, tipo: m.tipo, insumo: m.insumo, estancia: m.estancia, cantidad: m.cantidad, usuario: u.nombre, anulado: false, ts };
          movs.push(porId[id]);
          tocoStock = true;
          res('aplicado', m.tipo + ' ' + m.insumo + (m.estancia ? ' (' + nombreEstancia_(m.estancia) + ')' : '') + ' ' + m.cantidad + ' ' + m.unidad + ' (' + ddmmaaaa_(m.fecha) + ')' + (m.destino ? ' → ' + m.destino : ''));
        } else if (op.tipo === 'horas') {
          exigir_(u, MODULO_HORAS, 'CARGAR');
          trabajos = trabajos || leerTrabajos_(ss);
          const p = validarParte_(op, u, maquinas, trabajos, hoy);
          nuevasHoras.push([id, p.fecha, p.codigo, p.maquina, p.trabajo, p.cantidad, p.unidadCantidad, p.unidadNegocio,
            p.inicio, p.fin, p.horas, p.nota, u.nombre, horaTel, ahora, false, '', ts]);
          parteDe(id);
          partes[id] = Object.assign({ id, usuario: u.nombre, anulado: false, ts }, p);
          res('aplicado', 'Horómetro ' + p.maquina + ' ' + p.inicio + ' → ' + p.fin + ' (' + p.horas + ' h, ' + ddmmaaaa_(p.fecha) + ') ' + p.trabajo);
        } else if (op.tipo === 'anular' && !porId[texto_(op.ref, 40)] && parteDe(texto_(op.ref, 40))) {
          // Anular un parte de horómetro: mismas reglas que un movimiento (permisos de Combustible).
          const ref = parteDe(texto_(op.ref, 40));
          exigir_(u, MODULO_HORAS, 'CARGAR');
          if (ref.anulado) return res('duplicado');
          if (nivel_(u, MODULO_HORAS) < NIVELES.ADMINISTRAR && (ref.usuario !== u.nombre || ref.fecha < sumarDias_(hoy, -7))) {
            throw new Error('solo quien administra Combustible puede anular horas cargadas por otros o de hace más de 7 días');
          }
          const motivo = texto_(op.motivo, 200);
          ref.anulado = true;
          if (ref.fila) shH.getRange(ref.fila, 16, 1, 2).setValues([[true, u.nombre + (motivo ? ': ' + motivo : '')]]);
          else nuevasHoras.forEach((f) => { if (f[0] === ref.id) { f[15] = true; f[16] = u.nombre + (motivo ? ': ' + motivo : ''); } });
          res('aplicado', 'Anula horas de ' + ref.maquina + ' (' + ddmmaaaa_(ref.fecha) + ')');
        } else if (op.tipo === 'anular' || op.tipo === 'factura') {
          const ref = porId[texto_(op.ref, 40)];
          if (!ref) throw new Error('ese movimiento no existe');
          const mod = moduloDe(ref.insumo);
          exigir_(u, mod, 'CARGAR');
          const admin = nivel_(u, mod) >= NIVELES.ADMINISTRAR;
          if (op.tipo === 'anular') {
            if (ref.anulado) return res('duplicado');
            // Quien carga corrige lo suyo de los últimos 7 días; lo demás, quien administra.
            if (!admin && (ref.usuario !== u.nombre || ref.fecha < sumarDias_(hoy, -7))) {
              throw new Error('solo quien administra ' + mod + ' puede anular movimientos de otros o de hace más de 7 días');
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

    if (nuevas.length) shM.getRange(shM.getLastRow() + 1, 1, nuevas.length, COLS_MOV.length).setValues(nuevas.map(filaMov_));
    if (nuevasHoras.length) shH.getRange(shH.getLastRow() + 1, 1, nuevasHoras.length, COLS_HORAS.length).setValues(nuevasHoras);
    if (lluvias.length) guardarLluvias_(lluvias, u.nombre);
    registrar_(ss, log);
    if (tocoStock) { reconstruirStock_(ss); publicarDatosInforme_(ss); }
    return { ok: true, resultados };
  });
}

function accionTexto_(op) {
  return { mov: 'Movimiento', anular: 'Anular', factura: 'Asociar factura', lluvia: 'Lluvia', horas: 'Horómetro' }[op.tipo] || String(op.tipo);
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

function validarMov_(op, u, insumos, destinos, hoy, maquinas, trabajos) {
  const tipo = TIPOS_MOV.indexOf(op.clase) === -1 ? null : op.clase;
  if (!tipo) throw new Error('tipo de movimiento inválido');
  const fecha = String(op.fecha || '');
  if (!esFecha_(fecha)) throw new Error('fecha inválida');
  if (fecha > sumarDias_(hoy, 1)) throw new Error('fecha futura');
  const ins = insumos[texto_(op.insumo, 60)];
  if (!ins) throw new Error('insumo desconocido: ' + op.insumo);
  const comb = ins.modulo === 'Combustible';
  // Sanidad: la baja (consumo) llega solo desde la app de la estancia; acá, ingresos y conteos.
  if (ins.modulo === 'Sanidad' && tipo === 'Consumo' && ins.rubro !== RUBRO_MATERIALES) throw new Error('el uso de ' + ins.nombre + ' se carga en la app de la estancia');


  if (tipo === 'Conteo' && nivel_(u, ins.modulo) < NIVELES.ADMINISTRAR) throw new Error('solo quien administra ' + ins.modulo + ' carga conteos');
  if (comb && fecha < COMBUSTIBLE_DESDE) throw new Error('el registro de combustible arranca el ' + ddmmaaaa_(COMBUSTIBLE_DESDE));
  const cantidad = Number(op.cantidad);
  if (!isFinite(cantidad) || cantidad < 0 || (tipo !== 'Conteo' && cantidad === 0)) throw new Error('cantidad inválida');
  const estancia = ins.porEstancia ? String(op.estancia || '') : '';
  if (ins.porEstancia && ESTANCIAS.indexOf(estancia) === -1) throw new Error('falta elegir la estancia (' + ins.nombre + ' lleva stock por estancia)');
  // Sanidad no usa destinos (corrales): el detalle por animal queda en la app de la estancia.
  let destino = tipo === 'Consumo' && ins.modulo !== 'Sanidad' ? texto_(op.destino, 60) : '';
  let maquina = '', equipo = '', trabajo = '', finca = '';
  if (comb && tipo === 'Consumo') {
    // Combustible: el consumo va a una máquina (o a otro destino escrito a mano).
    maquina = texto_(op.maquina, 30);
    if (maquina === OTRO_DESTINO) {
      if (!destino) throw new Error('escribí el destino del combustible');
    } else {
      const q = (maquinas || {})[maquina];
      if (!q) throw new Error('elegí la máquina');
      if (q.combustible && q.combustible !== ins.nombre) throw new Error(q.nombre + ' usa ' + q.combustible.toLowerCase() + ', no ' + ins.nombre.toLowerCase());
      destino = q.nombre;
      if (q.agrupa) equipo = texto_(op.equipo, 60);
      trabajo = texto_(op.trabajo, 60);
      // Solo de la lista (hoja Trabajos, la edita quien tiene Configurar): nada escrito a mano.
      if (trabajo && (trabajos || []).indexOf(trabajo) === -1) throw new Error('el trabajo "' + trabajo + '" no está en la lista');
      if (q.pideTrabajo && !trabajo) throw new Error('en los tractores hay que cargar el trabajo que se hizo');
    }
    finca = ESTANCIAS.indexOf(String(op.finca || '')) !== -1 ? String(op.finca) : '';
  } else if (destino && !destinos[destino]) throw new Error('destino desconocido: ' + destino);
  return {
    tipo, fecha, insumo: ins.nombre, estancia, cantidad, unidad: ins.unidad,
    kg: ins.kgUnidad ? Math.round(cantidad * ins.kgUnidad * 1000) / 1000 : (ins.unidad === 'kg' ? cantidad : null),
    destino,
    proveedor: tipo === 'Ingreso' && !ins.propia ? texto_(op.proveedor, 80) : '',
    remito: tipo === 'Ingreso' && !ins.propia ? texto_(op.remito, 40) : '',
    factura: tipo === 'Ingreso' && !ins.propia ? texto_(op.factura, 60) : '',
    nota: texto_(op.nota, 200),
    maquina, equipo, trabajo, finca,
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
  const mods = ['Stock', 'Combustible', 'Sanidad'].filter((m) => nivel_(u, m) >= NIVELES.VER);
  if (mods.length) {
    const insumos = leerInsumos_(ss).filter((i) => mods.indexOf(i.modulo) !== -1);
    const deModulo = {};
    insumos.forEach((i) => { deModulo[i.nombre] = true; });
    const movs = leerMovimientos_(ss).filter((m) => deModulo[m.insumo]);
    const saldos = calcularStock_(insumos, movs);
    const propias = {};
    insumos.forEach((i) => { if (i.propia) propias[i.nombre] = true; });
    r.stock = {
      insumos,
      destinos: leerDestinos_(ss),
      saldos: Object.keys(saldos).map((k) => saldos[k]).filter((x) => deModulo[x.insumo]),
      movimientos: movs.filter((m) => m.fecha >= desde || (m.tipo === 'Ingreso' && !m.factura && !m.anulado && !propias[m.insumo]))
        .map((m) => {
          const x = Object.assign({}, m);
          delete x.fila;
          return x;
        }),
      proveedores: movs.map((m) => m.proveedor).filter((p, i, a) => p && a.indexOf(p) === i).sort(),
    };
    if (mods.indexOf('Sanidad') !== -1) r.stock.estancia = estadoEstancia_();
    if (mods.indexOf('Combustible') !== -1) {
      r.horometro = datosHorometro_(ss, desde);
      r.stock.maquinas = leerMaquinas_(ss).filter((q) => q.activo);
      r.stock.trabajos = leerTrabajos_(ss);
    }
  }
  if (u.configura) r.tapfeedDias = diasTapfeed_(ss).filter((f) => f >= desde);
  if (facturasVisibles_(u)) {
    try { r.za = sesionZA_(body.pin); } catch (e) { r.za = { ok: false, error: String(e.message || e) }; }
  }
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
  if (!u.configura) throw new Error('solo quien configura puede cargar informes de TAP Feed');
  const d = body.datos || {};
  const fecha = String(d.fecha || '');
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  if (!esFecha_(fecha) || fecha > hoy) throw new Error('fecha del informe inválida');
  const total = Array.isArray(d.total) ? d.total : [];
  const corrales = Array.isArray(d.corrales) ? d.corrales : [];
  if (!total.length || !corrales.length) throw new Error('el informe no trae datos');
  const porTapfeed = {};
  // Varios nombres por insumo, separados por punto y coma (Tapfeed a veces renombra los ingredientes).
  leerInsumos_(ss).forEach((i) => String(i.tapfeed || '').split(';').forEach((n) => { if (n.trim()) porTapfeed[n.trim().toUpperCase()] = i; }));
  const desconocidos = total.filter((t) => !porTapfeed[String(t.nombre).trim().toUpperCase()]).map((t) => t.nombre);
  if (desconocidos.length) {
    throw new Error('no sé a qué insumo corresponde: ' + desconocidos.join(', ') + '. Agregá ese nombre en la columna "Nombre en Tapfeed" de la hoja Insumos (varios, separados por punto y coma).');
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
    shM.getRange(shM.getLastRow() + 1, 1, filasMov.length, COLS_MOV.length).setValues(filasMov.map(filaMov_));
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
//   Stock por día        — por día y por cada insumo de Stock: consumo, acumulado, promedio 7 días,
//                          consumo esperado (dietas), saldo y días de stock = saldo ÷ esperado (todo en kg)
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
    // Dietas y categoría de cada corral (de "Datos base confinamiento"). Si no se puede leer, el informe
    // sale igual, sin consumo esperado, y queda anotado en Resumen.
    let base = { grupos: [], categoria: {}, error: '' };
    try { base = leerDatosBase_(); } catch (e) { base.error = String(e.message || e); }
    const kgDe = (insumo, cant) => {
      const i = porNombre[insumo] || {};
      if (i.kgUnidad) return cant * i.kgUnidad;
      return i.unidad === 'kg' ? cant : 0;
    };
    // En el informe todo va en kg, salvo lo que no tiene peso (Fardos): eso va en unidades.
    const enUnidades = (insumo) => { const i = porNombre[insumo] || {}; return !i.kgUnidad && i.unidad !== 'kg'; };
    const cantRep = (insumo, cant) => (enUnidades(insumo) ? cant : kgDe(insumo, cant));
    const unidadRep = (insumo) => (enUnidades(insumo) ? (porNombre[insumo].unidad + 's') : 'kg');
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

    // Insumos por estancia (Fardos): en el informe solo cuenta la estancia del parámetro (si no hay, todas).
    const deLaEstancia = (m) => !base.estancia || !(porNombre[m.insumo] || {}).porEstancia || m.estancia === base.estancia;
    const movsInf = movs.filter(deLaEstancia);
    // Stock por día de TODOS los insumos de Stock (no solo los del confinamiento).
    const ingStock = insumos.filter((i) => i.activo && i.modulo === 'Stock' && (base.fuera || []).indexOf(i.nombre) === -1).map((i) => i.nombre);
    const consumoDia = {};   // insumo|fecha -> kg (todos los destinos)
    movsInf.filter((m) => m.tipo === 'Consumo').forEach((m) => {
      const k = m.insumo + '|' + m.fecha;
      consumoDia[k] = (consumoDia[k] || 0) + cantRep(m.insumo, m.cantidad);
    });
    // Saldo al final de un día, sumando las estancias (Fardos lleva un stock por estancia).
    const saldosAl = (fecha) => {
      const s = calcularStock_(insumos, movsInf.filter((m) => m.fecha <= fecha));
      const r = {};
      Object.keys(s).filter((k) => !base.estancia || !s[k].estancia || s[k].estancia === base.estancia).forEach((k) => { r[s[k].insumo] = (r[s[k].insumo] || 0) + cantRep(s[k].insumo, s[k].cantidad); });
      return r;
    };
    // Consumo esperado de un día: kg por cabeza de cada grupo × cabezas. Los grupos con Categoría toman
    // las cabezas del último Tapfeed hasta ese día (corrales de esa categoría en la hoja Corrales).
    const esperadoAl = (fecha) => {
      const diaTf = diasTf.filter((d) => d <= fecha).pop();
      const cabCat = {};
      const vistos = {};
      tf.filter((t) => t.fecha === diaTf).forEach((t) => {   // una fila por corral e ingrediente
        if (vistos[t.corral]) return;
        vistos[t.corral] = true;
        const cat = base.categoria[t.corral];
        if (cat) cabCat[cat] = (cabCat[cat] || 0) + t.cabezas;
      });
      const r = {};
      base.grupos.forEach((g) => {
        if (g.desde && fecha < g.desde) return;
        const cab = g.categoria ? (cabCat[g.categoria] || 0) : g.cabezas;
        Object.keys(g.kg).forEach((ins) => { r[ins] = (r[ins] || 0) + g.kg[ins] * cab; });
      });
      return r;
    };
    const stockDia = [['Fecha', 'Ingrediente', 'Unidad', 'Consumo del día', 'Consumo acumulado (desde 21/09/2026)',
      'Promedio diario 7 días', 'Consumo esperado por día', 'Saldo', 'Días de stock']];
    for (let f = desde; f <= hoy; f = sumarDias_(f, 1)) {
      const saldos = saldosAl(f);
      const esperado = esperadoAl(f);
      ingStock.forEach((ins) => {
        let acum = 0;
        let siete = 0;
        Object.keys(consumoDia).forEach((k) => {
          const p = k.split('|');
          if (p[0] !== ins || p[1] > f) return;
          if (p[1] >= INFORME_ACUM_DESDE) acum += consumoDia[k];
          if (p[1] > sumarDias_(f, -7)) siete += consumoDia[k];
        });
        const saldo = saldos[ins] || 0;
        const esp = esperado[ins] || 0;
        stockDia.push([ddmmaaaa_(f), ins, unidadRep(ins), r0(consumoDia[ins + '|' + f] || 0), r0(acum), r0(siete / 7), r0(esp), r0(saldo),
          esp > 0 ? Math.max(0, Math.floor(saldo / esp)) : '—']);
      });
    }

    const saldos = calcularStock_(insumos, movs);
    const stock = [['Insumo', 'Estancia', 'Saldo', 'Unidad', 'Saldo kg']];
    Object.keys(saldos).map((k) => saldos[k]).forEach((x) => {
      const i = porNombre[x.insumo];
      // Solo los insumos de Stock: la tarea lee ~100 filas por hoja y Sanidad son casi cien productos.
      if (!i || !i.activo || i.modulo !== 'Stock' || (base.fuera || []).indexOf(i.nombre) !== -1) return;
      if (base.estancia && x.estancia && x.estancia !== base.estancia) return;

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
      ['Unidades', 'En kg, redondeado, salvo lo que se cuenta por unidad (Fardos: en fardos); ver columna Unidad de Stock por día.' +
        (base.estancia ? ' Fardos: solo ' + nombreEstancia_(base.estancia) + '.' : '') + ' Consumo = confinamiento (Tapfeed) + otros destinos (autoconsumo, cargado en la app).'],
      ['Consumo esperado', base.error ? 'NO SE PUDO CALCULAR: ' + base.error
        : 'Según las dietas de la hoja "' + HOJA_ESPERADO + '" de Datos base confinamiento (cantidad por cabeza × cabezas; confinamiento con las cabezas de Tapfeed). Días de stock = saldo ÷ consumo esperado.'],
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

/** De "Datos base confinamiento": la categoría de cada corral (hoja Corrales), los kg por fardo (Parámetros)
 *  y los grupos con su dieta (hoja "Consumo esperado"). Las dos últimas se crean la primera vez. */
function leerDatosBase_() {
  const db = SpreadsheetApp.openById(DATOS_BASE_ID);
  const r = { grupos: [], categoria: {}, error: '' };

  const cor = db.getSheetByName('Corrales');
  if (cor && cor.getLastRow() > 1) {
    cor.getRange(2, 1, cor.getLastRow() - 1, 3).getValues().forEach((f) => {
      if (String(f[0]).trim() && String(f[2]).trim()) r.categoria[String(f[0]).trim()] = String(f[2]).trim();
    });
  }

  const par = db.getSheetByName('Parámetros');
  if (par) {
    const filas = par.getLastRow() > 0 ? par.getRange(1, 1, par.getLastRow(), 2).getValues() : [];
    // Los fardos se cuentan por unidad: el parámetro de kg por fardo ya no va.
    const iKg = filas.findIndex((f) => String(f[0]).trim() === PARAM_KG_FARDO);
    if (iKg !== -1) par.deleteRow(iKg + 1);
    // Insumos de Stock que no van en el informe (ej. Semilla de Gatton), separados por punto y coma.
    const fuera = filas.find((f) => String(f[0]).trim() === PARAM_FUERA_INFORME);
    if (fuera) r.fuera = String(fuera[1] || '').split(';').map((x) => x.trim()).filter(Boolean);
    else { par.appendRow([PARAM_FUERA_INFORME, 'Semilla de Gatton']); r.fuera = ['Semilla de Gatton']; }
    const est = filas.find((f) => String(f[0]).trim() === PARAM_ESTANCIA_INFORME);
    if (est) r.estancia = String(est[1] || '').trim().toUpperCase();
    else { par.appendRow([PARAM_ESTANCIA_INFORME, 'La Paciencia']); r.estancia = 'LA PACIENCIA'; }
  }

  let h = db.getSheetByName(HOJA_ESPERADO);
  if (h) ajustarConsumoEsperado_(h);
  if (!h) {
    h = db.insertSheet(HOJA_ESPERADO);
    escribirConsumoEsperado_(h);
    props_().setProperty('esperadoAjuste3', '1');
  }
  const datos = h.getDataRange().getValues();
  const enc = datos[0].map((x) => String(x).trim());
  datos.slice(1).forEach((f) => {
    const grupo = String(f[0]).trim();
    const categoria = String(f[1]).trim();
    const cabezas = Number(f[2]) || 0;
    if (!grupo || (!categoria && !cabezas)) return;
    const kg = {};
    enc.forEach((ins, c) => {
      if (c < 4 || !ins || ins === 'Nota') return;
      const v = Number(String(f[c]).replace(',', '.'));
      if (v > 0) kg[ins] = v;
    });
    const desde = f[3] ? iso_(f[3]) : '';
    r.grupos.push({ grupo, categoria, cabezas, desde: esFecha_(desde) ? desde : '', kg });
  });
  return r;
}

// ---------------------------------------------------------------- Excel (Stock / Combustible)
// Bajar lo registrado en un período (para la contadora o para cargar en Albor): Resumen, una hoja
// por insumo con el formato de las planillas de siempre (saldo con fórmula) y la tabla plana de
// Movimientos. El "Cód. bien de uso" es el de Bienes de Uso de ZehirutApp (el que usa Albor).
function exportarExcel_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (body.modulo === 'Horómetro') return exportarHorasExcel_(u, body);
  const modulo = ['Combustible', 'Sanidad'].indexOf(body.modulo) !== -1 ? body.modulo : 'Stock';

  exigir_(u, modulo, 'VER');
  // Sanidad: un Excel por rubro (Medicamentos, Materiales sanitarios, Semen), como la planilla de siempre:
  // Resumen + Movimientos, sin una hoja por producto (son casi cien).
  const san = modulo === 'Sanidad';
  const rubro = san ? (RUBROS_SANIDAD.indexOf(body.rubro) !== -1 ? body.rubro : RUBROS_SANIDAD[0]) : '';
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const desde = esFecha_(body.desde) ? body.desde : hoy.slice(0, 8) + '01';
  const hasta = esFecha_(body.hasta) ? body.hasta : hoy;
  if (hasta < desde) throw new Error('la fecha "hasta" es anterior a "desde"');

  const insumos = leerInsumos_(ss).filter((i) => i.modulo === modulo && (!san || i.rubro === rubro));
  const porNombre = {};
  insumos.forEach((i) => { porNombre[i.nombre] = i; });
  const movs = leerMovimientos_(ss).filter((m) => !m.anulado && porNombre[m.insumo])
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ts - b.ts));
  const maquinas = {};
  leerMaquinas_(ss).forEach((q) => { maquinas[q.codigo] = q; });
  const kgDe = (ins, c) => (ins.contenido ? Math.round(c * ins.contenido * 100) / 100 : ins.kgUnidad ? c * ins.kgUnidad : (ins.unidad === 'kg' ? c : ''));
  const aDate = (iso) => { const p = iso.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };

  // Cuentas por insumo (y estancia): saldo al empezar, y las filas del período. Un conteo entra
  // como "Ajuste por conteo" con la diferencia, así el saldo de la planilla cierra.
  const cuentas = {};
  const cuenta = (m) => {
    const k = claveStock_(m.insumo, m.estancia);
    return cuentas[k] || (cuentas[k] = { insumo: m.insumo, estancia: m.estancia, inicial: 0, saldo: 0, entradas: 0, salidas: 0, filas: [], antes: false });
  };
  insumos.forEach((i) => {
    if (i.porEstancia) ESTANCIAS.forEach((e) => cuenta({ insumo: i.nombre, estancia: e }));
    else cuenta({ insumo: i.nombre, estancia: '' });
  });
  const plana = san
    ? [['Fecha', 'Producto', 'Rubro', 'Uso', 'Tipo', 'Cantidad', 'Unidad', 'Equivale a', 'Unidad del contenido', 'Unidad de negocio',
      'Proveedor', 'Remito', 'Factura', 'Nota', 'Cargado por']]
    : [['Fecha', 'Insumo', 'Estancia', 'Tipo', 'Cantidad', 'Unidad', 'Kg', 'Destino', 'Cód. bien de uso', 'Equipo', 'Trabajo',
      'Finca', 'Proveedor', 'Remito', 'Factura', 'Nota', 'Cargado por']];
  movs.forEach((m) => {
    if (m.fecha > hasta) return;
    const c = cuenta(m);
    let entra = 0, sale = 0;
    if (m.tipo === 'Ingreso') entra = m.cantidad;
    else if (m.tipo === 'Consumo') sale = m.cantidad;
    else if (m.tipo === 'Conteo') { const dif = m.cantidad - c.saldo; if (dif > 0) entra = dif; else sale = -dif; }
    c.saldo += entra - sale;
    // El primer movimiento de un insumo, si es un conteo, es su stock inicial.
    const esInicial = m.tipo === 'Conteo' && !c.antes;
    c.antes = true;
    if (m.fecha < desde) { c.inicial = c.saldo; return; }
    c.entradas += entra;
    c.salidas += sale;
    const codigo = m.maquina && m.maquina !== OTRO_DESTINO ? m.maquina : '';
    const destino = m.tipo === 'Consumo' ? (m.destino || '') + (m.equipo ? ' - ' + m.equipo : '')
      : m.tipo === 'Ingreso' ? (m.proveedor || 'Ingreso') + (m.factura ? ' (Fact. ' + m.factura + ')' : '') : esInicial ? 'Stock inicial' : 'Ajuste por conteo (' + m.cantidad + ')';
    c.filas.push([aDate(m.fecha), destino, codigo, m.trabajo || (m.tipo === 'Consumo' ? '' : esInicial ? 'Stock inicial' : m.tipo), m.finca ? nombreEstancia_(m.finca) : '', sale || '', entra || '']);
    if (san) {
      const i = porNombre[m.insumo];
      plana.push([aDate(m.fecha), m.insumo, rubro, esIatf_(i) ? 'IATF' : '', m.tipo, m.cantidad, m.unidad, i.contenido ? kgDe(i, m.cantidad) : '', i.unidadContenido,
        UNIDAD_NEGOCIO_SANIDAD, m.proveedor, m.remito, m.factura, m.nota, m.usuario]);
    } else {
      plana.push([aDate(m.fecha), m.insumo, m.estancia ? nombreEstancia_(m.estancia) : '', m.tipo, m.cantidad, m.unidad, m.kg == null ? '' : m.kg,
        m.destino, codigo, m.equipo, m.trabajo, m.finca ? nombreEstancia_(m.finca) : '', m.proveedor, m.remito, m.factura, m.nota, m.usuario]);
    }
  });

  const titulo = san ? 'Sanidad ' + rubro : modulo === 'Combustible' ? 'Combustible' : 'Stock insumos';
  const nombre = titulo + ' ' + ddmmaaaa_(desde).replace(/\//g, '-') + ' al ' + ddmmaaaa_(hasta).replace(/\//g, '-');
  const tmp = SpreadsheetApp.create(nombre);
  try {
    tmp.setSpreadsheetTimeZone(ZONA);
    const lista = Object.keys(cuentas).map((k) => cuentas[k]).filter((c) => porNombre[c.insumo] && (porNombre[c.insumo].activo || c.filas.length || c.inicial));
    // Resumen
    const res = tmp.getSheets()[0];
    res.setName('Resumen');
    const filasRes = san
      ? [['Producto', 'Uso', 'Unidad', 'Contenido', 'Saldo al ' + ddmmaaaa_(desde), 'Entradas', 'Salidas', 'Saldo al ' + ddmmaaaa_(hasta), 'Saldo final en ml / un', 'Unidad de negocio']]
      : [['Insumo', 'Estancia', 'Unidad', 'Saldo al ' + ddmmaaaa_(desde), 'Entradas', 'Salidas', 'Saldo al ' + ddmmaaaa_(hasta), 'Saldo final kg']];
    lista.forEach((c) => {
      const i = porNombre[c.insumo];
      const fin = c.inicial + c.entradas - c.salidas;
      if (san) {
        filasRes.push([c.insumo, esIatf_(i) ? 'IATF' : '', i.unidad, i.contenido ? i.contenido + ' ' + i.unidadContenido : '', c.inicial, c.entradas, c.salidas, fin,
          i.contenido ? kgDe(i, fin) : '', UNIDAD_NEGOCIO_SANIDAD]);
      } else {
        filasRes.push([c.insumo, c.estancia ? nombreEstancia_(c.estancia) : '', i.unidad, c.inicial, c.entradas, c.salidas, fin, kgDe(i, fin)]);
      }
    });
    res.getRange(1, 1).setValue((san ? 'SANIDAD – ' + rubro.toUpperCase() : modulo === 'Combustible' ? 'COMBUSTIBLE' : 'STOCK DE INSUMOS') +
      ' – del ' + ddmmaaaa_(desde) + ' al ' + ddmmaaaa_(hasta)).setFontSize(14).setFontWeight('bold');
    res.getRange(3, 1, filasRes.length, filasRes[0].length).setValues(filasRes).setBorder(true, true, true, true, true, true);
    res.getRange(3, 1, 1, filasRes[0].length).setFontWeight('bold').setBackground('#eeeeee');
    if (filasRes.length > 1) res.getRange(4, san ? 5 : 4, filasRes.length - 1, 5).setNumberFormat('#,##0.##;-#,##0.##;"-"');
    res.autoResizeColumns(1, filasRes[0].length);

    // Una hoja por insumo (formato de las planillas de siempre, con el saldo como fórmula).
    if (!san) lista.forEach((c) => {

      const i = porNombre[c.insumo];
      const h = tmp.insertSheet((c.insumo + (c.estancia ? ' ' + nombreEstancia_(c.estancia) : '')).slice(0, 90));
      const unidad = String(i.unidad).toUpperCase();
      h.getRange('A1:H1').merge().setValue((modulo === 'Combustible' ? 'CONSUMO DE ' : 'MOVIMIENTOS DE ') + c.insumo.toUpperCase() +
        (c.estancia ? ' – ' + nombreEstancia_(c.estancia).toUpperCase() : '') + ' (' + unidad + ')')
        .setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
      h.getRange('A2:H2').setValues([['Fecha', 'Destino', 'Cód. bien de uso', 'Trabajo', 'Estancia', 'Salida', 'Entrada', 'Saldo']])
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#eeeeee');
      h.getRange(3, 1, 1, 8).setValues([['', '', '', 'Saldo al ' + ddmmaaaa_(desde), '', '', '', c.inicial]]);
      const filas = c.filas.map((f, n) => f.concat(['=H' + (n + 3) + '-F' + (n + 4) + '+G' + (n + 4)]));
      if (filas.length) {
        h.getRange(4, 1, filas.length, 8).setValues(filas);
        h.getRange(4, 1, filas.length, 1).setNumberFormat('d/m/yy');
      }
      const ultima = 3 + filas.length;
      h.getRange(3, 6, ultima - 2, 3).setNumberFormat('#,##0.##;-#,##0.##;"-"');
      h.getRange(2, 1, ultima - 1, 8).setBorder(true, true, true, true, true, true);
      [80, 280, 110, 150, 100, 80, 80, 100].forEach((a, n) => h.setColumnWidth(n + 1, a));
      h.setFrozenRows(2);
    });

    // Tabla plana
    const pl = tmp.insertSheet('Movimientos');
    pl.getRange(1, 1, plana.length, plana[0].length).setValues(plana);
    pl.getRange(1, 1, 1, plana[0].length).setFontWeight('bold').setBackground('#eeeeee');
    if (plana.length > 1) pl.getRange(2, 1, plana.length - 1, 1).setNumberFormat('d/m/yy');
    pl.setFrozenRows(1);
    pl.autoResizeColumns(1, plana[0].length);

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

// ---------------------------------------------------------------- permisos
/** Ejecutar a mano desde el editor (elegir "autorizar" y tocar Ejecutar) cuando el script pida
 *  un permiso nuevo: usa cada servicio una vez, así Google muestra el pedido de permisos. */
function autorizar() {
  SpreadsheetApp.getActive().getName();
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  try { ZA.iniciarSesion('0000'); } catch (e) { /* PIN falso: solo carga la biblioteca de ZehirutApp */ }
  return 'Permisos OK';
}

// ---------------------------------------------------------------- Facturas y Fondo fijo (ZehirutApp)
// Se usan las MISMAS funciones de ZehirutApp, que está agregado como biblioteca ("ZA", ver
// appsscript.json): misma planilla de Facturas, mismas carpetas de Drive, misma clave de Gemini y
// mismos permisos (hoja Usuarios de ZehirutApp, con el mismo PIN). Las dos apps conviven y dan lo
// mismo porque es el mismo código. Al publicar una versión nueva de ZehirutApp, subir "version" de
// la biblioteca en appsscript.json.
//
// Abierto a todos desde el 01/10/2026 (antes en prueba): lo ve quien tiene Facturas o Fondo fijo en la
// hoja Usuarios; lo que puede hacer cada uno lo deciden los permisos de ZehirutApp. En ZehirutApp esos
// módulos quedaron ocultos (su código sigue, porque es esta biblioteca).

// Funciones de ZehirutApp que la app puede usar. En los argumentos, "__PIN__" se reemplaza por el
// PIN de la sesión (cada función lo espera en una posición distinta).
const ZA_PERMITIDAS = {
  iniciarSesion: 1, procesarFactura: 1, descartarArchivo: 1, guardarFactura: 1, guardarAnticipo: 1,
  guardarPagoSinFactura: 1, listarFacturas: 1, obtenerDetalleFactura: 1, eliminarFactura: 1,
  marcarCargadoAlbor: 1, actualizarFactura: 1, descargarArchivoAdjunto: 1, exportarFacturasExcel: 1,
  buscarAnticiposPendientes: 1, vincularAnticipoManual: 1, listarFacturasMismoProveedor: 1,
  procesarComprobanteAsociado: 1, obtenerResumenFondoFijo: 1, registrarFondeoFondoFijo: 1,
  eliminarFondeoFondoFijo: 1, exportarFondoFijoExcel: 1,
};

function facturasVisibles_(u) {
  return nivel_(u, 'Facturas') >= NIVELES.VER || nivel_(u, 'Fondo fijo') >= NIVELES.VER;
}

/** Sesión de ZehirutApp (qué puede hacer en Facturas / Fondo fijo), guardada 10 minutos para que
 *  cada sincronización no tenga que consultar ZehirutApp. */
function sesionZA_(pin) {
  const clave = 'za:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'zehirut-' + pin));
  const cache = CacheService.getScriptCache();
  const guardada = cache.get(clave);
  if (guardada) return JSON.parse(guardada);
  const s = ZA.iniciarSesion(pin);
  if (s && s.ok) cache.put(clave, JSON.stringify(s), 600);
  return s;
}

function zehirut_(body) {
  const ss = SpreadsheetApp.getActive();
  const u = usuarioDe_(ss, body.pin);
  if (!facturasVisibles_(u)) throw new Error('Facturas y Fondo fijo todavía no están habilitados para tu usuario');
  const fn = String(body.fn || '');
  if (!ZA_PERMITIDAS[fn] || typeof ZA[fn] !== 'function') throw new Error('función no permitida: ' + fn);
  // En ZehirutApp Fondo fijo es un solo permiso (ver y cargar); acá se separa: con "Ver" en la columna
  // Fondo fijo de Usuarios no se registran ni eliminan fondeos.
  if (/FondeoFondoFijo$/.test(fn) && nivel_(u, 'Fondo fijo') < NIVELES.CARGAR) throw new Error('tu usuario solo puede ver el Fondo fijo');
  const args = (Array.isArray(body.args) ? body.args : []).map((a) => (a === '__PIN__' ? String(body.pin) : a));
  // Lo que devuelve ZehirutApp viaja como JSON (las fechas ya vienen como texto).
  return { ok: true, resultado: ZA[fn].apply(null, args) };
}

// ---------------------------------------------------------------- limpieza (una sola vez)
/** 01/10/2026, pedido del usuario: manda a la papelera lo que quedó sin uso en ZehirutApp (planilla vieja de
 *  usuarios y hoja de combustible vieja; ver ZA.limpiarObsoletos). Corre una vez; el resultado va a Registro. */
function limpiarObsoletos_() {
  if (props_().getProperty('LIMPIEZA_ZEHIRUTAPP')) return;
  try {
    conLock_(() => {
      if (props_().getProperty('LIMPIEZA_ZEHIRUTAPP')) return;
      const r = ZA.limpiarObsoletos();
      registrar_(SpreadsheetApp.getActive(), [[new Date(), 'Sistema', 'Limpieza de ZehirutApp', r, 'Aplicado', '']]);
      props_().setProperty('LIMPIEZA_ZEHIRUTAPP', r);
    });
  } catch (e) { console.error('Limpieza: ' + e); }   // nunca frena la app
}
