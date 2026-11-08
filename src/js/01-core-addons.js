const FLAVOR = 'auto';                                              // build.js sets this to 'tv' or 'phone' for the two apps
/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
{ const rc = Element.prototype.replaceChildren;          // skip null / false / undefined children and flatten arrays
  Element.prototype.replaceChildren = function (...k) { return rc.apply(this, k.flat(Infinity).filter(x => x != null && x !== false)); }; }
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})) {
    if (k==='class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v!==false && v!=null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c==null||c===false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),2800); }
const enc = encodeURIComponent;

/* ---------- built-in demo addon (openly licensed Blender films) ---------- */
// DEMO-START
const DEMO = {
  'manifest.json': {
    id:'org.streamlet.demo', version:'1.0.0', name:'Blender Open Movies (demo)',
    description:'Sample addon: free, openly licensed short films from the Blender Foundation.',
    resources:['catalog','stream'], types:['movie'], idPrefixes:['blender_'],
    catalogs:[{type:'movie', id:'blender', name:'Open Movies', extra:[{name:'search'}]}]
  },
  'catalog/movie/blender.json': { metas:[
    {id:'blender_bbb',    type:'movie', name:'Big Buck Bunny',  releaseInfo:'2008', description:'A giant rabbit with a heart bigger than himself gets fed up with three bullying rodents.'},
    {id:'blender_sintel', type:'movie', name:'Sintel',          releaseInfo:'2010', description:'A lonely young woman searches for the baby dragon she befriended.'},
    {id:'blender_tos',    type:'movie', name:'Tears of Steel',  releaseInfo:'2012', description:'Sci-fi short: a group of warriors and scientists try to save the world from destructive robots.'},
    {id:'blender_ed',     type:'movie', name:'Elephants Dream', releaseInfo:'2006', description:'The first Blender open movie. Two strange characters explore a capricious and seemingly infinite machine.'}
  ]},
  'stream/movie/blender_bbb.json':    { streams:[{name:'MP4', title:'Big Buck Bunny\n720p', url:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'}] },
  'stream/movie/blender_sintel.json': { streams:[{name:'MP4', title:'Sintel\n720p', url:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'}] },
  'stream/movie/blender_tos.json':    { streams:[{name:'MP4', title:'Tears of Steel\n720p', url:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'}] },
  'stream/movie/blender_ed.json':     { streams:[{name:'MP4', title:'Elephants Dream\n720p', url:'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'}] }
};
// DEMO-END
function demoRoute(path){
  const m = path.match(/^catalog\/movie\/blender\/search=(.*)\.json$/);
  if (m) { const q = decodeURIComponent(m[1]).toLowerCase(); return {metas: DEMO['catalog/movie/blender.json'].metas.filter(x=>x.name.toLowerCase().includes(q))}; }
  if (DEMO[path]) return DEMO[path];
  throw new Error('HTTP 404');
}

/* ---------- addon store ---------- */
let addons = [];
try { addons = JSON.parse(localStorage.getItem('streamlet.addons') || '[]'); } catch {}
ensureUids();
const save = () => { try { localStorage.setItem('streamlet.addons', JSON.stringify(addons)); } catch {} stamp('addonsT'); };

/* Catalog rows and title pages are remembered between launches (TV and phone): they show at once from the cache
   and refresh quietly in the background once they are older than 15 minutes (rows) or 30 minutes (title pages). */
const DCACHE = 'streamlet-data', DMAX = 160;
const dKind = url => /search=/.test(url) ? '' : /\/catalog\//.test(url) ? 'c' : /\/meta\//.test(url) ? 'm' : '';
const dFresh = url => dKind(url) === 'm' ? 30 * 60e3 : 15 * 60e3;
async function dataGet(url){
  if (!dKind(url) || !self.caches) return null;
  try {
    const c = await caches.open(DCACHE), r = await c.match(url);
    if (!r) return null;
    return {json: await r.json(), age: Date.now() - Number(r.headers.get('x-t') || 0)};
  } catch { return null; }
}
async function dataPut(url, json){
  if (!dKind(url) || !self.caches) return;
  try {
    const c = await caches.open(DCACHE);
    await c.put(url, new Response(JSON.stringify(json), {headers:{'content-type':'application/json', 'x-t':String(Date.now())}}));
    const ks = await c.keys(); if (ks.length > DMAX) for (const k of ks.slice(0, ks.length - DMAX)) await c.delete(k);
  } catch {}
}

const warmC = new Map();                                                       // catalogs fetched ahead of time by warmSpace (used for 2 minutes)
async function getJSON(url){                                            // a show's episodes may be swapped for TMDB's order (26-ep-order.js)
  const j = await getJSON0(url);
  return /\/meta\/series\//.test(url) ? eoApply(url, j) : j;
}
async function getJSON0(url){
  const w = warmC.get(url); if (w && Date.now() - w.t < 120000) return w.j;
  if (url.startsWith('demo://sample/')) return demoRoute(url.slice('demo://sample/'.length));
  if (url.startsWith('qc://')) return qcRoute(url);
  if (url.startsWith('tmdb://')) return tmRoute(url);
  const hit = await dataGet(url);
  if (hit) { if (hit.age > dFresh(url)) fetchJSON(url).then(j => dataPut(url, j)).catch(() => {}); return hit.json; }
  const j = await fetchJSON(url);
  dataPut(url, j);
  return j;
}
async function fetchJSON(url){
  const c = new AbortController(); const t = setTimeout(()=>c.abort(), 12000);
  try {
    const r = await fetch(url, {signal:c.signal});
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch(e) {
    if (e.name==='AbortError') throw new Error('Timed out');
    if (e instanceof TypeError) throw new Error("Couldn't reach it (network error, or the addon doesn't allow CORS)");
    throw e;
  } finally { clearTimeout(t); }
}

function parseAddonUrl(input){
  let u = input.trim();
  if (!u) throw new Error('Paste an addon URL first.');
  if (u.toLowerCase()==='demo') u = 'demo://sample';
  if (/^(qu[eé]bec|qc)$/i.test(u)) u = 'qc://tva';
  const tm = /^tmdb(?::\/\/|\s+)?(all|netflix|disney|marvel|kids)?\/?$/i.exec(u); if (tm) u = 'tmdb://' + (tm[1] || 'all').toLowerCase();
  const tl = /themoviedb\.org\/list\/(\d+)/i.exec(u) || /^tmdb(?::\/\/|\s+)list[-\s]?(\d+)\/?$/i.exec(u); if (tl) u = 'tmdb://list-' + tl[1];      // a TMDB list link becomes a row
  u = u.replace(/^stremio:\/\//i, 'https://').replace(/^https?:\/\/((qc|tmdb):\/\/)/i, '$1');      // 'https://qc://tva' was saved by an older build: repair it
  if (!/^(https?|demo|qc|tmdb):\/\//i.test(u)) u = 'https://' + u;
  if (!/manifest\.json(\?.*)?$/.test(u)) u = u.replace(/\/+$/,'') + '/manifest.json';
  return { url:u, base:u.replace(/\/manifest\.json(\?.*)?$/,'') };
}

// every installed copy of an addon is an "instance" with its own uid ("com.x.addon", "com.x.addon#2", ...) and an optional label
const an = a => a.label || a.manifest.name;
function ensureUids(){
  const seen = new Set();
  for (const a of addons) {
    if (!a.uid) { let u = a.manifest.id, n = 2; while (seen.has(u)) u = a.manifest.id + '#' + n++; a.uid = u; }
    seen.add(a.uid);
  }
}
function nextUid(mid){
  if (!addons.some(a => a.uid === mid)) return mid;
  let n = 2; while (addons.some(a => a.uid === mid + '#' + n)) n++;
  return mid + '#' + n;
}
const hasRes = (a, r) => (a.manifest.resources || []).some(x => (typeof x === 'string' ? x : x.name) === r);
const configurable = a => !!(a.manifest.behaviorHints && a.manifest.behaviorHints.configurable);
const baseOf = u => String(u).replace(/\/manifest\.json(\?.*)?$/, '');
function openConfigure(base){
  const url = baseOf(base) + '/configure';
  try { window.open(url, '_blank', 'noopener'); } catch { location.href = url; }
  toast('Opening the addon\'s settings page. Copy the new link it gives you, then paste it here.');
}
async function fetchManifest(input){
  const {url, base} = parseAddonUrl(input);
  const manifest = await getJSON(url);
  if (!manifest || !manifest.id || !manifest.name || !Array.isArray(manifest.resources))
    throw new Error("That doesn't look like a valid addon manifest.");
  if (!manifest.types) manifest.types = [];
  return {url, base, manifest};
}
async function installAddon(input, opts = {}){
  const {url, base, manifest} = await fetchManifest(input);
  const i = addons.findIndex(a => a.url === url);
  if (i >= 0) {                                   // same link: refresh it
    addons[i] = {...addons[i], url, base, manifest, pending:undefined};
    if ('label' in opts) addons[i].label = opts.label || undefined;
  } else {                                        // new link: new copy, even if the addon is already installed
    const uid = nextUid(manifest.id), n = uid.includes('#') ? +uid.split('#').pop() : 1;
    addons.push({url, base, manifest, uid, label: opts.label || (n > 1 ? `${manifest.name} #${n}` : undefined)});
  }
  save();
  return manifest;
}
async function replaceAddon(uid, input, label){
  const i = addons.findIndex(a => a.uid === uid); if (i < 0) throw new Error('Addon not found.');
  const {url, base, manifest} = await fetchManifest(input);
  addons[i] = {...addons[i], url, base, manifest, pending:undefined, label: label || undefined};
  save();
  return manifest;
}

function supports(a, res, type, id){
  const m = (a.url && a.url.startsWith('qc://') && typeof QC_MANIFEST !== 'undefined') ? QC_MANIFEST : a.manifest;       // the built-in Québec addon always answers with its current manifest
  return (m.resources||[]).some(r => {
    const name = typeof r==='string' ? r : r.name;
    if (name !== res) return false;
    const types = r.types || m.types || [];
    const pre = r.idPrefixes || m.idPrefixes;
    return types.includes(type) && (!pre || pre.some(p => String(id).startsWith(p)));
  });
}
function catInfo(cat){
  const ex = cat.extra || [];
  return {
    search: ex.some(e=>e.name==='search') || (cat.extraSupported||[]).includes('search'),
    req: ex.filter(e=>e.isRequired).map(e=>e.name).concat(cat.extraRequired||[])
  };
}


/* ---------- release state: upcoming titles, movies still in theaters ---------- */
const yearOf = m => parseInt(String((m && (m.releaseInfo || m.year)) || '').slice(0, 4)) || 0;
const normTitle = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const CAM_RE = /\b(?:hd[\s.-]?cam|cam[\s.-]?rip|cam|tele[\s.-]?sync|hd[\s.-]?ts|tele[\s.-]?cine|hd[\s.-]?tc|pre[\s.-]?dvd|dvd[\s.-]?scr|screener)\b/i;   // recordings of a cinema screen
const theatersMap = () => { const v = lsGet('streamlet.theaters', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
function relState(m, type){                                              // 'upcoming' | 'theaters' | null
  if (!m) return null;
  const r = m.released || m.firstAired, d = r ? new Date(r) : null;
  if (d && !isNaN(d)) { if (d.getTime() > Date.now()) return 'upcoming'; }
  else { const y = yearOf(m); if (y && y > new Date().getFullYear()) return 'upcoming'; }
  if ((m.type || type) === 'movie' && theatersMap()[m.id || m.itemId]) return 'theaters';
  return null;
}
const hideUnreleased = () => lsGet('streamlet.ui', {}).showUpcoming === false;
const visibleMeta = (m, type) => !(hideUnreleased() && relState(m, type));
const recentRelease = m => { const r = m && m.released ? new Date(m.released) : null; return r && !isNaN(r) ? (Date.now() - r.getTime()) < 200 * 864e5 : yearOf(m) === new Date().getFullYear(); };
/* a movie that came out recently and has no real (non-cinema) source yet is "in theaters" */
function noteTheaters(item, streams){
  try {
    if (!item || !item.id || item.type !== 'movie') return;
    const recent = recentRelease(item);
    const map = theatersMap(), real = (streams || []).some(x => x && (x.url || x.infoHash || x.externalUrl) && !CAM_RE.test(String(x.name || '') + ' ' + String(x.title || '') + ' ' + String(x.description || '')));
    const was = !!map[item.id];
    if (recent && !real) map[item.id] = Date.now(); else delete map[item.id];
    if (was !== !!map[item.id]) { const ks = Object.keys(map); if (ks.length > 300) delete map[ks[0]]; lsSet('streamlet.theaters', map); refreshRelBadges(item.id); }
  } catch {}
}
const relLabel = st => st === 'upcoming' ? 'Upcoming' : st === 'theaters' ? 'In theaters' : '';
function relBadgeEl(meta, type){ const st = relState(meta, type), e = h('span', {class:'relbadge' + (st ? ' ' + st : ''), 'data-id':meta.id, 'data-up':st === 'upcoming' ? '1' : ''}, relLabel(st)); e.hidden = !st; return e; }
function refreshRelBadges(id){ document.querySelectorAll('.relbadge[data-id="' + String(id).replace(/"/g, '') + '"]').forEach(e => { const t = theatersMap()[id] ? 'theaters' : (e.dataset.up === '1' ? 'upcoming' : null); e.className = 'relbadge' + (t ? ' ' + t : ''); e.textContent = relLabel(t); e.hidden = !t; }); try { if (typeof playSync === 'function' && playSync) playSync(); } catch {} }
