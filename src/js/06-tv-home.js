/* ---------- TV home: full-bleed hero that follows the focused title ---------- */
let tvHeroCtx = null, tvHeroT = 0;
function buildTvHero(){
  return h('div', {class:'tvhero'}, h('div', {class:'tbg'}), h('div', {class:'tin'}));
}
function setTvHero(ctx, instant){
  const box = $('#rows .tvhero'); if (!box || !ctx) return;
  tvHeroCtx = ctx;
  const m = ctx.m, tbg = box.querySelector('.tbg'), tin = box.querySelector('.tin');
  const src = m.background || m.poster;
  if (src && !(tbg.lastChild && tbg.lastChild.dataset.src === src)) {
    tbg.style.setProperty('--bgi', `url("${String(src).replace(/"/g, '%22')}")`);
    const img = h('img', {alt:'', 'data-src':src}); img.onerror = () => img.remove();
    img.onload = () => { requestAnimationFrame(() => img.classList.add('on')); setTimeout(() => { for (const o of [...tbg.children]) if (o !== img && o !== tbg.lastChild) o.remove(); }, 800); };
    img.src = src; tbg.append(img);
    if (instant) img.classList.add('on');
  }
  const gen = (Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : []).slice(0, 3);
  const bits = [m.releaseInfo || m.year, m.runtime, ...gen].filter(Boolean);
  const title = h('div', {class:'ttitle'}, m.name);
  const logo = m.logo ? h('img', {class:'tlogo', src:m.logo, alt:m.name, onerror:e => e.target.replaceWith(title)}) : title;
  const fk = tin.contains(document.activeElement) ? document.activeElement.dataset.k : null;   // the button you were on stays focused when the slide changes
  const many = heroSlides.length > 1;
  const step = d => { heroPause(15000); heroGo(heroIdx + d); };
  tin.replaceChildren(
    ctx.tag ? h('div', {class:'ttag'}, ctx.tag) : ctx.kick ? h('div', {class:'tkick'}, ctx.kick) : null,
    logo,
    h('div', {class:'tmeta'}, m.imdbRating ? h('span', {class:'timdb'}, '★ ' + m.imdbRating) : null, ...bits.map(x => h('span', null, String(x)))),
    m.description ? h('p', {class:'tdesc'}, m.description) : null,
    h('div', {class:'tbtns'},
      h('button', {class:'hb p', type:'button', 'data-k':'play', onclick:() => quickPlay(ctx.a, ctx.type, m)}, ctx.play || '▶  Play'),
      h('button', {class:'hb s', type:'button', 'data-k':'info', onclick:() => openDetail(ctx.a, ctx.type, m)}, 'More info'),
      many ? h('div', {class:'tnav'},
        h('button', {class:'hn', type:'button', 'data-k':'prev', 'aria-label':'Previous', onclick:() => step(-1)}, '‹'),
        h('span', {class:'tcount'}, `${heroIdx + 1} / ${heroSlides.length}`),
        h('button', {class:'hn', type:'button', 'data-k':'next', 'aria-label':'Next', onclick:() => step(1)}, '›')) : null),
    many ? h('div', {class:'tseg', 'aria-hidden':'true'}, heroSlides.map((x, i) => h('i', {class:i < heroIdx ? 'past' : i === heroIdx ? 'on' : '', onclick:() => { heroPause(15000); heroGo(i); }}, h('b')))) : null);
  if (fk) { const b2 = tin.querySelector(`[data-k="${fk}"]`); if (b2) b2.focus({preventScroll:true}); }
}
/* ---------- hero slideshow: new episodes of what you watch, confirmed new seasons, then recommendations ---------- */
let heroSlides = [], heroIdx = 0, heroTimer = 0, heroHold = 0, heroTok = 0;
const heroPause = (ms = 12000) => {
  heroHold = Date.now() + ms;
  const hb = $('#rows .tvhero'); if (hb) { hb.classList.add('hold'); clearTimeout(heroPause.t); heroPause.t = setTimeout(() => { const x = $('#rows .tvhero'); if (x) x.classList.remove('hold'); }, ms); }
};
function heroGo(i){
  if (!heroSlides.length || !$('#rows .tvhero')) return;
  heroIdx = (i + heroSlides.length) % heroSlides.length; setTvHero(heroSlides[heroIdx]);
}
function heroTick(){
  if (!$('#rows .tvhero') || !$('#rows .tvhero').isConnected) { clearInterval(heroTimer); heroTimer = 0; return; }
  if (document.hidden || layersOpen.length || Date.now() < heroHold || scrollY > 200 || heroSlides.length < 2) return;
  heroGo(heroIdx + 1);
}
/* TMDB accepts the short v3 key (as a parameter) or the long v4 read token (as a bearer header) */
async function tmdbGet(path, key){
  const long = key.length > 60, url = 'https://api.themoviedb.org/3' + path + (long ? '' : (path.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(key));
  const r = await fetch(url, long ? {headers:{Authorization:'Bearer ' + key}} : undefined);
  if (!r.ok) throw new Error(r.status === 401 ? 'invalid key' : 'HTTP ' + r.status);
  return r.json();
}
const dayOf = d => { const t = new Date(d); return isNaN(t) ? 0 : t.getTime(); };
let heroPool = [];
const heroFoundMem = new Map();
/* new episodes of shows you follow and confirmed returning seasons, for a space (also run behind the loading screen) */
async function heroFind(sp){
  const sid = (sp && sp.id) || (cur && cur.id) || '', hit = heroFoundMem.get(sid);
  if (hit && Date.now() - hit.t < 300000) return hit.list;
  const now = Date.now(), DAY = 864e5;
  const shows = [], ids = new Set();
  const mine = x => allHist() || x.space === (cur && cur.id), wlIds = new Set(wlHere().map(x => x.itemId));
  for (const e of [...histForSpace(), ...wlHere().map(x => ({itemId:x.itemId, itemType:x.type, name:x.name})), ...wdGet().filter(mine).map(x => ({itemId:x.itemId, itemType:x.type, name:x.name}))]) {
    const ty = e.itemType || e.type; if (ty !== 'series' || ids.has(e.itemId) || ids.size >= 8) continue; ids.add(e.itemId); shows.push(e);
  }
  const pool = spaceAddons(), addonFor = e => pool.find(x => x.uid === e.addonId && supports(x, 'meta', 'series', e.itemId)) || pool.find(x => supports(x, 'meta', 'series', e.itemId));
  const found = (await Promise.all(shows.map(e => Promise.race([(async () => {
    try {
      const ma = addonFor(e); if (!ma) return null;
      const r = await getJSON(`${ma.base}/meta/series/${enc(e.itemId)}.json`), m = {...r.meta, type:'series'};
      const vids = (m.videos || []).filter(v => v && v.id && v.released && (v.season ?? 1) >= 1);
      const sorted = vids.sort((x, y) => ((x.season ?? 1) - (y.season ?? 1)) || ((x.episode ?? 0) - (y.episode ?? 0)));
      const code = v => `S${v.season ?? 1}E${v.episode}`;
      const fresh = sorted.filter(v => dayOf(v.released) <= now && now - dayOf(v.released) < 30 * DAY && !epDone(m.id, v.season ?? 1, v.episode));
      const started = sorted.some(v => epDone(m.id, v.season ?? 1, v.episode)) || histGet().some(x => x.itemId === m.id);
      if (started && fresh.length) { const v = fresh[0]; return {a:ma, m, type:'series', tag:'New episode · ' + code(v), play:'▶  Play ' + code(v), rank:0}; }
      let future = sorted.filter(v => dayOf(v.released) > now);
      const tk = lsGet('streamlet.tmdb', '');
      if (!future.length && tk && (m.imdb_id || /^tt\d+$/.test(m.id))) {          // TMDB knows the confirmed next air date
        try {
          const f = await tmdbGet(`/find/${m.imdb_id || m.id}?external_source=imdb_id`, tk), t = f.tv_results && f.tv_results[0];
          const d = t && await tmdbGet(`/tv/${t.id}`, tk), ne = d && d.next_episode_to_air;
          if (ne && ne.air_date) future = [{season:ne.season_number, episode:ne.episode_number, released:ne.air_date}];
        } catch {}
      }
      const nx = future[0], last = sorted.filter(v => dayOf(v.released) <= now).pop();
      if (nx && (nx.episode ?? 1) === 1 && (nx.season ?? 1) > ((last && last.season) || 0))
        return {a:ma, m, type:'series', tag:`Season ${nx.season} returns ${new Date(nx.released).toLocaleDateString(undefined, {month:'short', day:'numeric', timeZone:'UTC'})}`, rank:1};
    } catch {}
    return null;
  })(), new Promise(r => setTimeout(() => r(null), 5000))])))).filter(Boolean);
  heroFoundMem.set(sid, {t:Date.now(), list:found});
  return found;
}
async function heroBuild(first, tok){
  const found = await heroFind(cur);
  if (tok !== heroTok) return;
  const out = [], seen = new Set();
  const add = (x, kick) => { if (!x || !x.m || seen.has(x.m.id) || !(x.m.background || x.m.poster)) return; seen.add(x.m.id); out.push(kick && !x.tag ? {...x, kick} : x); };
  found.slice().sort((p, q) => p.rank - q.rank).forEach(f => add(f));                       // 1. yours: new episodes, then returning seasons
  const yr = new Date().getFullYear(), year = m => parseInt(String(m.releaseInfo || m.year || '').slice(0, 4), 10) || 0;
  const pool = heroPool.filter(x => x.m.background), mix = arr => arr.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(v => v[1]);
  for (const x of mix(pool.filter(x => year(x.m) >= yr - 1)).slice(0, 4)) add(x, 'New' + (cur && cur.name ? ' in ' + cur.name : ''));   // 2. what's new in this space
  if (!seen.has(first.m.id)) add(first, 'Pick for you');
  for (const x of mix(pool)) { if (out.length >= 8) break; add(x, 'Pick for you'); }          // 3. the rest
  if (tok !== heroTok || !out.length) return;
  heroSlides = out.slice(0, 8); heroIdx = 0;
  setTvHero(heroSlides[0], false);
  if (heroSlides.length > 1 && !heroTimer) heroTimer = setInterval(heroTick, 9000);
}
for (const ev of ['keydown', 'touchstart', 'pointerdown']) document.addEventListener(ev, () => heroPause(10000), {passive:true});
document.addEventListener('focusin', e => {
  if (!document.body.classList.contains('tv')) return;
  const c = e.target.closest && e.target.closest('button.card');
  if (!c || !c._hero || !c._hero.m || c._hero.m === (tvHeroCtx || {}).m) return;
  heroPause(12000); clearTimeout(tvHeroT); tvHeroT = setTimeout(() => setTvHero(c._hero), 170);
});
addEventListener('scroll', () => document.body.classList.toggle('scr', scrollY > 30), {passive:true});
/*@phone*/
{ let ly = 0, busy = false;                                           // hide the top bar when scrolling down, show it when scrolling up
  addEventListener('scroll', () => {
    if (busy) return; busy = true;
    requestAnimationFrame(() => {
      busy = false;
      const b = document.body, y = scrollY, d = y - ly;
      if (b.classList.contains('tv') || document.activeElement === $('#q')) { ly = y; return; }
      if (y < 60) { b.classList.remove('tbhide'); ly = y; }
      else if (d > 8) { b.classList.add('tbhide'); ly = y; }
      else if (d < -8) { b.classList.remove('tbhide'); ly = y; }
    });
  }, {passive:true});
}
/*@end*/

let homeTok = 0;
let view = {tab:'home', genre:''};
const NEW_RE = /\b(new|latest|recent|release|releases|airing|year)\b/i;
const TYPE_LABEL = {movie:'Movies', series:'Shows', anime:'Anime', tv:'TV', channel:'Channels'};
const spaceTabs = () => !!(cur && (cur.tabs ?? (THEMES[cur.theme] || {}).tabs));
const typeOK = (tab, t) => tab==='home' || tab==='new' || (tab==='movie' ? t==='movie' : ['series','anime','tv'].includes(t));
function genreExtra(cat){
  const e = (cat.extra || []).find(x => x.name === 'genre');
  if (e) return {options:e.options || [], required:!!e.isRequired};
  if ((cat.extraSupported || []).includes('genre')) return {options:[], required:(cat.extraRequired || []).includes('genre')};
  return null;
}
const sortedOptions = o => (o.length && o.every(x => /^\d{4}$/.test(x))) ? [...o].sort((x,y) => y - x) : o;

let srchOn = false;
const SRCH_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function closeSearch(){ srchOn = false; const had = $('#q').value; $('#q').value = ''; $('#q').blur(); if (had.trim()) renderHome(''); else renderTabs(); }
function spaceGenres(){
  const genres = [];
  for (const ad of spaceAddons()) for (const cat of (ad.manifest.catalogs || [])) {
    const ge = genreExtra(cat);
    if (!ge || !typeOK(view.tab, cat.type) || NEW_RE.test(cat.id)) continue;
    for (const o of ge.options) if (!/^\d{4}$/.test(o) && !genres.includes(o)) genres.push(o);
  }
  return genres.sort((x,y) => x.localeCompare(y));
}
const gHue = g => { let n = 0; for (const c of g) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
let gFocus = null;
function genreStrip(){
  const gs = spaceGenres(), el = h('div', {class:'gstrip'});
  if (!gs.length) { el.hidden = true; return el; }
  for (const g of gs) el.append(h('button', {class:'gtile' + (view.genre === g ? ' on' : ''), type:'button', style:`--gh:${gHue(g)}`,
    onclick:() => { gFocus = g; view = {tab:view.tab, genre:view.genre === g ? '' : g}; pushPage(); renderHome(); }}, g));
  if (gFocus) { const t = [...el.children].find(x => x.textContent === gFocus); gFocus = null; if (t) requestAnimationFrame(() => t.focus({preventScroll:true})); }
  return el;
}
function renderTabs(){
  const bar = $('#tabsBar'), q = $('#q'), tv = isTVui();
  syncNav();
  const searching = srchOn || !!q.value.trim();
  if (searching && bar.dataset.mode === 's' && bar.contains(q)) return;       // keep focus while typing
  const had = document.activeElement && bar.contains(document.activeElement) && document.activeElement !== q ? (document.activeElement.id || document.activeElement.textContent) : null;
  bar.dataset.mode = searching ? 's' : 't';
  if (!searching && bar.contains(q)) $('header').append(q);
  if (tv) { if (bar.contains(q)) $('header').append(q); bar.replaceChildren(); bar.hidden = true; return; }
  document.body.classList.toggle('srch', searching);
  const ps = $('#phSearch'), pp = $('#phSpace');
  if (ps) {                                                              // phone: search and spaces live in the sticky top bar
    ps.innerHTML = searching ? X_SVG : SRCH_SVG;
    ps.onclick = () => { if (searching) closeSearch(); else { srchOn = true; renderTabs(); $('#q').focus(); } };
    pp.onclick = () => showLauncher();
  }
  if (searching) { bar.hidden = false; bar.replaceChildren(q); q.hidden = false; return; }
  if (!spaceTabs() || !addons.length) { bar.hidden = true; bar.replaceChildren(); return; }
  bar.hidden = false;
  const chip = (id, label) => h('button', {class:'chip'+(view.tab===id ? ' on' : ''), onclick:() => { view = {tab:id, genre:''}; pushPage(); renderHome(); }}, label);
  bar.replaceChildren(...[chip('home','Home'), chip('movie','Movies'), chip('series','Shows'), isKid() ? null : chip('new','New & Hot')].filter(Boolean));
  if (had) { const t = [...bar.children].find(c => c.id === had || c.textContent === had); if (t) t.focus({preventScroll:true}); }
}



/* phone: swipe the hero sideways for the previous / next slide */
{ let sx = 0, sy = 0, on = false;
  document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('.tvhero'); on = !!t; if (t) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, {passive:true});
  document.addEventListener('touchend', e => {
    if (!on) return; on = false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 45 && heroSlides.length > 1) { heroPause(15000); heroGo(heroIdx + (dx < 0 ? 1 : -1)); }
  }, {passive:true});
}
