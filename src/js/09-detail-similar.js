/* ---------- detail + streams ---------- */
function openResume(e){
  const a = addons.find(x => x.uid === e.addonId || x.manifest.id === e.addonId) || spaceAddons()[0] || addons[0];
  if (!a) return;
  openDetail(a, e.itemType, {id:e.itemId, type:e.itemType, name:e.name, poster:e.poster, background:e.background}, {resume:e});
}
const IC = {
  back:'<path d="M15 5l-7 7 7 7"/>',
  share:'<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1"/>',
  clap:'<rect x="3.5" y="9.5" width="17" height="10.5" rx="1.6"/><path d="M3.5 9.5l1.6-4.4 14.6 3-.5 1.4M8.4 6.1l1.6 3.4M13.6 7.2l1.6 3.4"/>',
  mark:'<path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/>',
  seen:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.5"/>'
};
function iconBtn(path, label, onclick, cls = ''){
  const b = h('button', {class:'ibtn ' + cls, type:'button', 'aria-label':label, title:label, onclick});
  b.innerHTML = `<svg viewBox="0 0 24 24">${path}</svg>`;
  return b;
}
const fmtDate = d => { try { return new Date(d).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}); } catch { return ''; } };
function heroBlock(meta, bg){
  const hero = h('div', {class:'dhero'}, h('div', {class:'dgrad'}));
  const u = bg || meta.background || meta.poster;
  if (u) hero.style.backgroundImage = `url("${String(u).replace(/"/g, '%22')}")`;
  if (meta.logo) hero.append(h('img', {class:'dlogo', src:meta.logo, alt:meta.name || '', onerror:e => e.target.replaceWith(h('h1', {class:'dtitle'}, meta.name))}));
  else hero.append(h('h1', {class:'dtitle'}, meta.name));
  return hero;
}
/* landscape/TV entry page: title block, info panel and action pills (the phone layout hides these) */
function titleBlock(meta){
  return h('div', {class:'dbt'}, meta.logo
    ? h('img', {class:'dbt-logo', src:meta.logo, alt:meta.name || '', onerror:e => e.target.replaceWith(h('h1', {class:'dbt-title'}, meta.name))})
    : h('h1', {class:'dbt-title'}, meta.name));
}
function infoPanel(meta, genres){
  const rows = [['Genres', genres], ['Director', listOf(meta, 'director', 'director')], ['Stars', listOf(meta, 'cast', 'cast').slice(0, 5)]].filter(r => r[1].length);
  if (!rows.length) return null;
  return h('div', {class:'dinfo'}, rows.map(([k, v]) => h('div', {class:'di'}, h('span', {class:'dil'}, k), h('span', null, v.join(', ')))));
}
function mirrorBtn(src, path, label){
  if (!src) return null;
  const b = iconBtn(path, label, null, src.classList.contains('fill') ? 'fill' : '');
  const sync = () => { b.classList.toggle('on', src.classList.contains('on')); b.title = src.title || label; };
  b.onclick = () => { src.click(); sync(); };
  sync(); return b;
}
function metaRow(parts, rating, right){
  const row = h('div', {class:'dmeta'});
  parts.filter(Boolean).forEach((t, i) => { if (i) row.append(h('span', {class:'dot'}, '·')); row.append(h('span', null, t)); });
  if (rating) row.append(h('span', {class:'imdb'}, 'IMDb'), h('span', null, String(rating)));
  row.append(h('span', {class:'sp'}), ...(right || []).filter(Boolean));
  return row;
}
const listOf = (meta, key, cat) => {
  const v = meta[key]; if (Array.isArray(v) && v.length) return v;
  if (typeof v === 'string' && v) return v.split(/\s*,\s*/);
  return (meta.links || []).filter(l => (l.category || '').toLowerCase() === cat).map(l => l.name);
};
function chipsSection(title, names){
  if (!names.length) return null;
  return h('div', {class:'dsec'}, h('h4', null, title), h('div', {class:'cchips'}, names.map(n => h('button', {class:'pillx', type:'button', onclick:() => searchFor(n)}, n))));
}
function toggleIcons(addon, type, meta){
  if (!profile) return {wl:null, seen:null};
  const e = entryOf(addon, type, meta);
  const wl = iconBtn(IC.mark, 'Watchlist', null, 'fill'), seen = iconBtn(IC.seen, 'Watched', null);
  const paint = () => { const w = wlHas(e.itemId), v = watchedHas(e.itemId); wl.classList.toggle('on', w); wl.title = w ? 'Remove from watchlist' : 'Add to watchlist'; seen.classList.toggle('on', v); seen.title = v ? 'Mark as unwatched' : 'Mark as watched'; };
  wl.onclick = () => { if (wlHas(e.itemId)) { wlRemove(e.itemId); toast('Removed from watchlist'); } else { wlAdd({...e}); toast('Added to watchlist'); } paint(); };
  seen.onclick = () => { if (watchedHas(e.itemId)) { watchedRemove(e.itemId); toast('Marked as unwatched'); } else { watchedAdd(e); toast('Marked as watched'); } paint(); };
  paint(); return {wl, seen};
}
function titleMini(meta){
  return h('div', {class:'dtlogo'}, meta.logo
    ? h('img', {src:meta.logo, alt:'', onerror:e => e.target.replaceWith(h('b', null, meta.name))})
    : h('b', null, meta.name));
}
function bindScroll(sheet, top){
  const hero = sheet.querySelector('.dhero');
  const on = () => top.classList.toggle('scrolled', sheet.scrollTop > (hero ? hero.offsetHeight : 300) - 100);
  sheet.onscroll = on; on();
}
function trailerOf(meta){
  const t = (meta.trailerStreams && meta.trailerStreams[0] && meta.trailerStreams[0].ytId) || (meta.trailers && meta.trailers[0] && meta.trailers[0].source);
  return t || null;
}
/* ---------- more like this: same-franchise titles first, then the ones sharing the most genres ---------- */
async function findSimilar(a, type, meta){
  const out = new Map(), self = meta.id;
  const base = String(meta.name || '').replace(/[:\-–(].*$/, '').trim(), words = normQ(base).split(' ').filter(Boolean).slice(0, 2).join(' ');
  const add = (m, ad, ty, score) => { if (!m || !m.id || m.id === self || !m.name) return; const k = (m.type || ty) + '|' + m.id, p = out.get(k); if (!p) out.set(k, {m, a:ad, type:m.type || ty, score}); else if (score > p.score) p.score = score; };
  const jobs = [];
  if (words.length >= 3) jobs.push(searchAll(words).then(res => { for (const r of res) { const sc = simScore(words, r.m.name); if (sc >= .7) add(r.m, r.a, r.type, 2 + sc); } }).catch(() => {}));
  const gl = listOf(meta, 'genres', 'genres').length ? listOf(meta, 'genres', 'genres') : listOf(meta, 'genre', 'genres');
  const genres = gl.slice(0, 3), mine = new Set(genres.map(g => String(g).toLowerCase()));
  let used = 0;
  for (const g of genres.slice(0, 2)) for (const ad of spaceAddons()) for (const cat of (ad.manifest.catalogs || [])) {
    if (cat.type !== type || used >= 5) continue;
    const info = catInfo(cat), ge = genreExtra(cat);
    if (!ge || (ge.options.length && !ge.options.some(o => o.toLowerCase() === String(g).toLowerCase())) || info.req.some(n => n !== 'genre') || NEW_RE.test(cat.id)) continue;
    used++;
    jobs.push(getJSON(`${ad.base}/catalog/${cat.type}/${enc(cat.id)}/genre=${enc(ge.options.find(o => o.toLowerCase() === String(g).toLowerCase()) || g)}.json`).then(r => {
      (r.metas || []).forEach((m, i) => {
        const mg = (m.genres || m.genre || []).map(x => String(x).toLowerCase()), shared = mg.filter(x => mine.has(x)).length;
        const rating = parseFloat(m.imdbRating) || 0, yr = parseInt(m.releaseInfo || m.year) || 0, myYr = parseInt(meta.releaseInfo || meta.year) || 0;
        const near = yr && myYr ? Math.max(0, 1 - Math.abs(yr - myYr) / 30) : 0;
        add(m, ad, cat.type, (shared / Math.max(1, mine.size)) + rating / 10 * .25 + near * .15 - i * .002);
      });
    }).catch(() => {}));
  }
  await Promise.all(jobs);
  return [...out.values()].filter(x => x.score >= .45).sort((x, y) => y.score - x.score).slice(0, 30);
}
function similarPane(pane, a, type, meta){
  pane.replaceChildren(h('p', {class:'spin', style:'padding:10px 0'}, 'Finding similar titles…'));
  findSimilar(a, type, meta).then(list => {
    if (!list.length) { pane.replaceChildren(h('p', {class:'spin', style:'padding:10px 0'}, 'Nothing similar found.')); return; }
    const grid = h('div', {class:'dsim'});
    for (const it of list) {
      const {m, a:ad, type:ty} = it;
      grid.append(h('button', {class:'card', type:'button', onclick:() => openDetail(ad, ty, m, {noPush:true})}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || '')));
    }
    pane.replaceChildren(grid);
  });
}
function rightTabs(mainLabel, mainEls, loadSim){
  const paneMain = h('div', {class:'dpane'}, ...mainEls.filter(Boolean)), paneSim = h('div', {class:'dpane', hidden:true}); let loaded = false;
  const b1 = h('button', {class:'chip on', type:'button'}, mainLabel), b2 = h('button', {class:'chip', type:'button'}, 'More like this');
  const show = k => { b1.classList.toggle('on', k === 0); b2.classList.toggle('on', k === 1); paneMain.hidden = k !== 0; paneSim.hidden = k !== 1; if (k === 1 && !loaded) { loaded = true; loadSim(paneSim); } };
  b1.onclick = () => show(0); b2.onclick = () => show(1);
  return [h('div', {class:'dptabs'}, b1, b2), paneMain, paneSim];
}
function episodeBase(addon, type, meta, v, sorted){
  const i = sorted.indexOf(v), nx = sorted[i + 1];
  return {info:{item:{id:meta.id, type, name:meta.name, poster:meta.poster, background:meta.background}, addonId:addon.uid},
    alt: meta.imdb_id ? [`${meta.imdb_id}:${v.season ?? 1}:${v.episode}`] : [],
    ep:{season:v.season ?? 1, episode:v.episode, title:v.title || v.name},
    next: nx ? {id:nx.id, season:nx.season ?? 1, episode:nx.episode, title:nx.title || nx.name} : null,
    rest: sorted.slice(i + 2, i + 6).map(x => ({id:x.id, season:x.season ?? 1, episode:x.episode, title:x.title || x.name}))};
}
function resumeButton(rs, base){
  if (!rs || !rs.stream || !rs.stream.url || rs.upnext) return null;
  return h('button', {class:'btn resbtn', type:'button', onclick:() => playStream(rs.stream, rs.name, {type:rs.type, id:rs.id, info:base.info, ep:rs.ep, next:rs.next, alt:base.alt})},
    '▶ Resume ' + fmtTime(rs.pos) + (rs.ep ? ` · S${rs.ep.season ?? 1}:E${rs.ep.episode ?? '?'}` : ''));
}

