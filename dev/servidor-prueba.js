// Servidor de PRUEBA local (no se publica). Sirve la carpeta docs/ (la app) y simula el
// Apps Script: carga apps-script/Code.gs tal cual, con Google Sheets falsos en memoria
// (el de Registros Zehirut y el de Lluvias), para probar sin tocar Google.
//
//   node dev/servidor-prueba.js [puerto]
//
// HOY=AAAA-MM-DD simula la fecha del script. Usuarios de prueba: PIN 1111 = Enrique (administra todo), 2222 = Osmar, 3333 = Ver
// (solo mira stock y lluvias).
// GET /_hojas -> muestra el contenido de las hojas simuladas (JSON).
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUERTO = Number(process.argv[2]) || 8766;
const RAIZ = path.join(__dirname, '..', 'docs');

// ---------------------------------------------------------------- Google falso
function formatDate(fecha, zona, patron) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).forEach((x) => { p[x.type] = x.value; });
  return patron.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}

class Rango {
  constructor(h, f, c, nf, nc) { Object.assign(this, { h, f, c, nf, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const fila = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.h.celdas[this.f - 1 + i] || [])[this.c - 1 + j];
        fila.push(v === undefined ? '' : v);
      }
      out.push(fila);
    }
    return out;
  }
  setValues(v) {
    // Igual que Google: las filas tienen que tener exactamente el tamaño del rango.
    if (v.length !== this.nf || v.some((fila) => fila.length !== this.nc)) {
      throw new Error('El número de columnas de los datos no coincide con el del intervalo. Los datos tienen ' + (v.find((fila) => fila.length !== this.nc) || v[0] || []).length + ' y el intervalo, ' + this.nc + '.');
    }
    v.forEach((fila, i) => fila.forEach((x, j) => {
      const r = this.f - 1 + i;
      this.h.celdas[r] = this.h.celdas[r] || [];
      this.h.celdas[r][this.c - 1 + j] = x instanceof Date ? x.toISOString() : x;
    }));
    return this;
  }
  // Como en Google: en un rango de varias celdas, setValue pone el mismo valor en todas.
  setValue(x) { return this.setValues(Array.from({ length: this.nf }, () => new Array(this.nc).fill(x))); }
  getValue() { return this.getValues()[0][0]; }
  clearContent() {
    for (let i = 0; i < this.nf; i++) {
      const fila = this.h.celdas[this.f - 1 + i];
      if (fila) for (let j = 0; j < this.nc; j++) fila[this.c - 1 + j] = '';
    }
    this.h.recortar();
    return this;
  }
}
['setFontWeight', 'setBackground', 'setBackgrounds', 'setNumberFormat', 'setHorizontalAlignment', 'merge', 'setBorder',
  'setVerticalAlignment', 'setFontSize', 'setDataValidation', 'insertCheckboxes', 'setNote'].forEach((m) => { Rango.prototype[m] = function () { return this; }; });

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = []; }
  getName() { return this.nombre; }
  recortar() {
    while (this.celdas.length && !(this.celdas[this.celdas.length - 1] || []).some((x) => x !== '' && x !== undefined)) this.celdas.pop();
  }
  getLastRow() { this.recortar(); return this.celdas.length; }
  getLastColumn() { return Math.max(0, ...this.celdas.map((f) => (f || []).length)); }
  getRange(f, c, nf, nc) {
    if (typeof f === 'string') {
      // 'A2:H2' como en Google; 'A:B' (columnas enteras) solo se usa para dar formato.
      const col = (l) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const m = f.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      if (!m) return new Rango(this, 1, 1, 1, 1);
      const f1 = Number(m[2]), c1 = col(m[1]);
      return new Rango(this, f1, c1, m[4] ? Number(m[4]) - f1 + 1 : 1, m[3] ? col(m[3]) - c1 + 1 : 1);
    }
    return new Rango(this, f, c, nf || 1, nc || 1);
  }
  getDataRange() { return new Rango(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  clear() { this.celdas = []; }
}
Hoja.prototype.setName = function (n) { this.nombre = n; return this; };
['setFrozenRows', 'setFrozenColumns', 'setColumnWidth', 'setColumnWidths', 'autoResizeColumns', 'setRowHeight'].forEach((m) => { Hoja.prototype[m] = function () { return this; }; });

function nuevoLibro(nombres, url) {
  const hojas = nombres.map((n) => new Hoja(n));
  return {
    hojas,
    getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
    insertSheet: (n) => { const h = new Hoja(n); hojas.push(h); return h; },
    getSheets: () => hojas.slice(),
    deleteSheet: (h) => { hojas.splice(hojas.indexOf(h), 1); },
    setSpreadsheetTimeZone() {}, setActiveSheet() {}, moveActiveSheet() {},
    getUrl: () => url,
  };
}
const libro = nuevoLibro(['Hoja 1'], 'https://docs.google.com/spreadsheets/d/PRUEBA');
const libroLluvias = nuevoLibro(['Lluvias'], 'https://docs.google.com/spreadsheets/d/LLUVIAS');
// "datos para el informe" (la planilla que lee la tarea diaria de Claude)
const libroInforme = nuevoLibro(['Hoja 1'], 'https://docs.google.com/spreadsheets/d/INFORME');
libroLluvias.getSheetByName('Lluvias').getRange(1, 1, 1, 7).setValues([['ID', 'Finca', 'Sector', 'Fecha', 'mm', 'Usuario', 'Fecha carga']]);

const validacion = { requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } };
const contexto = {
  SpreadsheetApp: { flush() {}, create: (n) => { ultimoExcel = nuevoLibro(['Hoja 1'], 'excel'); ultimoExcel.nombre = n; ultimoExcel.getId = () => 'EXCEL'; return ultimoExcel; }, getActive: () => libro, openById: (id) => (id === '1DXk0c3HOAsjoPwmfZzqSCUEZ9ByAOL9XlkmRdEBT7Ds' ? libroLluvias : libroInforme), newDataValidation: () => validacion },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [80, 75] }) }) },
  ScriptApp: { getOAuthToken: () => 'x' },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (alg, txt) => [...require('crypto').createHash(alg).update(String(txt)).digest()], base64Encode: (b) => Buffer.from(b).toString('base64'), formatDate, newBlob: (bytes, tipo, nombre) => ({ nombre, bytes }), base64Decode: (b) => Buffer.from(b, 'base64') },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].hasta > Date.now() ? cache[k].v : null),
      put: (k, v, seg) => { cache[k] = { v, hasta: Date.now() + seg * 1000 }; },
    }),
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in propiedades ? propiedades[k] : null),
      setProperty: (k, v) => { propiedades[k] = String(v); },
      deleteProperty: (k) => { delete propiedades[k]; },
    }),
  },
  // ZehirutApp (biblioteca de Facturas y Fondo fijo), simulado en memoria.
  ZA: require('./za-prueba.js')(),
  CalendarApp: { getCalendarById: () => null },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; } }) },
  // Drive: el PDF de Tapfeed "se guarda" en memoria; la carga inicial se lee de la ruta que diga
  // la variable CARGA_INICIAL (un CSV local, nunca en el repositorio).
  DriveApp: {
    getFileById: () => ({ setTrashed() {} }),
    getFolderById: () => ({ createFile: (b) => { pdfsGuardados.push(b.nombre); return { getUrl: () => 'https://drive.google.com/PRUEBA/' + encodeURIComponent(b.nombre) }; } }),
    getFilesByName: () => {
      const ruta = process.env.CARGA_INICIAL;
      let dado = !(ruta && fs.existsSync(ruta) && !cargaImportada);
      return { hasNext: () => !dado, next: () => { dado = true; return { getBlob: () => ({ getDataAsString: () => fs.readFileSync(ruta, 'utf8') }), setName: () => { cargaImportada = true; } }; } };
    },
  },
  console,
};
// HOY=2026-10-02 simula esa fecha en el script (para probar lo que arranca más adelante).
if (process.env.HOY) {
  const RealDate = Date;
  const falsa = new RealDate(process.env.HOY + 'T12:00:00-03:00').getTime();
  contexto.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(falsa); } static now() { return falsa; } };
}
const propiedades = {};
const pdfsGuardados = [];
let ultimoExcel = null;
let cargaImportada = false;
const cache = {};
vm.createContext(contexto);
// Todos los .gs, como en Apps Script (comparten el mismo espacio de nombres).
const carpetaGs = path.join(__dirname, '..', 'apps-script');
const codigo = fs.readdirSync(carpetaGs).filter((f) => f.endsWith('.gs')).sort()
  .map((f) => fs.readFileSync(path.join(carpetaGs, f), 'utf8')).join('\n');
