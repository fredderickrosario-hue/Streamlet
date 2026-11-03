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
function watchedRemove(id){
  if (!profile) return;
  pset('watched', wdGet().filter(x => x.itemId !== id));
  const r = pget('wdRemoved', {}); r[id] = Date.now();
  pset('wdRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 400)));
  scheduleSync(); syncRibbons();
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
  const inWL = !!profile && wlHas(en.itemId), seen = watchedHas(en.itemId);
  const base = {itemId:en.itemId, type:en.type, name:en.name, poster:en.poster, background:en.background, addonId:en.addonId};
  m.replaceChildren(h('div', {class:'box'},
    h('h3', null, en.name),
    choose('Details', () => openEntry(en)),
    profile ? choose(inWL ? 'Remove from watchlist' : 'Add to watchlist', () => {
      if (inWL) { wlRemove(en.itemId); toast('Removed from watchlist'); } else { wlAdd({...base}); toast('Added to watchlist'); }
      if (!$('#watch').hidden) renderWatch();
    }) : null,
    profile ? choose(seen ? 'Mark as unwatched' : 'Mark as watched', () => {
      if (seen) { watchedRemove(en.itemId); toast('Marked as unwatched'); } else { watchedAdd(base); toast('Marked as watched'); }
      if (!$('#home').hidden) renderCW();
    }) : null,
    ctx.cw ? choose('Remove from Continue watching', () => { histRemove(ctx.cw.k); renderCW(); toast('Removed from Continue watching'); }) : null,
    choose('Cancel', () => {})));
  m.hidden = false; pushLayer('menu');
  m.onclick = ev => { if (ev.target === m) popLayer('menu'); };
}
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
function mlCard(e, sub, extra){
  const b = h('button', {class:'wlb', type:'button', 'data-id':e.itemId, onclick:() => openWL(e)}, posterEl(e), h('div', {class:'t'}, e.name), h('div', {class:'s'}, sub));
  attachHold(b, {...e});
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
    grid.replaceChildren(...shows.map(s => { const n = unwatchedOf(s.id); return mlCard({itemId:s.id, type:'series', name:s.n, poster:s.p, background:s.b, addonId:s.a}, n > 0 ? `${n} to watch` : 'Caught up'); }));
    if (!noRefresh) { try { refreshCounts().then(ch => { if (ch && tok === mlTok && mlTab === 'watching' && !$('#watch').hidden) renderWatch(true); }); } catch {} }      // redraw once if the counts changed (never in a loop)
    return;
  }
  if (mlTab === 'history') {
    const sh = pget('shows', {}), byShow = new Map();
    for (const r of epAll()) { if (!r.itemId || r.s < 1) continue; const k = r.itemId, g = byShow.get(k) || {id:k, last:null, n:0, t:0}; g.n += r.done ? 1 : 0; if (r.t > g.t) { g.t = r.t; g.last = r; } byShow.set(k, g); }
    const rows = [...byShow.values()].filter(g => sh[g.id] && mlHere(sh[g.id].sp)).map(g => ({t:g.t, card:mlCard({itemId:g.id, type:'series', name:sh[g.id].n, poster:sh[g.id].p, background:sh[g.id].b, addonId:sh[g.id].a}, `S${g.last.s}:E${g.last.e} · ${fmtDay(g.t)}${g.n > 1 ? ' · ' + g.n + ' watched' : ''}`)}));
    for (const m of wdGet()) if (m.type === 'movie' && mlHere(m.space)) rows.push({t:m.t || 0, card:mlCard({itemId:m.itemId, type:'movie', name:m.name, poster:m.poster, addonId:m.addonId}, `Movie · ${fmtDay(m.t)}`)});
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
