/* ---------- Import Netflix viewing activity (the CSV from Account > Viewing activity > Download all) ----------
   Each show is matched to its IMDb entry through Cinemeta, its episodes are matched by name, and everything is marked watched.
   Before anything is saved you choose, per show, which space it belongs to (so anime can go to the Anime space) or skip it. */
const NF_CINEMETA = 'https://v3-cinemeta.strem.io';
function nfParseCSV(text){
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
const nfDate = s => { const t = Date.parse(String(s).replace(' ', 'T')); if (!isNaN(t)) return t; const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[1] - 1, +m[2]).getTime(); } return Date.now(); };
/* "Show: Season 2: Episode name"  ->  {show, season, ep}      "Movie name"  ->  {show, movie:true} */
function nfSplitTitle(raw){
  let t = String(raw || '').replace(/\s*\((?:Hook|Trailer|Teaser)\)\s*$/i, '').trim();
  const parts = t.split(/:\s+/);
  if (parts.length < 2) return {show:t, movie:true};
  const idx = parts.findIndex((p, i) => i > 0 && /^(season|series|part|volume|vol\.?|book|chapter|limited series|collection|saison|partie)\b/i.test(p));
  if (idx < 0) return {show:parts[0], season:null, ep:parts.slice(1).join(': '), guess:true};
  const sm = parts[idx].match(/(\d+)/);
  return {show:parts.slice(0, idx).join(': '), season:sm ? +sm[1] : 1, ep:parts.slice(idx + 1).join(': ')};
}
async function nfPool(items, n, fn){ let i = 0; await Promise.all(Array.from({length:n}, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
async function nfSearch(kind, q){
  try { const r = await getJSON(`${NF_CINEMETA}/catalog/${kind}/top/search=${enc(q)}.json`); return r.metas || []; } catch { return []; }
}
function nfPick(metas, q){
  let best = null, bs = 0;
  for (const m of metas.slice(0, 8)) { const sc = simScore(q, m.name); if (sc > bs) { bs = sc; best = m; } }
  return bs >= .8 ? best : null;
}
async function nfMatchEpisodes(g){
  const meta = (await getJSON(`${NF_CINEMETA}/meta/series/${enc(g.match.id)}.json`)).meta || {};
  g.genres = meta.genres || g.match.genres || [];
  const vids = (meta.videos || []).filter(v => v && (v.season ?? 1) >= 1), byName = new Map();
  for (const v of vids) { const k = normQ(v.name || v.title || ''); if (k) { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(v); } }
  for (const e of g.eps) {
    const k = normQ(e.name), cand = byName.get(k) || [];
    let v = cand.find(x => e.season && (x.season ?? 1) === e.season) || (cand.length === 1 ? cand[0] : null) || cand[0];
    if (!v) { const m = String(e.name).match(/^(?:episode|épisode|episodio|ep\.?)\s*(\d+)$/i) || String(e.name).match(/^(\d+)$/); if (m) v = vids.find(x => (x.season ?? 1) === (e.season || 1) && +x.episode === +m[1]); }
    if (v) { e.s = v.season ?? 1; e.e = v.episode; } else g.missed = (g.missed || 0) + 1;
  }
  g.found = g.eps.filter(e => e.e != null).length;
}
function nfAnimeish(g){ return (g.genres || []).some(x => /anim/i.test(x)) || /^kitsu:/.test(g.match && g.match.id || ''); }
async function nfBuild(text, onProgress){
  const rows = nfParseCSV(text); if (rows.length < 2) throw new Error('That file is empty');
  const head = rows[0].map(x => x.trim().toLowerCase()), ti = head.findIndex(x => x === 'title'), di = head.findIndex(x => x === 'date' || x === 'start time');
  if (ti < 0) throw new Error('No "Title" column found. Use the file from Viewing activity > Download all');
  const groups = new Map();
  for (const r of rows.slice(1)) {
    const p = nfSplitTitle(r[ti]); if (!p.show) continue;
    const key = normQ(p.show), t = di >= 0 ? nfDate(r[di]) : Date.now();
    if (!groups.has(key)) groups.set(key, {key, name:p.show, movie:!!p.movie, eps:[], t:0});
    const g = groups.get(key); if (!p.movie) g.movie = false;
    g.t = Math.max(g.t, t);
    if (!p.movie && !g.eps.some(x => x.name === p.ep && x.season === p.season)) g.eps.push({name:p.ep, season:p.season, t});
  }
  const list = [...groups.values()];
  let done = 0;
  await nfPool(list, 4, async g => {
    try {
      const kinds = g.movie ? ['movie', 'series'] : ['series', 'movie'];
      for (const kind of kinds) { const m = nfPick(await nfSearch(kind, g.name), g.name); if (m) { g.match = {id:m.id, name:m.name, type:kind, poster:m.poster, background:m.background, year:m.releaseInfo || m.year, genres:m.genres || []}; break; } }
      if (g.match && g.match.type === 'series' && g.eps.length) await nfMatchEpisodes(g);
      else if (g.match) g.genres = g.match.genres;
    } catch {}
    onProgress(++done, list.length);
  });
  return list.sort((a, b) => b.t - a.t);
}
function nfApply(list, profileLabel){
  const eps = epAll(), have = new Map(eps.map(r => [r.k, r])), rem = pget('epRemoved', {}), sh = pget('shows', {}), now = Date.now();
  let nEp = 0, nMovie = 0, nShow = 0;
  for (const g of list) {
    if (!g.include || !g.match || !g.space) continue;
    const sp = g.space;
    if (g.match.type === 'movie') { watchedAdd({itemId:g.match.id, type:'movie', name:g.match.name, space:sp}); nMovie++; continue; }
    let any = false;
    for (const e of g.eps) {
      if (e.e == null) continue;
      const k = epKey(g.match.id, e.s, e.e); if (rem[k] || (have.get(k) && have.get(k).done)) continue;
      have.set(k, {k, itemId:g.match.id, s:e.s, e:e.e, pos:0, dur:0, done:true, t:e.t || now}); nEp++; any = true;
    }
    if (any || g.found) { const ma = addons.find(x => supports(x, 'meta', 'series', g.match.id)); sh[g.match.id] = {n:g.match.name, p:g.match.poster, b:g.match.background, a:ma ? ma.uid : '', ty:'series', sp, t:g.t}; nShow++; }
  }
  epWrite([...have.values()]);
  pset('shows', Object.fromEntries(Object.entries(sh).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 200)));
  try { syncRibbons(); } catch {}
  return {nEp, nMovie, nShow};
}
function nfSheet(list){
  const ed = $('#nfImp'); ed.hidden = false; ed.scrollTop = 0; pushLayer('nfimp');
  const spOpts = () => [...(spaces || []).map(s => h('option', {value:s.id}, s.name || s.id)), h('option', {value:''}, 'Skip')];
  const anime = (spaces || []).find(s => /anim|ani?me/i.test(s.name || ''));
  for (const g of list) { g.include = !!g.match; g.space = g.match ? ((anime && nfAnimeish(g)) ? anime.id : (cur ? cur.id : ((spaces || [])[0] || {}).id)) : ''; }
  const rowsEl = h('div', {style:'display:flex;flex-direction:column;gap:8px'}), bulkSel = h('select', {class:'f'}, ...spOpts()), info = h('div', {class:'spin', style:'padding:6px 0'});
  const redraw = () => {
    const ok = list.filter(g => g.match), bad = list.length - ok.length;
    info.textContent = `${ok.length} matched of ${list.length} titles${bad ? ` · ${bad} could not be matched` : ''}. Tick the ones to import and pick a space for each.`;
    rowsEl.replaceChildren(...list.map((g, i) => {
      const cb = h('input', {type:'checkbox'}); cb.checked = g.include && !!g.match; cb.disabled = !g.match; cb.onchange = () => { g.include = cb.checked; };
      const sel = h('select', {class:'f', style:'max-width:44%'}, ...spOpts()); sel.value = g.space || ''; sel.disabled = !g.match; sel.onchange = () => { g.space = sel.value; if (!g.space) { g.include = false; cb.checked = false; } };
      const sub = g.match ? `${g.match.name}${g.match.year ? ' (' + g.match.year + ')' : ''} · ${g.match.type === 'movie' ? 'movie' : (g.found || 0) + ' of ' + g.eps.length + ' episodes matched'}` : 'No match found';
      return h('div', {class:'rrow', style:'align-items:center;gap:10px;opacity:' + (g.match ? 1 : .55)}, cb, h('div', {style:'flex:1;min-width:0'}, h('div', {style:'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'}, g.name), h('div', {class:'spin', style:'padding:0;font-size:12px'}, sub)), sel);
    }));
  };
  const toggleAll = on => { list.forEach(g => { if (g.match) g.include = on; }); redraw(); };
  const moveSel = () => { if (!bulkSel.value && bulkSel.value !== '') return; for (const g of list) if (g.include && g.match) g.space = bulkSel.value; redraw(); };
  const msg = h('div', {class:'msg', style:'margin-top:8px'});
  ed.replaceChildren(
    h('div', {class:'bar', style:'padding-left:0;padding-right:0'}, h('button', {class:'btn ghost sm', onclick:() => popLayer('nfimp')}, '← Back')),
    h('div', {style:'padding:0 16px 120px'},
      h('h2', {style:'margin:6px 0 2px'}, 'Import from Netflix'), h('p', {style:'margin:0 0 8px;color:var(--mut);font-size:13px'}, 'Saving to profile: ' + (profile ? profile.name : '?')), info,
      h('div', {class:'rrow', style:'gap:8px;flex-wrap:wrap;margin:8px 0'}, h('button', {class:'btn ghost sm', type:'button', onclick:() => toggleAll(true)}, 'Select all'), h('button', {class:'btn ghost sm', type:'button', onclick:() => toggleAll(false)}, 'Select none'),
        h('button', {class:'btn ghost sm', type:'button', onclick:() => { const a = (spaces || []).find(s => /anim|ani?me/i.test(s.name || '')); if (!a) { toast('No space with "anime" in its name'); return; } for (const g of list) g.include = !!g.match && nfAnimeish(g); for (const g of list) if (g.include) g.space = a.id; redraw(); }}, 'Pick anime → Anime space')),
      h('div', {class:'rrow', style:'gap:8px;align-items:center;margin-bottom:10px'}, h('span', {class:'spin', style:'padding:0'}, 'Move ticked to:'), bulkSel, h('button', {class:'btn ghost sm', type:'button', onclick:moveSel}, 'Move')),
      rowsEl, msg,
      h('div', {style:'position:sticky;bottom:0;padding:12px 0;background:var(--bg)'}, h('button', {class:'btn', type:'button', onclick:() => {
        const r = nfApply(list); msg.className = 'msg ok'; msg.textContent = `Imported ${r.nEp} episodes from ${r.nShow} shows and ${r.nMovie} movies.`; toast('Netflix history imported');
      }}, 'Import ticked'))));
  redraw();
}
$('#nfPick').onclick = () => $('#nfFile').click();
$('#nfFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !profile) { if (!profile) toast('Pick a profile first'); return; }
  const st = $('#nfState'); st.textContent = 'Reading…';
  try {
    const list = await nfBuild(await f.text(), (d, n) => { st.textContent = `Matching ${d} of ${n}…`; });
    st.textContent = ''; nfSheet(list);
  } catch (err) { st.textContent = String(err.message || err); }
};
