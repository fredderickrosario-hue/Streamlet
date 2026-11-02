/* ---------- player (subtitles + audio) ---------- */
let hls = null;
let pl = {id:0, ctx:null, subs:[], loading:false, nSrc:0, cur:null, offset:0, blob:null};
const OS_URL = 'https://opensubtitles-v3.strem.io/manifest.json';

async function getText(url){
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP '+r.status);
  const buf = await r.arrayBuffer();
  try { return new TextDecoder('utf-8', {fatal:true}).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
function toVtt(txt, off){
  txt = txt.replace(/^﻿/, '').replace(/\r/g, '').replace(/\{\\an?\d\}/g, '');
  const fmt = ms => { ms = Math.max(0, Math.round(ms)); const p = (n,l=2) => String(n).padStart(l,'0');
    return `${p(Math.floor(ms/3600000))}:${p(Math.floor(ms/60000)%60)}:${p(Math.floor(ms/1000)%60)}.${p(ms%1000,3)}`; };
  const parse = t => { const m = t.match(/(\d+):(\d+):(\d+)[,.](\d{1,3})/); return ((+m[1]*60 + +m[2])*60 + +m[3])*1000 + +m[4].padEnd(3,'0'); };
  const body = txt.replace(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/g,
    (_, x, y) => `${fmt(parse(x) + off*1000)} --> ${fmt(parse(y) + off*1000)}`);
  return /^WEBVTT/.test(body) ? body : 'WEBVTT\n\n' + body;
}

function setPanel(open){
  if (open) { if (!$('#ppanel').hidden) return; $('#ppanel').hidden = false; $('#pback').hidden = false; pushLayer('panel'); renderPanel(); }
  else popLayer('panel');
}
$('#pback').onclick = () => setPanel(false);
async function applySub(entry, keep){
  if (!keep) setPanel(false);
  const v = $('#vid'), myId = pl.id;
  v.querySelectorAll('track').forEach(t => t.remove());
  for (const t of v.textTracks) t.mode = 'disabled';
  if (pl.blob) { URL.revokeObjectURL(pl.blob); pl.blob = null; }
  pl.cur = entry; renderPanel();
  if (!entry) return;
  try {
    if (!entry.raw) entry.raw = await getText(entry.url);
    if (pl.id !== myId) return;
    pl.blob = URL.createObjectURL(new Blob([toVtt(entry.raw, pl.offset)], {type:'text/vtt'}));
    const tr = h('track', {kind:'subtitles', label:langName(entry.lang), src:pl.blob, default:''});
    v.append(tr); tr.track.mode = 'showing';
  } catch(e) { toast("Couldn't load that subtitle: " + e.message); pl.cur = null; renderPanel(); }
}

async function loadSubs(){
  const ctx = pl.ctx, myId = pl.id; if (!ctx) return;
  const cands = [ctx.id, ...(ctx.alt || [])];
  const srcs = addons.map(a => ({a, sid:cands.find(c => supports(a, 'subtitles', ctx.type, c))})).filter(x => x.sid);
  pl.nSrc = srcs.length; pl.loading = srcs.length > 0; renderPanel();
  await Promise.all(srcs.map(async ({a, sid}) => {
    try {
      const r = await getJSON(`${a.base}/subtitles/${ctx.type}/${enc(sid)}.json`);
      if (pl.id !== myId) return;
      for (const x of (r.subtitles || [])) if (x.url) pl.subs.push({...x, addon:an(a)});
    } catch {}
  }));
  if (pl.id !== myId) return;
  pl.loading = false;
  if (settings.subLang !== 'off') { const m = pl.subs.find(x => sameLang(x.lang, settings.subLang)); if (m) { await applySub(m); return; } }
  renderPanel();
}

function audioTracks(){
  const v = $('#vid');
  if (hls && hls.audioTracks && hls.audioTracks.length > 1)
    return hls.audioTracks.map((t,i) => ({label:t.name || langName(t.lang), lang:t.lang, on:hls.audioTrack === i, pick:() => { hls.audioTrack = i; }}));
  if (v.audioTracks && v.audioTracks.length > 1)
    return [...v.audioTracks].map((t,i) => ({label:t.label || langName(t.language), lang:t.language, on:t.enabled, pick:() => { [...v.audioTracks].forEach((x,j) => x.enabled = j === i); }}));
  return [];
}
function autoAudio(){
  if (settings.audioLang === 'any') return;
  const t = audioTracks(), i = t.findIndex(x => x.lang && sameLang(x.lang, settings.audioLang));
  if (i >= 0 && !t[i].on) { t[i].pick(); renderPanel(); }
}

function renderPanel(){
  const pn = $('#ppanel'); if (pn.hidden) return;
  const byLang = {};
  for (const x of pl.subs) (byLang[langName(x.lang)] ||= []).push(x);
  const pref = settings.subLang !== 'off' ? langName(settings.subLang) : null;
  const names = Object.keys(byLang).sort((a,b) => (b===pref) - (a===pref) || a.localeCompare(b));
  const subUI = [];
  if (!pl.nSrc) subUI.push(h('p', {class:'spin', style:'padding:0'}, 'No subtitle addon supports this title.'),
    h('button', {class:'btn sm', onclick:async () => { try { await installAddon(OS_URL); toast('OpenSubtitles installed'); loadSubs(); } catch(e) { toast(e.message); } }}, '+ Install OpenSubtitles'));
  else {
    subUI.push(h('button', {class:'opt'+(pl.cur ? '' : ' on'), onclick:() => applySub(null)}, 'Off'));
    if (pl.loading) subUI.push(h('p', {class:'spin', style:'padding:4px 0'}, 'Searching subtitles…'));
    else if (!pl.subs.length) subUI.push(h('p', {class:'spin', style:'padding:4px 0'}, 'No subtitles found for this title.'));
    for (const n of names) subUI.push(h('details', {open: n===pref ? '' : null},
      h('summary', null, `${n} `, h('small', {style:'color:var(--mut)'}, `(${byLang[n].length})`)),
      byLang[n].slice(0, 15).map((x,i) => h('button', {class:'opt'+(pl.cur === x ? ' on' : ''), onclick:() => applySub(x)}, `${n} ${i+1}`, h('small', null, x.addon)))));
    if (pl.cur) subUI.push(h('div', {class:'sync'}, h('span', {style:'color:var(--mut)'}, 'Sync'),
      h('button', {class:'btn ghost sm', onclick:() => { pl.offset -= .5; applySub(pl.cur, true); }}, '−0.5s'),
      h('b', null, (pl.offset > 0 ? '+' : '') + pl.offset.toFixed(1) + 's'),
      h('button', {class:'btn ghost sm', onclick:() => { pl.offset += .5; applySub(pl.cur, true); }}, '+0.5s')));
  }
  const at = audioTracks();
  const audUI = at.length
    ? at.map((t,i) => h('button', {class:'opt'+(t.on ? ' on' : ''), onclick:() => { t.pick(); setPanel(false); }}, t.label || 'Track '+(i+1), h('small', null, t.lang || '')))
    : [h('p', {class:'spin', style:'padding:0'}, "This stream has a single audio track the browser can see. For another language, go back and pick a stream tagged with it (MULTI, FR, ES…), they're sorted first if you set a preferred audio language.")];
  pn.replaceChildren(h('button', {class:'btn ghost sm', style:'float:right', onclick:() => setPanel(false)}, '✕ Close'), h('h3', null, 'Subtitles'), ...subUI, h('h3', null, 'Audio'), ...audUI);
}

let barT;
function setBar(on){
  for (const el of [$('#pbar'), $('#pctl')]) el.classList.toggle('off', !on);
  if (!on) { const a = document.activeElement; if (a && a.closest && a.closest('#pbar, #pctl')) a.blur(); }
}
function showBar(){
  setBar(true); clearTimeout(barT);
  barT = setTimeout(() => { if ($('#ppanel').hidden && !$('#vid').paused) setBar(false); }, document.body.classList.contains('tv') ? 4500 : 3200);
}
['touchstart','mousemove','click'].forEach(e => $('#player').addEventListener(e, showBar, {passive:true}));
$('#ccBtn').onclick = () => setPanel($('#ppanel').hidden);
$('#fsBtn').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await $('#player').requestFullscreen(); try { await screen.orientation.lock('landscape'); } catch {} }
  } catch { toast('Fullscreen not available here.'); }
};

