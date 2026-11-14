/* ---------- Torrentio, built in: installed for everyone, set up from Settings > TMDB & addons (no more pasting its long link).
   The installed Torrentio link is the record of its settings (it syncs with the addons); the Real-Debrid token is also kept on its own
   (streamlet.rd, synced like the TMDB key) so "Use Real-Debrid" can be turned off and back on without pasting it again.
   Option keys are Torrentio's own (torrentio-scraper: lib/filter.js, lib/sort.js, lib/languages.js, moch/options.js). ---------- */
const TIO = 'https://torrentio.strem.fun';
const isTio = u => /^https?:\/\/torrentio\.strem\.fun\//i.test(String(u || ''));
const TIO_PROV = [
  ['yts', 'YTS'], ['eztv', 'EZTV'], ['rarbg', 'RARBG'], ['1337x', '1337x'], ['ext', 'EXT'], ['thepiratebay', 'The Pirate Bay'], ['kickasstorrents', 'KickassTorrents'],
  ['torrentgalaxy', 'TorrentGalaxy'], ['magnetdl', 'MagnetDL'],
  ['horriblesubs', 'HorribleSubs', 'anime'], ['nyaasi', 'Nyaa', 'anime'], ['tokyotosho', 'TokyoTosho', 'anime'], ['anidex', 'AniDex', 'anime'], ['nekobt', 'nekoBT', 'anime'],
  ['rutor', '🇷🇺 Rutor', 'f'], ['rutracker', '🇷🇺 Rutracker', 'f'], ['comando', '🇵🇹 Comando', 'f'], ['bludv', '🇵🇹 BluDV', 'f'], ['micoleaodublado', '🇵🇹 MicoLeaoDublado', 'f'],
  ['torrent9', '🇫🇷 Torrent9', 'f'], ['ilcorsaronero', '🇮🇹 ilCorSaRoNeRo', 'f'], ['mejortorrent', '🇪🇸 MejorTorrent', 'f'], ['wolfmax4k', '🇪🇸 Wolfmax4k', 'f'],
  ['cinecalidad', '🇲🇽 Cinecalidad', 'f'], ['besttorrents', '🇵🇱 BestTorrents', 'f']];
const TIO_QF = [['4k', '4K'], ['1080p', '1080p'], ['720p', '720p'], ['480p', '480p'], ['brremux', 'BluRay REMUX'], ['hdrall', 'HDR / Dolby Vision'], ['dolbyvision', 'Dolby Vision'],
  ['threed', '3D'], ['other', 'Other rips'], ['scr', 'Screener'], ['cam', 'Cam'], ['unknown', 'Unknown']];
const TIO_LANGS = ['english', 'french', 'spanish', 'latino', 'portuguese', 'italian', 'german', 'dutch', 'russian', 'japanese', 'korean', 'chinese', 'taiwanese', 'hindi', 'telugu', 'tamil',
  'polish', 'czech', 'hungarian', 'romanian', 'greek', 'turkish', 'arabic', 'hebrew', 'ukrainian', 'swedish', 'danish', 'norwegian', 'finnish', 'vietnamese', 'thai', 'indonesian'];
const TIO_MANIFEST = {id:'com.stremio.torrentio.addon', name:'Torrentio', version:'0.0.0', description:'Built in. Streams from torrent sites, played through Real-Debrid. Set it up in Settings > TMDB & addons.',
  resources:[{name:'stream', types:['movie', 'series', 'anime'], idPrefixes:['tt', 'kitsu']}], types:['movie', 'series', 'anime', 'other'], catalogs:[], behaviorHints:{configurable:true}};

const rdKey = () => String(lsGet('streamlet.rd', '') || '');
const rdKeySet = k => { lsSet('streamlet.rd', k); stamp('rdT'); };
const tioAddon = () => addons.find(a => isTio(a.url));
function tioParse(url){                                                   // 'https://torrentio.strem.fun/a=b|c=d,e/manifest.json' → {a:'b', c:['d','e']}
  const seg = String(url || '').replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/?manifest\.json.*$/, '');
  const o = {}; let s = seg; try { s = decodeURIComponent(seg); } catch {}
  for (const part of s.split('|')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).toLowerCase()] = part.slice(i + 1); }
  for (const k of ['providers', 'qualityfilter', 'language', 'debridoptions']) o[k] = o[k] ? o[k].split(',').filter(Boolean) : [];
  return o;
}
function tioUrl(c){                                                       // the reverse, in Torrentio's own order; Torrentio's defaults are left out
  const parts = [], all = TIO_PROV.map(p => p[0]);
  const prov = (c.providers || []).filter(p => all.includes(p));
  if (prov.length && prov.length < all.length) parts.push('providers=' + all.filter(p => prov.includes(p)).join(','));
  if (c.sort && c.sort !== 'quality') parts.push('sort=' + c.sort);
  if ((c.language || []).length) parts.push('language=' + c.language.join(','));
  if ((c.qualityfilter || []).length) parts.push('qualityfilter=' + c.qualityfilter.join(','));
  if (c.limit) parts.push('limit=' + c.limit);
  if (c.sizefilter) parts.push('sizefilter=' + c.sizefilter);
  const rd = c.realdebrid;
  if (rd) { if ((c.debridoptions || []).length) parts.push('debridoptions=' + c.debridoptions.join(',')); parts.push('realdebrid=' + rd); }
  return TIO + '/' + (parts.length ? parts.join('|') + '/' : '') + 'manifest.json';
}
const TIO_DEF = () => ({providers:[], qualityfilter:[], language:[], debridoptions:['nodownloadlinks', 'nocatalog']});
let tioPend = null;                                                        // a change waiting to be applied: the next change builds on it
function tioCfg(){
  if (tioPend) return {...tioPend};
  const a = tioAddon(), saved = lsGet('streamlet.tioCfg', null) || TIO_DEF();
  if (!a) return {...TIO_DEF(), ...saved, realdebrid:undefined};
  const c = tioParse(a.url);
  if (!c.realdebrid) c.debridoptions = saved.debridoptions || TIO_DEF().debridoptions;   // Real-Debrid off: its options are kept for when it's back on
  return c;
}

