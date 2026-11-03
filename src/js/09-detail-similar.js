/* ---------- detail + streams ---------- */
/* a "Continue watching" card: plays on from where it stopped (same source), no page in between */
async function openResume(e){
  const a = addons.find(x => x.uid === e.addonId || x.manifest.id === e.addonId) || spaceAddons()[0] || addons[0];
  if (!a) return;
  const item = {id:e.itemId, type:e.itemType, name:e.name, poster:e.poster, background:e.background};
  if (!profile || (!autoPickOn() && !(e.stream && e.stream.url))) return openDetail(a, e.itemType, item, {resume:e});
  showLoading();
  let meta = {...item};
  try { const ma = supports(a, 'meta', e.itemType, e.itemId) ? a : addons.find(x => supports(x, 'meta', e.itemType, e.itemId)); if (ma) { const r = await getJSON(`${ma.base}/meta/${e.itemType}/${enc(e.itemId)}.json`); meta = {...item, ...r.meta}; } } catch {}
  if (loadCancelled) return;
  let base = {info:{item:{id:e.itemId, type:e.itemType, name:e.name, poster:e.poster, background:e.background, released:meta.released, releaseInfo:meta.releaseInfo}, addonId:a.uid},
    alt:[meta.behaviorHints && meta.behaviorHints.defaultVideoId, meta.imdb_id].filter(x => x && x !== e.itemId), ep:e.ep || undefined, next:e.next || undefined};
  if (e.itemType === 'series' && Array.isArray(meta.videos)) {
    const sorted = meta.videos.filter(v => v && v.id).sort((x, y) => ((x.season ?? 1) - (y.season ?? 1)) || ((x.episode ?? 0) - (y.episode ?? 0))), v = sorted.find(x => x.id === e.id);
    if (v) base = episodeBase(a, e.itemType, meta, v, sorted);
  }
  if (e.stream && e.stream.url && !e.upnext) { await hideLoading(); await playStream(e.stream, e.name, {type:e.type, id:e.id, ...base}); backToEntry(a, e.itemType, item); return; }
  if (!(await autoPlay(e.type, e.id, e.name, base))) openDetail(a, e.itemType, item, {resume:e}); else backToEntry(a, e.itemType, item);
}
const IC = {
  back:'<path d="M15 5l-7 7 7 7"/>',
  share:'<circle cx="18" cy="5.5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4.1M8.3 13.2l7.4 4.1"/>',
  clap:'<rect x="3.5" y="9.5" width="17" height="10.5" rx="1.6"/><path d="M3.5 9.5l1.6-4.4 14.6 3-.5 1.4M8.4 6.1l1.6 3.4M13.6 7.2l1.6 3.4"/>',
  mark:'<path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/>',
  seen:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  restart:'<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.6h4.6"/>'
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
/* TV: toggle icons (Watchlist / Watched) with no background; the icon itself grows when focused and fills with the accent color when on */
function plainIconBtn(src, path, label){
  if (!src) return null;
  const b = h('button', {class:'pib', type:'button', 'aria-label':label}); b.innerHTML = `<svg viewBox="0 0 24 24">${path}</svg>`;
  const sync = () => { b.classList.toggle('on', src.classList.contains('on')); b.title = src.title || label; };
  b.onclick = () => { src.click(); sync(); }; sync(); return b;
}
function metaRow(parts, rating, right){
  const row = h('div', {class:'dmeta'});
  parts.filter(Boolean).forEach((t, i) => { if (i) row.append(h('span', {class:'dot'}, '·')); row.append(h('span', null, t)); });
  if (rating) row.append(h('span', {class:'imdb'}, true ? '★' : 'IMDb'), h('span', null, String(rating)));
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
  const on = () => top.classList.toggle('scrolled', sheet.scrollTop > (hero ? Math.min(hero.offsetHeight - 100, innerHeight * .5) : 300));
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
  if (words.length >= 3) jobs.push(searchAll(words).then(res => { for (const r of res) { const sc = simScore(words, r.m.name); if (sc >= .7 && normTitle(r.m.name) !== normTitle(meta.name) && normTitle(r.m.name).startsWith(normTitle(base))) add(r.m, r.a, r.type, 1.2 + sc * .2); } }).catch(() => {}));
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
        if (normTitle(m.name) === normTitle(meta.name)) return;
        add(m, ad, cat.type, (shared / Math.max(1, mine.size)) * .6 + rating / 10 * .5 + near * .15 - i * .002);
      });
    }).catch(() => {}));
  }
  await Promise.all(jobs);
  const me = normTitle(meta.name) + '|' + yearOf(meta);
  return dedupeList([...out.values()].filter(x => x.score >= .5 && visibleMeta(x.m, x.type)).sort((x, y) => y.score - x.score), x => x.m, x => x.type).filter(x => normTitle(x.m.name) !== normTitle(meta.name) && normTitle(x.m.name) + '|' + yearOf(x.m) !== me).slice(0, 30);
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
    rest: sorted.slice(i + 2, i + 6).map(x => ({id:x.id, season:x.season ?? 1, episode:x.episode, title:x.title || x.name})),
    eps: sorted.map(x => ({id:x.id, season:x.season ?? 1, episode:x.episode, title:x.title || x.name, thumb:x.thumbnail || ''}))};
}
let playSync = null;
function hintEl(){ const e = h('div', {class:'dhint', 'aria-hidden':'true'}); e.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'; return e; }
function epCard(addon, type, meta, v, sorted, soon, th, hist, again){
  return h('button', {class:'ep' + (soon ? ' soon' : ''), type:'button', onclick:() => openEpisode(addon, type, meta, v, sorted, again)},
    h('div', {class:'ethumb'}, th ? h('img', {src:th, loading:'lazy', alt:'', onerror:e => e.target.remove()}) : null,
      h('span', {class:'enum'}, String(v.episode ?? '')),
      hist && hist.dur && !hist.upnext ? h('div', {class:'epg'}, h('i', {style:`width:${Math.min(100, Math.round(hist.pos / hist.dur * 100))}%`})) : null),
    h('div', {class:'einfo'}, h('div', {class:'etop'}, h('b', {class:'etitle'}, v.title || v.name || `Episode ${v.episode ?? ''}`), h('span', {class:'edate'}, soon ? 'Soon' : (v.released ? fmtDate(v.released) : ''))),
      (v.overview || v.description) ? h('p', {class:'eover'}, v.overview || v.description) : null));
}
/* TV: the lower half of an entry page: rows of episodes / sources, cast and crew, similar titles */
function tvRowsFor(addon, type, meta, title, els, opts = {}){
  const people = [chipsSection('Cast', listOf(meta, 'cast', 'cast')), chipsSection('Director', listOf(meta, 'director', 'director')), chipsSection('Writer', listOf(meta, 'writer', 'writer'))].filter(Boolean);
  let simRow = null;
  if (opts.sim !== false) { const sim = h('div', {class:'dpane'}); similarPane(sim, addon, type, meta); simRow = h('section', {class:'drow dsimr'}, h('h3', {class:'drt'}, 'More like this'), sim); }
  return h('div', {class:'dp2'}, h('div', {class:'dp2in'},
    h('section', {class:'drow dmain'}, h('h3', {class:'drt'}, title), ...els.filter(Boolean)),
    ...(opts.rows || []),
    people.length ? h('section', {class:'drow dpeople'}, h('h3', {class:'drt'}, 'Cast & crew'), h('div', {class:'dpl'}, ...people)) : null,
    simRow));
}
function resumeButton(rs, base){
  if (!rs || !rs.stream || !rs.stream.url || rs.upnext) return null;
  return h('button', {class:'btn resbtn', type:'button', onclick:() => playStream(rs.stream, rs.name, {type:rs.type, id:rs.id, info:base.info, ep:rs.ep, next:rs.next, alt:base.alt, eps:base.eps})},
    '▶ Resume ' + fmtTime(rs.pos) + (rs.ep ? ` · S${rs.ep.season ?? 1}:E${rs.ep.episode ?? '?'}` : ''));
}

/* the page of a single episode: its own backdrop, overview and the streams */
function openEpisode(addon, type, meta, v, sorted, again){
  const ed = $('#episode'); ed.hidden = false; ed.scrollTop = 0; ed.classList.remove('p2'); if (!again) pushLayer('episode');
  const base = episodeBase(addon, type, meta, v, sorted);
  const sn = v.season ?? 1, code = `S${String(sn).padStart(2, '0')}E${String(v.episode ?? 0).padStart(2, '0')}`;
  const title = v.title || v.name || `Episode ${v.episode ?? ''}`;
  const when = v.released ? fmtDate(v.released) : '';
  const streamsBox = h('div', {class:'dbox'});
  const saved = histGet().find(x => x.k === `${type}|${v.id}`);
  const etop = h('div', {class:'dtop'}, iconBtn(IC.back, 'Back', () => popLayer('episode')), titleMini(meta), h('span', {class:'dtep'}, `S${sn} E${v.episode ?? ''} · ${title}`));
  if (true) {                                                      // TV: same two-half page as a movie, for this episode
    const hist = saved && !saved.upnext && saved.pos > 20;
    const play = h('button', {class:'hb p', type:'button', onclick:async () => {
      if (autoPickOn()) { if (!(await autoPlay(type, v.id, meta.name, base))) { const b = ed.querySelector('.manualbtn'); if (b) b.click(); } return; }
      const t = ed.querySelector('.scard:not(.dis)'); if (t) t.focus(); else { const b = ed.querySelector('.manualbtn'); if (b) b.click(); }
    }}, hist ? '▶  Continue' : '▶  Play');
    const others = h('div', {class:'eplist'}, ...sorted.filter(x => (x.season ?? 1) === sn).map(x => epCard(addon, type, meta, x, sorted, x.released && new Date(x.released) > new Date(), x.thumbnail || meta.background, histGet().find(y => y.k === `series|${x.id}`), true)));
    ed.replaceChildren(etop, h('div', {class:'dwrap'}, heroBlock(meta, v.thumbnail || meta.background || meta.poster),
      h('div', {class:'dbody'},
        h('div', {class:'dleft'},
          h('div', {class:'dep'}, `${meta.name} · Season ${sn}, episode ${v.episode ?? ''}`),
          h('div', {class:'dbt'}, h('h1', {class:'dbt-title'}, title)),
          metaRow([v.runtime || meta.runtime, when || meta.year || meta.releaseInfo], meta.imdbRating),
          (v.overview || v.description) ? h('p', {class:'ddesc'}, v.overview || v.description) : null,
          h('div', {class:'dacts2'}, play),
          hintEl()),
        tvRowsFor(addon, type, meta, 'Sources', [streamsBox], {sim:false, rows:[h('section', {class:'drow'}, h('h3', {class:'drt'}, 'Season ' + sn), others)]}))));
    const at = sorted.indexOf(v);
    ed._step = d => { const t = sorted[at + d]; if (t) openEpisode(addon, type, meta, t, sorted, true); };       // Left / Right on the top half
    if (!isTVui()) {                                                       // phone: swipe the top half sideways for the previous / next episode
      let sx = 0, sy = 0;
      ed.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
      ed.ontouchend = e => { if (ed.scrollTop > innerHeight * .5 || e.target.closest('.dp2')) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 80 && Math.abs(dy) < 50) ed._step(dx < 0 ? 1 : -1); };
    }
    for (const [cls, ok, label] of [['l', at > 0, '‹'], ['r', at >= 0 && at < sorted.length - 1, '›']]) if (ok) ed.append(h('div', {class:'dnav ' + cls, 'aria-hidden':'true'}, label));
    manualSources(streamsBox, () => loadStreams(type, v.id, streamsBox, meta.name, base));
    return;
  }
  ed.replaceChildren(
    etop,
    h('div', {class:'dwrap'}, heroBlock(meta, v.thumbnail || meta.background || meta.poster),
      h('div', {class:'dbody'},
        h('div', {class:'dleft'},
          titleBlock(meta),
          metaRow([v.runtime || meta.runtime, when || meta.year || meta.releaseInfo], meta.imdbRating),
          h('h2', {class:'ept'}, `${code} – ${title}`),
          (v.overview || v.description) ? h('p', {class:'ddesc'}, v.overview || v.description) : null),
        h('div', {class:'dsec dright'}, h('div', {class:'dptitle'}, 'Sources'), resumeButton(saved, base),
          autoPickOn() ? h('button', {class:'btn resbtn', type:'button', onclick:() => autoPlay(type, v.id, meta.name, base)}, '▶  Play best source') : null, streamsBox))));
  bindScroll(ed, etop);
  manualSources(streamsBox, () => loadStreams(type, v.id, streamsBox, meta.name, base));
}

