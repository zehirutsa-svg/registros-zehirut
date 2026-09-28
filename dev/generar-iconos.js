// Genera los íconos de la app (docs/icons/) a partir del diseño elegido: block con espiral,
// marca a fuego de ZEHIRUT en la hoja y lápiz amarillo, fondo blanco (sesión 2026-09-28).
// Uso: node dev/generar-iconos.js   (necesita Chrome instalado para pasar el SVG a PNG)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const raiz = path.join(__dirname, '..'), destino = path.join(raiz, 'docs', 'icons');
const b64 = fs.readFileSync(path.join(__dirname, 'logo-zehirut-original.png')).toString('base64');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Solo el dibujo del centro del logo (sin el texto del círculo); el triángulo blanco tapa
// la punta de una letra del texto que entra en el recorte.
const marca = (x, y, w) => `<svg x="${x}" y="${y}" width="${w}" height="${w * 305 / 420}" viewBox="88 158 420 305" style="mix-blend-mode:multiply"><image href="data:image/png;base64,${b64}" width="584" height="600"/><polygon points="430,470 515,470 515,436" fill="#fff"/></svg>`;

const defs = `<defs>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".33" stop-color="#ffd23f"/><stop offset=".33" stop-color="#ffb000"/><stop offset=".66" stop-color="#ffb000"/><stop offset=".66" stop-color="#e98a00"/><stop offset="1" stop-color="#e98a00"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".5" stop-color="#b9bec4"/><stop offset="1" stop-color="#7d848c"/></linearGradient>
<linearGradient id="eraser" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c1"/><stop offset="1" stop-color="#e8637f"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf3"/><stop offset="1" stop-color="#f3ecd4"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9463b"/><stop offset="1" stop-color="#a3261f"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".35"/></filter>
</defs>`;

// Lápiz a lo largo de +x con la punta en (0,0)
function lapiz(x, y, rot, L) {
  const w = 44, h = w / 2;
  return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#sh)">
<path d="M0 0 L70 ${-h} L70 ${h} Z" fill="#f6d2a2"/><path d="M0 0 L70 ${h} L70 ${h * 0.35} Z" fill="#dfae76"/>
<path d="M0 0 L24 ${-h * 0.34} L24 ${h * 0.34} Z" fill="#333"/>
<rect x="70" y="${-h}" width="${L - 150}" height="${w}" fill="url(#body)"/>
<rect x="${L - 80}" y="${-h}" width="42" height="${w}" fill="url(#metal)"/>
<rect x="${L - 72}" y="${-h}" width="6" height="${w}" fill="#8a9098"/><rect x="${L - 54}" y="${-h}" width="6" height="${w}" fill="#8a9098"/>
<path d="M${L - 38} ${-h} h24 a14 ${h} 0 0 1 0 ${w} h-24 Z" fill="url(#eraser)"/></g>`;
}

let renglones = '', anillos = '';
for (let y = 160; y <= 430; y += 32) renglones += `<line x1="112" y1="${y}" x2="388" y2="${y}" stroke="#b9d3ea" stroke-width="4"/>`;
for (let i = 0; i < 6; i++) { const cx = 150 + i * 44; anillos += `<rect x="${cx - 9}" y="58" width="18" height="58" rx="9" fill="url(#metal)" stroke="#555" stroke-width="3"/><circle cx="${cx}" cy="106" r="8" fill="#3a2a22"/>`; }
const dibujo = `<g filter="url(#sh)"><rect x="100" y="80" width="300" height="380" rx="18" fill="url(#red)"/><rect x="112" y="90" width="276" height="360" rx="10" fill="url(#paper)"/></g>
${renglones}<line x1="160" y1="92" x2="160" y2="448" stroke="#f08a8a" stroke-width="4"/>${anillos}
${marca(135, 180, 230)}${lapiz(335, 478, -62, 265)}`;

// esquinas: radio del fondo blanco (0 = cuadrado lleno); escala: tamaño del dibujo (maskable necesita margen)
function svg(esquinas, escala) {
  const t = 256 - 256 * escala;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" rx="${esquinas}" fill="#fff"/><g transform="translate(${t} ${t}) scale(${escala})">${dibujo}</g></svg>`;
}

const iconos = [
  ['logo.svg', 512, svg(110, 1)],
  ['icon-512.png', 512, svg(110, 1)],
  ['icon-192.png', 192, svg(110, 1)],
  ['icon-maskable-512.png', 512, svg(0, 0.78)],
  ['apple-touch-icon.png', 180, svg(0, 0.88)],
  ['favicon.png', 48, svg(110, 1)],
];
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'iconos-'));
for (const [nombre, tam, contenido] of iconos) {
  const salida = path.join(destino, nombre);
  if (nombre.endsWith('.svg')) { fs.writeFileSync(salida, contenido); continue; }
  const html = path.join(tmp, 'i.html');
  fs.writeFileSync(html, `<html><body style="margin:0;background:transparent"><div style="width:${tam}px;height:${tam}px">${contenido.replace('<svg ', `<svg width="${tam}" height="${tam}" `)}</div></body></html>`);
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${tam},${tam}`, `--screenshot=${salida}`, 'file:///' + html.split(path.sep).join('/')], { stdio: 'ignore' });
  console.log('ok', nombre);
}
