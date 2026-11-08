/* ---------- watchlist ---------- */
const wlGet = () => pget('watchlist', []);
const wlHere = () => wlGet().filter(e => !e.spaces || !cur || e.spaces.includes(cur.id));   // entries saved before spaces existed show everywhere
const wlHas = id => wlHere().some(x => x.itemId === id);
function wlAdd(e){
  const old = wlGet().find(x => x.itemId === e.itemId);
  if (cur) e.spaces = [...new Set([...((old && old.spaces) || []), cur.id])];
  e.t = Math.max(Date.now(), (pget('wlRemoved', {})[e.itemId] || 0) + 1);
  pset('watchlist', [e, ...wlGet().filter(x => x.itemId !== e.itemId)]); scheduleSync();
}
function wlRemove(itemId){
  const old = wlGet().find(x => x.itemId === itemId);
  if (old && old.spaces && cur && old.spaces.some(x => x !== cur.id)) {        // still saved in another space: only leave this one
    pset('watchlist', wlGet().map(x => x.itemId === itemId ? {...x, spaces:x.spaces.filter(y => y !== cur.id), t:Date.now()} : x)); scheduleSync(); return;
  }
  pset('watchlist', wlGet().filter(x => x.itemId !== itemId));
  const r = pget('wlRemoved', {}); r[itemId] = Date.now();
  pset('wlRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 200))); scheduleSync();
}
/* ---------- liked (the heart) ---------- */
const likeGet = () => pget('likes', []);
const likeSpaces = e => e.spaces || ((pget('shows', {})[e.itemId] || {}).sp ? [pget('shows', {})[e.itemId].sp] : []);   // likes made before spaces existed follow the show's space
const likeHere = () => likeGet().filter(e => cur && likeSpaces(e).includes(cur.id));                                   // a like belongs to the space it was made in
const likeHas = id => !!profile && likeHere().some(x => x.itemId === id);
function likeAdd(e){
  if (!profile || !cur) return;
  const rt = pget('likeRemoved', {})[e.itemId] || 0, old = likeGet().find(x => x.itemId === e.itemId);
  pset('likes', [{itemId:e.itemId, type:e.type, name:e.name, poster:e.poster, addonId:e.addonId, spaces:[...new Set([...(old ? likeSpaces(old) : []), cur.id])], t:Math.max(Date.now(), rt + 1)}, ...likeGet().filter(x => x.itemId !== e.itemId)].slice(0, 1000)); scheduleSync();
}
function likeRemove(id){
  if (!profile || !cur) return;
  const old = likeGet().find(x => x.itemId === id), rest = old ? likeSpaces(old).filter(x => x !== cur.id) : [];
  if (rest.length) { pset('likes', likeGet().map(x => x.itemId === id ? {...x, spaces:rest, t:Date.now()} : x)); scheduleSync(); return; }   // still liked in another space
  pset('likes', likeGet().filter(x => x.itemId !== id));
  const r = pget('likeRemoved', {}); r[id] = Date.now();
  pset('likeRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 400))); scheduleSync();
}
/* ---------- watched ---------- */
const wdGet = () => pget('watched', []);
const watchedHas = id => !!profile && wdGet().some(x => x.itemId === id);
function syncRibbons(){
  if (!profile) return;
  document.querySelectorAll('.poster[data-iid]').forEach(p => {
    const want = ribEl(p.dataset.iid), r = p.querySelector(':scope > .rib');
    if (!want) { if (r) r.remove(); return; }
    if (r && r.className === want.className && r.dataset.n === want.dataset.n) return;
    if (r) r.replaceWith(want); else p.append(want);
  });
}
function watchedAdd(e){
  if (!profile) return;
  const rt = pget('wdRemoved', {})[e.itemId] || 0;
  pset('watched', [{itemId:e.itemId, type:e.type, name:e.name, space:e.space ?? (cur && cur.id), t:Math.max(Date.now(), rt + 1)}, ...wdGet().filter(x => x.itemId !== e.itemId)].slice(0, 3000));
  for (const x of histGet().filter(h_ => h_.itemId === e.itemId)) histRemove(x.k);   // watched titles leave "Continue watching"
  scheduleSync(); syncRibbons();
}
/* ---------- series: a show is never marked watched as a whole. "Caught up" marks the episodes that have aired; the eye is for movies only ---------- */
const serMem = new Map();
async function serMeta(itemId, type, addonId){
  const hit = serMem.get(itemId); if (hit && Date.now() - hit.t < 600000) return hit.m;
  const a = addons.find(x => x.uid === addonId || (x.manifest && x.manifest.id === addonId)) || spaceAddons()[0] || addons[0];
  const ma = a && supports(a, 'meta', type, itemId) ? a : addons.find(x => supports(x, 'meta', type, itemId));
  if (!ma) return null;
  const r = await getJSON(`${ma.base}/meta/${type}/${enc(itemId)}.json`);
  const m = {...r.meta, id:itemId, type};
  const tk = lsGet('streamlet.tmdb', ''), imdb = /^tt\d+$/.test(itemId) ? itemId : (m.imdb_id || '');
  if (tk && /^tt\d+$/.test(imdb)) {                                  // TMDB knows the real status: Returning Series, In Production, Ended, Canceled…
    try { const f = await tmdbGet(`/find/${imdb}?external_source=imdb_id`, tk), t = f.tv_results && f.tv_results[0];
      if (t) { const d = await tmdbGet(`/tv/${t.id}`, tk); m.tmdbStatus = d.status || ''; m.tmdbNext = !!d.next_episode_to_air; } } catch {}
  }
  serMem.set(itemId, {t:Date.now(), m}); return m;
}
function serStatus(meta){
  const now = Date.now(), vids = (meta.videos || []).filter(v => v && v.id && v.episode != null);
  const aired = vids.filter(v => v.released && new Date(v.released) <= now);
  const lastAired = aired.length ? Math.max(...aired.map(v => new Date(v.released).getTime())) : 0;
  const tm = serMem.get(meta.id), ts = String((tm && tm.m.tmdbStatus) || meta.tmdbStatus || '');
  const st = String(meta.status || '');
  const ongoing = ts ? (/returning|production|planned|pilot/i.test(ts) || !!((tm && tm.m.tmdbNext) || meta.tmdbNext))
    : (/continu|return|production|planned|airing|ongoing/i.test(st) || (!/ended|cancel/i.test(st) && (vids.length > aired.length || (!st && lastAired > now - 400 * 864e5))));
  const done = aired.length > 0 && aired.every(v => epDone(meta.id, v.season ?? 1, v.episode));
  return {aired, ongoing, done};
}
const serLabel = meta => { const s = serStatus(meta); return s.done ? 'Mark as unwatched' : (s.ongoing ? 'Caught up' : 'Mark as watched'); };
function serToggle(meta){
  if (!profile) return;
  const s = serStatus(meta);
  if (s.done) { epMark(meta.id, s.aired, false); toast('Marked as unwatched'); }
  else {
    const todo = s.aired.filter(v => !epDone(meta.id, v.season ?? 1, v.episode));
    epMark(meta.id, todo, true);
    toast(s.ongoing ? (todo.length ? `Caught up: ${todo.length} episode${todo.length === 1 ? '' : 's'} marked` : 'Already caught up') : 'Marked as watched');
  }
  if (watchedHas(meta.id)) watchedRemove(meta.id);                  // older whole-show marks are cleared
  refreshLists(); syncRibbons();
}
function watchedRemove(id){
  if (!profile) return;
  pset('watched', wdGet().filter(x => x.itemId !== id));
  const r = pget('wdRemoved', {}); r[id] = Date.now();
  pset('wdRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 400)));
  scheduleSync(); syncRibbons();
}
/* stop following a show: it leaves Continue watching and the Watching tab (comes back by itself once you play it again) */
function showForget(id){
  if (!profile) return;
  const sh = pget('shows', {}); if (sh[id]) { delete sh[id]; pset('shows', sh); }
  const r = pget('showsRemoved', {}); r[id] = Date.now(); pset('showsRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 400)));
  pset('nextcards', (pget('nextcards', []) || []).filter(e => e.itemId !== id));
  scheduleSync();
}
/* take a title out of the history: a movie is no longer watched, a show loses its watched episodes */
function historyForget(en){
  if (!profile) return;
  if (en.type === 'movie') watchedRemove(en.itemId);
  else { const recs = epAll().filter(r => r.itemId === en.itemId); if (recs.length) epMark(en.itemId, recs.map(r => ({season:r.s, episode:r.e})), false); showForget(en.itemId); }
  for (const x of histGet().filter(x => x.itemId === en.itemId)) histRemove(x.k);
  syncRibbons();
}
const entryOf = (addon, type, meta) => ({itemId:meta.id, type, name:meta.name, poster:meta.poster, background:meta.background, addonId:addon.uid});
/* ---------- hold menu: Details / watchlist / watched ---------- */
function afterLayerClosed(name, fn){
  const t0 = Date.now(), iv = setInterval(() => { if (!layersOpen.includes(name) || Date.now() - t0 > 700) { clearInterval(iv); fn(); } }, 30);
}
function openEntry(en){
  const a = addons.find(x => x.uid === en.addonId) || addons[0]; if (!a) return;
  openDetail(a, en.type, en._item || {id:en.itemId, type:en.type, name:en.name, poster:en.poster, background:en.background});
}
function openMenu(en, ctx = {}){
  const m = $('#menu'); if (!m.hidden) return;
  const choose = (label, fn) => h('button', {class:'opt', type:'button', onclick:() => { popLayer('menu'); afterLayerClosed('menu', fn); }}, label);
  const inWL = !!profile && wlHas(en.itemId), seen = watchedHas(en.itemId), isSer = en.type === 'series';
  let serBtn = null;
  if (profile && !ctx.upcoming && !ctx.watching && isSer) {
    serBtn = choose('Caught up', async () => { try { const meta = await serMeta(en.itemId, 'series', en.addonId); if (meta) serToggle(meta); else toast("Couldn't load this show right now"); } catch { toast("Couldn't load this show right now"); } });
    const hit = serMem.get(en.itemId);
    if (hit) serBtn.textContent = serLabel(hit.m);
    else serMeta(en.itemId, 'series', en.addonId).then(m => { if (m) serBtn.textContent = serLabel(m); }).catch(() => {});
  }
  const base = {itemId:en.itemId, type:en.type, name:en.name, poster:en.poster, background:en.background, addonId:en.addonId};
  m.replaceChildren(h('div', {class:'box'},
    h('h3', null, en.name),
    choose('Details', () => openEntry(en)),
    profile ? choose(inWL ? 'Remove from watchlist' : 'Add to watchlist', () => {
      if (inWL) { wlRemove(en.itemId); toast('Removed from watchlist'); } else { wlAdd({...base}); toast('Added to watchlist'); }
      if (!$('#watch').hidden) renderWatch();
    }) : null,
    profile && cur ? choose(likeHas(en.itemId) ? 'Remove like' : 'Like', () => {
      if (likeHas(en.itemId)) { likeRemove(en.itemId); toast('Removed your like'); } else { likeAdd({...base}); toast('Liked. You will get more like this on Home'); }
    }) : null,
    profile && !ctx.upcoming && !ctx.watching ? (isSer ? serBtn : choose(seen ? 'Mark as unwatched' : 'Mark as watched', () => {
      if (seen) { watchedRemove(en.itemId); toast('Marked as unwatched'); } else { watchedAdd(base); toast('Marked as watched'); }
      refreshLists();
    })) : null,
    ctx.cw ? choose('Remove from Continue watching', () => {
      if (ctx.cw.fromShow) showForget(en.itemId); else histRemove(ctx.cw.k);
      refreshLists(); toast('Removed from Continue watching');
    }) : null,
    ctx.watching ? choose('Remove from Watching', () => { showForget(en.itemId); refreshLists(); toast('Removed from Watching'); }) : null,
    ctx.history ? choose('Remove from history', () => { historyForget(en); refreshLists(); toast('Removed from history'); }) : null,
    choose('Cancel', () => {})));
  m.hidden = false; pushLayer('menu');
  m.onclick = ev => { if (ev.target === m) popLayer('menu'); };
}
function refreshLists(){ try { if (!$('#home').hidden) renderCW(); if (!$('#watch').hidden) renderWatch(); } catch {} }
function attachLong(el, fn){
  el._holdFn = fn;
  let t = null, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sx = e.clientX; sy = e.clientY; cancel();
    t = setTimeout(() => { t = null; el._held = true; setTimeout(() => { el._held = false; }, 700); try { navigator.vibrate && navigator.vibrate(18); } catch {} fn(); }, 520);
  });
  el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, cancel);
  el.addEventListener('click', e => { if (el._held) { el._held = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (!el._held) fn(); });
}
function attachHold(el, en, ctx = {}){
  el._entry = en; el._ctx = ctx;
  let t = null, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sx = e.clientX; sy = e.clientY; cancel();
    t = setTimeout(() => { t = null; el._held = true; setTimeout(() => { el._held = false; }, 700); try { navigator.vibrate && navigator.vibrate(18); } catch {} openMenu(en, ctx); }, 520);
  });
  el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, cancel);
  el.addEventListener('click', e => { if (el._held) { el._held = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (!el._held) openMenu(en, ctx); });
}