async function playStream(s, title, ctx){
  if (s.externalUrl) { window.open(s.externalUrl,'_blank','noopener'); return; }
  if (s.ytId) { window.open('https://www.youtube.com/watch?v='+enc(s.ytId),'_blank','noopener'); return; }
  if (!s.url) { toast(s.infoHash ? "Torrent stream: needs a debrid service set up in that addon (so it returns direct links), or a backend." : 'This stream type is not supported.'); return; }
  if (nativePlayer()) { return playNative(s, title, ctx); }
  const v = $('#vid'); $('#player').hidden = false; $('#ptitle').textContent = title || ''; pushLayer('player');
  const tvp = document.body.classList.contains('tv'); v.controls = !tvp; $('#pctl').hidden = !tvp; showBar();
  setPanel(false);
  pl = {id:pl.id + 1, ctx, subs:[], loading:false, nSrc:0, cur:null, offset:0, blob:null, stream:{url:s.url, name:s.name, title:s.title}};
  lastSave = 0;
  const saved = ctx && histGet().find(x => x.k === `${ctx.type}|${ctx.id}`);
  if (saved && !saved.upnext && saved.pos > 20) v.addEventListener('loadedmetadata', () => { if (!v.duration || saved.pos < v.duration - 30) { v.currentTime = saved.pos; toast('Resumed at ' + fmtTime(saved.pos)); } }, {once:true});
  v.querySelectorAll('track').forEach(t => t.remove());
  for (const sub of (s.subtitles || [])) pl.subs.push({id:'embedded', url:sub.url, lang:sub.lang || 'eng', addon:'Stream'});
  if (/\.m3u8(\?|$)/i.test(s.url) && !v.canPlayType('application/vnd.apple.mpegurl')) {
    try {
      if (!window.Hls) await new Promise((res,rej) => document.head.append(h('script', {src:'https://cdn.jsdelivr.net/npm/hls.js@1', onload:res, onerror:rej})));
      hls = new Hls(); hls.loadSource(s.url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, autoAudio);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => { autoAudio(); renderPanel(); });
    } catch { toast("Couldn't load the HLS player."); }
  } else { v.src = s.url; v.addEventListener('loadedmetadata', autoAudio, {once:true}); }
  v.play().catch(() => {});
  if (ctx) loadSubs(); else renderPanel();
}
$('#vid').addEventListener('error', () => toast("Couldn't play that stream."));
let lastSave = 0;

