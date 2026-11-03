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
  pset('watched', [{itemId:e.itemId, type:e.type, name:e.name, space:cur && cur.id, t:Math.max(Date.now(), rt + 1)}, ...wdGet().filter(x => x.itemId !== e.itemId)].slice(0, 3000));
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
function renderWatch(){
  const all = wlHere(), list = all.filter(e => wlFilter === 'all' || (wlFilter === 'movie' ? e.type === 'movie' : e.type !== 'movie'));
  $('#wlCount').textContent = all.length ? `${all.length} saved` : '';
  const chip = (id, label) => h('button', {class:'chip' + (wlFilter === id ? ' on' : ''), type:'button', onclick:() => { wlFilter = id; renderWatch(); }}, label);
  $('#wlTabs').replaceChildren(...(all.length ? [chip('all', 'All'), chip('movie', 'Movies'), chip('series', 'Shows')] : []));
  const grid = $('#wlGrid');
  if (!all.length) { grid.replaceChildren(h('div', {class:'empty', style:'grid-column:1/-1'}, h('h2', null, 'Your watchlist is empty'), h('p', null, 'Open any title and tap "＋ Watchlist" to save it for later.'))); return; }
  grid.replaceChildren(...list.map(e => h('div', {class:'card wlc'},
    (() => { const b = h('button', {class:'wlb', type:'button', 'data-id':e.itemId, onclick:() => openWL(e)}, posterEl(e), h('div', {class:'t'}, e.name), h('div', {class:'s'}, TYPE_LABEL[e.type] || e.type)); attachHold(b, {...e}, {wl:true}); return b; })(),
    h('button', {class:'rm', type:'button', tabindex:'-1', 'aria-label':'Remove', onclick:ev => { ev.stopPropagation(); wlRemove(e.itemId); renderWatch(); }}, '✕'))));
}