/* the page of a single episode: its own backdrop, overview and the streams */
function openEpisode(addon, type, meta, v, sorted){
  const ed = $('#episode'); ed.hidden = false; ed.scrollTop = 0; pushLayer('episode');
  const base = episodeBase(addon, type, meta, v, sorted);
  const sn = v.season ?? 1, code = `S${String(sn).padStart(2, '0')}E${String(v.episode ?? 0).padStart(2, '0')}`;
  const title = v.title || v.name || `Episode ${v.episode ?? ''}`;
  const when = v.released ? fmtDate(v.released) : '';
  const streamsBox = h('div', {class:'dbox'});
  const saved = histGet().find(x => x.k === `${type}|${v.id}`);
  const etop = h('div', {class:'dtop'}, iconBtn(IC.back, 'Back', () => popLayer('episode')), titleMini(meta));
  ed.replaceChildren(
    etop,
    h('div', {class:'dwrap'}, heroBlock(meta, v.thumbnail || meta.background || meta.poster),
      h('div', {class:'dbody'},
        h('div', {class:'dleft'},
          titleBlock(meta),
          metaRow([v.runtime || meta.runtime, when || meta.year || meta.releaseInfo], meta.imdbRating),
          h('h2', {class:'ept'}, `${code} – ${title}`),
          (v.overview || v.description) ? h('p', {class:'ddesc'}, v.overview || v.description) : null),
        h('div', {class:'dsec dright'}, h('div', {class:'dptitle'}, 'Sources'), resumeButton(saved, base), streamsBox))));
  bindScroll(ed, etop);
  loadStreams(type, v.id, streamsBox, meta.name, base);
}

