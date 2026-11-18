/* ---------- Québec: a built-in addon (qc://tva) that reads TVA+ pages directly from this device ----------
   No server and no login: the phone / TV asks tvaplus.ca for the show, its seasons and episodes, then asks the video service
   for the episode's stream when you press Play. It only works inside the Android apps (the browser blocks these requests).
   Add it like any addon: Addons -> type "quebec". */
/* plain GET from the native side (no browser cross-origin rules) with a desktop browser identity */
async function qcGet(url, headers){
  const N = nativePlayer();
  if (N && N.httpGet) { const r = await N.httpGet({url, headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language':'fr-CA,fr;q=0.9', ...(headers || {})}}); return r; }
  const r = await fetch(url, {headers}); return {status:r.status, body:await r.text(), url:r.url};
}
const QC_ACCOUNTS = ['5481942443001', '5813221784001'];
const QC_DEFAULT_SHOWS = ['https://www.tvaplus.ca/tva/les-armes', 'https://www.tvaplus.ca/tva/indefendable', 'https://ici.radio-canada.ca/tele/stat/site/episodes'];
const qcMem = new Map();                                                  // url -> {t, v}: short in-memory cache
async function qcCached(key, ttl, fn){
  const hit = qcMem.get(key); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn(); qcMem.set(key, {t:Date.now(), v}); return v;
}
const QC_OLD_DEFAULTS = [['https://www.tvaplus.ca/tva/les-armes', 'https://www.tvaplus.ca/tva/indefendable'], ['https://www.tvaplus.ca/tva/les-armes', 'https://www.tvaplus.ca/tva/indefendable', 'https://ici.tou.tv/stat']];
const qcShowList = () => {                                              // [{src:'tva'|'tou'|'rc', path}]
  let raw = lsGet('streamlet.qcshows', null);
  if (Array.isArray(raw) && QC_OLD_DEFAULTS.some(d => d.length === raw.length && d.every((u, i) => u === raw[i]))) { raw = null; lsSet('streamlet.qcshows', null); }   // a saved copy of an old default list: use the current defaults
  const urls = Array.isArray(raw) && raw.length ? raw : QC_DEFAULT_SHOWS, out = [];
  for (const u of urls) {
    let m = String(u).match(/tvaplus\.ca(\/[a-z0-9-]+\/[a-z0-9-]+)(?:[\/?#]|$)/i); if (m) { out.push({src:'tva', path:m[1].toLowerCase()}); continue; }
    m = String(u).match(/ici\.radio-canada\.ca\/tele\/([a-z0-9-]+)/i); if (m) { out.push({src:'rc', path:m[1].toLowerCase()}); continue; }
    m = String(u).match(/tou\.tv\/([a-z0-9-]+)(?:[\/?#]|$)/i); if (m) out.push({src:'tou', path:m[1].toLowerCase()});
  }
  return out;
};
const qcShowId = e => `qc:${e.src}:${e.path}`;
/* shows that Cinemeta knows (full seasons and episodes) open through Cinemeta; this addon then supplies the streams */
const qcCinemetaId = e => { const tt = Object.keys(QC_IMDB).find(k => QC_IMDB[k].src === e.src && QC_IMDB[k].path === e.path); return tt && addons.some(a => supports(a, 'meta', 'series', tt)) ? tt : qcShowId(e); };
async function qcPageData(path){
  const r = await qcGet('https://www.tvaplus.ca' + path, {Accept:'text/html'});
  if (r.status !== 200) throw new Error('TVA+ answered ' + r.status);
  const m = String(r.body).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('TVA+ page has no data');
  return {raw:r.body, ent:JSON.parse(m[1]).props.pageProps.staticEntity || {}};
}
const qcTitleCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const qcSlugTitle = slug => qcTitleCase(String(slug).split('/').pop().replace(/^episode-\d+-?/, '').replace(/-\d{3,}$/, '').replace(/-/g, ' ').trim());
const qcDate = o => {                                                     // first date-looking value under a date-ish key
  for (const [k, v] of Object.entries(o || {})) if (/release|air|publi|start|avail|date/i.test(k) && typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v)) return v;
  return '';
};
function qcImages(ent){
  const urls = [];
  const walk = (o, key, d) => { if (!o || d > 4) return; if (typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') walk(v, k, d + 1); else if (k === 'url' && /^https?:/.test(v) && /image|thumb|poster|background|cover|hero|banner/i.test(key)) urls.push({key, url:v}); } };
  walk(ent, '', 0);
  const pick = re => (urls.find(x => re.test(x.key)) || {}).url;
  return {poster:pick(/poster|portrait|vertical|tall|cover/i) || (urls[0] || {}).url || '', background:pick(/background|landscape|hero|wide|banner/i) || pick(/main|thumb/i) || (urls[0] || {}).url || ''};
}
async function qcShowInfo(path){
  return qcCached('show' + path, 6 * 3600e3, async () => {
    const {raw, ent} = await qcPageData(path), im = qcImages(ent);
    const seasons = [...new Set([...raw.matchAll(new RegExp(path.replace(/\//g, '\\/') + '\\/saison-(\\d+)', 'g'))].map(m => +m[1]))].sort((a, b) => a - b);
    return {path, name:ent.name || ent.title || qcTitleCase(path.split('/').pop().replace(/-/g, ' ')), description:ent.longDescription || ent.description || ent.shortDescription || '', poster:im.poster, background:im.background, seasons};
  });
}
async function qcEpisodes(path, season){
  return qcCached(`eps${path}/${season}`, 20 * 60e3, async () => {
    const {ent} = await qcPageData(`${path}/saison-${season}/tous-les-episodes`);
    return (ent.associatedEntities || []).filter(e => e && e.slug).map(e => ({
      id:'qc:tva:' + e.slug, season:+e.seasonNumber || season, episode:+e.episodeNumber || 0,
      title:e.name || e.title || qcSlugTitle(e.slug), overview:e.longDescription || e.description || '',
      thumbnail:(e.mainImage && e.mainImage.url) || '', released:qcDate(e), runtime:e.durationMillis ? Math.round(e.durationMillis / 60000) + ' min' : ''}));
  });
}
async function qcEnrich(v){                                               // the newest episodes get their real title, date and summary from their own page
  try {
    const {ent} = await qcPageData(v.id.slice(6));
    if (ent.name) v.title = ent.name;
    v.overview = ent.longDescription || ent.description || v.overview;
    v.released = qcDate(ent) || v.released;
    if (ent.durationMillis) v.runtime = Math.round(ent.durationMillis / 60000) + ' min';
  } catch {}
}
async function qcMeta(path){
  const info = await qcShowInfo(path), seasons = info.seasons.length ? info.seasons : [1];
  const lists = [];
  for (let i = 0; i < seasons.length; i += 3) lists.push(...await Promise.all(seasons.slice(i, i + 3).map(s => qcEpisodes(path, s).catch(() => []))));
  const videos = lists.flat().sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
  const latest = videos.filter(v => v.season >= 1).slice(-3);
  await Promise.all(latest.map(v => v.released && v.overview ? null : qcEnrich(v)));
  return {id:'qc:tva:' + path, type:'series', name:info.name, poster:info.poster, background:info.background, description:info.description, videos, releaseInfo:''};
}
const qcPolicy = {};
/* WebVTT -> SubRip: same lines and times, without positions, styles or notes */
function qcVttToSrt(b){
  const ts = t => { const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d\d)[.,](\d{1,3})$/); return m ? `${String(m[1] || 0).padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3]},${m[4].padEnd(3, '0')}` : null; };
  const out = []; let n = 0;
  for (const blk of String(b).replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = blk.split('\n'), i = lines.findIndex(l => l.includes('-->')); if (i < 0) continue;
    const [a, z] = lines[i].split('-->'), A = ts(a), Z = ts(String(z).trim().split(/\s+/)[0]); if (!A || !Z) continue;
    const text = lines.slice(i + 1).join('\n').replace(/<\/?(?:c|v|lang|ruby|rt)[^>]*>/g, '').trim(); if (!text) continue;
    out.push(`${++n}\n${A} --> ${Z}\n${text}`);
  }
  return out.join('\n\n') + '\n';
}
async function qcStreams(id){
  const slug = id.replace(/^qc:tva:/, ''), {ent} = await qcPageData(slug);
  if (!ent.videoId) throw new Error('No video on that page');
  for (const acct of QC_ACCOUNTS) {
    try {
      if (!qcPolicy[acct]) { const js = (await qcGet(`https://players.brightcove.net/${acct}/default_default/index.min.js`)).body || '', m = js.match(/policyKey\s*:\s*"(BC[^"]+)"/); if (m) qcPolicy[acct] = m[1]; }
      if (!qcPolicy[acct]) continue;
      const r = await qcGet(`https://edge.api.brightcove.com/playback/v1/accounts/${acct}/videos/${ent.videoId}`, {Accept:'application/json;pk=' + qcPolicy[acct]});
      if (r.status !== 200) continue;
      const j = JSON.parse(r.body), src = (j.sources || []).filter(s => s.src && !s.key_systems), out = [];
      const https = u => String(u).replace(/^http:/, 'https:');
      for (const s of src.filter(s => /mpegurl/i.test(s.type || ''))) { out.push({name:'TVA+', title:'HLS · adaptive', url:https(s.src)}); break; }
      for (const s of src.filter(s => /mp4/i.test(s.container || s.type || '') && !/mpegurl|dash/i.test(s.type || '')).sort((a, b) => (b.height || 0) - (a.height || 0)))
        out.push({name:'TVA+', title:`MP4 · ${s.height ? s.height + 'p' : Math.round((s.encoding_rate || 0) / 1000) + ' kbps'}`, url:https(s.src)});
      /* TEST: every subtitle track TVA+ gives, as it comes (A, B…) and moved to the bottom (A bas…). Details go to the log (QC) so the one that works can be kept */
      const all = (j.text_tracks || []).filter(t => t.src), subs = [];
      for (let i = 0; i < all.length; i++) {
        const t = all[i], L = String.fromCharCode(65 + i), u = https(t.src);
        let info = 'not read', flat = null;
        try { const r = await qcCached('subraw' + u, 3600e3, () => qcGet(u)), b = String(r.body || '');
          info = `HTTP ${r.status} · ${b.length} chars · ${/^\uFEFF?WEBVTT/.test(b) ? 'WEBVTT' : 'starts "' + b.slice(0, 20).replace(/\s+/g, ' ') + '"'} · ${(b.match(/-->/g) || []).length} cues`;
          if (r.status === 200 && /-->/.test(b)) flat = 'data:application/x-subrip;base64,' + btoa(unescape(encodeURIComponent(qcVttToSrt(b)))); } catch (e) { info = 'error ' + e.message; }
        qcLog(`subs ${slug} ${L}: kind=${t.kind || '-'} lang=${t.srclang || '-'} label=${t.label || '-'} mime=${t.mime_type || '-'} default=${!!t.default} · ${info} · ${u.slice(0, 90)}`);
        subs.push({id:'qc' + L, url:/\.vtt/i.test(u) ? u : u + '#.vtt', lang:t.srclang || 'fr', label:`Test ${L}`});   // '#.vtt' tells the player it is WebVTT
        if (flat) subs.push({id:'qc' + L + 'b', url:flat, lang:t.srclang || 'fr', label:`Test ${L} bas`});
      }
      if (subs.length) out.forEach(o => { o.subtitles = subs; });
      if (out.length) return out;
    } catch {}
  }
  return [];
}
/* ICI TOU.TV: the site needs a login to play, so episodes open in the official app (toutv://); the lists come from the public pages */
async function qcTouData(path){
  const r = await qcGet('https://ici.tou.tv/' + path, {Accept:'text/html'});
  if (r.status !== 200) throw new Error('Tou.tv answered ' + r.status);
  const m = String(r.body).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Tou.tv page has no data');
  return JSON.parse(m[1]).props.pageProps.data || {};
}
const qcFirstUrl = o => { let f = ''; const walk = (x, d) => { if (!x || f || d > 4) return; if (typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (typeof v === 'string' && k === 'url' && /^https?:/.test(v)) { f = v; return; } walk(v, d + 1); } }; walk(o, 0); return f; };
async function qcTouShow(slug){
  return qcCached('tou' + slug, 6 * 3600e3, async () => {
    const d = await qcTouData(slug), h = d.header || {}, lineups = ((d.content || [])[0] || {}).lineups || [];
    const bg = (h.background && h.background.url) || '';
    return {src:'tou', path:slug, name:h.title || qcTitleCase(slug.replace(/-/g, ' ')), description:(d.htmlMeta && (d.htmlMeta.description || d.htmlMeta['og:description'])) || '', poster:bg, background:bg,
      seasons:lineups.map(l => +l.seasonNumber).filter(n => n >= 0)};
  });
}
async function qcTouEpisodes(slug, season){
  return qcCached(`toueps${slug}/${season}`, 20 * 60e3, async () => {
    const d = await qcTouData(`${slug}/s${String(season).padStart(2, '0')}`), lineups = ((d.content || [])[0] || {}).lineups || [];
    const lu = lineups.find(l => +l.seasonNumber === season) || lineups[lineups.length - 1] || {}, out = [];
    for (const it of lu.items || []) {
      const m = String(it.url || it.slug || '').match(/s(\d+)e(\d+)/i); if (!m) continue;
      out.push({id:`qc:tou:${slug}/s${m[1]}e${m[2]}`, season:+m[1], episode:+m[2], title:it.title && !/^Épisode \d+$/i.test(it.title) ? it.title : `Épisode ${+m[2]}`,
        overview:it.description || it.synopsis || '', thumbnail:qcFirstUrl(it.images || it.image || it), released:qcDate(it), runtime:''});
    }
    return out;
  });
}
async function qcTouMeta(slug){
  const info = await qcTouShow(slug), seasons = info.seasons.length ? info.seasons : [1], lists = [];
  for (let i = 0; i < seasons.length; i += 3) lists.push(...await Promise.all(seasons.slice(i, i + 3).map(n => qcTouEpisodes(slug, n).catch(() => []))));
  const videos = lists.flat().sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
  return {id:'qc:tou:' + slug, type:'series', name:info.name, poster:info.poster, background:info.background, description:info.description, videos, releaseInfo:''};
}
/* Radio-Canada's own site (ici.radio-canada.ca/tele/<show>/site/episodes): the replay videos are public, so they play in-app */
const QC_MONTHS = {janvier:1, 'février':2, fevrier:2, mars:3, avril:4, mai:5, juin:6, juillet:7, 'août':8, aout:8, septembre:9, octobre:10, novembre:11, 'décembre':12, decembre:12};
const qcRcDate = slug => { const m = String(slug).match(/(\d{1,2})(?:er)?-([a-zéûè]+)-(\d{4})/i), mo = m && QC_MONTHS[m[2].toLowerCase()]; return mo ? `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}T20:00:00Z` : ''; };
async function qcRcPage(url){
  const r = await qcGet(url, {Accept:'text/html'});
  if (r.status !== 200) throw new Error('Radio-Canada answered ' + r.status);
  return String(r.body);
}
const qcMeta1 = (html, prop) => ((html.match(new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]+content="([^"]*)"', 'i')) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + prop + '"', 'i')) || [])[1] || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
async function qcRcShow(slug){
  return qcCached('rc' + slug, 6 * 3600e3, async () => {
    const html = await qcRcPage(`https://ici.radio-canada.ca/tele/${slug}/site/episodes`), img = qcMeta1(html, 'og:image');
    const name = (qcMeta1(html, 'og:title') || '').replace(/\s*[|\-–].*$/, '') || qcTitleCase(slug.replace(/-/g, ' '));
    const seen = new Set(), eps = [];
    for (const m of html.matchAll(new RegExp('/tele/' + slug + '/site/episodes/(\\d+)/([a-z0-9-]+)', 'gi'))) { if (seen.has(m[1])) continue; seen.add(m[1]); eps.push({epId:m[1], slug:m[2], released:qcRcDate(m[2])}); }
    const keep = lsGet('streamlet.qcseen.' + slug, []);                    // the site only shows the newest episode(s): remember every one seen so the list builds up
    for (const k of keep) if (!seen.has(k.epId)) { seen.add(k.epId); eps.push(k); }
    eps.sort((a, b) => (a.released || '').localeCompare(b.released || ''));
    lsSet('streamlet.qcseen.' + slug, eps.slice(-80));
    return {src:'rc', path:slug, name:name || slug, description:qcMeta1(html, 'og:description'), poster:img, background:img, eps};
  });
}
async function qcRcMeta(slug){
  const info = await qcRcShow(slug);
  const videos = info.eps.map((e, i) => ({id:`qc:rc:${slug}/${e.epId}/${e.slug}`, season:1, episode:i + 1, title:qcTitleCase(e.slug.replace(/-/g, ' ')), overview:'', thumbnail:info.background, released:e.released, runtime:''}));
  return {id:'qc:rc:' + slug, type:'series', name:info.name, poster:info.poster, background:info.background, description:info.description, videos, releaseInfo:''};
}
/* the site's own player offers French captions: they sit in the media description as separate files */
async function qcRcSubs(mid, app){
  try {
    const r = await qcGet(`https://services.radio-canada.ca/media/meta/v1/index.ashx?appCode=${app}&idMedia=${mid}&output=jsonObject`, {Authorization:'Client-Key 773aea60-0e80-41bb-9c7f-e6d7c3ad17fb', 'X-Requested-With':'XMLHttpRequest'});
    const found = [], seen = new Set();
    const walk = (o, key, d) => {
      if (!o || d > 8) return;
      if (typeof o === 'string') { if (/^https?:\/\/\S+\.(vtt|srt|ttml|dfxp|xml)(\?\S*)?$/i.test(o) && !seen.has(o) && (/caption|subtitle|sous|cc|text|vtt|srt|ttml/i.test(key) || /\.(vtt|srt|ttml|dfxp)(\?|$)/i.test(o))) { seen.add(o); found.push({id:'rc' + found.length, url:o.replace(/^http:/, 'https:'), lang:/\ben\b|anglais|english/i.test(key + o) ? 'eng' : 'fra'}); } return; }
      if (typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, k, d + 1);
    };
    walk(JSON.parse(r.body), '', 0);
    return found.slice(0, 4);
  } catch { return []; }
}
/* why a Québec source came up empty, for Settings > About > Diagnostics */
const qcLog = msg => { try { const a = JSON.parse(localStorage.getItem('streamlet.syslog') || '[]'); a.unshift({t:Date.now(), k:'QC', m:String(msg).slice(0, 300)}); localStorage.setItem('streamlet.syslog', JSON.stringify(a.slice(0, 60))); } catch {} };
/* when Radio-Canada's site can't play an episode, the show is still on ICI TOU.TV (login there) */
const qcTouLink = (slug, why) => ({name:'ICI TOU.TV', title:why + '\nOpen it on ICI TOU.TV', externalUrl:'https://ici.tou.tv/' + slug});
async function qcRcStreams(id){
  const [slug, epId, es] = id.replace(/^qc:rc:/, '').split('/');
  if (!nativePlayer() || !nativePlayer().httpGet) { qcLog(`Radio-Canada ${slug}: the website version can't read Radio-Canada's pages (the browser blocks it). Use the Android app`); return [qcTouLink(slug, 'Radio-Canada episodes play in the Android app')]; }
  let html;
  try { html = await qcRcPage(`https://ici.radio-canada.ca/tele/${slug}/site/episodes/${epId}/${es}`); }
  catch (e) { qcLog(`Radio-Canada ${slug} ${es}: episode page didn't load (${e.message})`); return [qcTouLink(slug, "This episode isn't on Radio-Canada's site anymore")]; }
  const cand = new Set();
  for (const re of [/"idMedia"\s*:\s*"?(\d{5,})/g, /idMedia=(\d{5,})/g, /"mediaId"\s*:\s*"?(\d{5,})/gi, /data-media-?id="(\d{5,})"/gi, /media-(\d{5,})/g]) for (const m of html.matchAll(re)) cand.add(m[1]);
  if (!cand.size) { qcLog(`Radio-Canada ${slug} ${es}: no video on the episode page (the page may have changed)`); return [qcTouLink(slug, 'No video on Radio-Canada’s page for this episode')]; }
  const why = [];
  for (const mid of [...cand].slice(0, 5)) for (const app of ['medianet', 'toutv']) {
    try {
      const r = await qcGet(`https://services.radio-canada.ca/media/validation/v2/?appCode=${app}&deviceType=ipad&connectionType=wifi&idMedia=${mid}&output=json`), j = JSON.parse(r.body);
      if (j && j.errorCode !== 0) why.push(`${mid}/${app}: ${j.errorCode} ${String(j.message || '').slice(0, 60)}`);
      else if (j && (j.params || []).some(p => /license|drm/i.test(p.name))) why.push(`${mid}/${app}: protected (DRM)`);
      if (j && j.errorCode === 0 && j.url && !(j.params || []).some(p => /license|drm/i.test(p.name))) {
        const st = {name:'Radio-Canada', title:'HLS · adaptive', url:String(j.url).replace(/^http:/, 'https:')}, subs = await qcRcSubs(mid, app);
        if (subs.length) st.subtitles = subs;
        return [st];
      }
    } catch (e) { why.push(`${mid}/${app}: ${e.message || e}`); }
  }
  qcLog(`Radio-Canada ${slug} ${es}: no playable video (${why.slice(0, 3).join(' · ')})`);
  return [qcTouLink(slug, "Radio-Canada's site won't play this episode here")];
}
/* Shows people find through Cinemeta (IMDb ids) that have no stream source: the Québec addon matches the episode by air date to what Radio-Canada has online */
const QC_IMDB = {tt22037002:{src:'rc', path:'stat'}};
async function qcMappedStreams(tt, season, episode){
  const ent = QC_IMDB[tt]; if (!ent) return [];
  const cm = await qcCached('cinemeta' + tt, 6 * 3600e3, async () => JSON.parse((await qcGet(`https://v3-cinemeta.strem.io/meta/series/${tt}.json`, {Accept:'application/json'})).body));
  const v = ((cm.meta || {}).videos || []).find(x => +x.season === season && +x.episode === episode);
  const when = v && (v.released || v.firstAired) ? new Date(v.released || v.firstAired).getTime() : 0;
  if (!when) { qcLog(`${ent.path} S${season}E${episode}: no air date in the catalog to match with Radio-Canada`); return [qcTouLink(ent.path, 'No air date to find this episode on Radio-Canada')]; }
  if (!nativePlayer() || !nativePlayer().httpGet) return [qcTouLink(ent.path, 'Radio-Canada episodes play in the Android app')];
  let info; try { info = await qcRcShow(ent.path); } catch (e) { qcLog(`${ent.path}: Radio-Canada's episode list didn't load (${e.message})`); return [qcTouLink(ent.path, "Radio-Canada's site didn't answer")]; }
  let best = null, bd = 1.6 * 864e5;
  for (const e of info.eps) { const t = e.released ? new Date(e.released).getTime() : 0; if (t && Math.abs(t - when) < bd) { bd = Math.abs(t - when); best = e; } }
  if (!best) {
    const day = new Date(when).toISOString().slice(0, 10), have = info.eps.slice(-4).map(e => (e.released || '').slice(0, 10)).filter(Boolean).join(', ');
    qcLog(`${ent.path} S${season}E${episode} (aired ${day}) isn't on Radio-Canada's site. It has: ${have || 'nothing'}`);
    return [qcTouLink(ent.path, `Aired ${day}: Radio-Canada's site only keeps the latest episodes`)];
  }
  return qcRcStreams(`qc:rc:${ent.path}/${best.epId}/${best.slug}`);
}
const QC_MANIFEST = {id:'app.streamlet.quebec', version:'1.0.0', name:'Québec', description:'TVA+ and ICI TOU.TV series, read straight from the sites on this device',
  resources:['catalog', {name:'meta', types:['series'], idPrefixes:['qc:']}, {name:'stream', types:['series'], idPrefixes:['qc:', ...Object.keys(QC_IMDB).map(k => k + ':')]}], types:['series'], idPrefixes:['qc:'], catalogs:[{type:'series', id:'qc-shows', name:'Séries québécoises'}, {type:'series', id:'qc-new', name:'Nouveautés québécoises'}, {type:'series', id:'qc-tva', name:'Sur TVA+'}, {type:'series', id:'qc-tou', name:'Sur ICI TOU.TV'}]};
async function qcRoute(url){
  if (!nativePlayer()) throw new Error('Québec only works in the Android apps');
  const path = decodeURIComponent(url.replace(/^qc:\/\/[^/]*\//, '').replace(/\.json(\?.*)?$/, ''));
  if (path === 'manifest') return QC_MANIFEST;
  if (/^catalog\/series\/qc-(new|tva|tou)/.test(path)) {                    // Québec shows found through TMDB that really are on TVA+ or ICI TOU.TV
    const k = path.match(/qc-(new|tva|tou)/)[1], pool = qcDiscoverSoon(), mine = new Set(qcShowList().map(qcShowId));
    let l = pool.filter(x => !mine.has(x.id));
    if (k === 'new') l = l.slice().sort((a, b) => String(b.last || b.first || '').localeCompare(String(a.last || a.first || ''))).slice(0, 20);
    else l = l.filter(x => x.src === k);
    return {metas:l.map(x => ({id:x.id, type:'series', name:x.name, poster:x.poster, background:x.background, description:x.description, releaseInfo:(x.first || '').slice(0, 4), genres:x.genres}))};
  }
  if (path.startsWith('catalog/')) {
    const metas = await Promise.all(qcShowList().map(async e => {
      const id = qcCinemetaId(e), fallback = {id, type:'series', name:qcTitleCase(e.path.split('/').pop().replace(/-/g, ' ')), poster:'', background:'', description:''};
      try {
        if (/^tt\d+$/.test(id)) {                                            // known to Cinemeta: use its name and pictures, the site page is not needed
          const cm = (await qcCached('cinemeta' + id, 6 * 3600e3, async () => JSON.parse((await qcGet(`https://v3-cinemeta.strem.io/meta/series/${id}.json`, {Accept:'application/json'})).body))).meta || {};
          return {id, type:'series', name:cm.name || fallback.name, poster:cm.poster || '', background:cm.background || cm.poster || '', description:cm.description || ''};
        }
        const i = await (e.src === 'tou' ? qcTouShow(e.path) : e.src === 'rc' ? qcRcShow(e.path) : qcShowInfo(e.path));
        return {id, type:'series', name:i.name, poster:i.poster, background:i.background, description:i.description};
      } catch { return fallback; }                                           // never drop a show just because its page did not load
    }));
    return {metas};
  }
  if (path.startsWith('meta/')) { const id = path.split('/').slice(2).join('/'); return {meta:/^qc:rc:/.test(id) ? await qcRcMeta(id.replace(/^qc:rc:/, '')) : /^qc:tou:/.test(id) ? await qcTouMeta(id.replace(/^qc:tou:/, '')) : await qcMeta(id.replace(/^qc:tva:/, ''))}; }
  if (path.startsWith('stream/')) {
    const id = path.split('/').slice(2).join('/');
    const tm = id.match(/^(tt\d+):(\d+):(\d+)$/);
    if (tm) {                                                              // signed in to TOU.TV: try it first, then Radio-Canada's site, then the TOU.TV link
      const ent = QC_IMDB[tm[1]];
      const first = ent ? touApp(ent.path, +tm[2], +tm[3]) : [];        // Stat: the ICI TOU.TV app at that episode
      if (first.length) return {streams:first};                             // ICI TOU.TV shows: Play opens the episode in the app, no source list
      if (ent && await touOn()) { const r = await touStreams(ent.path, +tm[2], +tm[3]); if (r.ok) return {streams:[...first, ...r.streams, ...touWeb(ent.path, +tm[2], +tm[3])]}; }
      const rest = await qcMappedStreams(tm[1], +tm[2], +tm[3]);
      return {streams:ent ? [...first, ...rest.filter(x => x.url), ...touWeb(ent.path, +tm[2], +tm[3]), ...rest.filter(x => !x.url && !x.touApp)] : rest};
    }
    if (/^qc:rc:/.test(id)) return {streams:await qcRcStreams(id)};
    if (/^qc:tou:/.test(id)) {
      const [slug, ep] = id.replace(/^qc:tou:/, '').split('/'), m = String(ep || '').match(/s(\d+)e(\d+)/i), app = {name:'ICI TOU.TV', title:'Open in the ICI TOU.TV app', externalUrl:'toutv://' + id.replace(/^qc:tou:/, '')};
      if (m && touApp(slug, +m[1], +m[2]).length) return {streams:touApp(slug, +m[1], +m[2])};   // straight to the episode in the app
      if (m) { const r = await touStreams(slug, +m[1], +m[2]); return {streams:[...touApp(slug, +m[1], +m[2]), ...(r.ok ? r.streams : []), ...touWeb(slug, +m[1], +m[2]), app]}; }
      return {streams:[app]};
    }
    return {streams:await qcStreams(id)};
  }
  throw new Error('HTTP 404');
}
const qcFillShows = () => { const v = lsGet('streamlet.qcshows', null); $('#qcShows').value = (Array.isArray(v) && v.length ? v : QC_DEFAULT_SHOWS).join('\n'); };   // an empty saved list shows (and uses) the defaults
$('#qcSave').onclick = () => { const urls = $('#qcShows').value.split(/\s+/).filter(Boolean); lsSet('streamlet.qcshows', urls.length ? urls : null); stamp('qcT'); qcMem.clear(); qcFillShows(); toast(urls.length ? 'Saved. Reopen the Québec space to refresh' : 'Back to the default shows'); };

/* ICI TOU.TV sign-in (Android apps): opens the real site in a window, keeps the session on this device */
async function touRefresh(){
  const N = nativePlayer(), el = $('#touState'); if (!el) return;
  if (!N || !N.touStatus) { el.textContent = 'Needs the Android app'; return; }
  try {
    const r = await N.touStatus();
    el.textContent = r.signedIn ? `Signed in${r.ageMin >= 0 ? ' · session seen ' + (r.ageMin < 90 ? r.ageMin + ' min' : Math.round(r.ageMin / 60) + ' h') + ' ago' : ''}${r.sawValidation ? ' · video request seen' : ''}${r.claims ? ' · access token saved' : ''}` : 'Not signed in. Tap Sign in, log in, open an episode and press play, then press Done';
  } catch { el.textContent = 'Could not read the sign-in state'; }
}
$('#touIn').onclick = async () => { const N = nativePlayer(); if (!N || !N.openTouLogin) { toast('Needs the Android app (update it first)'); return; } try { await N.openTouLogin(); } catch { toast('Could not open the sign-in window'); } };
$('#touOut').onclick = async () => { const N = nativePlayer(); try { if (N && N.touForget) await N.touForget(); toast('Signed out of ICI TOU.TV'); } catch {} touRefresh(); };
/* ---- playing ICI TOU.TV with the saved sign-in: find the episode's media number, ask for a link like the site does.
   Only plain or AES-128 HLS can play here; copy-protected (DRM) videos are left to the official app. ---- */
/* TOU.TV's own web player in a full-screen window (Android app): plays whatever their site plays, with your sign-in */
const touWeb = (slug, s, e) => nativePlayer() && nativePlayer().openTouLogin ? [{name:'ICI TOU.TV', title:'Play in TOU.TV’s player (signed in)\nThe remote: OK pause · ◀ ▶ 10 s · ▲ ▼ 1 min · Back closes', touWeb:`https://ici.tou.tv/${slug}/${touEp(s, e).toUpperCase()}`}] : [];
/* the official ICI TOU.TV app at the exact episode (Android app) */
const touApp = (slug, s, e) => nativePlayer() && nativePlayer().openTou ? [{name:'ICI TOU.TV app', title:`Opens S${s}:E${e} in the ICI TOU.TV app`, touApp:`${slug}/${touEp(s, e).toUpperCase()}`}] : [];
const touOn = async () => { const N = nativePlayer(); if (!N || !N.touStatus) return false; try { return !!(await N.touStatus()).signedIn; } catch { return false; } };
const touEp = (s, e) => `s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
async function touMediaId(slug, s, e){
  const N = nativePlayer(), ep = touEp(s, e), ids = [];
  const grab = body => { for (const m of String(body || '').matchAll(/\\?"(?:idMedia|mediaId|formattedIdMedia|playbackId)\\?"\s*:\s*\\?"?(\d{5,})/g)) if (!ids.includes(m[1])) ids.push(m[1]); };
  for (const u of [`show/${slug}/${ep}`, `show/${slug}/${ep.toUpperCase()}`]) {
    try { const r = await N.touGet({url:`https://services.radio-canada.ca/ott/catalog/v2/toutv/${u}?device=web&tier=Member`}); if (r.status === 200) grab(r.body); } catch {}
    if (ids.length) return {id:ids[0], how:'catalog'};
  }
  for (const u of [`https://ici.tou.tv/${slug}/${ep.toUpperCase()}`, `https://ici.tou.tv/${slug}/${ep}`]) {
    try { const r = await qcGet(u, {Accept:'text/html'}); if (r.status === 200) grab(r.body); } catch {}
    if (ids.length) return {id:ids[0], how:'page'};
  }
  return null;
}
async function touHlsClear(url){                                           // false when the playlist is copy-protected (SAMPLE-AES / Widevine / FairPlay)
  try {
    let r = await qcGet(url, {}); let body = String(r.body || '');
    const v = body.split('\n').find(l => l && !l.startsWith('#')); if (v && !/#EXT-X-KEY/.test(body)) { const u2 = new URL(v.trim(), r.url || url).toString(); r = await qcGet(u2, {}); body = String(r.body || ''); }
    return !/#EXT-X-(SESSION-)?KEY:METHOD=SAMPLE-AES|KEYFORMAT="(com\.widevine|com\.apple\.streamingkeydelivery|urn:uuid)/i.test(body);
  } catch { return true; }
}
async function touStreams(slug, s, e){
  const N = nativePlayer(), tag = `TOU.TV ${slug} ${touEp(s, e)}`;
  if (!N || !N.touGet) return {ok:false, why:'needs the Android app'};
  if (!await touOn()) return {ok:false, why:'not signed in (Settings > TMDB & addons > ICI TOU.TV)'};
  const mid = await touMediaId(slug, s, e);
  if (!mid) { qcLog(`${tag}: couldn't find the episode's media number`); return {ok:false, why:"couldn't find this episode on TOU.TV"}; }
  const why = [];
  for (const [dt, tech] of [['androidtv', 'hls'], ['ipad', 'hls'], ['desktop', 'hls'], ['android', 'hls']]) {
    try {
      const r = await N.touGet({url:`https://services.radio-canada.ca/media/validation/v2/?appCode=toutv&connectionType=hd&deviceType=${dt}&idMedia=${mid.id}&multibitrate=true&output=json&tech=${tech}&manifestVersion=2`});
      let j = null; try { j = JSON.parse(r.body); } catch {}
      if (!j) { why.push(`${dt}: HTTP ${r.status}`); continue; }
      if (j.errorCode && j.errorCode !== 0) { why.push(`${dt}: ${j.errorCode} ${String(j.message || '').slice(0, 50)}`); continue; }
      const drm = (j.params || []).some(p => /widevine|playready|fairplay|license|drm|protection/i.test(p.name)) || /widevine|playready|fairplay/i.test(j.protectionType || '');
      if (!j.url) { why.push(`${dt}: no link`); continue; }
      if (drm) { why.push(`${dt}: copy-protected (DRM)`); continue; }
      if (!await touHlsClear(j.url)) { why.push(`${dt}: copy-protected playlist`); continue; }
      qcLog(`${tag}: playable (${dt}, media ${mid.id} via ${mid.how})`);
      return {ok:true, streams:[{name:'ICI TOU.TV', title:'Signed in · HLS', url:String(j.url).replace(/^http:/, 'https:')}]};
    } catch (err) { why.push(`${dt}: ${err.message || err}`); }
  }
  qcLog(`${tag}: media ${mid.id} not playable here (${why.slice(0, 4).join(' · ')})`);
  return {ok:false, why:why.some(w => /DRM|protected/.test(w)) ? 'TOU.TV copy-protects this video' : 'TOU.TV refused: ' + (why[0] || '?')};
}
$('#touChk').onclick = async () => {
  const out = $('#touRes'); out.hidden = false; out.textContent = 'Checking the latest Stat episode…';
  try {
    const info = await qcTouShow('stat'), season = info.seasons.length ? Math.max(...info.seasons) : 1, eps = await qcTouEpisodes('stat', season);
    const now = Date.now(), last = eps.filter(v => !v.released || new Date(v.released).getTime() <= now).pop();
    if (!last) { out.textContent = "Couldn't read Stat's episode list on TOU.TV."; return; }
    const r = await touStreams('stat', last.season, last.episode);
    out.textContent = r.ok ? `Stat S${last.season}E${last.episode}: plays in Streamlet. Episodes will use your TOU.TV sign-in.` : `Stat S${last.season}E${last.episode}: can't play here: ${r.why}. Details in Diagnostics (QC lines).`;
  } catch (e) { out.textContent = 'Check failed: ' + (e.message || e); }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) touRefresh(); });
setTimeout(touRefresh, 1200);
for (const a of addons) if (a.url && a.url.startsWith('qc://')) a.manifest = QC_MANIFEST;          // built-in: always use the current manifest, no reinstall needed

/* ---------- more Québec shows: TMDB finds the series from TVA and ICI Radio-Canada / ICI TOU.TV; each is kept only if its page is really
   there (tvaplus.ca/tva/<name> or ici.tou.tv/<name>), so everything listed can play. Checked once a week, kept on this device ---------- */
const qcSlug = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' et ').replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
async function qcNetworks(key){
  const have = lsGet('streamlet.qcnet', null); if (have && Date.now() - have.t < 30 * 864e5 && (have.tva.length || have.tou.length)) return have;
  const out = {tva:new Set(), tou:new Set()};
  const nets = async q => { try { const f = await tmdbGet(`/search/tv?query=${encodeURIComponent(q)}`, key), x = (f.results || []).find(r => (r.origin_country || []).includes('CA')) || (f.results || [])[0]; if (!x) return; const d = await tmdbGet(`/tv/${x.id}`, key);
    for (const n of d.networks || []) { if (/\bTVA\b/i.test(n.name)) out.tva.add(n.id); else if (/radio-canada|\bICI\b|tou\.?tv/i.test(n.name)) out.tou.add(n.id); } } catch {} };
  await Promise.all(['Indéfendable', 'Les Armes', 'District 31', 'STAT', 'Les Pays d\'en haut', 'Fugueuse'].map(nets));
  const v = {t:Date.now(), tva:[...out.tva], tou:[...out.tou]}; lsSet('streamlet.qcnet', v); qcLog(`networks: TVA ${v.tva.join(',') || 'none'} · Radio-Canada/TOU.TV ${v.tou.join(',') || 'none'}`);
  return v;
}
let qcDiscBusy = null;
/* what's known now (even if a week old), without waiting: the first check takes a minute or two, the rows fill in when it's done */
function qcDiscoverSoon(){
  const have = lsGet('streamlet.qcdisc', null), fresh = have && Date.now() - have.t < 7 * 864e5;
  if (!fresh && !qcDiscBusy) qcDiscover().then(l => { if (l.length) { try { homeDirty(); } catch {} } }).catch(() => {});
  return have && Array.isArray(have.l) ? have.l : [];
}
function qcDiscover(){
  const key = (typeof tmKey === 'function' && tmKey()) || ''; if (!key) return Promise.resolve([]);
  const have = lsGet('streamlet.qcdisc', null); if (have && Date.now() - have.t < 7 * 864e5 && Array.isArray(have.l)) return Promise.resolve(have.l);
  if (qcDiscBusy) return qcDiscBusy;
  return qcDiscBusy = (async () => {
    try {
      const net = await qcNetworks(key), cands = [];
      for (const [src, ids] of [['tva', net.tva], ['tou', net.tou]]) {
        if (!ids.length) continue;
        for (const page of [1, 2, 3]) {
          try { const r = await tmdbGet(`/discover/tv?with_networks=${ids.join('|')}&sort_by=popularity.desc&page=${page}`, key);
            for (const x of r.results || []) cands.push({src, x}); } catch {}
        }
      }
      const checked = lsGet('streamlet.qcver', {}), out = [], seen = new Set();
      const one = async ({src, x}) => {
        const slug = qcSlug(x.name), path = src === 'tva' ? '/tva/' + slug : slug, key2 = src + ':' + path;
        if (!slug || seen.has(key2)) return; seen.add(key2);
        let ok = checked[key2] && Date.now() - checked[key2].t < 30 * 864e5 ? checked[key2].ok : null;
        if (ok === null) { try { const i = await (src === 'tva' ? qcShowInfo(path) : qcTouShow(slug)); ok = !!(i && i.name); } catch { ok = false; } checked[key2] = {ok, t:Date.now()}; }
        if (!ok) return;
        const img = p => p ? 'https://image.tmdb.org/t/p/w500' + p : '';
        out.push({id:`qc:${src}:${path}`, src, name:x.name, poster:img(x.poster_path), background:x.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + x.backdrop_path : img(x.poster_path),
          description:x.overview || '', first:x.first_air_date || '', pop:x.popularity || 0, gids:x.genre_ids || [], genres:tmGenreNames(x.genre_ids, 'tv')});
      };
      for (let i = 0; i < cands.length; i += 4) await Promise.all(cands.slice(i, i + 4).map(one));
      lsSet('streamlet.qcver', checked);
      out.sort((a, b) => b.pop - a.pop);
      qcLog(`more shows: ${out.length} of ${cands.length} found on TVA+ or ICI TOU.TV`);
      if (out.length) lsSet('streamlet.qcdisc', {t:Date.now(), l:out});
      return out;
    } finally { qcDiscBusy = null; }
  })();
}
/* the Québec space's own "Your next watch / Because you watched": other Québec shows, closest genres first */
const qcOnlySpace = () => { try { const l = spaceAddons(); return l.length > 0 && l.every(a => /^qc:\/\//.test(a.url || '')); } catch { return false; } };
async function qcSimilar(seed){
  const pool = qcDiscoverSoon(); if (!pool.length) return [];
  const a = addons.find(x => /^qc:\/\//.test(x.url || '')); if (!a) return [];
  let gs = []; const me = pool.find(x => x.id === seed.id);
  if (me) gs = me.gids; else { try { const f = await tmdbGet(`/search/tv?query=${encodeURIComponent(seed.name || '')}`, tmKey()), x = (f.results || []).find(r => (r.origin_country || []).includes('CA')); if (x) gs = x.genre_ids || []; } catch {} }
  const score = x => x.gids.filter(g => gs.includes(g)).length * 100 + x.pop;
  return pool.filter(x => x.id !== seed.id).sort((p, q) => score(q) - score(p)).slice(0, 14)
    .map(x => ({a, type:'series', m:{id:x.id, type:'series', name:x.name, poster:x.poster, background:x.background, description:x.description, releaseInfo:(x.first || '').slice(0, 4)}}));
}
