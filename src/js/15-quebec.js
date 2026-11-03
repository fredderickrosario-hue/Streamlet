/* ---------- Québec: a built-in addon (qc://tva) that reads TVA+ pages directly from this device ----------
   No server and no login: the phone / TV asks tvaplus.ca for the show, its seasons and episodes, then asks the video service
   for the episode's stream when you press Play. It only works inside the Android apps (the browser blocks these requests).
   Add it like any addon: Addons -> type "quebec". */
const QC_ACCOUNTS = ['5481942443001', '5813221784001'];
const QC_DEFAULT_SHOWS = ['https://www.tvaplus.ca/tva/les-armes', 'https://www.tvaplus.ca/tva/indefendable'];
const qcMem = new Map();                                                  // url -> {t, v}: short in-memory cache
async function qcCached(key, ttl, fn){
  const hit = qcMem.get(key); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn(); qcMem.set(key, {t:Date.now(), v}); return v;
}
const qcShowList = () => {
  const raw = lsGet('streamlet.qcshows', null), urls = Array.isArray(raw) && raw.length ? raw : QC_DEFAULT_SHOWS;
  return urls.map(u => { const m = String(u).match(/tvaplus\.ca(\/[a-z0-9-]+\/[a-z0-9-]+)(?:[\/?#]|$)/i); return m ? m[1].toLowerCase() : null; }).filter(Boolean);
};
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
const QC_MANIFEST = {id:'app.streamlet.quebec', version:'1.0.0', name:'Québec', description:'TVA+ series, read straight from the site on this device',
  resources:['catalog', 'meta', 'stream'], types:['series'], idPrefixes:['qc:'], catalogs:[{type:'series', id:'qc-shows', name:'Séries québécoises'}]};
async function qcRoute(url){
  if (!nativePlayer()) throw new Error('Québec only works in the Android apps');
  const path = decodeURIComponent(url.replace(/^qc:\/\/[^/]*\//, '').replace(/\.json(\?.*)?$/, ''));
  if (path === 'manifest') return QC_MANIFEST;
  if (path.startsWith('catalog/')) {
    const metas = (await Promise.all(qcShowList().map(p => qcShowInfo(p).then(i => ({id:'qc:tva:' + p, type:'series', name:i.name, poster:i.poster, background:i.background, description:i.description})).catch(() => null)))).filter(Boolean);
    return {metas};
  }
  if (path.startsWith('meta/')) { const id = path.split('/').slice(2).join('/'); return {meta:await qcMeta(id.replace(/^qc:tva:/, ''))}; }
  if (path.startsWith('stream/')) { const id = path.split('/').slice(2).join('/'); return {streams:await qcStreams(id)}; }
  throw new Error('HTTP 404');
}
const qcFillShows = () => { $('#qcShows').value = (lsGet('streamlet.qcshows', null) || QC_DEFAULT_SHOWS).join('\n'); };
$('#qcSave').onclick = () => { const urls = $('#qcShows').value.split(/\s+/).filter(Boolean); lsSet('streamlet.qcshows', urls); qcMem.clear(); toast('Saved. Reopen the Québec space to refresh'); };
