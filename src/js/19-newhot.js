/* ---------- "New season" labels on posters, and the New & Hot tab ---------- */
const NS_KEY = 'streamlet.nseason', NS_TTL = 2 * 864e5;
let nsMap = null, nsSaveT = 0, nsBusy = 0; const nsWait = [];
const nsAll = () => nsMap || (nsMap = (() => { const v = lsGet(NS_KEY, {}); return v && typeof v === 'object' ? v : {}; })());
const nsGet = id => { const e = nsAll()[id]; return e && e.s ? e.s : 0; };
function nsCompute(meta){                                                    // the newest season (2 or later) whose first episode aired in the last 60 days
  const now = Date.now(), DAY = 864e5, by = {};
  for (const v of airedVids(meta)) { const s = v.season ?? 1, t = v.released ? Date.parse(v.released) : NaN; if (!isNaN(t) && t <= now + DAY) (by[s] || (by[s] = [])).push(t); }
  const s = Object.keys(by).map(Number).filter(x => x >= 2).sort((a, b) => b - a)[0];
  return s && now - Math.min(...by[s]) < 60 * DAY ? s : 0;
}
function nsPaint(id){
  if (!nsGet(id)) return;
  for (const p of document.querySelectorAll('.poster[data-iid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]')) {
    if (p.querySelector('.rtag, .upn')) continue;
    p.append(h('span', {class:'rtag season'}, 'New season'));
  }
}
function nsRun(){
  while (nsBusy < 3 && nsWait.length) {
    const id = nsWait.shift(); nsBusy++;
    (async () => { try { const m = await showMeta(id, {a:''}); const s = m ? nsCompute(m) : 0; nsAll()[id] = {t:Date.now(), s}; clearTimeout(nsSaveT); nsSaveT = setTimeout(() => lsSet(NS_KEY, nsAll()), 1500); nsPaint(id); } catch {} nsBusy--; nsRun(); })();
  }
}
const nsIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; nsIO.unobserve(e.target);
  const id = e.target.dataset.iid, c = nsAll()[id]; if (!id || (c && Date.now() - c.t < NS_TTL) || nsWait.includes(id)) return;
  nsWait.push(id); nsRun();
}), {rootMargin:'300px'}) : null;
function nsWatch(p, id, type){ if (type !== 'series' || !id) return; if (nsGet(id) && !p.querySelector('.rtag, .upn')) p.append(h('span', {class:'rtag season'}, 'New season')); if (nsIO) nsIO.observe(p); }