let wlFilter = 'all';
function openWL(e){
  const a = addons.find(x => x.uid === e.addonId) || addons[0];
  if (a) openDetail(a, e.type, {id:e.itemId, type:e.type, name:e.name, poster:e.poster, background:e.background});
}
/* ---------- My List: Watchlist · Watching · History · For you ---------- */
let mlTab = 'list', mlTok = 0;
const ML_TABS = [['list', 'Watchlist'], ['watching', 'Watching'], ['history', 'History'], ['foryou', 'For you']];
const mlHere = sp => allHist() || sp === (cur && cur.id);
const fmtDay = t => { try { return new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'}); } catch { return ''; } };
function mlCard(e, sub, extra, ctx){
  const b = h('button', {class:'wlb', type:'button', 'data-id':e.itemId, onclick:() => openWL(e)}, posterEl(e), h('div', {class:'t'}, e.name), h('div', {class:'s'}, sub));
  attachHold(b, {...e}, ctx || {});
  return h('div', {class:'card wlc'}, b, extra || null);
}
const mlEmpty = (title, text) => h('div', {class:'empty', style:'grid-column:1/-1'}, h('h2', null, title), h('p', null, text));
function mlShows(){                                                          // shows remembered for this space, newest first
  const sh = pget('shows', {});
  return Object.keys(sh).filter(id => sh[id].ty === 'series' && mlHere(sh[id].sp)).map(id => ({id, ...sh[id]})).sort((x, y) => (y.t || 0) - (x.t || 0));
}
function renderWatch(noRefresh){
  if (!profile) return;
  const tok = ++mlTok, grid = $('#wlGrid'), wl = wlHere();
  $('#mlTabs').replaceChildren(...ML_TABS.map(([id, label]) => h('button', {class:'chip' + (mlTab === id ? ' on' : ''), type:'button', onclick:() => { mlTab = id; renderWatch(); }}, label)));
  $('#wlTabs').hidden = mlTab !== 'list' || !wl.length;
  $('#wlCount').textContent = mlTab === 'list' && wl.length ? `${wl.length} saved` : '';
  if (mlTab === 'list') {
    const list = wl.filter(e => wlFilter === 'all' || (wlFilter === 'movie' ? e.type === 'movie' : e.type !== 'movie'));
    const chip = (id, label) => h('button', {class:'chip' + (wlFilter === id ? ' on' : ''), type:'button', onclick:() => { wlFilter = id; renderWatch(); }}, label);
    $('#wlTabs').replaceChildren(...(wl.length ? [chip('all', 'All'), chip('movie', 'Movies'), chip('series', 'Shows')] : []));
    if (!wl.length) { grid.replaceChildren(mlEmpty('Your watchlist is empty', 'Open any title and tap the bookmark to save it for later.')); return; }
    grid.replaceChildren(...list.map(e => mlCard(e, TYPE_LABEL[e.type] || e.type, h('button', {class:'rm', type:'button', tabindex:'-1', 'aria-label':'Remove', onclick:ev => { ev.stopPropagation(); wlRemove(e.itemId); renderWatch(); }}, '✕'))));
    return;
  }
  if (mlTab === 'watching') {
    const shows = mlShows();
    if (!shows.length) { grid.replaceChildren(mlEmpty('Nothing in progress', 'Shows you are watching appear here once you have played an episode.')); return; }
    grid.replaceChildren(...shows.map(s => { const n = unwatchedOf(s.id); return mlCard({itemId:s.id, type:'series', name:s.n, poster:s.p, background:s.b, addonId:s.a}, n > 0 ? `${n} to watch` : 'Caught up', null, {watching:true}); }));
    if (!noRefresh) { try { refreshCounts().then(ch => { if (ch && tok === mlTok && mlTab === 'watching' && !$('#watch').hidden) renderWatch(true); }); } catch {} }      // redraw once if the counts changed (never in a loop)
    return;
  }
  if (mlTab === 'history') {
    const sh = pget('shows', {}), byShow = new Map();
    for (const r of epAll()) { if (!r.itemId || r.s < 1) continue; const k = r.itemId, g = byShow.get(k) || {id:k, last:null, n:0, t:0}; g.n += r.done ? 1 : 0; if (r.t > g.t) { g.t = r.t; g.last = r; } byShow.set(k, g); }
    const rows = [...byShow.values()].filter(g => sh[g.id] && mlHere(sh[g.id].sp)).map(g => ({t:g.t, card:mlCard({itemId:g.id, type:'series', name:sh[g.id].n, poster:sh[g.id].p, background:sh[g.id].b, addonId:sh[g.id].a}, `S${g.last.s}:E${g.last.e} · ${fmtDay(g.t)}${g.n > 1 ? ' · ' + g.n + ' watched' : ''}`, null, {history:true})}));
    for (const m of wdGet()) if (m.type === 'movie' && mlHere(m.space)) rows.push({t:m.t || 0, card:mlCard({itemId:m.itemId, type:'movie', name:m.name, poster:m.poster, addonId:m.addonId}, `Movie · ${fmtDay(m.t)}`, null, {history:true})});
    rows.sort((x, y) => y.t - x.t);
    grid.replaceChildren(...(rows.length ? rows.slice(0, 120).map(r => r.card) : [mlEmpty('No history yet', 'What you watch shows up here, newest first.')]));
    return;
  }
  // For you: titles like the shows you watch most recently
  grid.replaceChildren(h('div', {class:'spin', style:'grid-column:1/-1;padding:16px'}, 'Looking for shows you might like…'));
  mlRecs(tok);
}
async function mlRecs(tok){
  const grid = $('#wlGrid'), seeds = mlShows().slice(0, 4);
  if (!seeds.length) { grid.replaceChildren(mlEmpty('Nothing to go on yet', 'Watch a few shows and suggestions based on them appear here.')); return; }
  const secs = [];
  await Promise.all(seeds.map(async (s, i) => {
    try {
      let list = recsCache.get(s.id);
      if (!list) {
        const a = addons.find(x => x.uid === s.a) || spaceAddons()[0] || addons[0], ma = addons.find(x => supports(x, 'meta', 'series', s.id)) || a;
        let meta = {id:s.id, type:'series', name:s.n}; if (ma) { const r = await getJSON(`${ma.base}/meta/series/${enc(s.id)}.json`); meta = {...meta, ...r.meta}; }
        list = (await findSimilar(a, 'series', meta)).slice(0, 12); recsCache.set(s.id, list);
      }
      secs[i] = {name:s.n, list};
    } catch {}
  }));
  if (tok !== mlTok || mlTab !== 'foryou') return;
  const mine = new Set(Object.keys(pget('shows', {}))), out = [];
  for (const sec of secs) {
    if (!sec) continue;
    const items = sec.list.filter(it => !mine.has(it.m.id)); if (!items.length) continue;
    out.push(h('div', {class:'rsep', style:'grid-column:1/-1;margin-top:6px'}, 'Because you watched ' + sec.name));
    for (const it of items.slice(0, 9)) {
      const {m, a, type} = it, btn = h('button', {class:'card', type:'button', onclick:() => openDetail(a, type, m)}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || ''));
      attachHold(btn, {itemId:m.id, type, name:m.name, poster:m.poster, background:m.background, addonId:a.uid, _item:m}); out.push(btn);
    }
  }
  grid.replaceChildren(...(out.length ? out : [mlEmpty('No suggestions right now', 'Try again after watching a bit more.')]));
}