/* ---------- in-app updates (Android app only): compares the installed build with the "apk-latest" release ---------- */
const UPD_REPO = 'fredderickrosario-hue/Streamlet';
const UPD_APK = FLAVOR === 'phone' ? `https://github.com/${UPD_REPO}/releases/download/apk-latest-phone/Streamlet-phone.apk` : `https://github.com/${UPD_REPO}/releases/download/apk-latest/Streamlet.apk`;
let updInfo = null;
async function checkUpdate(){
  const N = nativePlayer(); if (!N || !N.appVersion) return null;
  const cur = (await N.appVersion()).code;
  const r = await fetch(`https://api.github.com/repos/${UPD_REPO}/releases/tags/${FLAVOR === 'phone' ? 'apk-latest-phone' : 'apk-latest'}`, {headers:{Accept:'application/vnd.github+json'}});
  if (!r.ok) throw new Error('Could not reach GitHub.');
  const j = await r.json(), m = /Build #(\d+)/.exec(j.body || '');
  const latest = m ? +m[1] : 0;
  return (updInfo = {cur, latest, newer: latest > cur});
}
async function runUpdate(){
  const N = nativePlayer(), msg = $('#apkMsg'), btn = $('#apkInstall');
  if (btn.dataset.busy) return; btn.dataset.busy = '1'; msg.textContent = 'Downloading…';   // not 'disabled': that would take the remote's focus away
  lsSet('streamlet.upd', Date.now());                                    // if the system restarts the app while installing, come back to Settings
  const hd = await N.addListener('updateProgress', e => { if (e.percent >= 0) msg.textContent = `Downloading… ${e.percent}%`; });
  try { await N.installApk({url:UPD_APK}); msg.textContent = 'Tap Install in the window that opened.'; }
  catch (e) {
    msg.textContent = String(e.message || e) === 'permission'
      ? 'Allow Streamlet to install apps in the settings screen that just opened, come back and tap again.'
      : "Couldn't download the update (" + (e.message || e) + ').';
  }
  try { hd.remove(); } catch {}
  delete btn.dataset.busy;
}
function showUpdState(){
  const msg = $('#apkMsg'), inst = $('#apkInstall');
  if (!updInfo) return;
  $('#tabSettings').classList.toggle('upd', !!updInfo.newer);
  inst.hidden = !updInfo.newer;
  if (updInfo.newer) { inst.textContent = `Install build ${updInfo.latest}`; inst.onclick = runUpdate; msg.textContent = `Installed: build ${updInfo.cur}. Build ${updInfo.latest} is available.`; }
  else msg.textContent = `You're up to date (build ${updInfo.cur}).`;
}
async function manualCheck(){
  const msg = $('#apkMsg'); msg.textContent = 'Checking…';
  try { await checkUpdate(); showUpdState(); } catch (e) { msg.textContent = e.message || "Couldn't check."; }
}
function initUpdates(){
  const N = nativePlayer(); if (!N || !N.appVersion) return;
  $('#apkRow').hidden = false; $('#apkBtn').onclick = manualCheck;
  checkUpdate().then(i => { if (!i) return; showUpdState(); if (i.newer) toast('A new version of Streamlet is available. See Settings.'); }).catch(() => {});
}
setTimeout(initUpdates, 1500);

