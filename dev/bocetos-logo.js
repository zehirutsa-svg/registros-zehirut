const fs=require('fs');
const b64=fs.readFileSync('C:/Users/kikeD/OneDrive/Documentos/Proyectos Claude/Registro de score confinamiento/docs/icons/logo.png').toString('base64');
const mark=(x,y,w)=>`<svg x="${x}" y="${y}" width="${w}" height="${w*305/420}" viewBox="88 158 420 305" style="mix-blend-mode:multiply"><image href="data:image/png;base64,${b64}" width="584" height="600"/><polygon points="430,470 515,470 515,436" fill="#fff"/></svg>`;
const defs=`<defs>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".33" stop-color="#ffd23f"/><stop offset=".33" stop-color="#ffb000"/><stop offset=".66" stop-color="#ffb000"/><stop offset=".66" stop-color="#e98a00"/><stop offset="1" stop-color="#e98a00"/></linearGradient>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".5" stop-color="#b9bec4"/><stop offset="1" stop-color="#7d848c"/></linearGradient>
<linearGradient id="eraser" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3c1"/><stop offset="1" stop-color="#e8637f"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf3"/><stop offset="1" stop-color="#f3ecd4"/></linearGradient>
<linearGradient id="pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe3f3"/><stop offset="1" stop-color="#eec6e3"/></linearGradient>
<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b5a4e"/><stop offset="1" stop-color="#3f332c"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9463b"/><stop offset="1" stop-color="#a3261f"/></linearGradient>
<linearGradient id="green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f7d4f"/><stop offset="1" stop-color="#14502f"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".35"/></filter>
</defs>`;
// pencil along +x, tip at (0,0), length L, width 44
function pencil(x,y,rot,L=300){const w=44,h=w/2;return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#sh)">
<path d="M0 0 L70 ${-h} L70 ${h} Z" fill="#f6d2a2"/><path d="M0 0 L70 ${h} L70 ${h*0.35} Z" fill="#dfae76"/>
<path d="M0 0 L24 ${-h*0.34} L24 ${h*0.34} Z" fill="#333"/>
<rect x="70" y="${-h}" width="${L-150}" height="${w}" fill="url(#body)"/>
<rect x="${L-80}" y="${-h}" width="42" height="${w}" fill="url(#metal)"/>
<rect x="${L-72}" y="${-h}" width="6" height="${w}" fill="#8a9098"/><rect x="${L-54}" y="${-h}" width="6" height="${w}" fill="#8a9098"/>
<path d="M${L-38} ${-h} h24 a14 ${h} 0 0 1 0 ${w} h-24 Z" fill="url(#eraser)"/>
</g>`;}
function lines(x0,x1,y0,y1,step,col){let s='';for(let y=y0;y<=y1;y+=step)s+=`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${col}" stroke-width="4"/>`;return s;}
const tile=(inner,bg)=>`<svg viewBox="0 0 512 512" width="220" height="220" xmlns="http://www.w3.org/2000/svg">${defs}${bg?`<rect width="512" height="512" rx="110" fill="${bg}"/>`:''}${inner}</svg>`;
// 1: memo rosa estilo emoji
const v1=`<g filter="url(#sh)"><path d="M110 70 H370 L410 110 V450 H110 Z" fill="url(#pink)"/><path d="M370 70 V110 H410 Z" fill="#d9a6c8"/></g>
<rect x="140" y="100" width="170" height="14" rx="4" fill="#c79bbd"/>
${lines(140,380,150,420,34,'#dcb4d2')}
${mark(125,175,240)}
${pencil(335,475,-62,265)}`;
// 2: block con espiral
let rings='';for(let i=0;i<6;i++){const cx=150+i*44;rings+=`<rect x="${cx-9}" y="58" width="18" height="58" rx="9" fill="url(#metal)" stroke="#555" stroke-width="3"/><circle cx="${cx}" cy="106" r="8" fill="#3a2a22"/>`;}
const v2=`<g filter="url(#sh)"><rect x="100" y="80" width="300" height="380" rx="18" fill="url(#red)"/><rect x="112" y="90" width="276" height="360" rx="10" fill="url(#paper)"/></g>
${lines(112,388,160,430,32,'#b9d3ea')}<line x1="160" y1="92" x2="160" y2="448" stroke="#f08a8a" stroke-width="4"/>
${rings}
${mark(135,180,230)}
${pencil(335,478,-62,265)}`;
// 3: tabla con clip
const v3=`<g filter="url(#sh)"><rect x="95" y="70" width="310" height="400" rx="22" fill="url(#board)"/><rect x="120" y="105" width="260" height="340" rx="6" fill="url(#paper)"/></g>
${lines(140,360,175,420,32,'#d6ccb0')}
<g filter="url(#sh)"><rect x="185" y="52" width="130" height="62" rx="14" fill="url(#metal)" stroke="#6b7178" stroke-width="4"/><circle cx="250" cy="70" r="11" fill="#4a4f55"/></g>
${mark(135,190,220)}
${pencil(340,478,-62,265)}`;
const vs=[['1: hojita rosa',v1],['2: block con espiral',v2],['3: tabla con clip',v3]];
const html=`<!doctype html><meta charset="utf-8"><title>Logo Registros Zehirut</title>
<style>body{font-family:system-ui;background:#1b1b1b;color:#fff;margin:16px}.row{display:flex;gap:18px;flex-wrap:wrap}.c{padding:10px;border-radius:14px;text-align:center;background:#2a2a2a}.s svg{width:56px;height:56px;margin:4px}</style>
<div class="row">${vs.map(([t,s])=>`<div class="c"><b>${t}</b><br>${tile(s,'#fff')}<br>${tile(s,'url(#green)')}<div class="s">en el celular: ${tile(s,'#fff')}${tile(s,'url(#green)')}</div></div>`).join('')}</div>`;
fs.writeFileSync('logo-bocetos.html',html);