/* ---------- New & Hot (needs the TMDB key): coming soon, everyone's watching, top 10, just released ---------- */
const NH_REGION = (() => { try { return (navigator.language || 'en-CA').split('-')[1] || 'CA'; } catch { return 'CA'; } })();
const nhMem = new Map();
const nhImg = (p, w = 'w342') => p ? 'https://image.tmdb.org/t/p/' + w + p : '';
const isoDay = off => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
async function nhGet(path, key){ const hit = nhMem.get(path); if (hit && Date.now() - hit.t < 30 * 60e3) return hit.j; const j = await tmdbGet(path, key); nhMem.set(path, {t:Date.now(), j}); return j; }
const nhNorm = (r, mt) => (r || []).filter(x => x && x.poster_path && (x.media_type || mt) !== 'person').map(x => ({mt:x.media_type || mt, id:x.id, name:x.title || x.name, poster:x.poster_path, backdrop:x.backdrop_path, date:x.release_date || x.first_air_date || ''}));
async function nhOpen(it){
  const key = lsGet('streamlet.tmdb', '');
  try {
    const ex = await nhGet(`/${it.mt}/${it.id}/external_ids`, key), imdb = ex && ex.imdb_id, type = it.mt === 'movie' ? 'movie' : 'series';
    const a = imdb && (spaceAddons().find(x => supports(x, 'meta', type, imdb)) || addons.find(x => supports(x, 'meta', type, imdb)));
    if (!a) { toast("Your addons don't have this one yet"); return; }
    openDetail(a, type, {id:imdb, type, name:it.name, poster:nhImg(it.poster), background:nhImg(it.backdrop, 'w780'), releaseInfo:(it.date || '').slice(0, 4)});
  } catch { toast("Couldn't open it right now"); }
}
function nhCard(it, o = {}){
  const po = posterEl({name:it.name, poster:nhImg(it.poster)});
  if (o.rank) po.append(h('span', {class:'nhrank'}, String(o.rank)));
  if (o.date && it.date) { const d = new Date(it.date + 'T12:00:00'); if (!isNaN(d)) po.append(h('span', {class:'rtag upcoming'}, d.toLocaleDateString(undefined, {month:'short', day:'numeric'}))); }
  return h('button', {class:'card', type:'button', onclick:() => nhOpen(it)}, po, h('div', {class:'t'}, it.name), h('div', {class:'s'}, it.tag ? it.tag + ' · ' + it.sub : (it.mt === 'movie' ? 'Movie' : 'Show') + (it.date ? ' · ' + it.date.slice(0, 4) : '')));
}
async function nhNext(it, key){                                              // the next episode of a returning show: its date and whether it starts a season
  try { const d = await nhGet(`/tv/${it.id}`, key), n = d && d.next_episode_to_air; if (!n || !n.air_date) return null; return {...it, date:n.air_date, tag:n.episode_number === 1 ? 'New season' : 'New episode', sub:'S' + n.season_number + ' · E' + n.episode_number}; } catch { return null; }
}
async function renderNewHot(box, tok, key){
  const get = p => nhGet(p, key), reg = '&region=' + NH_REGION;
  const [upM, upT, back, all, tvd, mvd, newM, newT] = (await Promise.allSettled([
    get(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${isoDay(1)}&primary_release_date.lte=${isoDay(120)}${reg}`),
    get(`/discover/tv?sort_by=popularity.desc&first_air_date.gte=${isoDay(1)}&first_air_date.lte=${isoDay(120)}`),
    get(`/discover/tv?sort_by=popularity.desc&air_date.gte=${isoDay(1)}&air_date.lte=${isoDay(60)}&first_air_date.lte=${isoDay(-30)}`),
    get('/trending/all/week'), get('/trending/tv/day'), get('/trending/movie/day'),
    get(`/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${isoDay(-28)}&primary_release_date.lte=${isoDay(0)}${reg}`),
    get(`/discover/tv?sort_by=popularity.desc&first_air_date.gte=${isoDay(-60)}&first_air_date.lte=${isoDay(0)}`)
  ])).map(r => r.status === 'fulfilled' ? r.value : null);
  if (tok !== homeTok) return;
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const rows = [
    ['New shows coming soon', nhNorm(upT && upT.results, 'tv').filter(x => x.date).sort(byDate).slice(0, 16), {date:true}],
    ['Movies coming soon', nhNorm(upM && upM.results, 'movie').filter(x => x.date).sort(byDate).slice(0, 16), {date:true}],
    ["Everyone's watching", nhNorm(all && all.results).slice(0, 18), {}],
    ['Top 10 shows today', nhNorm(tvd && tvd.results, 'tv').slice(0, 10), {rank:true}],
    ['Top 10 movies today', nhNorm(mvd && mvd.results, 'movie').slice(0, 10), {rank:true}],
    ['Just released', [...nhNorm(newM && newM.results, 'movie').slice(0, 10), ...nhNorm(newT && newT.results, 'tv').slice(0, 10)].sort((a, b) => b.date.localeCompare(a.date)), {}]
  ].filter(r => r[1].length);
  const paint = (title, list, o) => {
    const strip = h('div', {class:'strip'}, ...list.map((it, i) => nhCard(it, {rank:o.rank ? i + 1 : 0, date:o.date})));
    return h('div', {class:'row' + (o.rank ? ' top10' : '')}, h('h2', null, title), strip);
  };
  if (!rows.length && !(back && back.results && back.results.length)) { box.append(h('div', {class:'empty'}, h('h2', null, "Couldn't load New & Hot"), h('p', null, 'Check your TMDB key in Settings, or try again in a moment.'))); return false; }
  rows.forEach(([title, list, o], i) => { box.append(paint(title, list, o)); if (i === 1) box.append(h('div', {id:'nhBack'})); });   // new seasons and episodes sit right after the two "coming soon" rows
  let slot = box.querySelector('#nhBack'); if (!slot) { slot = h('div', {id:'nhBack'}); box.append(slot); }
  const cand = nhNorm(back && back.results, 'tv').filter(x => !((upT && upT.results) || []).some(u => u.id === x.id)).slice(0, 14);
  const next = (await Promise.all(cand.map(it => nhNext(it, key)))).filter(Boolean).sort(byDate);
  if (tok !== homeTok) return true;
  if (slot && next.length) slot.replaceWith(paint('New seasons & episodes coming soon', next, {date:true}));
  return true;
}
