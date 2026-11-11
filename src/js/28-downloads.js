/* ---------- Downloads (phone app): movies, episodes and whole seasons, with subtitles, playable offline ----------
   Android's download manager does the work in the background (its own notification, keeps going when the app is closed).
   Files live in the app's own folder; this device's list is kept in streamlet.dl. Progress still goes to your profile. */
const DL_SVG = '<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/>';
const dlOn = () => { const N = nativePlayer(); return !!(N && N.dlStart) && !document.body.classList.contains('tv'); };
const dlAll = () => lsGet('streamlet.dl', []);
const dlSave = a => lsSet('streamlet.dl', a);
const dlKey = (type, id) => type + '|' + id;
const dlGet = (type, id) => dlAll().find(x => x.k === dlKey(type, id));
const dlUpd = (k, patch) => { const a = dlAll(), i = a.findIndex(x => x.k === k); if (i >= 0) { a[i] = {...a[i], ...patch}; dlSave(a); } };
const dlMB = st => { const m = /([\d.]+)\s*(GB|MB)/i.exec(`${st.title || ''} ${st.description || ''} ${st.name || ''}`); return m ? parseFloat(m[1]) * (/g/i.test(m[2]) ? 1024 : 1) : 0; };
const dlFmt = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : b > 0 ? Math.max(1, Math.round(b / 1024)) + ' KB' : '';
const dlWifi = () => uiGet().dlWifi !== false;
const dlSafe = s => String(s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'video';

/* the source for a download: your usual ranking (language, your pick, cached), at the quality you chose; HLS can't be saved as one file */
function dlPick(streams, q, itemId){
  const ranked = rankStreams(sortByLang(streams || []), itemId).filter(x => x.url && !/\.m3u8/i.test(x.url) && !x.touWeb && !isBadStream(x));
  if (!ranked.length) return null;
  if (q === 'best') return ranked[0];
  const want = +q, at = r => ranked.filter(x => resOf(x) === r);
  if (at(want).length) return at(want)[0];
  const lower = ranked.filter(x => resOf(x) && resOf(x) < want).sort((a, b) => resOf(b) - resOf(a));
  if (lower.length) return lower[0];
  return ranked.slice().sort((a, b) => (dlMB(a) || 1e9) - (dlMB(b) || 1e9))[0];       // nothing labelled: the smallest one
}
/* a small copy of the poster for when you're offline */
async function dlPoster(url){
  if (!url) return '';
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; setTimeout(no, 8000); });
    const c = document.createElement('canvas'), w = 180, hgt = Math.round(w * img.naturalHeight / img.naturalWidth) || 270;
    c.width = w; c.height = hgt; c.getContext('2d').drawImage(img, 0, 0, w, hgt);
    return c.toDataURL('image/jpeg', .72);
  } catch { return url; }
}
function dlChooseQuality(label, go){
  const m = $('#menu'); if (!m.hidden) return;
  const q0 = uiGet().dlQ || '1080';
  const opt = (q, t, sub) => h('button', {class:'opt' + (q === q0 ? ' on' : ''), type:'button', onclick:() => { uiSet({dlQ:q}); popLayer('menu'); afterLayerClosed('menu', () => go(q)); }}, t, h('small', null, sub));
  m.replaceChildren(h('div', {class:'box'}, h('h3', null, 'Download ' + label),
    opt('720', '720p', 'Smaller: usually 0.3–1 GB an episode'), opt('1080', '1080p', 'Usually 1–4 GB an episode'), opt('best', 'Best available', 'Can be 10 GB or more'),
    h('p', {class:'gnote', style:'margin:6px 4px 10px'}, dlWifi() ? 'Downloads wait for Wi-Fi (Settings > Storage & backup).' : 'Downloads use any connection, mobile data included.'),
    h('button', {class:'opt', type:'button', onclick:() => popLayer('menu')}, 'Cancel')));
  m.hidden = false; pushLayer('menu'); m.onclick = ev => { if (ev.target === m) popLayer('menu'); };
}
/* one title or episode: find the source, its real file link and subtitles, then hand it to the download manager */
async function dlOne(job, q){
  const N = nativePlayer(), k = dlKey(job.type, job.id);
  const a0 = dlAll().filter(x => x.k !== k);
  a0.unshift({k, itemId:job.itemId, type:job.type, vid:job.id, s:job.s, e:job.e, name:job.name, ep:job.ep || '', poster:job.poster || '', q, status:'finding', at:Date.now(), addonId:job.addonId, subs:[]});
  dlSave(a0); dlPaint();
  try {
    const streams = await collectStreams(job.type, job.id, job.base, 6000);
    const st = dlPick(streams, q, job.itemId);
    if (!st) { dlUpd(k, {status:'failed', why:'No source can be downloaded (only streams)'}); dlPaint(); return false; }
    const real = (await N.resolveLink({url:st.url})).url || st.url;
    const ext = (/\.(mkv|mp4|m4v|avi|webm|mov|ts)(?:$|\?)/i.exec(new URL(real).pathname) || [, 'mkv'])[1].toLowerCase();
    const base = dlSafe(job.e != null ? `${job.name} S${String(job.s).padStart(2, '0')}E${String(job.e).padStart(2, '0')}` : job.name);
    const r = await N.dlStart({url:real, file:`${base}.${ext}`, title:job.e != null ? `${job.name} · S${job.s}:E${job.e}` : job.name, wifiOnly:dlWifi()});
    dlUpd(k, {status:'waiting', dm:r.id, file:r.file, src:String(st.name || '').split('\n')[0].trim(), mb:dlMB(st)});
    dlPaint();
    (async () => {                                                       // subtitles and poster, while the video downloads
      const subs = [];
      try {
        const all = await withTimeout(collectSubs({type:job.type, id:job.id, ...job.base}), 8000), pref = effSub() !== 'off' ? effSub() : null, pick = [];
        for (const want of [pref, 'eng', 'fre'].filter(Boolean)) { const s2 = all.filter(x => sameLang(x.lang, want) && !pick.includes(x)).slice(0, want === pref ? 2 : 1); pick.push(...s2); }
        for (const [i, x] of pick.slice(0, 4).entries()) {
          const sx = (/\.(vtt|ass|ssa)(?:$|\?)/i.exec(x.url) || [, 'srt'])[1].toLowerCase();
          try { const f = await N.dlSmall({url:x.url, file:`${base}.${code2(x.lang) || 'xx'}${i}.${sx}`}); subs.push({file:f.file, lang:code2(x.lang) || String(x.lang), label:langName(x.lang)}); } catch {}
        }
      } catch {}
      const poster = await dlPoster(job.poster);
      dlUpd(k, {subs, poster}); dlPaint();
    })();
    return true;
  } catch (e) { dlUpd(k, {status:'failed', why:String(e.message || e).slice(0, 120)}); dlPaint(); return false; }
}
/* entry points from title pages */
function dlTitle(addon, meta, base){
  if (!dlOn()) return;
  const have = dlGet('movie', meta.id); if (have && have.status !== 'failed') { openDownloads(); return; }
  dlChooseQuality(meta.name, q => { toast('Getting the download ready…'); dlOne({type:'movie', id:meta.id, itemId:meta.id, name:meta.name, poster:meta.poster, addonId:addon.uid, base}, q).then(ok => { if (ok) toast('Downloading ' + meta.name); else toast("Couldn't download: " + ((dlGet('movie', meta.id) || {}).why || 'no source')); }); });
}
function dlEpisode(addon, type, meta, v, sorted){
  if (!dlOn()) return;
  const have = dlGet(type, v.id); if (have && have.status !== 'failed') { openDownloads(); return; }
  dlChooseQuality(`S${v.season ?? 1}:E${v.episode}`, q => { toast('Getting the download ready…'); dlOne(epJob(addon, type, meta, v, sorted), q).then(ok => toast(ok ? `Downloading S${v.season ?? 1}:E${v.episode}` : "Couldn't download: " + ((dlGet(type, v.id) || {}).why || 'no source'))); });
}
function dlEpBtn(addon, type, meta, v, sorted){
  if (!dlOn() || (v.released && new Date(v.released) > new Date())) return null;
  const b = h('button', {class:'pib', type:'button', 'aria-label':'Download episode', title:'Download episode'}); b.innerHTML = `<svg viewBox="0 0 24 24">${DL_SVG}</svg>`;
  const x = dlGet(type, v.id); if (x && x.status !== 'failed') b.classList.add('on');
  b.onclick = () => dlEpisode(addon, type, meta, v, sorted); return b;
}
const epJob = (addon, type, meta, v, sorted) => ({type, id:v.id, itemId:meta.id, s:v.season ?? 1, e:v.episode, name:meta.name, ep:v.title || v.name || '', poster:meta.poster, addonId:addon.uid, base:episodeBase(addon, type, meta, v, sorted)});
function dlSeason(addon, type, meta, list, sorted){
  if (!dlOn()) return;
  const now = Date.now(), todo = list.filter(v => (!v.released || new Date(v.released).getTime() <= now) && !(dlGet(type, v.id) && dlGet(type, v.id).status !== 'failed'));
  if (!todo.length) { toast('Every aired episode of this season is already downloaded'); openDownloads(); return; }
  dlChooseQuality(`season ${list[0].season ?? 1} (${todo.length} episode${todo.length > 1 ? 's' : ''})`, async q => {
    toast(`Preparing ${todo.length} episode${todo.length > 1 ? 's' : ''}…`);
    let ok = 0; for (const v of todo) { if (await dlOne(epJob(addon, type, meta, v, sorted), q)) ok++; }   // one at a time: gentle on the addon and Real-Debrid
    toast(ok === todo.length ? `Downloading ${ok} episodes` : `${ok} of ${todo.length} episodes downloading. See Downloads for the others`);
  });
}
/* status from the download manager */
let dlPollT = 0;
async function dlRefresh(){
  const N = nativePlayer(); if (!N || !N.dlStatus) return null;
  const a = dlAll(), ids = a.filter(x => x.dm != null && x.status !== 'done' && x.status !== 'failed').map(x => x.dm);
  try {
    const r = await N.dlStatus({ids});
    let changed = false;
    for (const x of a) { const s = x.dm != null && r.items[String(x.dm)]; if (!s) continue; const st = s.status === 'failed' ? 'failed' : s.status; if (x.status !== st || x.done !== s.done) { x.status = st; x.done = s.done; x.total = s.total; if (st === 'failed') x.why = 'The download stopped (code ' + s.reason + ')'; if (st === 'paused') x.why = s.reason === 3 ? 'Waiting for Wi-Fi' : s.reason === 4 ? 'Waiting for storage' : 'Paused by Android'; changed = true; } }
    if (changed) dlSave(a);
    return r.free;
  } catch { return null; }
}
async function dlRemove(list){
  const N = nativePlayer(), ks = new Set(list.map(x => x.k));
  try { await N.dlRemove({ids:list.filter(x => x.dm != null).map(x => x.dm), files:list.flatMap(x => [x.file, ...(x.subs || []).map(s => s.file)]).filter(Boolean)}); } catch {}
  dlSave(dlAll().filter(x => !ks.has(x.k)));
}
/* play a downloaded file: local video and subtitles, progress saved as usual */
function dlPlay(x){
  const title = x.e != null ? `${x.name} · S${x.s}:E${x.e}${x.ep ? ' · ' + x.ep : ''}` : x.name;
  const ctx = {type:x.type, id:x.vid, offline:true, info:{item:{id:x.itemId, type:x.type, name:x.name, poster:x.poster}, addonId:x.addonId},
    ep:x.e != null ? {season:x.s, episode:x.e, title:x.ep} : null};
  playStream({url:x.file, name:'Downloaded', title:x.src || '', subtitles:(x.subs || []).map(s => ({url:s.file, lang:s.lang}))}, title, ctx);
}

