// ZehirutApp SIMULADO para el servidor de prueba: las mismas funciones que la biblioteca "ZA"
// (Facturas y Fondo fijo) con datos en memoria. La "lectura de Gemini" devuelve siempre una
// factura de ejemplo; si el nombre del archivo tiene "otro", el cliente no es Zehirut.
'use strict';

module.exports = function crearZA() {
  const facturas = [];
  const items = {};
  const docs = [];
  const anticipos = [{ id: 9001, fechaCarga: '20/09/2026', fecha: '20/09/2026', proveedor: 'Taller Pérez', monto: 500000, moneda: 'PYG', motivo: 'Adelanto repuestos', facturasVinculadas: 0, ruc: '80012345-6' }];
  const fondeos = [];
  const archivos = {};
  let sec = 0;
  const id = () => Number('2609' + String(1000000 + ++sec).slice(1));
  const hoy = () => { const d = new Date(); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
  const sesion = (pin) => {
    // 4444: usuaria que existe solo en ZehirutApp (prueba el alta automática): solo ve facturas y combustible.
    const u = { '1111': 'Enrique Delfante', '2222': 'Osmar Acosta', '4444': 'Natalia Prueba' }[String(pin)];
    if (!u) throw new Error('PIN inválido.');
    if (pin === '4444') {
      return { ok: true, nombre: u, puedeFacturas: false, puedeLluvias: false, puedeVerFacturas: true, puedeEliminarFacturas: false,
        verSoloPropias: false, puedeFondoFijo: false, puedeCombustible: false, puedeVerCombustible: true };
    }
    return { ok: true, nombre: u, puedeFacturas: true, puedeLluvias: true, puedeVerFacturas: true, puedeEliminarFacturas: pin === '1111',
      verSoloPropias: pin === '2222', puedeFondoFijo: true, puedeCombustible: false, puedeVerCombustible: false };
  };
  const orden = (f) => { const p = String(f || '').split('/'); return p.length === 3 ? Number(p[2]) * 10000 + Number(p[1]) * 100 + Number(p[0]) : 0; };
  const resumen = (f) => ({ id: f.id, fecha: f.fecha, numeroFactura: f.numeroFactura, proveedor: f.proveedor, ruc: f.ruc, moneda: f.moneda, monto: f.monto,
    tipoComprobante: f.tipoComprobante, usuario: f.usuario, cargadoAlbor: f.cargadoAlbor, detalle: f.detalle });
  const buscar = (fid) => { const f = facturas.find((x) => String(x.id) === String(fid)); if (!f) throw new Error('No se encontró la factura.'); return f; };
  const filtrar = (s, o) => {
    const q = String((o && o.query) || '').toUpperCase();
    const mes = String((o && o.mes) || '');
    return facturas.filter((f) => (!s.verSoloPropias || f.usuario === s.nombre) &&
      (!mes || f.fecha.slice(3).split('/').reverse().join('-') === mes) &&
      (!q || (f.numeroFactura + f.proveedor + f.ruc).toUpperCase().indexOf(q) !== -1))
      .sort((a, b) => orden(b.fecha) - orden(a.fecha));
  };
  const guardarArchivo = (nombre, base64) => { const aid = 'arch' + ++sec; archivos[aid] = { nombre, base64, tamanioKB: Math.max(1, Math.round((base64 || '').length * 0.75 / 1024)) }; return aid; };

  return {
    iniciarSesion: sesion,
    procesarFactura(base64, tipo, nombre, pin) {
      sesion(pin);
      const aid = guardarArchivo(nombre, base64);
      const datos = { tipo_comprobante: 'Factura Crédito', fecha_factura: '29/09/2026', numero_factura: '001-001-00' + (1000 + sec), proveedor: 'Taller Pérez',
        cliente: /otro/i.test(nombre) ? 'Juan Gómez' : 'ZEHIRUT S.A.', ruc: '80012345-6', electronico: 'Sí', timbrado: '12345678', vto_timbrado: '31/12/2026',
        moneda: 'PYG', monto: '1250000', iva5: '0', iva10: '113636', dias_credito: '30 días', detalle: 'Repuestos',
        items: [{ codigo: 'F-1', descripcion: 'Filtro de aceite', cantidad: '2', precioUnitario: '125000', subtotal: '250000', iva: '22727' },
          { codigo: 'P-7', descripcion: 'Pastillas de freno', cantidad: '1', precioUnitario: '1000000', subtotal: '1000000', iva: '90909' }] };
      const dup = facturas.find((f) => f.numeroFactura === datos.numero_factura);
      return { archivoUrl: 'https://drive.google.com/PRUEBA/' + aid, archivoId: aid, datos, clienteCoincide: !/otro/i.test(nombre),
        clienteDetectado: datos.cliente, duplicado: !!dup, facturaExistente: dup ? { proveedor: dup.proveedor, numeroFactura: dup.numeroFactura, fechaCarga: dup.fechaCarga, usuario: dup.usuario } : null,
        anticiposPendientes: anticipos.filter((a) => a.ruc === datos.ruc) };
    },
    descartarArchivo(aid, pin) { sesion(pin); delete archivos[aid]; return 'ok'; },
    guardarFactura(d, pin) {
      const s = sesion(pin);
      const fid = id();
      facturas.push(Object.assign({ id: fid, fechaCarga: hoy(), usuario: s.nombre, cargadoAlbor: false, carpetaId: 'carp' + fid,
        archivoId: String(d.archivoUrl || '').split('/').pop() }, d, { monto: Number(d.monto) || '', iva5: Number(d.iva5) || '', iva10: Number(d.iva10) || '' }));
      items[fid] = d.items || [];
      (d.anticiposVinculados || []).forEach((aid) => {
        const a = anticipos.find((x) => String(x.id) === String(aid));
        if (a) { a.facturasVinculadas++; docs.push({ facturaId: fid, tipo: 'Anticipo', fechaCarga: a.fechaCarga, usuario: s.nombre }); }
      });
      return 'Guardado correctamente';
    },
    guardarAnticipo(base64, tipo, nombre, d, pin) {
      const s = sesion(pin);
      anticipos.push({ id: id(), fechaCarga: hoy(), fecha: d.fecha, proveedor: d.proveedor, monto: Number(d.monto), moneda: d.moneda, motivo: d.motivo, facturasVinculadas: 0, ruc: d.ruc, usuario: s.nombre });
      return 'ok';
    },
    guardarPagoSinFactura(base64, tipo, nombre, d, pin) {
      const s = sesion(pin);
      const fid = id();
      const n = facturas.filter((f) => /^SinFC_/.test(f.numeroFactura)).length + 1;
      facturas.push({ id: fid, fechaCarga: hoy(), tipoComprobante: 'Factura Contado', fecha: d.fecha, numeroFactura: 'SinFC_' + d.fecha.replace(/\//g, '').replace(/(\d{4})(\d{2})(\d{2})/, '$1$3') + '_' + String(n).padStart(2, '0'),
        proveedor: d.proveedor, ruc: '', moneda: d.moneda, monto: Number(d.monto), unidadNegocio: d.unidadNegocio, formaPago: d.formaPago, usuario: s.nombre,
        cargadoAlbor: false, detalle: d.item, archivoId: base64 ? guardarArchivo(nombre, base64) : '' });
      return 'Guardado correctamente';
    },
    listarFacturas(pin, o) {
      const s = sesion(pin);
      const todas = filtrar(s, o);
      const off = (o && o.offset) || 0;
      const lim = (o && o.limite) || 30;
      return { filas: todas.slice(off, off + lim).map(resumen), total: todas.length, hayMas: off + lim < todas.length };
    },
    obtenerDetalleFactura(pin, fid) {
      const s = sesion(pin);
      const f = buscar(fid);
      if (s.verSoloPropias && f.usuario !== s.nombre) throw new Error('No tenés permiso para ver esta factura.');
      const arch = [f.archivoId].concat(docs.filter((d) => String(d.facturaId) === String(fid) && d.archivoId).map((d) => d.archivoId))
        .filter((a) => archivos[a]).map((a) => ({ id: a, nombre: archivos[a].nombre, mimeType: 'image/jpeg', tamanioKB: archivos[a].tamanioKB }));
      return { factura: Object.assign({}, f), items: items[fid] || [], documentos: docs.filter((d) => String(d.facturaId) === String(fid)), archivos: arch };
    },
    eliminarFactura(pin, fid) {
      if (String(pin) !== '1111') throw new Error('No tenés permiso para eliminar facturas.');
      facturas.splice(facturas.indexOf(buscar(fid)), 1);
      return 'ok';
    },
    marcarCargadoAlbor(pin, fid, v) { sesion(pin); buscar(fid).cargadoAlbor = !!v; return 'ok'; },
    actualizarFactura(pin, fid, d) {
      sesion(pin);
      Object.assign(buscar(fid), d, { monto: Number(d.monto) || '', iva5: Number(d.iva5) || '', iva10: Number(d.iva10) || '' });
      items[fid] = d.items || [];
      return 'ok';
    },
    descargarArchivoAdjunto(pin, aid) {
      sesion(pin);
      const a = archivos[aid];
      if (!a) throw new Error('no existe');
      return { base64: a.base64, mimeType: 'application/octet-stream', nombre: a.nombre };
    },
    exportarFacturasExcel(pin, o) {
      const s = sesion(pin);
      if (!filtrar(s, o).length) throw new Error('No hay facturas para exportar con ese filtro.');
      return { base64: 'UEs=', nombre: 'Facturas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    },
    buscarAnticiposPendientes(q, pin) {
      sesion(pin);
      const Q = String(q).toUpperCase();
      return anticipos.filter((a) => (a.proveedor + a.motivo + a.ruc).toUpperCase().indexOf(Q) !== -1);
    },
    vincularAnticipoManual(pin, fid, aid) {
      const s = sesion(pin);
      buscar(fid);
      const a = anticipos.find((x) => String(x.id) === String(aid));
      a.facturasVinculadas++;
      docs.push({ facturaId: fid, tipo: 'Anticipo', fechaCarga: a.fechaCarga, usuario: s.nombre });
      return 'ok';
    },
    listarFacturasMismoProveedor(pin, fid) {
      sesion(pin);
      const f = buscar(fid);
      return facturas.filter((x) => x.id !== f.id && x.ruc === f.ruc).map((x) => ({ id: x.id, numeroFactura: x.numeroFactura, fecha: x.fecha, moneda: x.moneda, monto: x.monto }));
    },
    procesarComprobanteAsociado(base64, tipo, nombre, ids, tipoDoc, pin) {
      const s = sesion(pin);
      const aid = guardarArchivo(nombre, base64);
      ids.forEach((fid) => { buscar(fid); docs.push({ facturaId: fid, tipo: tipoDoc, fechaCarga: hoy(), usuario: s.nombre, archivoId: aid }); });
      return 'ok';
    },
    obtenerResumenFondoFijo(pin) {
      sesion(pin);
      const movs = facturas.filter((f) => f.formaPago === 'Fondo Fijo').map((f) => ({ tipo: 'gasto', id: String(f.id), orden: orden(f.fecha), fecha: f.fecha, numero: f.numeroFactura,
        proveedor: f.proveedor, detalle: f.detalle, moneda: f.moneda || 'PYG', debe: Number(f.monto) || 0, haber: 0 }))
        .concat(fondeos.map((m) => Object.assign({ tipo: 'fondeo', orden: orden(m.fecha), debe: 0, proveedor: 'Zehirut S.A', moneda: 'PYG' }, m)))
        .sort((a, b) => a.orden - b.orden);
      return { saldo: movs.reduce((s, m) => s - m.debe + m.haber, 0), ultimos: movs.slice(-20).reverse() };
    },
    registrarFondeoFondoFijo(base64, tipo, nombre, d, pin) {
      const s = sesion(pin);
      fondeos.push({ id: String(id()), fecha: d.fecha, haber: Number(d.monto), detalle: d.descripcion, usuario: s.nombre, tieneComprobante: !!base64 });
      return 'ok';
    },
    eliminarFondeoFondoFijo(pin, fid) { sesion(pin); fondeos.splice(fondeos.findIndex((m) => m.id === String(fid)), 1); return 'ok'; },
    exportarFondoFijoExcel(pin) { sesion(pin); return { base64: 'UEs=', nombre: 'Fondo Fijo.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }; },
  };
};