async function openDetail(addon, type, item, opts = {}){
  const d = $('#detail'); d.hidden = false; d.scrollTop = 0; d.classList.remove('p2'); document.body.style.overflow = 'hidden'; if (!opts.noPush) pushLayer('detail');
  let meta = {...item}, curSeason = null;
  const close = () => popLayer('detail');
  const build = withStreams => {
    const keep = d.scrollTop;
    const vids = type === 'series' && Array.isArray(meta.videos) ? meta.videos.filter(v => v && v.id) : [];
    const sorted = [...vids].sort((x, y) => ((x.season ?? 1) - (y.season ?? 1)) || ((x.episode ?? 0) - (y.episode ?? 0)));
    const base = {info:{item:{id:meta.id, type, name:meta.name, poster:meta.poster, background:meta.background, released:meta.released, releaseInfo:meta.releaseInfo}, addonId:addon.uid},
      alt:[meta.behaviorHints && meta.behaviorHints.defaultVideoId, meta.imdb_id].filter(x => x && x !== meta.id)};
    const ico = toggleIcons(addon, type, meta), yt = trailerOf(meta);
    const top = h('div', {class:'dtop'}, iconBtn(IC.back, 'Back', close), titleMini(meta), ico.wl);
    const genres = listOf(meta, 'genres', 'genres').length ? listOf(meta, 'genres', 'genres') : listOf(meta, 'genre', 'genres');
    const ph = el => { if (el) el.classList.add('dphone'); return el; };
    const acts = h('div', {class:'dacts2'});
    const body = h('div', {class:'dbody'}, h('div', {class:'dleft'},
      titleBlock(meta), relBadgeEl(meta, type),
      metaRow([meta.runtime, true ? genres.slice(0, 3).join(', ') : null, meta.year || meta.releaseInfo], meta.imdbRating, [ico.seen]),
      meta.description ? h('p', {class:'ddesc'}, meta.description) : null,
      acts, infoPanel(meta, genres), true ? hintEl() : null,
      ph(genres.length ? h('div', {class:'dgen'}, genres.map(g => h('button', {class:'pillx', type:'button', onclick:() => searchFor(g)}, g))) : null),
      ph(chipsSection('Cast', listOf(meta, 'cast', 'cast'))), ph(chipsSection('Director', listOf(meta, 'director', 'director'))), ph(chipsSection('Writer', listOf(meta, 'writer', 'writer')))));
    const tvRows = (title, els) => tvRowsFor(addon, type, meta, title, els);
    if (withStreams && sorted.length) {                                    // ---- series: seasons + episodes
      const seasons = [...new Set(sorted.map(v => v.season ?? 1))];
      if (curSeason === null || !seasons.includes(curSeason)) curSeason = seasons.find(x => x >= 1) ?? seasons[0];
      const srow = h('div', {class:'srow'}), list = h('div', {class:'eplist'});
      const draw = () => {
        srow.replaceChildren(...seasons.map(sn => h('button', {class:'chip' + (sn === curSeason ? ' on' : ''), type:'button', onclick:() => { curSeason = sn; draw(); }}, sn === 0 ? 'Specials' : 'Season ' + sn)));
        list.replaceChildren(...sorted.filter(v => (v.season ?? 1) === curSeason).map(v => {
          const hist = histGet().find(x => x.k === `series|${v.id}`), soon = v.released && new Date(v.released) > new Date();
          const th = v.thumbnail || meta.background;
          return epCard(addon, type, meta, v, sorted, soon, th, hist);
        }));
      };
      draw(); body.append(true ? tvRows('Episodes', [srow, list]) : h('div', {class:'dsec dright'}, ...rightTabs('Episodes', [srow, list], pane => similarPane(pane, addon, type, meta))));
    } else if (withStreams) {                                              // ---- movie / single title: streams right here
      const box = h('div', {class:'dbox'}), saved = histGet().find(x => x.k === `${type}|${meta.id}`);
      body.append(true ? tvRows('Sources', [box]) : h('div', {class:'dsec dright'}, ...rightTabs('Sources', [resumeButton(saved, base), box], pane => similarPane(pane, addon, type, meta))));
      manualSources(box, () => loadStreams(type, meta.id, box, meta.name, base));
      if (autoPickOn() && type === 'movie' && recentRelease(meta)) collectStreams(type, meta.id, base, 2500).then(o => { if (o) noteTheaters(base.info.item, o); }).catch(() => {});
    }
    const rs0 = histGet().find(x => x.itemId === meta.id && !x.upnext);
    const soon = () => { const st = relState(meta, type); return st === 'upcoming' || st === 'theaters'; };       // not out yet: Play becomes Trailer
    const playLabel = () => soon() ? '▶  Trailer' : (rs0 ? '▶  Continue' : '▶  Play');
    const playEl = h('button', {class:'hb p', type:'button', onclick:async () => {
      if (soon()) { const yt = trailerOf(meta); if (yt) playStream({ytId:yt}, meta.name); else toast('No trailer yet.'); return; }
      if (sorted.length) {
        const rv = (rs0 && sorted.find(v => v.id === rs0.id)) || sorted.find(v => (v.season ?? 1) >= 1) || sorted[0];
        if (autoPickOn()) { if (!(await autoPlay(type, rv.id, meta.name, episodeBase(addon, type, meta, rv, sorted)))) openEpisode(addon, type, meta, rv, sorted); return; }
        openEpisode(addon, type, meta, rv, sorted);
      }
      else if (autoPickOn() && !d.querySelector('.dright .resbtn')) { if (!(await autoPlay(type, meta.id, meta.name, base))) { const b = d.querySelector('.manualbtn'); if (b) b.click(); } }
      else { const rb = d.querySelector('.dright .resbtn'); if (rb) { rb.click(); return; } const t = d.querySelector('.dright .scard:not(.dis), .dp2 .scard:not(.dis)'); if (t) t.focus({preventScroll:true}); else toast('Loading sources…'); }
    }}, playLabel());
    playSync = () => { playEl.textContent = playLabel(); };
    const restart = type === 'movie' ? (true ? (() => { const b = h('button', {class:'pib', type:'button', 'aria-label':'Start from the beginning', title:'Start from the beginning'}); b.innerHTML = `<svg viewBox="0 0 24 24">${IC.restart}</svg>`; b.onclick = () => { if (soon()) { toast('Not out yet.'); return; } autoPlay(type, meta.id, meta.name, {...base, fresh:true}); }; return b; })() : iconBtn(IC.restart, 'Start from the beginning', () => { if (soon()) { toast('Not out yet.'); return; } autoPlay(type, meta.id, meta.name, {...base, fresh:true}); })) : null;
    acts.append(playEl, ...(true ? [plainIconBtn(ico.wl, IC.mark, 'Watchlist'), plainIconBtn(ico.seen, IC.seen, 'Watched'), restart] : [mirrorBtn(ico.wl, IC.mark, 'Watchlist'), mirrorBtn(ico.seen, IC.seen, 'Watched'), restart]));
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
/* ---------- best source: picked from your preferences ---------- */
const autoPickOn = () => lsGet('streamlet.ui', {}).autoPick !== false;
const resOf = st => { const t = String((st.name || '') + ' ' + (st.title || '') + ' ' + (st.description || '')); return /\b(2160p|4k|uhd)\b/i.test(t) ? 2160 : /\b1440p\b/i.test(t) ? 1440 : /\b1080p\b/i.test(t) ? 1080 : /\b720p\b/i.test(t) ? 720 : /\b(480p|576p|sd)\b/i.test(t) ? 480 : 0; };
function rankStreams(all, itemId){                                    // best first: what worked before, your audio language, quality up to your limit, ready-to-stream links, seeds
  const cap = Number(lsGet('streamlet.ui', {}).maxQ) || 99999, pref = prefOf(itemId), pc = effAudio() === 'any' ? null : code2(effAudio());
  const lang = x => { if (!pc) return 0; const l = streamLangs(x); return l.includes(pc) ? 0 : l.includes('multi') ? 1 : 2; };
  const key = x => {
    const r = resOf(x), t = String(x.name || '') + ' ' + String(x.title || ''), seeds = Number((/\u{1F464}\s*(\d+)/u.exec(t) || [])[1]) || 0;
    return [pref && sigOf(x) === pref ? 0 : 1, lang(x), r > cap ? 1 : 0, r === 0 ? 1 : 0, -Math.min(r, cap), /\[[A-Z]{2}\+\]|cached|\u26A1/i.test(t) ? 0 : 1, -seeds];
  };
  return all.filter(x => x && x.url && !isBadStream(x)).map((x, i) => [x, key(x), i]).sort((a, b) => { for (let k = 0; k < a[1].length; k++) if (a[1][k] !== b[1][k]) return a[1][k] - b[1][k]; return a[2] - b[2]; }).map(x => x[0]);
}
/* asks every stream addon; waits up to 4 s for the slow ones once something has arrived */
async function collectStreams(type, id, base, soft = 4000){
  const cands = [id, ...(base.alt || [])];
  const srcs = streamPool().map(a => ({a, sid:cands.find(c => supports(a, 'stream', type, c))})).filter(x => x.sid);
  if (!srcs.length) return null;
  const out = [];
  const jobs = Promise.all(srcs.map(async ({a, sid}) => { try { const r = await getJSON(`${a.base}/stream/${type}/${enc(sid)}.json`); out.push(...(r.streams || [])); } catch {} }));
  await Promise.race([jobs, new Promise(r => setTimeout(r, soft))]);
  if (!out.length) await jobs;
  return out;
}
async function autoPlay(type, id, title, base){
  showLoading(title);
  const out = await collectStreams(type, id, base);
  if (out && type === 'movie' && base.info) noteTheaters(base.info.item, out);
  if (loadCancelled) { return true; }                                   // backed out while waiting
  if (!out) { await hideLoading(); toast('No stream addon for this title.'); return false; }
  const ranked = rankStreams(sortByLang(out), base.info && base.info.item.id);
  await hideLoading();
  if (!ranked.length) { toast('No playable source found.'); return false; }
  await playStream(ranked[0], title, {type, id, ...base, _list:ranked});
  return true;
}
/* after a video started from the home page or a Continue card, Back lands on that title's page */
function backToEntry(addon, type, item){ if (nativePlayer() && !layersOpen.includes('detail')) openDetail(addon, type, item); }
/* the hero's Play button: with auto-pick on it starts the best source straight away (More info opens the page) */
async function quickPlay(addon, type, item){
  if (!autoPickOn() || !profile) return openDetail(addon, type, item);
  showLoading(item.name);
  let meta = {...item};
  try { const ma = supports(addon, 'meta', type, item.id) ? addon : addons.find(x => supports(x, 'meta', type, item.id)); if (ma) { const r = await getJSON(`${ma.base}/meta/${type}/${enc(item.id)}.json`); meta = {...item, ...r.meta}; } } catch {}
  if (loadCancelled) return;
  let id = meta.id, base = {info:{item:{id:meta.id, type, name:meta.name, poster:meta.poster, background:meta.background, released:meta.released, releaseInfo:meta.releaseInfo}, addonId:addon.uid},
    alt:[meta.behaviorHints && meta.behaviorHints.defaultVideoId, meta.imdb_id].filter(x => x && x !== meta.id)};
  if (type === 'series') {
    const sorted = (Array.isArray(meta.videos) ? meta.videos.filter(v => v && v.id) : []).sort((x, y) => ((x.season ?? 1) - (y.season ?? 1)) || ((x.episode ?? 0) - (y.episode ?? 0)));
    if (!sorted.length) { await hideLoading(); return openDetail(addon, type, item); }
    const rs0 = histGet().find(x => x.itemId === meta.id && !x.upnext);
    const ep = (rs0 && sorted.find(v => v.id === rs0.id)) || sorted.find(v => (v.season ?? 1) >= 1) || sorted[0];
    base = episodeBase(addon, type, meta, ep, sorted); id = ep.id;
  }
  if (!(await autoPlay(type, id, meta.name, base))) openDetail(addon, type, item); else backToEntry(addon, type, item);
}
function sortByLang(ss){
  if (effAudio() === 'any') return ss;
  const pc = code2(effAudio()), score = x => { const l = streamLangs(x); return l.includes(pc) ? 0 : l.includes('multi') ? 1 : 2; };
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
/* with auto-pick on the list stays hidden until asked for; otherwise it loads right away */
function manualSources(box, load){
  if (!autoPickOn()) { load(); return; }
  box.replaceChildren(h('p', {class:'hint', style:'margin:6px 0 10px'}, 'Play picks the best source for you.'),
    h('button', {class:'btn ghost manualbtn', type:'button', onclick:() => load()}, 'Choose a source myself'));
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
  const doneAll = () => { if (type === 'movie' && base.info) noteTheaters(base.info.item, groups.flatMap(g => g.ss || [])); };
  await Promise.all(groups.map(async g => {
    try {
      const r = await getJSON(`${g.a.base}/stream/${type}/${enc(g.sid)}.json`);
      g.ss = orderStreams(sortByLang(r.streams || []), base.info && base.info.item.id);
    } catch (e) { g.err = e.message || 'failed'; }
    draw();
  }));
  doneAll();
}