/* put the new link in place of the old one (same spot, same uid); the manifest is fetched again in the background */
let tioT = 0;
function tioApply(c, now){
  clearTimeout(tioT); tioPend = c;
  const run = async () => {
    tioPend = null;
    const url = tioUrl(c), a = tioAddon(); lsSet('streamlet.tioCfg', {...c, realdebrid:undefined});
    if (!a || a.url === url) { tioFill(); return; }
    a.url = url; a.base = baseOf(url); save(); tioFill(); try { homeDirty(); } catch {}
    try { const {manifest} = await fetchManifest(url); const b = tioAddon(); if (b && b.url === url) { b.manifest = manifest; save(); } } catch {}
  };
  if (now) run(); else tioT = setTimeout(run, 500);
}
const tioPatch = patch => { tioApply({...tioCfg(), ...patch}); try { tioFill(); } catch {} };

/* installed once for everyone. On a new device it waits for the account's addons: Torrentio is only added locally (no sync stamp),
   so the account's own list still wins the first sync and keeps its Torrentio and its settings */
function tioBoot(){
  const a = tioAddon(); if (a && !rdKey()) { const k = tioParse(a.url).realdebrid; if (k) lsSet('streamlet.rd', k); }   // the token already in your Torrentio link
  if (lsGet('streamlet.tioInit', 0)) return;
  lsSet('streamlet.tioInit', 1);
  if (a) return;
  const c = tioCfg(); if (rdKey()) c.realdebrid = rdKey();
  const url = tioUrl(c);
  addons.push({url, base:baseOf(url), manifest:{...TIO_MANIFEST}, uid:nextUid(TIO_MANIFEST.id)});
  if (metaGet().addonsT) save(); else { try { localStorage.setItem('streamlet.addons', JSON.stringify(addons)); } catch {} }
  fetchManifest(url).then(({manifest}) => { const b = tioAddon(); if (b && b.url === url) { b.manifest = manifest; try { localStorage.setItem('streamlet.addons', JSON.stringify(addons)); } catch {} } }).catch(() => {});
}
try { tioBoot(); } catch {}

