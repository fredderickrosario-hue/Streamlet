/* ---------- Home: rows made for you (Your next watch · Because you watched · Because you liked) ---------- */
let personalSkip = false;                                                    // set once when personal rows came out empty, so Home falls back to the catalogs
function personalSeeds(){
  const sp = cur && cur.id, wl = wlHere(), shows = mlShows(), sh = pget('shows', {});
  const done = new Map(); for (const r of epAll()) if (r.done && r.itemId) done.set(r.itemId, (done.get(r.itemId) || 0) + 1);
  const movies = wdGet().filter(m => m.type === 'movie' && mlHere(m.space)).sort((x, y) => (y.t || 0) - (x.t || 0));
  const used = new Set(), out = [], push = (kind, it) => { if (!it.id || used.has(it.id)) return; used.add(it.id); out.push({kind, ...it}); };
  const watched = [...shows.map(s => ({id:s.id, type:'series', name:s.n, addonId:s.a, t:s.t || 0})), ...movies.map(m => ({id:m.itemId, type:'movie', name:m.name, addonId:m.addonId, t:m.t || 0}))].sort((x, y) => y.t - x.t);
  const liked = [...likeGet().map(e => ({id:e.itemId, type:e.type, name:e.name, addonId:e.addonId, t:(e.t || 0) + 1e13})), ...wl.map(e => ({id:e.itemId, type:e.type, name:e.name, addonId:e.addonId, t:e.t || 0})), ...shows.filter(s => (done.get(s.id) || 0) >= 3).map(s => ({id:s.id, type:'series', name:s.n, addonId:s.a, t:s.t || 0}))].sort((x, y) => y.t - x.t);
  // alternate: the latest watched, the latest liked, the next watched, ...
  const A = watched.slice(), B = liked.slice();
  while ((A.length || B.length) && out.length < 6) { const a = A.shift(); if (a) push('watched', a); if (out.length >= 6) break; const b = B.shift(); if (b) push('liked', b); }
  return {seeds: out, any: !!(watched.length || liked.length), wl, mine: new Set([...likeGet().map(e => e.itemId), ...Object.keys(sh), ...wdGet().map(m => m.itemId), ...wlGet().map(e => e.itemId)])};
}
async function personalRecs(s){
  let list = recsCache.get(s.id);
  if (!list) {
    const a = addons.find(x => x.uid === s.addonId || x.manifest.id === s.addonId) || spaceAddons()[0] || addons[0];
    const ma = a && (supports(a, 'meta', s.type, s.id) ? a : addons.find(x => supports(x, 'meta', s.type, s.id)));
    let meta = {id:s.id, type:s.type, name:s.name}; if (ma) { const r = await getJSON(`${ma.base}/meta/${s.type}/${enc(s.id)}.json`); meta = {...meta, ...r.meta}; }
    list = (await findSimilar(a, s.type, meta)).slice(0, 14); recsCache.set(s.id, list);
  }
  return list;
}
function recCard(it){
  const {m, a, type} = it, btn = h('button', {class:'card', type:'button', onclick:() => openDetail(a, type, m)}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || ''));
  attachHold(btn, {itemId:m.id, type, name:m.name, poster:m.poster, background:m.background, addonId:a.uid, _item:m});
  btn._hero = {a, m, type};
  return btn;
}
async function renderPersonal(box, tok){
  const {seeds, any, wl, mine} = personalSeeds();
  if (!any) return false;
  const mk = title => { const strip = h('div', {class:'strip'}), sec = h('div', {class:'row'}, h('h2', null, title), strip); return {sec, strip}; };
  const next = mk('Your next watch'), rows = seeds.map(s => ({s, ...mk((s.kind === 'liked' ? 'Because you liked ' : 'Because you watched ') + s.name)}));
  box.append(next.sec, ...rows.map(r => r.sec));
  // saved but not started yet come first
  const sh = pget('shows', {}), started = new Set([...Object.keys(sh), ...wdGet().map(m => m.itemId)]);
  for (const e of wl.filter(x => !started.has(x.itemId))) {
    const b = h('button', {class:'card', type:'button', onclick:() => openWL(e)}, posterEl(e), h('div', {class:'t'}, e.name), h('div', {class:'s'}, 'On your list'));
    attachHold(b, {...e}); next.strip.append(b);
  }
  const lists = await Promise.all(rows.map(r => personalRecs(r.s).catch(() => [])));
  if (tok !== homeTok) return true;
  const seen = new Set(); let any2 = false, nextN = 0;
  rows.forEach((r, i) => {
    const items = (lists[i] || []).filter(it => it.m && !mine.has(it.m.id) && it.m.id !== r.s.id);
    const fresh = items.filter(it => !seen.has(it.m.id)).slice(0, 12);
    if (fresh.length < 3) { r.sec.remove(); return; }
    for (const it of fresh) { seen.add(it.m.id); r.strip.append(recCard(it)); }
    any2 = true;
  });
  // your next watch: the best match of each row, interleaved after the saved titles
  const picks = []; for (let k = 0; k < 3; k++) for (const l of lists) { const it = (l || []).filter(x => x.m && !mine.has(x.m.id))[k]; if (it && !picks.some(p => p.m.id === it.m.id)) picks.push(it); }
  for (const it of picks.slice(0, Math.max(0, 14 - next.strip.children.length))) { next.strip.append(recCard(it)); nextN++; }
  if (!next.strip.children.length) next.sec.remove();
  return any2 || nextN > 0 || box.querySelector('.row') !== null;
}