async function openDetail(addon, type, item, opts = {}){
  const d = $('#detail'); d.hidden = false; d.scrollTop = 0; document.body.style.overflow = 'hidden'; if (!opts.noPush) pushLayer('detail');
  let meta = {...item}, curSeason = null;
  const close = () => popLayer('detail');
  const build = withStreams => {
    const keep = d.scrollTop;
    const vids = type === 'series' && Array.isArray(meta.videos) ? meta.videos.filter(v => v && v.id) : [];
    const sorted = [...vids].sort((x, y) => ((x.season ?? 1) - (y.season ?? 1)) || ((x.episode ?? 0) - (y.episode ?? 0)));
    const base = {info:{item:{id:meta.id, type, name:meta.name, poster:meta.poster, background:meta.background}, addonId:addon.uid},
      alt:[meta.behaviorHints && meta.behaviorHints.defaultVideoId, meta.imdb_id].filter(x => x && x !== meta.id)};
    const ico = toggleIcons(addon, type, meta), yt = trailerOf(meta);
    const top = h('div', {class:'dtop'}, iconBtn(IC.back, 'Back', close), titleMini(meta), ico.wl);
    const genres = listOf(meta, 'genres', 'genres').length ? listOf(meta, 'genres', 'genres') : listOf(meta, 'genre', 'genres');
    const ph = el => { if (el) el.classList.add('dphone'); return el; };
    const acts = h('div', {class:'dacts2'});
    const body = h('div', {class:'dbody'}, h('div', {class:'dleft'},
      titleBlock(meta),
      metaRow([meta.runtime, meta.year || meta.releaseInfo], meta.imdbRating, [ico.seen]),
      meta.description ? h('p', {class:'ddesc'}, meta.description) : null,
      acts, infoPanel(meta, genres),
      ph(genres.length ? h('div', {class:'dgen'}, genres.map(g => h('button', {class:'pillx', type:'button', onclick:() => searchFor(g)}, g))) : null),
      ph(chipsSection('Cast', listOf(meta, 'cast', 'cast'))), ph(chipsSection('Director', listOf(meta, 'director', 'director'))), ph(chipsSection('Writer', listOf(meta, 'writer', 'writer')))));
    if (withStreams && sorted.length) {                                    // ---- series: seasons + episodes
      const seasons = [...new Set(sorted.map(v => v.season ?? 1))];
      if (curSeason === null || !seasons.includes(curSeason)) curSeason = seasons.find(x => x >= 1) ?? seasons[0];
      const srow = h('div', {class:'srow'}), list = h('div', {class:'eplist'});
      const draw = () => {
        srow.replaceChildren(...seasons.map(sn => h('button', {class:'chip' + (sn === curSeason ? ' on' : ''), type:'button', onclick:() => { curSeason = sn; draw(); }}, sn === 0 ? 'Specials' : 'Season ' + sn)));
        list.replaceChildren(...sorted.filter(v => (v.season ?? 1) === curSeason).map(v => {
          const hist = histGet().find(x => x.k === `series|${v.id}`), soon = v.released && new Date(v.released) > new Date();
          const th = v.thumbnail || meta.background;
          return h('button', {class:'ep' + (soon ? ' soon' : ''), type:'button', onclick:() => openEpisode(addon, type, meta, v, sorted)},
            h('div', {class:'ethumb'}, th ? h('img', {src:th, loading:'lazy', alt:'', onerror:e => e.target.remove()}) : null,
              h('span', {class:'enum'}, String(v.episode ?? '')),
              hist && hist.dur && !hist.upnext ? h('div', {class:'epg'}, h('i', {style:`width:${Math.min(100, Math.round(hist.pos / hist.dur * 100))}%`})) : null),
            h('div', {class:'einfo'}, h('div', {class:'etop'}, h('b', {class:'etitle'}, v.title || v.name || `Episode ${v.episode ?? ''}`), h('span', {class:'edate'}, soon ? 'Soon' : (v.released ? fmtDate(v.released) : ''))),
              (v.overview || v.description) ? h('p', {class:'eover'}, v.overview || v.description) : null));
        }));
      };
      draw(); body.append(h('div', {class:'dsec dright'}, ...rightTabs('Episodes', [srow, list], pane => similarPane(pane, addon, type, meta))));
    } else if (withStreams) {                                              // ---- movie / single title: streams right here
      const box = h('div', {class:'dbox'}), saved = histGet().find(x => x.k === `${type}|${meta.id}`);
      body.append(h('div', {class:'dsec dright'}, ...rightTabs('Sources', [resumeButton(saved, base), box], pane => similarPane(pane, addon, type, meta))));
      loadStreams(type, meta.id, box, meta.name, base);
    }
    const rs0 = histGet().find(x => x.itemId === meta.id && !x.upnext);
    acts.append(h('button', {class:'hb p', type:'button', onclick:() => {
      if (sorted.length) { const rv = rs0 && sorted.find(v => v.id === rs0.id); openEpisode(addon, type, meta, rv || sorted.find(v => (v.season ?? 1) >= 1) || sorted[0], sorted); }
      else { const rb = d.querySelector('.dright .resbtn'); if (rb) { rb.click(); return; } const t = d.querySelector('.dright .scard:not(.dis)'); if (t) t.focus({preventScroll:true}); else toast('Loading sources…'); }
    }}, rs0 ? '▶  Resume' : '▶  Play'), mirrorBtn(ico.wl, IC.mark, 'Watchlist'), mirrorBtn(ico.seen, IC.seen, 'Watched'));
    d.replaceChildren(top, h('div', {class:'dwrap'}, heroBlock(meta), body));
    d.scrollTop = keep; bindScroll(d, top);
    return {sorted};
  };
  build(false);
  const ma = supports(addon, 'meta', type, item.id) ? addon : addons.find(x => supports(x, 'meta', type, item.id));
  if (ma) { try { const r = await getJSON(`${ma.base}/meta/${type}/${enc(item.id)}.json`); meta = {...item, ...r.meta}; } catch {} }
  const {sorted} = build(true);
  const rs = opts.resume;
  if (rs && type === 'series') { const rv = sorted.find(v => v.id === rs.id); if (rv) openEpisode(addon, type, meta, rv, sorted); }
}

