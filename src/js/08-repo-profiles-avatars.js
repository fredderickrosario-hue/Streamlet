/* ---------- addon repository ---------- */
const STARTER_REPO = [
  {name:'Cinemeta', url:'https://v3-cinemeta.strem.io/manifest.json', desc:'The official movie and series catalogs and metadata.'},
  {name:'OpenSubtitles v3', url:'https://opensubtitles-v3.strem.io/manifest.json', desc:'Subtitles in many languages.'},
  {name:'Kitsu Anime', url:'https://anime-kitsu.strem.fun/manifest.json', desc:'Anime catalogs and metadata.'},
  {name:'Québec (TVA+)', url:'quebec', desc:'Quebec series from TVA+ such as Les armes and Indéfendable. Built in, no account needed. Android apps only.'},
  {name:'Blender open movies (demo)', url:'demo', desc:'Built-in sample: free, openly licensed short films.'}
];
const reposGet = () => lsGet('streamlet.repos', []);
const reposSet = v => { lsSet('streamlet.repos', v); stamp('reposT'); };
const hostOf = u => { try { return new URL(u).hostname; } catch { return String(u).slice(0, 40); } };
let repo = {src:null, q:'', items:null, err:'', show:40, busy:false, loadedFor:''};
function repoSources(){
  const out = [];
  const seen = new Set();
  for (const a of addons) for (const c of (a.manifest.addonCatalogs || [])) {
    const nm = `${c.name || c.id}${c.type && c.type !== 'all' ? ' (' + c.type + ')' : ''} · ${an(a)}`;
    if (seen.has(nm)) continue; seen.add(nm);
    out.push({id:`ac:${a.uid}:${c.type}:${c.id}`, name:nm, ac:{a, c}, group:String(c.name || c.id), type:c.type || 'all', owner:an(a)});
  }
  for (const r of reposGet()) out.push({id:'u:' + r.id, name:r.name, url:r.url, user:true, group:r.name, type:'all', owner:''});
  return out;
}
function normRepoItem(x){
  const m = x.manifest || {}, bh = m.behaviorHints || {};
  const url = x.transportUrl || x.url || x.manifestUrl || x.link || '';
  return {name:x.name || m.name || hostOf(url), desc:x.description || x.desc || m.description || '', url, types:m.types || x.types || [],
    cfg: !!(bh.configurable || x.configure), cfgReq: !!(bh.configurationRequired || x.requiresConfig)};
}
async function loadRepo(src){
  if (src.id === 'starter') return STARTER_REPO.map(x => ({...x, types:[], cfg:false, cfgReq:false}));
  if (src.ac) { const r = await getJSON(`${src.ac.a.base}/addon_catalog/${src.ac.c.type}/${enc(src.ac.c.id)}.json`); return (r.addons || []).map(normRepoItem); }
  const r = await getJSON(src.url);
  return (Array.isArray(r) ? r : (r.addons || r.items || [])).map(normRepoItem);
}
async function pickRepo(id){
  const src = repoSources().find(x => x.id === id) || repoSources()[0];
  if (!src) { repo = {...repo, src:null, items:[], err:'', busy:false}; renderRepo(); return; }
  repo = {...repo, src:src.id, items:null, err:'', show:40, busy:true}; renderRepo();
  try { repo.items = (await withTimeout(loadRepo(src), 15000)).filter(x => x.url); } catch (e) { repo.err = "Couldn't load this list: " + (e.message || e); repo.items = []; }
  repo.busy = false; renderRepo();
}
const installedByUrl = u => { try { const p = parseAddonUrl(u).url; return addons.find(a => a.url === p); } catch { return null; } };
function repoCard(it){
  const inst = installedByUrl(it.url), btns = [];
  if (inst) btns.push(h('span', {class:'tag'}, 'Installed ✓'));
  else {
    if (it.cfgReq) btns.push(h('button', {class:'btn sm', type:'button', onclick:() => openConfigure(it.url)}, 'Set up ↗'));
    btns.push(h('button', {class:it.cfgReq ? 'btn ghost sm' : 'btn sm', type:'button', onclick:async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Installing…';
      try { const m = await installAddon(it.url); toast('Installed ' + m.name); } catch (e) { toast(e.message || 'Could not install.'); }
      renderAddons(); if ($('#repoBox').open) renderRepo();
    }}, 'Install'));
  }
  if (it.cfg && !it.cfgReq) btns.push(h('button', {class:'btn ghost sm', type:'button', onclick:() => openConfigure(it.url)}, 'Set up ↗'));
  return h('div', {class:'rcard'}, h('h4', null, it.name), it.desc ? h('p', null, it.desc) : null, h('div', {class:'rrow'}, btns));
}
function renderBrowse(){ $('#recList').replaceChildren(...STARTER_REPO.map(it => repoCard({...it, types:[], cfg:false, cfgReq:false}))); }
function renderRepo(){
  const box = $('#repoBody'); if (!box) return;
  const srcs = repoSources(), cursrc = srcs.find(x => x.id === repo.src) || srcs[0] || {};
  const TYPE_NAMES = {all:'All', movie:'Movies', series:'Shows', channel:'Channels', tv:'TV', anime:'Anime', other:'Other'};
  const tName = t => TYPE_NAMES[t] || (String(t).charAt(0).toUpperCase() + String(t).slice(1));
  const groups = []; for (const x of srcs) { const k = x.group + (srcs.some(y => y !== x && y.group === x.group && y.owner !== x.owner) ? ' · ' + x.owner : ''); x.gk = k; if (!groups.some(g => g.k === k)) groups.push({k, first:x}); }
  const chip = (label, on, fn) => h('button', {class:'chip' + (on ? ' on' : ''), type:'button', onclick:fn}, label);
  const inGroup = srcs.filter(x => x.gk === cursrc.gk);
  const sel = srcs.length ? h('div', {style:'display:flex;flex-direction:column;gap:10px'},
    h('div', {class:'rrow', style:'flex-wrap:wrap;gap:8px'}, groups.map(g => chip(g.k, g.k === cursrc.gk, () => pickRepo(g.first.id)))),
    inGroup.length > 1 ? h('div', {class:'rrow', style:'flex-wrap:wrap;gap:8px'}, inGroup.map(x => chip(tName(x.type), x.id === cursrc.id, () => pickRepo(x.id)))) : null)
    : h('p', {class:'spin', style:'padding:0'}, 'No extra lists yet. Add one below.');
  const q = h('input', {class:'f', type:'search', placeholder:'Search this list…', style:'width:100%;margin-top:8px'}); q.value = repo.q;
  q.oninput = () => { repo.q = q.value; repo.show = 40; clearTimeout(renderRepo._t); renderRepo._t = setTimeout(() => { renderRepo(); const n = $('#repoBody input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  const nameIn = h('input', {class:'f', placeholder:'Name (optional)', style:'flex:1;min-width:90px'}), urlIn = h('input', {class:'f', placeholder:'Link to a list (JSON)', style:'flex:2;min-width:140px', autocapitalize:'off'});
  const addRepo = h('button', {class:'btn ghost sm', type:'button', onclick:() => {
    const u = urlIn.value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Paste the link to a JSON list.'); return; }
    const r = {id:Date.now().toString(36), name:nameIn.value.trim() || hostOf(u), url:u}; reposSet([...reposGet(), r]); pickRepo('u:' + r.id);
  }}, 'Add list');
  const items = (repo.items || []).filter(x => !repo.q || (x.name + ' ' + x.desc).toLowerCase().includes(repo.q.toLowerCase()));
  const cards = items.slice(0, repo.show).map(repoCard);
  box.replaceChildren(
    h('p', {class:'spin', style:'padding:0 0 8px'}, 'Choose a list of addons, then Install the ones you want.'), h('div', {class:'lbl', style:'margin-top:0'}, 'Addon list'), sel, srcs.length ? q : null,
    repo.busy ? h('p', {class:'spin', style:'padding:8px 0'}, 'Loading…') : null,
    repo.err ? h('p', {class:'msg err'}, repo.err) : null,
    ...cards,
    items.length > repo.show ? h('button', {class:'btn ghost sm', type:'button', style:'margin:6px 0', onclick:() => { repo.show += 40; renderRepo(); }}, `Show more (${items.length - repo.show} left)`) : null,
    srcs.length && !repo.busy && repo.items && !items.length && !repo.err ? h('p', {class:'spin', style:'padding:8px 0'}, 'Nothing matches.') : null,
    h('div', {class:'lbl'}, 'Add your own list (advanced)'),
    h('div', {class:'rrow'}, nameIn, urlIn, addRepo),
    cursrc.user ? h('button', {class:'lnk', type:'button', onclick:() => { reposSet(reposGet().filter(r => 'u:' + r.id !== cursrc.id)); pickRepo('starter'); }}, 'Remove this list') : null,
    h('p', {class:'spin', style:'padding:6px 0 0'}, 'Advanced: you can add your own list, a link to a JSON file of addons.'));
}
$('#repoBox').addEventListener('toggle', () => { if ($('#repoBox').open) { if (repo.items === null && !repo.busy) pickRepo(repo.src || (repoSources()[0] || {}).id); else renderRepo(); } });

$('#addForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const msg = $('#addMsg'); msg.className='msg'; msg.textContent='Installing…';
  try {
    const m = await installAddon($('#addUrl').value);
    msg.className='msg ok'; msg.textContent = `Installed ${m.name}.`; $('#addUrl').value='';
    renderAddons();
  } catch(e) { msg.className='msg err'; msg.textContent = e.message; }
});
$('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeSearch(); } });
$('#q').addEventListener('blur', () => { setTimeout(() => { if (srchOn && !$('#q').value.trim() && document.activeElement !== $('#q') && !$('#tabsBar').contains(document.activeElement)) closeSearch(); }, 200); });
let qT; $('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(()=>{ if ($('#home').hidden) showTab('home'); else renderHome($('#q').value.trim()); }, 350); });


/* ---------- languages + settings ---------- */
const LANGS = [
  {n:'English', c:['eng','en']}, {n:'French', c:['fre','fra','fr']}, {n:'Spanish', c:['spa','es']}, {n:'Spanish (Latin America)', c:['spl']},
  {n:'German', c:['ger','deu','de']}, {n:'Italian', c:['ita','it']}, {n:'Portuguese', c:['por','pt']}, {n:'Portuguese (Brazil)', c:['pob','ptbr','pt-br']},
  {n:'Japanese', c:['jpn','ja']}, {n:'Korean', c:['kor','ko']}, {n:'Russian', c:['rus','ru']}, {n:'Chinese', c:['chi','zho','zh']},
  {n:'Hindi', c:['hin','hi']}, {n:'Arabic', c:['ara','ar']}, {n:'Dutch', c:['dut','nld','nl']}, {n:'Turkish', c:['tur','tr']},
  {n:'Polish', c:['pol','pl']}, {n:'Swedish', c:['swe','sv']}, {n:'Greek', c:['ell','gre','el']}
];
const langOf = code => LANGS.find(l => l.c.includes(String(code||'').toLowerCase()));
const langName = code => (langOf(code) || {n:String(code||'Unknown').toUpperCase()}).n;
const sameLang = (a, b) => { const x = langOf(a), y = langOf(b); return x && y ? x === y : String(a).toLowerCase() === String(b).toLowerCase(); };
const code2 = l => (langOf(l) || {c:[]}).c.find(x => x.length === 2);

/* ---------- profiles (per-profile settings, history, last space) ---------- */
/* ---------- avatars: original characters drawn in code (48 of them) ---------- */
const AV_COUNT = 48, AD = '#2a2233';
const AV_PAL = [['#ff7eb3','#ff5f8d','#ffd9b8'],['#7c5cff','#4fc3ff','#ffe29a'],['#34d399','#22d3ee','#fff3c4'],['#f6a23c','#ff6b6b','#ffffff'],
  ['#a78bfa','#f9a8d4','#ffffff'],['#38bdf8','#6366f1','#ffc9a8'],['#fb7185','#fbbf24','#fff7e6'],['#2dd4bf','#818cf8','#ffd8b0'],
  ['#fda4af','#fde68a','#b6f0ea'],['#22c55e','#14b8a6','#fef08a'],['#f43f5e','#fb923c','#ffe7d6'],['#334155','#64748b','#e5e7eb']];
let avUid = 0;
function avSvg(i){
  const gid = 'avg' + i + '_' + (++avUid);
  const pal = AV_PAL[(i * 5 + Math.floor(i / 16) * 3) % AV_PAL.length], c = pal[2], type = i % 16, acc = (Math.floor(i / 16) + i % 5) % 6;
  const circ = (cx, cy, r, f) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`;
  const ell = (cx, cy, rx, ry, f, rot = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  const eyes = (y = 55, gap = 14, r = 4.4) => circ(50 - gap, y, r, AD) + circ(50 + gap, y, r, AD) + circ(50 - gap + 1.5, y - 1.5, 1.5, '#fff') + circ(50 + gap + 1.5, y - 1.5, 1.5, '#fff');
  const smile = (y = 67, w = 8) => `<path d="M${50 - w} ${y}q${w} ${w * .9} ${2 * w} 0" fill="none" stroke="${AD}" stroke-width="2.6" stroke-linecap="round"/>`;
  const nose = (y = 62, col = '#ff8aa5') => `<path d="M46 ${y}h8l-4 4.5z" fill="${col}"/>`;
  const B = [
    () => `<path d="M24 42L27 17L45 32Z" fill="${c}"/><path d="M76 42L73 17L55 32Z" fill="${c}"/><path d="M29 36L30 25L38 32Z" fill="#ff9db5"/><path d="M71 36L70 25L62 32Z" fill="#ff9db5"/>${circ(50,57,28,c)}${eyes()}${nose()}<path d="M22 60h13M22 66l12-2M78 60H65M78 66l-12-2" stroke="${AD}" stroke-width="1.6" stroke-linecap="round"/>${smile(69,7)}`,
    () => `${circ(26,33,11,'#a8693f')}${circ(74,33,11,'#a8693f')}${circ(26,33,6,'#d9a07a')}${circ(74,33,6,'#d9a07a')}${circ(50,57,29,'#b9774e')}${ell(50,66,13,10,'#f4dcc4')}${eyes(51,15,4)}${ell(50,61,4.8,3.4,AD)}<path d="M50 64v4M45 70q5 4 10 0" stroke="${AD}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M50 88L19 54L22 22L42 37Q50 35 58 37L78 22L81 54Z" fill="#f08a3c"/><path d="M22 22L30 43L40 38Z" fill="#7a3a1a"/><path d="M78 22L70 43L60 38Z" fill="#7a3a1a"/><path d="M50 86L34 62Q50 72 66 62Z" fill="#fff"/>${eyes(54,14,3.8)}${circ(50,80,4.2,AD)}`,
    () => `${ell(38,24,7,19,c)}${ell(62,24,7,19,c)}${ell(38,26,3.6,13,'#ffa9c0')}${ell(62,26,3.6,13,'#ffa9c0')}${circ(50,61,27,c)}${eyes(58,13)}${nose(64)}${smile(71,6)}<rect x="47" y="73" width="6" height="6" rx="1.5" fill="#fff" stroke="${AD}" stroke-width="1"/>`,
    () => `<rect x="48.5" y="12" width="3" height="15" fill="#9aa4b5"/>${circ(50,11,4.5,'#ff5d6c')}<rect x="20" y="27" width="60" height="54" rx="14" fill="#c7d0de"/><rect x="26" y="35" width="48" height="31" rx="9" fill="#27304a"/><rect x="34" y="44" width="9" height="13" rx="3" fill="#6ff2ff"/><rect x="57" y="44" width="9" height="13" rx="3" fill="#6ff2ff"/><rect x="38" y="72" width="24" height="5" rx="2.5" fill="#27304a"/><rect x="12" y="45" width="8" height="17" rx="4" fill="#9aa4b5"/><rect x="80" y="45" width="8" height="17" rx="4" fill="#9aa4b5"/>`,
    () => `<path d="M30 33L26 14L42 28Z" fill="#fff2b0"/><path d="M70 33L74 14L58 28Z" fill="#fff2b0"/>${circ(50,58,29,'#8e5cf0')}${circ(50,52,13,'#fff')}${circ(50,52,6.5,AD)}${circ(52,50,2,'#fff')}<path d="M36 70q14 12 28 0z" fill="#fff" stroke="${AD}" stroke-width="2"/>`,
    () => `${ell(50,56,25,31,'#8be28b')}${ell(38,56,8,12,AD,-20)}${ell(62,56,8,12,AD,20)}${circ(36,52,2.2,'#fff')}${circ(60,52,2.2,'#fff')}<path d="M43 74q7 5 14 0" fill="none" stroke="${AD}" stroke-width="2.4" stroke-linecap="round"/><path d="M50 26V15" stroke="#6bc96b" stroke-width="3"/>${circ(50,13,3.6,'#ff7ad9')}`,
    () => `<path d="M24 36L30 18L44 32Z" fill="#8a5a3c"/><path d="M76 36L70 18L56 32Z" fill="#8a5a3c"/>${circ(50,58,29,'#a36e4b')}${circ(37,52,12,'#fff')}${circ(63,52,12,'#fff')}${circ(37,52,6,AD)}${circ(63,52,6,AD)}${circ(39,50,2,'#fff')}${circ(65,50,2,'#fff')}<path d="M45 60h10l-5 9z" fill="#ffb02e"/><path d="M36 77q5-5 10 0M54 77q5-5 10 0" stroke="#7d4f33" stroke-width="2" fill="none"/>`,
    () => `${circ(26,32,11,AD)}${circ(74,32,11,AD)}${circ(50,57,29,'#fff')}${ell(37,53,8,10,AD,20)}${ell(63,53,8,10,AD,-20)}${circ(38,52,3,'#fff')}${circ(62,52,3,'#fff')}${ell(50,63,5,3.5,AD)}<path d="M44 69q6 5 12 0" stroke="${AD}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    () => `${ell(50,64,33,24,'#6fcf6f')}${circ(32,40,12,'#6fcf6f')}${circ(68,40,12,'#6fcf6f')}${circ(32,40,8,'#fff')}${circ(68,40,8,'#fff')}${circ(33,41,4,AD)}${circ(67,41,4,AD)}${circ(45,58,1.7,AD)}${circ(55,58,1.7,AD)}<path d="M28 68q22 18 44 0" fill="none" stroke="${AD}" stroke-width="2.8" stroke-linecap="round"/>${circ(27,64,4,'#ff9fb2')}${circ(73,64,4,'#ff9fb2')}`,
    () => `<path d="M34 34l5-12 5 12M46 31l5-14 5 14M58 34l5-12 5 12" fill="#4faa5a"/>${ell(50,60,31,27,'#6fcf7a')}${circ(36,50,4,'#58b563')}${circ(66,46,3,'#58b563')}${eyes(54,13,4)}${circ(44,66,1.7,AD)}${circ(56,66,1.7,AD)}<path d="M36 73q14 9 28 0z" fill="#fff" stroke="${AD}" stroke-width="2"/>`,
    () => `<path d="M24 86V52a26 26 0 0 1 52 0v34l-9-7-8 7-9-7-9 7-8-7z" fill="#fff"/>${eyes(52,10,4.4)}${ell(50,66,4.5,5.5,AD)}${circ(34,62,4,'#ffc1d4')}${circ(66,62,4,'#ffc1d4')}`,
    () => `${circ(50,57,29,'#2f3a52')}<path d="M50 44q-22-4-22 14 0 16 22 20 22-4 22-20 0-18-22-14z" fill="#fff"/>${circ(40,54,4,AD)}${circ(60,54,4,AD)}${circ(41.4,52.8,1.4,'#fff')}${circ(61.4,52.8,1.4,'#fff')}<path d="M44 62h12l-6 8z" fill="#ffa62b"/>`,
    () => `${circ(50,56,38,'#d98a2b')}${circ(50,58,26,'#f3c177')}${circ(30,36,7,'#f3c177')}${circ(70,36,7,'#f3c177')}${eyes(55,12,3.8)}${nose(61,'#7a3a1a')}<path d="M50 66v3M44 71q6 4 12 0" stroke="${AD}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    () => `<path d="M26 36L30 20L44 32Z" fill="#ff9fb5"/><path d="M74 36L70 20L56 32Z" fill="#ff9fb5"/>${circ(50,57,29,'#ffb3c7')}${eyes(50,15,4)}${ell(50,64,12,9,'#ff8fab')}${circ(45,64,2.4,AD)}${circ(55,64,2.4,AD)}${smile(74,6)}`,
    () => `${ell(24,50,10,20,'#7a4a2b',12)}${ell(76,50,10,20,'#7a4a2b',-12)}${circ(50,57,28,'#d9a066')}${ell(50,66,12,9,'#f3dcc0')}${eyes(52,13,4)}${ell(50,62,5,3.5,AD)}<path d="M50 65v4M44 70q6 5 12 0" stroke="${AD}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M47 73q3 9 6 0z" fill="#ff7a93"/>`
  ];
  const A = ['',
    `<g fill="none" stroke="${AD}" stroke-width="2.4"><circle cx="36" cy="55" r="9"/><circle cx="64" cy="55" r="9"/><path d="M45 55h10"/></g>`,
    `<path d="M22 56a28 28 0 0 1 56 0" fill="none" stroke="#2f2f3a" stroke-width="5"/><rect x="16" y="50" width="9" height="16" rx="4" fill="#2f2f3a"/><rect x="75" y="50" width="9" height="16" rx="4" fill="#2f2f3a"/>`,
    `<path d="M32 31l4-14 7 9 7-12 7 12 7-9 4 14z" fill="#ffd34d" stroke="#e0a800" stroke-width="1.5"/>`,
    `<path d="M36 31L50 4l14 27z" fill="#ff6b9d"/>${circ(50,5,4,'#ffe27a')}`,
    `<circle cx="30" cy="66" r="4.5" fill="#ff8fa3" opacity=".55"/><circle cx="70" cy="66" r="4.5" fill="#ff8fa3" opacity=".55"/><path d="M82 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>`
  ];
  const a2 = [7, 9, 11].includes(type) ? (acc === 5 ? 5 : 0) : acc;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#${gid})"/><ellipse cx="50" cy="104" rx="44" ry="22" fill="rgba(0,0,0,.16)"/>${B[type]()}${A[a2]}</svg>`;
}
function avatarEl(pr, size){
  const el = h('span', {class:'av', style:`width:${size}px;height:${size}px;font-size:${Math.round(size * .52)}px`});
  if (pr && /^a:\d+$/.test(pr.avatar || '')) el.innerHTML = avSvg(+pr.avatar.slice(2) % AV_COUNT);
  else { el.textContent = (pr && pr.emoji) || '🙂'; el.style.background = (pr && pr.color) || '#7c5cff'; }
  return el;
}
const PROFILE_COLORS = ['#7c5cff','#ff5c93','#25b9ff','#2fd18b','#ffb020','#ec1d24','#f47521','#8ab4f8'];
const PROFILE_EMOJIS = ['😎','🦊','🐼','🐯','🦄','🐸','🚀','👑','🎮','🍕'];
let profiles = [], profile = null;
let settings = {subLang:'off', audioLang:'any'};
const effAudio = () => (cur && cur.audio) || settings.audioLang;      // a space can have its own audio / subtitle language (anime: Japanese + English subs)
const effSub = () => (cur && cur.subs) || settings.subLang;
/* Profile data (history, watched, episodes...) is read very often (every poster asks "watched?"): it is parsed once and kept in memory,
   and every write goes through lsSet, which keeps that copy current. */
const lsMem = new Map();
const lsGet = (k, d) => {
  if (lsMem.has(k)) { const v = lsMem.get(k); return v === undefined ? d : v; }
  try { const s = localStorage.getItem(k), v = s == null ? undefined : JSON.parse(s); if (k.startsWith('streamlet.p.')) lsMem.set(k, v); return v === undefined ? d : v; } catch { return d; }
};
function lsFree(){                                                  // storage is full: drop what can be rebuilt, never what was watched
  for (const k of Object.keys(localStorage)) if (/^streamlet\.(nseason|syslog|recent\.|p\.[^.]+\.nextcards$)/.test(k)) { try { localStorage.removeItem(k); lsMem.delete(k); } catch {} }
}
const lsSet = (k, v) => {
  const s = JSON.stringify(v);
  try { localStorage.setItem(k, s); }
  catch { lsFree(); try { localStorage.setItem(k, s); } catch { lsMem.delete(k); try { sysLog('STORAGE', 'Storage full, could not save ' + k); } catch {} return; } }
  if (k.startsWith('streamlet.p.')) lsMem.set(k, v);
};
const plsGet = (id, k, d) => lsGet(`streamlet.p.${id}.${k}`, d);
const plsSet = (id, k, v) => lsSet(`streamlet.p.${id}.${k}`, v);
const pget = (k, d) => plsGet(profile.id, k, d);
const pset = (k, v) => plsSet(profile.id, k, v);
const saveSettings = () => { pset('settings', settings); pset('settingsT', Date.now()); scheduleSync(); };
const saveProfiles = () => { lsSet('streamlet.profiles', profiles); stamp('profilesT'); };

function initProfiles(){
  profiles = lsGet('streamlet.profiles', null);
  if (!Array.isArray(profiles) || !profiles.length) {
    profiles = [{id:'p1', name:'Me', emoji:'😎', color:PROFILE_COLORS[0]}];
    lsSet('streamlet.profiles', profiles);
    // carry over anything saved before profiles existed
    try {
      const old = localStorage.getItem('streamlet.settings'); if (old) localStorage.setItem('streamlet.p.p1.settings', old);
      const last = localStorage.getItem('streamlet.last'); if (last) localStorage.setItem('streamlet.p.p1.last', JSON.stringify(last));
    } catch {}
  }
}
function fillSettingsUI(){
  const fill = (sel, first, key) => {
    sel.replaceChildren(h('option', {value:first[0]}, first[1]), ...LANGS.map(l => h('option', {value:l.c[0]}, l.n)));
    sel.value = settings[key]; if (sel.value !== settings[key]) sel.value = first[0];
    sel.onchange = () => { settings[key] = sel.value; saveSettings(); };
  };
  fill($('#setSub'), ['off','Off'], 'subLang');
  fill($('#setAud'), ['any','Any'], 'audioLang');
  $('#profRow').replaceChildren(h('span', {style:'font-weight:700;font-size:20px;display:inline-flex;align-items:center;gap:14px'}, profile ? [avatarEl(profile, 52), profile.name] : ''),
    h('button', {class:'btn ghost sm', type:'button', onclick:() => showProfiles()}, 'Switch / manage'));
}
function loadProfileData(){
  settings = {subLang:'off', audioLang:'any', ...pget('settings', {})};
  fillSettingsUI();
}
async function selectProfile(p){
  profile = p; try { navAvatar(); } catch {} lsSet('streamlet.profile.last', p.id);
  loadProfileData(); epReset(); try { fillTmdb(); qcFillShows(); } catch {} try { epMigrate(); } catch {} try { for (const q of profiles) showsBackfill(q.id); epReset(); } catch {}
  const last = pget('last', null);
  const sp = last && spaces.find(x => x.id === last);
  if (!sp) { showLauncher(); return; }
  const done = (!pfx && !document.getElementById('intro') && !$('#profiles').hidden) ? warmCover(profile.name) : null;   // the boot logo / the profile animation already cover the wait
  try { await warmSpace(sp, 8000); } catch {}
  if (profile === p) enterSpace(sp.id);
  if (done) done();
}

/* watch history ("continue watching"). One entry per title; newest first.
   Entries carry a timestamp (t) so a future sync service can merge by latest. */
const histGet = () => pget('history', []);
function histPut(e){
  e.t = Math.max(e.t || Date.now(), (pget('removed', {})[e.itemId] || 0) + 1);
  pset('history', [e, ...histGet().filter(x => x.k !== e.k && x.itemId !== e.itemId)].slice(0, 60)); scheduleSync();
}
function histRemove(k){
  const gone = histGet().find(x => x.k === k);
  pset('history', histGet().filter(x => x.k !== k));
  if (gone) { const r = pget('removed', {}); r[gone.itemId] = Date.now(); pset('removed', Object.fromEntries(Object.entries(r).sort((a,b) => b[1] - a[1]).slice(0, 100))); }
  scheduleSync();
}
const allHist = () => !!(cur && (cur.allHistory ?? (THEMES[cur.theme] || {}).allhist));
const histForSpace = () => histGet().filter(e => allHist() || e.space === (cur && cur.id));
const fmtTime = t => { t = Math.max(0, Math.round(t)); const h_ = Math.floor(t/3600), m = Math.floor(t/60)%60, sec = t%60; return (h_ ? h_+':'+String(m).padStart(2,'0') : m) + ':' + String(sec).padStart(2,'0'); };

// language hints found in stream names/titles (Torrentio-style flags, "MULTI", "VOSTFR", ...)
const LANG_HINTS = [
  ['en', /\b(eng(lish)?)\b|🇬🇧|🇺🇸/i], ['fr', /\b(fr(ench)?|vf[fq]?|truefrench|vostfr)\b|🇫🇷/i], ['es', /\b(spa(nish)?|esp|latino|castellano)\b|🇪🇸|🇲🇽/i],
  ['de', /\b(ger(man)?|deutsch)\b|🇩🇪/i], ['it', /\b(ita(lian)?)\b|🇮🇹/i], ['pt', /\b(por(tuguese)?|dublado)\b|🇵🇹|🇧🇷/i],
  ['ja', /\b(jap(anese)?|jpn)\b|🇯🇵/i], ['ko', /\b(kor(ean)?)\b|🇰🇷/i], ['ru', /\b(rus(sian)?)\b|🇷🇺/i], ['zh', /\b(chi(nese)?|mandarin)\b|🇨🇳/i],
  ['hi', /\b(hindi)\b|🇮🇳/i], ['multi', /\b(multi|dual)\b/i]
];
const streamLangs = s => { const t = [s.name, s.title, s.description].filter(Boolean).join(' '); return LANG_HINTS.filter(([,re]) => re.test(t)).map(([k]) => k); };