/* ---------- native ExoPlayer (Android / Android TV app only) ---------- */
const nativePlayer = () => {
  try {
    const C = window.Capacitor;
    return (C && C.isNativePlatform && C.isNativePlatform() && ((C.Plugins && C.Plugins.ExoPlayer) || (C.registerPlugin && C.registerPlugin('ExoPlayer')))) || null;
  } catch { return null; }
};
async function collectSubs(ctx){
  const cands = [ctx.id, ...(ctx.alt || [])];
  const srcs = addons.map(a => ({a, sid:cands.find(c => supports(a, 'subtitles', ctx.type, c))})).filter(x => x.sid), out = [];
  await Promise.all(srcs.map(async ({a, sid}) => {
    try { const r = await getJSON(`${a.base}/subtitles/${ctx.type}/${enc(sid)}.json`); for (const x of (r.subtitles || [])) if (x.url) out.push({...x, addon:an(a)}); } catch {}
  }));
  return out;
}
const uiPlay = (k, d) => { const v = lsGet('streamlet.ui', {})[k]; return v === undefined ? d : !!v; };
async function playNative(s, title, ctx){
  const N = nativePlayer();
  let subs = [];
  if (ctx) { try { subs = await withTimeout(collectSubs(ctx), 5000); } catch {} }
  for (const sub of (s.subtitles || [])) subs.push({url:sub.url, lang:sub.lang || 'eng'});
  const pref = settings.subLang !== 'off' ? settings.subLang : null;
  subs.sort((a, b) => (pref && sameLang(b.lang, pref) ? 1 : 0) - (pref && sameLang(a.lang, pref) ? 1 : 0));
  const seen = {}, picked = [];
  for (const x of subs) {                      // preferred language: up to 6 options, others: up to 2 each
    const n = langName(x.lang), cap = pref && sameLang(x.lang, pref) ? 6 : 2;
    seen[n] = seen[n] || 0;
    if (seen[n] < cap && picked.length < 24) { seen[n]++; picked.push({url:x.url, lang:code2(x.lang) || String(x.lang), label:n + (seen[n] > 1 ? ' ' + seen[n] : '')}); }
  }
  const saved = ctx && histGet().find(x => x.k === `${ctx.type}|${ctx.id}`);
  const startMs = saved && !saved.upnext && saved.pos > 20 ? Math.round(saved.pos * 1000) : 0;
  const stream = {url:s.url, name:s.name, title:s.title};
  const handle = await N.addListener('progress', e => recordProgress(ctx, stream, e.position / 1000, e.duration / 1000));
  try {
    const epLine = ctx && ctx.ep ? `S${ctx.ep.season ?? 1}:E${ctx.ep.episode ?? ''}` + (ctx.ep.title ? ' · ' + ctx.ep.title : '') : '';
    const itemId = ctx && ctx.info && ctx.info.item.id, nextTitle = ctx && ctx.next ? `S${ctx.next.season ?? 1}:E${ctx.next.episode ?? ''}` + (ctx.next.title ? ' · ' + ctx.next.title : '') : '';
    const r = await N.play({nextTitle, episode:!!(ctx && ctx.ep), subDelay:(mapGet('streamlet.subdelay')[itemId] || 0), url:s.url, title:title || '', hw:uiPlay('hw', true), fps:uiPlay('fps', true), tunnel:uiPlay('tunnel', false), pass:uiPlay('pass', true), eps:(ctx && ctx.eps && ctx.ep ? JSON.stringify(ctx.eps.map(x => ({s:x.season, e:x.episode, t:x.title || ''}))) : ''), curSeason:(ctx && ctx.ep ? ctx.ep.season ?? 1 : 1), curEpisode:(ctx && ctx.ep ? ctx.ep.episode ?? 0 : 0), subtitle:epLine, accent:(getComputedStyle(document.documentElement).getPropertyValue('--acc') || '').trim(), startMs, subtitles:picked, audioLang:code2(settings.audioLang) || null, subLang:pref ? (code2(pref) || pref) : null});
    if (r && r.failed) {
      badStreams.add(s); badSet(s); logErr(title, s, r.error); const el = streamEls.get(s); if (el) el.classList.add('bad');
      const list = (ctx && ctx._list) || [], i = list.indexOf(s);
      const nx = r.next && i >= 0 ? list.slice(i + 1).find(x => x && x.url && !badStreams.has(x)) : null;
      if (nx) { toast('Trying the next source…'); return playNative(nx, title, ctx); }
      toast(r.next ? 'No other sources to try.' : 'That source failed. Pick another one.');
    } else {
      if (r && r.duration) recordProgress(ctx, stream, r.position / 1000, r.duration / 1000);
      if (r && itemId && r.position > 20000) prefSet(itemId, sigOf(s));
      if (r && itemId && typeof r.subDelay === 'number') { const m = mapGet('streamlet.subdelay'); if (r.subDelay) m[itemId] = r.subDelay; else delete m[itemId]; lsSet('streamlet.subdelay', m); }
      if (r && r.autoNext && ctx && ctx.next) setTimeout(() => autoPlayNext(ctx, s), 60);
      else if (r && r.pick && ctx && ctx.eps) setTimeout(() => playEpisodeOf(ctx, r.pick.season, r.pick.episode, s), 60);
    }
  } catch (e) { toast("Couldn't start the native player: " + ((e && e.message) || e)); }
  finally { try { handle.remove(); } catch {} if (!$('#home').hidden) renderCW(); }
}
/* plays the next episode by itself: same kind of source as before when one exists */
async function autoPlayNext(ctx, prev){
  const nx = ctx.next; if (!nx || !ctx.info) return;
  const eps = ctx.eps, i = eps ? eps.findIndex(x => x.id === nx.id) : -1;
  return playEpisode(ctx, nx, prev, i >= 0 ? eps.slice(i + 2, i + 6) : (ctx.rest || []).slice(1), i >= 0 ? eps[i + 1] || null : (ctx.rest || [])[0] || null);
}
/* the viewer picked another episode inside the player */
function playEpisodeOf(ctx, season, episode, prev){
  const eps = ctx.eps || [], i = eps.findIndex(x => x.season === season && x.episode === episode); if (i < 0) return;
  return playEpisode(ctx, eps[i], prev, eps.slice(i + 2, i + 6), eps[i + 1] || null);
}
/* plays an episode from the same kind of source as the previous one when one exists */
async function playEpisode(ctx, nx, prev, rest, next){
  const imdb = ctx.alt && ctx.alt[0] ? String(ctx.alt[0]).split(':')[0] : null;
  const alt = imdb ? [`${imdb}:${nx.season}:${nx.episode}`] : [], cands = [nx.id, ...alt];
  const srcs = streamPool().map(a => ({a, sid:cands.find(c => supports(a, 'stream', ctx.type, c))})).filter(x => x.sid);
  toast('Loading ' + (nx.title ? nx.title : 'episode ' + nx.episode) + '…');
  let all = [];
  await Promise.all(srcs.map(async ({a, sid}) => { try { const r = await withTimeout(getJSON(`${a.base}/stream/${ctx.type}/${enc(sid)}.json`), 12000); all.push(...(r.streams || []).filter(x => x && x.url)); } catch {} }));
  const sig = sigOf(prev);
  all = sortByLang(all);
  const st = all.find(x => !isBadStream(x) && sigOf(x) === sig) || all.find(x => !isBadStream(x));
  if (!st) { toast('No sources found for that episode.'); return; }
  return playNative(st, ctx.info.item.name, {type:ctx.type, id:nx.id, info:ctx.info, alt, eps:ctx.eps, ep:{season:nx.season, episode:nx.episode, title:nx.title}, next:next || null, rest:rest || [], _list:all});
}
function saveProgress(){ const v = $('#vid'); recordProgress(pl.ctx, pl.stream, v.currentTime, v.duration); }
function recordProgress(c, stream, pos, dur){
  if (!c || !c.info || !profile) return;
  if (!isFinite(dur) || dur < 60 || pos < 15) return;
  const it = c.info.item, key = `${c.type}|${c.id}`;
  if (pos / dur >= 0.92) {                       // finished: drop it, queue the next episode
    histRemove(key);
    if (it.type === 'movie' || (c.ep && !c.next)) watchedAdd({itemId:it.id, type:it.type, name:it.name});
    if (c.next) histPut({k:`${c.type}|${c.next.id}`, type:c.type, id:c.next.id, itemId:it.id, itemType:it.type, name:it.name, poster:it.poster, background:it.background,
      addonId:c.info.addonId, ep:{season:c.next.season, episode:c.next.episode, title:c.next.title}, pos:0, dur:0, t:Date.now(), space:cur && cur.id, upnext:true});
    return;
  }
  histPut({k:key, type:c.type, id:c.id, itemId:it.id, itemType:it.type, name:it.name, poster:it.poster, background:it.background, addonId:c.info.addonId,
    ep:c.ep || null, next:c.next || null, pos, dur, t:Date.now(), space:cur && cur.id, stream});
}
$('#vid').addEventListener('timeupdate', () => { if (Date.now() - lastSave > 10000) { lastSave = Date.now(); saveProgress(); } });
$('#vid').addEventListener('pause', saveProgress);
$('#vid').addEventListener('ended', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden && !$('#player').hidden) saveProgress(); });
async function stopPlayer(){
  saveProgress();
  const v = $('#vid'); v.pause(); if (hls) { hls.destroy(); hls = null; }
  v.querySelectorAll('track').forEach(t => t.remove()); if (pl.blob) URL.revokeObjectURL(pl.blob);
  pl = {id:pl.id + 1, ctx:null, subs:[], loading:false, nSrc:0, cur:null, offset:0, blob:null};
  v.removeAttribute('src'); v.load(); $('#player').hidden = true; $('#ppanel').hidden = true; $('#pback').hidden = true;
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
}
$('#closePlayer').onclick = () => popLayer('player');

