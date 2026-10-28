// ---------------------------------------------------------------- resumen del confinamiento para la estancia
// 28/10/2026, pedido del usuario: que el conector de IA de la app de la estancia (servidor MCP) pueda
// contestar "stock actual", "qué insumos hay que pedir" y "qué días faltan del informe" sin leer las
// planillas de Drive. No se calcula nada nuevo: publicarDatosInforme_ guarda acá lo que ya calculó para
// "datos para el informe", y estancia_ (la llamada de cada 15 minutos que ya existía) lo devuelve junto con
// la lista de productos de sanidad. Registros sigue siendo el dueño de estos números.

const RESUMEN_ESTANCIA = 'RESUMEN_ESTANCIA';                    // propiedad del script (JSON chico)
const INFORMES_CARPETA_ID = '1HL2rTLm6XQwH0FgaAdP-iS-NkMOAc1m-';   // PDF "Informe confinamiento ZEHIRUT DD LLL AA"
const PARAM_ALERTA_STOCK = 'Alerta de stock (días o menos)';

/** Guarda el resumen (lo llama publicarDatosInforme_ al terminar). Nunca frena el informe. */
function guardarResumenEstancia_(datos) {
  try {
    props_().setProperty(RESUMEN_ESTANCIA, JSON.stringify(datos));
  } catch (e) {
    console.error('No se pudo guardar el resumen para la estancia: ' + e);
  }
}

/** Arma el resumen con las tablas que publicarDatosInforme_ ya calculó.
 *  stockDia: filas de "Stock por día" (con encabezado); stock: filas de "Stock actual" (con encabezado). */
function resumenEstancia_(hoy, stockDia, stock, diasTf, faltan, sinPremezcla, base, corralesDia) {
  const deHoy = {};
  stockDia.slice(1).filter((f) => f[0] === ddmmaaaa_(hoy)).forEach((f) => {
    // unidad_consumo: kg o fardos (el saldo de "Stock actual" puede estar en bolsas: no se mezclan)
    deHoy[f[1]] = { unidad_consumo: f[2], saldo_en_unidad_consumo: f[7], consumo_esperado_dia: f[6], dias_stock: f[8] === '—' ? null : f[8] };
  });
  return {
    actualizado: Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm'),
    alerta_dias: base.alerta || 10,
    ultimo_tapfeed: diasTf.length ? diasTf[diasTf.length - 1] : null,
    dias_sin_tapfeed: faltan.map(iso_),
    avisos: sinPremezcla.map((a) => a[1]),
    stock: stock.slice(1).map((f) => Object.assign({ insumo: f[0], estancia: f[1] || null, saldo: f[2], unidad: f[3],
      saldo_kg: f[4] === '' ? null : f[4] }, deHoy[f[0]] || {})),
    corrales: base.corrales || [],
    // Cabezas por corral del último Tapfeed (filas de "Corrales por día": fecha, corral, cabezas, kg, MS).
    cabezas_tapfeed: diasTf.length ? (corralesDia || []).slice(1).filter((f) => f[0] === ddmmaaaa_(diasTf[diasTf.length - 1]))
      .map((f) => ({ corral: f[1], cabezas: f[2] })) : [],
    error_datos_base: base.error || '',
  };
}

/** Días desde INFORME_INICIO hasta ayer sin el PDF del informe diario en la carpeta de informes. */
function diasSinInforme_() {
  try {
    const hay = {};
    const it = DriveApp.getFolderById(INFORMES_CARPETA_ID).getFiles();
    while (it.hasNext()) {
      const m = it.next().getName().match(/^Informe confinamiento ZEHIRUT (\d{2}) ([A-Za-z]{3}) (\d{2})\.pdf$/i);
      const mes = m ? MESES.indexOf(m[2].toLowerCase()) : -1;
      if (mes !== -1) hay['20' + m[3] + '-' + ('0' + (mes + 1)).slice(-2) + '-' + m[1]] = true;
    }
    const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    const faltan = [];
    for (let f = INFORME_INICIO; f < hoy; f = sumarDias_(f, 1)) if (!hay[f]) faltan.push(f);
    return faltan;
  } catch (e) {
    return null;   // sin acceso a la carpeta: la estancia lo muestra como "no se pudo revisar"
  }
}

/** Lo que estancia_ agrega a su respuesta. */
function confinamientoParaEstancia_() {
  let r = null;
  try { r = JSON.parse(props_().getProperty(RESUMEN_ESTANCIA) || 'null'); } catch (e) { r = null; }
  if (r) r.dias_sin_informe = diasSinInforme_();
  return r;
}
