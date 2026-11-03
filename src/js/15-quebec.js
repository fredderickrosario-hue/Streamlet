/* ---------- Québec: a built-in addon (qc://tva) that reads TVA+ pages directly from this device ----------
   No server and no login: the phone / TV asks tvaplus.ca for the show, its seasons and episodes, then asks the video service
   for the episode's stream when you press Play. It only works inside the Android apps (the browser blocks these requests).
   Add it like any addon: Addons -> type "quebec". */
const QC_ACCOUNTS = ['5481942443001', '5813221784001'];
const QC_DEFAULT_SHOWS = ['https://www.tvaplus.ca/tva/les-armes', 'https://www.tvaplus.ca/tva/indefendable', 'https://ici.radio-canada.ca/tele/stat/site/episodes'];
const qcMem = new Map();                                                  // url -> {t, v}: short in-memory cache
async function qcCached(key, ttl, fn){
  const hit = qcMem.get(key); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn(); qcMem.set(key, {t:Date.now(), v}); return v;
}
const qcShowList = () => {                                              // [{src:'tva'|'tou', path}]
  const raw = lsGet('streamlet.qcshows', null), urls = Array.isArray(raw) && raw.length ? raw : QC_DEFAULT_SHOWS, out = [];
  for (const u of urls) {
    let m = String(u).match(/tvaplus\.ca(\/[a-z0-9-]+\/[a-z0-9-]+)(?:[\/?#]|$)/i); if (m) { out.push({src:'tva', path:m[1].toLowerCase()}); continue; }
    m = String(u).match(/ici\.radio-canada\.ca\/tele\/([a-z0-9-]+)/i); if (m) { out.push({src:'rc', path:m[1].toLowerCase()}); continue; }
    m = String(u).match(/tou\.tv\/([a-z0-9-]+)(?:[\/?#]|$)/i); if (m) out.push({src:'tou', path:m[1].toLowerCase()});
  }
  return out;
};
const qcShowId = e => `qc:${e.src}:${e.path}`;
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
      const subs = (j.text_tracks || []).filter(t => t.src && /vtt/i.test(t.src + (t.mime_type || ''))).map((t, i) => ({id:'qc' + i, url:https(t.src), lang:t.srclang || 'fr'}));
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
async function qcRcStreams(id){
  const [slug, epId, es] = id.replace(/^qc:rc:/, '').split('/');
  const html = await qcRcPage(`https://ici.radio-canada.ca/tele/${slug}/site/episodes/${epId}/${es}`), cand = new Set();
  for (const re of [/"idMedia"\s*:\s*"?(\d{5,})/g, /idMedia=(\d{5,})/g, /"mediaId"\s*:\s*"?(\d{5,})/gi, /data-media-?id="(\d{5,})"/gi, /media-(\d{5,})/g]) for (const m of html.matchAll(re)) cand.add(m[1]);
  for (const mid of [...cand].slice(0, 5)) for (const app of ['medianet', 'toutv']) {
    try {
      const r = await qcGet(`https://services.radio-canada.ca/media/validation/v2/?appCode=${app}&deviceType=ipad&connectionType=wifi&idMedia=${mid}&output=json`), j = JSON.parse(r.body);
      if (j && j.errorCode === 0 && j.url && !(j.params || []).some(p => /license|drm/i.test(p.name))) {
        const st = {name:'Radio-Canada', title:'HLS · adaptive', url:String(j.url).replace(/^http:/, 'https:')}, subs = await qcRcSubs(mid, app);
        if (subs.length) st.subtitles = subs;
        return [st];
      }
    } catch {}
  }
  return [];
}
/* Shows people find through Cinemeta (IMDb ids) that have no stream source: the Québec addon matches the episode by air date to what Radio-Canada has online */
const QC_IMDB = {tt22037002:{src:'rc', path:'stat'}};
async function qcMappedStreams(tt, season, episode){
  const ent = QC_IMDB[tt]; if (!ent) return [];
  const cm = await qcCached('cinemeta' + tt, 6 * 3600e3, async () => JSON.parse((await qcGet(`https://v3-cinemeta.strem.io/meta/series/${tt}.json`, {Accept:'application/json'})).body));
  const v = ((cm.meta || {}).videos || []).find(x => +x.season === season && +x.episode === episode);
  const when = v && (v.released || v.firstAired) ? new Date(v.released || v.firstAired).getTime() : 0;
  if (!when) return [];
  const info = await qcRcShow(ent.path);
  let best = null, bd = 1.6 * 864e5;
  for (const e of info.eps) { const t = e.released ? new Date(e.released).getTime() : 0; if (t && Math.abs(t - when) < bd) { bd = Math.abs(t - when); best = e; } }
  return best ? qcRcStreams(`qc:rc:${ent.path}/${best.epId}/${best.slug}`) : [];
}
const QC_MANIFEST = {id:'app.streamlet.quebec', version:'1.0.0', name:'Québec', description:'TVA+ and ICI TOU.TV series, read straight from the sites on this device',
  resources:['catalog', {name:'meta', types:['series'], idPrefixes:['qc:']}, {name:'stream', types:['series'], idPrefixes:['qc:', ...Object.keys(QC_IMDB).map(k => k + ':')]}], types:['series'], idPrefixes:['qc:'], catalogs:[{type:'series', id:'qc-shows', name:'Séries québécoises'}]};
async function qcRoute(url){
  if (!nativePlayer()) throw new Error('Québec only works in the Android apps');
  const path = decodeURIComponent(url.replace(/^qc:\/\/[^/]*\//, '').replace(/\.json(\?.*)?$/, ''));
  if (path === 'manifest') return QC_MANIFEST;
  if (path.startsWith('catalog/')) {
    const metas = (await Promise.all(qcShowList().map(e => (e.src === 'tou' ? qcTouShow(e.path) : e.src === 'rc' ? qcRcShow(e.path) : qcShowInfo(e.path)).then(i => ({id:qcShowId(e), type:'series', name:i.name, poster:i.poster, background:i.background, description:i.description})).catch(() => null)))).filter(Boolean);
    return {metas};
  }
  if (path.startsWith('meta/')) { const id = path.split('/').slice(2).join('/'); return {meta:/^qc:rc:/.test(id) ? await qcRcMeta(id.replace(/^qc:rc:/, '')) : /^qc:tou:/.test(id) ? await qcTouMeta(id.replace(/^qc:tou:/, '')) : await qcMeta(id.replace(/^qc:tva:/, ''))}; }
  if (path.startsWith('stream/')) {
    const id = path.split('/').slice(2).join('/');
    const tm = id.match(/^(tt\d+):(\d+):(\d+)$/); if (tm) return {streams:await qcMappedStreams(tm[1], +tm[2], +tm[3])};
    if (/^qc:rc:/.test(id)) return {streams:await qcRcStreams(id)};
    if (/^qc:tou:/.test(id)) return {streams:[{name:'ICI TOU.TV', title:'Open in the ICI TOU.TV app', externalUrl:'toutv://' + id.replace(/^qc:tou:/, '')}]};
    return {streams:await qcStreams(id)};
  }
  throw new Error('HTTP 404');
}
const qcFillShows = () => { $('#qcShows').value = (lsGet('streamlet.qcshows', null) || QC_DEFAULT_SHOWS).join('\n'); };
$('#qcSave').onclick = () => { const urls = $('#qcShows').value.split(/\s+/).filter(Boolean); lsSet('streamlet.qcshows', urls); qcMem.clear(); toast('Saved. Reopen the Québec space to refresh'); };
