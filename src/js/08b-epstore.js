/* ---------- per-episode watch state ----------
   One record per title + season + episode: {k,itemId,s,e,pos,dur,done,t}. Movies use season 0 / episode 0.
   Everything about episodes (progress bars, watched marks, which episode is next) reads from here.
   Records merge per record by latest t, with tombstones in 'epRemoved', so two devices never overwrite each other. */
let _epIdx = null, _epFor = null;
const epKey = (id, s, e) => `${id}|${s ?? 1}|${e ?? 0}`;
const epAll = () => profile ? pget('eps', []) : [];
function epReset(){ _epIdx = null; }
function epMap(){
  if (!profile) return new Map();
  if (!_epIdx || _epFor !== profile.id) { _epIdx = new Map(epAll().map(r => [r.k, r])); _epFor = profile.id; }
  return _epIdx;
}
const epGet = (id, s, e) => epMap().get(epKey(id, s, e)) || null;
const epDone = (id, s, e) => { const r = epGet(id, s, e); return !!(r && r.done); };
function epWrite(list){
  pset('eps', list.sort((a, b) => b.t - a.t).slice(0, 3000)); epReset(); scheduleSync();
}
function epPut(id, s, e, patch, t){
  if (!profile) return;
  const k = epKey(id, s, e), rem = pget('epRemoved', {})[k] || 0, old = epGet(id, s, e) || {};
  const rec = {k, itemId:id, s:s ?? 1, e:e ?? 0, pos:Math.round(old.pos || 0), dur:Math.round(old.dur || 0), done:!!old.done, ...patch, t:Math.max(t || Date.now(), rem + 1)};
  if (patch && patch.pos != null) rec.pos = Math.round(patch.pos);
  if (patch && patch.dur != null) rec.dur = Math.round(patch.dur);
  epWrite([rec, ...epAll().filter(x => x.k !== k)]);
}
function epDel(id, s, e){
  if (!profile) return;
  const k = epKey(id, s, e), r = pget('epRemoved', {}); r[k] = Date.now();
  pset('epRemoved', Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 1500)));
  epWrite(epAll().filter(x => x.k !== k));
}
/* mark a list of episodes (all of a season, or the whole show) watched / unwatched */
function epMark(id, list, done){
  if (!profile) return;
  const now = Date.now(), have = new Map(epAll().map(r => [r.k, r]));
  for (const v of list) {
    const s = v.season ?? 1, e = v.episode ?? 0, k = epKey(id, s, e);
    if (done) { const rem = pget('epRemoved', {})[k] || 0, o = have.get(k) || {}; have.set(k, {k, itemId:id, s, e, pos:0, dur:o.dur || 0, done:true, t:Math.max(now, rem + 1)}); }
    else { have.delete(k); const r = pget('epRemoved', {}); r[k] = now; pset('epRemoved', r); }
  }
  epWrite([...have.values()]);
  if (done) for (const x of histGet().filter(x => x.itemId === id)) histRemove(x.k);
}
/* which episode to play next: the one in progress, else the first not yet watched after the last watched one, else the first */
function epNext(id, sorted){
  const real = sorted.filter(v => (v.season ?? 1) >= 1), pool = real.length ? real : sorted;
  let prog = null;
  for (const v of pool) { const r = epGet(id, v.season ?? 1, v.episode); if (r && !r.done && r.pos > 20 && (!prog || r.t > prog.r.t)) prog = {v, r}; }
  if (prog) return {v:prog.v, resume:true};
  let last = -1;
  pool.forEach((v, i) => { if (epDone(id, v.season ?? 1, v.episode)) last = i; });
  const nx = pool[last + 1] || (last < 0 ? pool[0] : null);
  return {v:nx || pool[0], resume:false, finished:!nx && last >= 0};
}
/* one-off: fold the old "continue watching" entries into episode records */
function epMigrate(){
  if (!profile || pget('epsMig', false)) return;
  for (const x of histGet()) if (x.ep && x.itemId && !x.upnext && x.dur) {
    if (!epGet(x.itemId, x.ep.season, x.ep.episode)) epPut(x.itemId, x.ep.season, x.ep.episode, {pos:x.pos, dur:x.dur, done:false}, x.t);
  }
  pset('epsMig', true);
}
/* backup file: everything a profile has watched, restorable on any device */
function backupExport(){
  const data = {app:'streamlet', v:1, at:Date.now(), profile:profile && profile.name, eps:epAll(), history:histGet(), watched:wdGet(), watchlist:wlGet()};
  const a = h('a', {href:URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'})), download:`streamlet-backup-${new Date().toISOString().slice(0, 10)}.json`});
  document.body.append(a); a.click(); a.remove(); toast('Backup saved');
}
function backupImport(file){
  if (!profile || !file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt); if (!d || d.app !== 'streamlet') throw 0;
    const merge = (key, rows, idf) => { const m = new Map(pget(key, []).map(x => [idf(x), x])); for (const r of rows || []) { const o = m.get(idf(r)); if (!o || (o.t || 0) < (r.t || 0)) m.set(idf(r), r); } return [...m.values()].sort((a, b) => (b.t || 0) - (a.t || 0)); };
    pset('eps', merge('eps', d.eps, r => r.k).slice(0, 3000)); epReset();
    pset('history', merge('history', d.history, r => r.itemId).slice(0, 60));
    pset('watched', merge('watched', d.watched, r => r.itemId).slice(0, 3000));
    pset('watchlist', merge('watchlist', d.watchlist, r => r.itemId));
    scheduleSync(); try { syncRibbons(); renderCW(); } catch {} toast('Backup restored');
  }).catch(() => toast('That is not a Streamlet backup'));
}

const fillTmdb = () => { $('#setTmdb').value = lsGet('streamlet.tmdb', '') || ''; };

/* shows watched before the followed-shows list existed (or on another device): rebuild their entries from the history and watchlist, which already carry the name, picture and space */
function showsBackfill(id){
  if (!id) return false;
  const sh = {...plsGet(id, 'shows', {})}; let ch = false;
  for (const x of plsGet(id, 'history', [])) { const ii = x.itemId; if (!ii || sh[ii] || (x.itemType || x.type) !== 'series' || !x.space || !x.name) continue; sh[ii] = {n:x.name, p:x.poster || '', b:x.background || '', a:x.addonId || '', ty:'series', sp:x.space, t:x.t || Date.now()}; ch = true; }
  for (const x of plsGet(id, 'watchlist', [])) { const ii = x.itemId, sp = x.spaces && x.spaces[0]; if (!ii || sh[ii] || x.type !== 'series' || !sp || !x.name) continue; sh[ii] = {n:x.name, p:x.poster || '', b:x.background || '', a:x.addonId || '', ty:'series', sp, t:x.t || Date.now()}; ch = true; }
  if (ch) plsSet(id, 'shows', Object.fromEntries(Object.entries(sh).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 200)));
  return ch;
}