function noStreamsMsg(type, cands){
  const isStream = r => (typeof r === 'string' ? r : r.name) === 'stream';
  const withStream = streamPool().filter(a => (a.manifest.resources || []).some(isStream));
  const pend = addons.filter(a => a.pending).map(a => an(a));
  const pendTxt = pend.length ? " Couldn't load: " + pend.join(', ') + ' (try Sync now, or reinstall it).' : '';
  if (!withStream.length) return 'None of your installed addons provide streams.' + (pendTxt || ' Install one on the Addons tab.');
  const parts = withStream.map(a => {
    const r = (a.manifest.resources || []).find(isStream), pre = (r && r.idPrefixes) || a.manifest.idPrefixes, ty = (r && r.types) || a.manifest.types;
    return `${an(a)} (${(ty || []).join('/') || 'any type'}; ids: ${pre ? pre.join(', ') : 'any'})`;
  });
  return `No stream addon accepts this title (${type}, id ${cands.map(c => '"' + c + '"').join(' / ')}). Stream addons: ${parts.join('; ')}.` + pendTxt;
}
function streamSummary(st){
  const t = String(st.title || st.description || '');
  const size = (/💾\s*([\d.,]+\s*[KMGT]i?B)/i.exec(t) || [])[1], seeds = (/👤\s*(\d+)/.exec(t) || [])[1], src = (/⚙️?\s*([^\n]+)/.exec(t) || [])[1];
  const parts = [size, seeds ? seeds + ' seeds' : null, src && src.trim()].filter(Boolean);
  return parts.length ? parts.join('  ·  ') : t.split('\n')[0].slice(0, 90);
}
const badStreams = new WeakSet(), streamEls = new WeakMap();
/* what worked and what failed is remembered on this device */
const sigOf = st => String((st && st.name) || '').replace(/\s+/g, ' ').trim().toLowerCase();
const urlKey = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return String(u || ''); } };
const mapGet = k => { const v = lsGet(k, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const prefOf = id => mapGet('streamlet.srcpref')[id];
const prefSet = (id, sig) => { if (!id || !sig) return; const m = mapGet('streamlet.srcpref'); m[id] = sig; const ks = Object.keys(m); if (ks.length > 150) delete m[ks[0]]; lsSet('streamlet.srcpref', m); };
const badSet = st => { const m = mapGet('streamlet.badsrc'), now = Date.now(); for (const k of Object.keys(m)) if (now - m[k] > 7 * 864e5) delete m[k]; m[urlKey(st.url)] = now; const ks = Object.keys(m); if (ks.length > 200) delete m[ks[0]]; lsSet('streamlet.badsrc', m); };
const isBadStream = st => badStreams.has(st) || (st.url && Date.now() - (mapGet('streamlet.badsrc')[urlKey(st.url)] || 0) < 7 * 864e5);
const logErr = (title, st, code) => { const a = lsGet('streamlet.errlog', []); a.unshift({t:Date.now(), title:title || '', src:String((st && st.name) || '').replace(/\n+/g, ' '), code:code || ''}); lsSet('streamlet.errlog', a.slice(0, 30)); };
function orderStreams(ss, itemId){                                    // the source that worked last time first, ones that failed recently last
  const pref = prefOf(itemId), rank = x => isBadStream(x) ? 2 : (pref && sigOf(x) === pref ? 0 : 1);
  return ss.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}
function sortByLang(ss){
  if (settings.audioLang === 'any') return ss;
  const pc = code2(settings.audioLang), score = x => { const l = streamLangs(x); return l.includes(pc) ? 0 : l.includes('multi') ? 1 : 2; };
  return ss.map((x, i) => [x, i]).sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1]).map(x => x[0]);
}
function streamCard(st, title, ctx){
  const playable = !!(st.url || st.externalUrl || st.ytId), langs = streamLangs(st);
  const card = h('button', {class:'scard' + (playable ? '' : ' dis') + (isBadStream(st) ? ' bad' : ''), type:'button', onclick:() => playStream(st, title, ctx)},
    h('span', {class:'splay'}, playable ? '▶' : '✕'),
    h('div', {class:'sbody'}, h('b', {class:'sname'}, String(st.name || 'Stream').replace(/\n+/g, ' · '), ctx && ctx.info && prefOf(ctx.info.item.id) === sigOf(st) ? h('span', {class:'lastu'}, 'Last used') : null), h('div', {class:'sinfo'}, streamSummary(st)), h('div', {class:'stxt'}, st.title || st.description || ''),
      langs.length ? h('div', {class:'slall', style:'margin-top:6px'}, langs.map(l => h('span', {class:'lc'}, l.toUpperCase()))) : null,
      langs.length ? h('div', {class:'slangs'}, langs.slice(0, 6).map(l => h('span', {class:'lc'}, l.toUpperCase())), langs.length > 6 ? h('span', {class:'lc more'}, '+' + (langs.length - 6)) : null) : null));
  streamEls.set(st, card);
  return card;
}
async function loadStreams(type, id, box, title, base = {}){
  const chipsEl = h('div', {class:'sfilter'}), listEl = h('div', {class:'slist'});
  box.replaceChildren(h('div', {class:'dsec', style:'margin-top:8px'}, h('h4', null, 'Streams')), chipsEl, listEl);
  const cands = [id, ...(base.alt || [])];
  const srcs = streamPool().map(a => ({a, sid:cands.find(c => supports(a, 'stream', type, c))})).filter(x => x.sid);
  if (!srcs.length) { listEl.append(h('p', {class:'spin'}, noStreamsMsg(type, cands))); return; }
  const groups = srcs.map(x => ({...x, ss:null, err:''}));
  let filter = 'all';
  const draw = () => {
    const total = groups.reduce((n, g) => n + (g.ss ? g.ss.length : 0), 0), loading = groups.some(g => !g.ss && !g.err);
    const chip = (key, label, count) => h('button', {class:'chip' + (filter === key ? ' on' : ''), type:'button', onclick:() => { filter = key; draw(); }}, label, h('b', null, count));
    chipsEl.replaceChildren(chip('all', 'All', loading ? '…' : String(total)),
      ...groups.map((g, i) => chip(String(i), an(g.a), g.ss ? String(g.ss.length) : (g.err ? '!' : '…'))));
    listEl.replaceChildren();
    const flat = []; groups.forEach((g, i) => { if ((filter === 'all' || filter === String(i)) && !g.err && g.ss) flat.push(...g.ss); });
    groups.forEach((g, i) => {
      if (filter !== 'all' && filter !== String(i)) return;
      if (g.err) listEl.append(h('p', {class:'msg err'}, an(g.a) + ': ' + g.err));
      else if (g.ss) for (const st of g.ss) listEl.append(streamCard(st, title, {type, id, ...base, _list:flat}));
    });
    if (loading && !listEl.children.length) listEl.append(h('p', {class:'spin'}, 'Searching…'));
    else if (!loading && !total && !listEl.querySelector('.msg')) listEl.append(h('p', {class:'spin'}, 'No streams found.'));
  };
  draw();
  await Promise.all(groups.map(async g => {
    try {
      const r = await getJSON(`${g.a.base}/stream/${type}/${enc(g.sid)}.json`);
      g.ss = orderStreams(sortByLang(r.streams || []), base.info && base.info.item.id);
    } catch (e) { g.err = e.message || 'failed'; }
    draw();
  }));
}