vm.runInContext(codigo + '\nthis.__api = { doPost, doGet };', contexto);
const api = contexto.__api;
api.doGet();   // primera apertura: prepara la planilla

// PIN de prueba (en Google se cargan a mano en la hoja Usuarios).
const usuarios = libro.getSheetByName('Usuarios');
usuarios.getRange(2, 2).setValue('1111');
usuarios.getRange(3, 2).setValue('2222');
usuarios.getRange(4, 1, 1, 8).setValues([['Visita', '3333', true, 'Ver', 'Ver', '', '', '']]);

// ---------------------------------------------------------------- servidor
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api' && req.method === 'POST') {
    let cuerpo = '';
    req.on('data', (d) => { cuerpo += d; });
    req.on('end', () => {
      // Demora como la de Google, para ver los estados "sincronizando".
      setTimeout(() => {
        const r = api.doPost({ postData: { contents: cuerpo } });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(r.texto);
      }, 400);
    });
    return;
  }
  if (url.pathname === '/_excel') {   // contenido del último Excel generado
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(ultimoExcel ? Object.fromEntries(ultimoExcel.hojas.map((h) => [h.nombre, h.celdas])) : {}, null, 1));
    return;
  }
  if (url.pathname === '/_hojas') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const todas = {};
    libro.hojas.forEach((h) => { todas[h.nombre] = h.celdas; });
    todas['(planilla Lluvias)'] = libroLluvias.hojas[0].celdas;
    libroInforme.hojas.forEach((h) => { todas['(informe) ' + h.nombre] = h.celdas; });
    res.end(JSON.stringify(todas, null, 1));
    return;
  }
  if (url.pathname === '/config.js') {       // apunta la app al Apps Script simulado
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end("const SCRIPT_URL = location.origin + '/api';");
    return;
  }
  let archivo = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
  if (url.pathname.endsWith('/')) archivo = path.join(archivo, 'index.html');
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); res.end('no encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  });
}).listen(PUERTO, () => console.log('Servidor de prueba en http://localhost:' + PUERTO));