/* ---- the Downloads list (My List > Downloads) ---- */
function openDownloads(){ mlTab = 'dl'; showTab('watch'); }
let dlPaintT = 0;
function dlPaint(){ clearTimeout(dlPaintT); dlPaintT = setTimeout(() => { try { if (!$('#watch').hidden && mlTab === 'dl') renderDownloads($('#wlGrid')); } catch {} }, 120); }
async function renderDownloads(grid){
  const free = await dlRefresh();
  const a = dlAll(), used = a.reduce((n, x) => n + (x.status === 'done' ? x.total || 0 : x.done || 0), 0);
  const wifi = h('input', {type:'checkbox'}); wifi.checked = dlWifi(); wifi.onchange = () => uiSet({dlWifi:wifi.checked});
  const head = h('div', {class:'dlhead'}, h('span', null, h('b', null, a.length ? `${a.length} download${a.length > 1 ? 's' : ''}` : 'Downloads'), h('small', null, [used ? dlFmt(used) + ' used' : '', free ? dlFmt(free) + ' free' : ''].filter(Boolean).join(' · '))),
    h('label', {class:'dlwifi'}, wifi, h('span', null, 'Wi-Fi only')));
  if (!a.length) { grid.replaceChildren(h('div', {class:'dlwrap'}, head, mlEmpty('Nothing downloaded yet', 'Open a movie or an episode and press the download button. Whole seasons too.'))); return; }
  const groups = new Map(); for (const x of a) { const g = groups.get(x.itemId) || []; g.push(x); groups.set(x.itemId, g); }
  const row = x => {
    const pct = x.total > 0 ? Math.min(100, Math.round((x.done || 0) / x.total * 100)) : 0, live = x.status === 'running' || x.status === 'waiting' || x.status === 'paused' || x.status === 'finding';
    const line = x.status === 'done' ? [dlFmt(x.total), x.q === 'best' ? 'Best' : x.q + 'p', (x.subs || []).length ? `${x.subs.length} subtitle${x.subs.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')
      : x.status === 'failed' ? (x.why || 'Failed') : x.status === 'finding' ? 'Finding a source…' : x.status === 'paused' ? (x.why || 'Paused') + (pct ? ` · ${pct}%` : '')
      : x.status === 'waiting' ? 'Waiting to start' : `${pct}% · ${dlFmt(x.done || 0)} of ${dlFmt(x.total || 0)}`;
    return h('div', {class:'dlrow' + (x.status === 'done' ? ' ok' : '')},
      h('span', {class:'dlx'}, h('b', null, x.e != null ? `S${x.s}:E${x.e}${x.ep ? ' · ' + x.ep : ''}` : (x.src ? 'From ' + x.src : 'Full movie')), h('small', null, line),
        live && x.status !== 'finding' ? h('span', {class:'dlbar'}, h('i', {style:`width:${pct}%`})) : null),
      x.status === 'done' ? h('button', {class:'btn sm', type:'button', onclick:() => dlPlay(x)}, '▶ Play') : null,
      x.status === 'failed' ? h('button', {class:'btn ghost sm', type:'button', onclick:() => { const job = {type:x.type, id:x.vid, itemId:x.itemId, s:x.s, e:x.e, name:x.name, ep:x.ep, poster:x.poster, addonId:x.addonId, base:{info:{item:{id:x.itemId, type:x.type, name:x.name}, addonId:x.addonId}, alt:[], ep:x.e != null ? {season:x.s, episode:x.e, title:x.ep} : null}}; dlOne(job, x.q || '1080'); }}, 'Retry') : null,
      h('button', {class:'btn ghost sm', type:'button', 'aria-label':live ? 'Cancel' : 'Delete', onclick:async () => { await dlRemove([x]); dlPaint(); toast(live ? 'Cancelled' : 'Deleted'); }}, live ? 'Cancel' : 'Delete'));
  };
  const cards = [...groups.values()].map(g => {
    g.sort((p, q) => (p.s ?? 0) - (q.s ?? 0) || (p.e ?? 0) - (q.e ?? 0));
    const x0 = g[0], img = x0.poster;
    return h('div', {class:'dlgrp'},
      h('div', {class:'dlgh'}, img ? h('img', {src:img, alt:'', onerror:e => e.target.remove()}) : h('span', {class:'dlph'}),
        h('span', {class:'dlx'}, h('b', null, x0.name), h('small', null, x0.type === 'movie' ? 'Movie' : `${g.length} episode${g.length > 1 ? 's' : ''}`)),
        g.length > 1 ? h('button', {class:'btn ghost sm', type:'button', onclick:async () => { await dlRemove(g); dlPaint(); toast('Deleted ' + x0.name); }}, 'Delete all') : null),
      ...g.map(row));
  });
  grid.replaceChildren(h('div', {class:'dlwrap'}, head, ...cards));
  clearTimeout(dlPollT);
  if (a.some(x => x.status !== 'done' && x.status !== 'failed')) dlPollT = setTimeout(dlPaint, 2500);   // keep the numbers moving while something downloads
}

/* ---- offline: Home leads with your downloads; the rows come back with the connection ---- */
function dlOfflineRow(box){
  if (navigator.onLine !== false) return;
  const done = dlOn() ? dlAll().filter(x => x.status === 'done') : [];
  const strip = h('div', {class:'strip'});
  for (const x of done.slice(0, 20)) {
    const b = h('button', {class:'card', type:'button', onclick:() => dlPlay(x)}, posterEl({name:x.name, poster:x.poster}),
      h('div', {class:'t'}, x.name), h('div', {class:'s'}, x.e != null ? `S${x.s}:E${x.e}` : 'Movie'));
    strip.append(b);
  }
  box.prepend(h('div', {class:'row offrow'}, h('h2', null, "You're offline ", h('small', null, done.length ? '· your downloads' : '· nothing downloaded on this device')),
    done.length ? strip : h('p', {class:'gnote', style:'padding:0 4px'}, dlOn() ? 'Download movies and episodes from their pages to watch them without a connection.' : 'Rows come back when you reconnect.'),
    dlOn() && done.length ? h('button', {class:'btn ghost sm', type:'button', style:'margin:8px 4px 0', onclick:openDownloads}, 'All downloads') : null));
}
addEventListener('online', () => { try { if (cur && !$('#home').hidden) renderHome(); } catch {} });
addEventListener('offline', () => { try { if (cur && !$('#home').hidden) renderHome(); } catch {} });