function tioChips(sel, items, have, onTap){
  const box = $(sel), fi = [...box.children].indexOf(document.activeElement);    // keep the remote's focus on the same chip
  box.replaceChildren(...items.map(([v, n]) => {
    const on = have.has(v), b = h('button', {class:'chip' + (on ? ' on' : ''), type:'button', 'aria-pressed':on ? 'true' : 'false'}, n);
    b.onclick = () => onTap(v);
    return b;
  }));
  if (fi >= 0 && box.children[fi]) box.children[fi].focus({preventScroll:true});
}
function tioFill(){
  if (!$('#tioGrp')) return;
  const a = tioAddon(), c = tioCfg(), key = rdKey(), rdOn = !!c.realdebrid, all = TIO_PROV.map(p => p[0]);
  const prov = new Set(c.providers.length ? c.providers : all);
  $('#rowTioIns').hidden = !!a;
  $('#tioRd').checked = rdOn; $('#tioKey').value = key;
  $('#rowTioDl').hidden = $('#rowTioCat').hidden = !rdOn;
  $('#tioNoDl').checked = c.debridoptions.includes('nodownloadlinks');
  $('#tioCat').checked = !c.debridoptions.includes('nocatalog');
  tioChips('#tioProv', TIO_PROV, prov, v => {
    const s = new Set(prov); if (s.has(v)) { if (s.size === 1) { toast('Keep at least one source'); return; } s.delete(v); } else s.add(v);
    tioPatch({providers:all.filter(p => s.has(p))});
  });
  $('#tioProvSum').textContent = prov.size === all.length ? 'All ' + all.length + ' sites Torrentio searches' : `${prov.size} of ${all.length} sites`;
  tioChips('#tioQf', TIO_QF, new Set(c.qualityfilter), v => { const s = new Set(c.qualityfilter); s.has(v) ? s.delete(v) : s.add(v); tioPatch({qualityfilter:TIO_QF.map(q => q[0]).filter(q => s.has(q))}); });
  $('#tioSort').value = c.sort || 'quality'; $('#tioLimit').value = c.limit || ''; $('#tioSize').value = c.sizefilter || '';
  if (c.sizefilter && $('#tioSize').value !== c.sizefilter) $('#tioSize').append(h('option', {value:c.sizefilter, selected:true}, c.sizefilter));   // a custom size from an older link
  const lg = $('#tioLang');
  if (lg.options.length < 2) lg.replaceChildren(h('option', {value:''}, 'No preference'), ...TIO_LANGS.map(l => h('option', {value:l}, l[0].toUpperCase() + l.slice(1))));
  lg.value = c.language[0] || '';
  $('#tioState').textContent = !a ? 'Torrentio is not installed.' : rdOn ? 'Torrentio plays through Real-Debrid.'
    : 'Without Real-Debrid, Torrentio lists torrents that Streamlet can\'t play. Turn on Real-Debrid to play them.';
}
function tioWire(){
  if (!$('#tioGrp') || $('#tioGrp')._w) return; $('#tioGrp')._w = 1;
  $('#tioRd').onchange = e => {
    const k = $('#tioKey').value.trim() || rdKey();
    if (e.target.checked && !k) { e.target.checked = false; toast('Paste your Real-Debrid token first'); $('#tioKey').focus(); return; }
    tioApply({...tioCfg(), realdebrid:e.target.checked ? k : undefined}, true);
  };
  $('#tioKey').onchange = e => {
    const k = e.target.value.trim(); rdKeySet(k);
    const c = tioCfg();
    if (k && (c.realdebrid || !rdKeyWas)) tioApply({...c, realdebrid:k}, true);          // a new token goes straight into Torrentio
    else if (!k) tioApply({...c, realdebrid:undefined}, true);
    rdKeyWas = k; toast(k ? 'Real-Debrid token saved' : 'Real-Debrid token removed');
  };
  $('#tioChk').onclick = async () => {
    const k = $('#tioKey').value.trim(); if (!k) { toast('Paste your Real-Debrid token first'); return; }
    const b = $('#tioChk'); b.disabled = true;
    try {
      const r = await fetch('https://api.real-debrid.com/rest/1.0/user', {headers:{Authorization:'Bearer ' + k}});
      if (r.status === 401 || r.status === 403) toast('Real-Debrid rejected that token');
      else if (!r.ok) toast('Real-Debrid answered ' + r.status);
      else { const u = await r.json(); const days = u.expiration ? Math.ceil((new Date(u.expiration) - Date.now()) / 864e5) : 0;
        toast(u.type === 'premium' ? `Works: ${u.username}, premium for ${days} more day${days === 1 ? '' : 's'}` : `Works: ${u.username}, but the account isn't premium`); }
    } catch { toast("Couldn't reach Real-Debrid"); }
    b.disabled = false;
  };
  const dopt = () => [!$('#tioNoDl').checked ? '' : 'nodownloadlinks', $('#tioCat').checked ? '' : 'nocatalog'].filter(Boolean);
  $('#tioNoDl').onchange = $('#tioCat').onchange = () => tioPatch({debridoptions:dopt()});
  $('#tioAll').onclick = () => tioPatch({providers:[]});
  $('#tioNoForeign').onclick = () => tioPatch({providers:TIO_PROV.filter(p => p[2] !== 'f').map(p => p[0])});
  $('#tioSort').onchange = e => tioPatch({sort:e.target.value});
  $('#tioLimit').onchange = e => tioPatch({limit:e.target.value});
  $('#tioSize').onchange = e => tioPatch({sizefilter:e.target.value});
  $('#tioLang').onchange = e => tioPatch({language:e.target.value ? [e.target.value] : []});
  $('#tioReset').onclick = () => { const c = tioCfg(); tioApply({providers:[], qualityfilter:[], language:[], debridoptions:['nodownloadlinks', 'nocatalog'], realdebrid:c.realdebrid}, true); toast('Torrentio is back to its defaults'); };
  $('#tioIns').onclick = () => {
    const c = {...tioCfg()}; if (rdKey()) c.realdebrid = rdKey();
    const url = tioUrl(c); addons.push({url, base:baseOf(url), manifest:{...TIO_MANIFEST}, uid:nextUid(TIO_MANIFEST.id)}); save(); tioFill(); toast('Torrentio installed');
    fetchManifest(url).then(({manifest}) => { const b = tioAddon(); if (b && b.url === url) { b.manifest = manifest; save(); } }).catch(() => {});
  };
}
let rdKeyWas = rdKey();
