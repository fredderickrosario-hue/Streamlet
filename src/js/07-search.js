/* ---------- smart search: forgiving about spaces and spelling, merged across catalogs, ordered by how close each title is to what you typed ---------- */
const normQ = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b){
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({length:b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function simScore(q, title){                                              // 0..1, how close a title is to the query
  const qn = normQ(q), tn = normQ(title), qc = qn.replace(/ /g, ''), tc = tn.replace(/ /g, '');
  if (!qc || !tc) return 0;
  if (qc === tc) return 1;
  let sc = 0;
  if (tc.startsWith(qc)) sc = .93 - Math.min(.2, (tc.length - qc.length) * .004);       // shorter titles first: "Tinker Bell" before "Tinker Bell and the Great Fairy Rescue"
  else if (tc.includes(qc)) sc = .84 - Math.min(.2, (tc.length - qc.length) * .003);
  else if (qc.includes(tc) && tc.length >= 4) sc = .7;
  const qt = qn.split(' ').filter(Boolean), tt = tn.split(' ');
  const hit = qt.filter(w => tt.some(x => x === w || (w.length >= 3 && (x.startsWith(w) || (w.startsWith(x) && x.length >= 3))))).length;
  if (qt.length) sc = Math.max(sc, (hit / qt.length) * .74);
  const ed = 1 - lev(qc.slice(0, 40), tc.slice(0, 40)) / Math.max(qc.length, tc.length, 1);
  const edp = 1 - lev(qc.slice(0, 40), tc.slice(0, qc.length + 1).slice(0, 40)) / Math.max(qc.length, 1);   // a typo near the start of a longer title
  return Math.max(sc, ed * .86, edp * .8);
}
function searchVariants(q){
  const n = normQ(q), out = [String(q).trim()], c = n.replace(/ /g, '');
  if (n.includes(' ') && c.length >= 4) out.push(c);                                      // "tinker bell" -> "tinkerbell"
  const words = n.split(' ').filter(w => w.length >= 4).sort((a, b) => b.length - a.length);
  if (n.includes(' ') && words[0]) out.push(words[0]);                                    // the longest word on its own
  if (!n.includes(' ') && n.length >= 7) out.push(n.slice(0, Math.max(5, Math.round(n.length * .6))));   // "tinkerbell" -> "tinker"
  return [...new Set(out.filter(x => x.length >= 2))].slice(0, 3);
}
/* the same film found through two addons (different ids) shows once; the entry with a poster wins */
function dedupeList(list, getM, getType){
  const seen = new Map(), out = [];
  for (const it of list) {
    const m = getM(it), k = (getType(it) || '') + '|' + normTitle(m.name) + '|' + yearOf(m), prev = seen.get(k);
    if (!prev) { seen.set(k, it); out.push(it); }
    else if (!getM(prev).poster && m.poster) { out[out.indexOf(prev)] = it; seen.set(k, it); }
  }
  return out;
}
const rankResults = items => dedupeList([...items.values()].filter(x => x.score >= .36 || (x.exact && x.score >= .25)).filter(x => visibleMeta(x.m, x.type)).sort((x, y) => (y.score - x.score) || (x.rank - y.rank)), x => x.m, x => x.type);
const peopleOf = m => [].concat(m.cast || [], m.director || [], m.writer || [], (m.links || []).filter(l => /^(cast|director|writers?)$/i.test(l.category || '')).map(l => l.name))
  .flatMap(x => typeof x === 'string' ? x.split(/\s*,\s*/) : []).map(normQ).filter(Boolean);
const shortQuery = q => { const n = normQ(q); return n.length > 0 && n.length <= 3 && !n.includes(' '); };
function relevance(query, m){                                             // title closeness, or a person / genre match for names and tags
  const qn = normQ(query), qt = qn.split(' ');
  let sc = simScore(query, m.name);
  if (shortQuery(query)) sc = normQ(m.name).split(' ').some(w => w.startsWith(qn)) ? .78 : 0;       // first letters only: titles with a word starting with them (the popular ones first), not every title containing them
  if (qn.length >= 3 && peopleOf(m).some(p => p === qn || (qt.length > 1 && qt.every(w => p.split(' ').includes(w))))) sc = Math.max(sc, .8);
  const gs = [].concat(m.genres || m.genre || []).map(normQ);
  if (qn && gs.includes(qn)) sc = Math.max(sc, .66);
  return sc;
}
function runSearch(query, items, onHit){                                   // asks every searchable catalog with every spelling variant; fills `items`
  const variants = searchVariants(query), jobs = [], qn = normQ(query), trace = [];
  const note = (a, cat, what, t0, n, err) => { trace.push(`${an(a)} · ${cat.name || cat.id} (${cat.type}) · ${what} · ${err ? 'ERROR ' + err : n + ' results'} · ${Date.now() - t0} ms`); lsSet('streamlet.lastsearch', {q:query, t:Date.now(), rows:trace.slice(0, 60)}); };
  const ask = (a, cat, path, what, vi, floor) => { const t0 = Date.now(); return getJSON(`${a.base}/catalog/${cat.type}/${enc(cat.id)}/${path}.json`).then(r => { note(a, cat, what, t0, (r.metas || []).length); add(a, cat, r, vi, floor); }).catch(e => note(a, cat, what, t0, 0, (e && e.message) || 'failed')); };
  const add = (a, cat, r, vi, floor) => {
    (r.metas || []).forEach((m, i) => {
      if (!m || !m.id || !m.name) return;
      const key = (m.type || cat.type) + '|' + m.id, rank = (vi ? 1000 : 0) + i, prev = items.get(key);
      const sc = Math.max(relevance(query, m), vi === 0 && !shortQuery(query) ? Math.max(.62, floor - Math.min(.04, i * .001)) : 0) + (parseFloat(m.imdbRating) || 0) / 200;       // a little extra for well-rated titles: popular ones come first   // whatever the addon returns for exactly what was typed is kept near the top
      if (!prev) items.set(key, {m, a, type:m.type || cat.type, rank, score:sc, exact:vi === 0});
      else { if (rank < prev.rank) prev.rank = rank; if (vi === 0) prev.exact = true; prev.score = Math.max(prev.score, sc); }
    });
    if (onHit) onHit();
  };
  const run = list => {
    for (const a of list) for (const cat of (a.manifest.catalogs || [])) {
      const info = catInfo(cat), ge = genreExtra(cat);
      if (info.search) variants.forEach((v, vi) => jobs.push(ask(a, cat, 'search=' + enc(v), '"' + v + '"', vi, .62)));
      if (ge && qn.length >= 3 && !NEW_RE.test(cat.id) && !info.req.some(n => n !== 'genre')) {
        const opt = ge.options.find(o => normQ(o) === qn);
        if (opt) jobs.push(ask(a, cat, 'genre=' + enc(opt), 'genre ' + opt, 0, .7));
      }
    }
  };
  run(lsGet('streamlet.ui', {}).srchAll === false ? spaceAddons() : addons);   // by default every installed addon is searched, not just this space's
  if (!jobs.length) run(addons);                                           // this space's addons can't search: use everything installed
  return jobs;
}
function searchFor(term){                                                   // tags on an entry page start a search
  const go = () => {
    if (isTVui()) { showTab('search'); sQuery = term; sPaint(); clearTimeout(sT); homeTok++; renderHome(term, $('#sres')); return; }
    $('#q').value = term; srchOn = true;
    if ($('#home').hidden) showTab('home'); else renderHome(term);
    window.scrollTo(0, 0);
  };
  if (!layersOpen.length) return go();
  window.addEventListener('popstate', () => setTimeout(go, 40), {once:true});
  history.go(-layersOpen.length);
}
async function searchAll(query){ const items = new Map(); await Promise.all(runSearch(query, items)); return rankResults(items); }
async function renderResults(query, box, tok){
  const grid = h('div', {class:'rgrid'}), head = h('h2', {class:'rhead'}, 'Results for ', h('b', null, '“' + query + '”'));
  const note = h('p', {class:'hint', style:'padding:0 16px'}, 'Searching…');
  box.append(h('div', {class:'tspace'}), head, note, grid);
  const items = new Map(); let t = 0, loading = true;
  const paint = () => {
    if (tok !== homeTok) return;
    const list = rankResults(items); grid.replaceChildren(); let sep = false;
    for (const it of list) {
      if (!sep && it.score < .62 && grid.children.length) { sep = true; grid.append(h('div', {class:'rsep'}, 'Similar titles')); }
      const {m, a, type} = it, btn = h('button', {class:'card', type:'button', onclick:() => { recentAdd(query); openDetail(a, type, m); }}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || ''));
      attachHold(btn, {itemId:m.id, type, name:m.name, poster:m.poster, background:m.background, addonId:a.uid, _item:m});
      btn._hero = {a, m, type};
      grid.append(btn);
    }
    note.textContent = list.length ? '' : (loading ? 'Searching…' : 'No results.');
  };
  const jobs = runSearch(query, items, () => { clearTimeout(t); t = setTimeout(paint, 120); });
  if (!jobs.length) { note.textContent = 'None of your addons support search.'; return; }
  await Promise.all(jobs); loading = false; clearTimeout(t); paint();
}
async function renderHome(query = $('#q').value.trim(), target){
  const tok = ++homeTok, box = target || $('#rows');
  box.replaceChildren(); if (!target) renderTabs();
  if (!addons.length) {
    box.append(h('div', {class:'empty'},
      h('h2', null, 'No addons installed'),
      h('p', null, 'Streamlet is an empty shell. Install at least one addon to get catalogs and streams.'),
      h('button', {class:'btn', onclick:()=>showTab('addons')}, 'Install an addon')));
    return;
  }
  if (query) { await renderResults(query, box, tok); return; }
  const tabs = spaceTabs() && !query;
  const skipP = personalSkip; personalSkip = false;
  const personal = !skipP && !query && !target && !(tabs && view.genre) && (!tabs || view.tab === 'home') && personalSeeds().any;
  const hideCats = personal && tabs;                                            // with tabs, the catalogs live in Movies / Shows as discoveries
  const nhKey = tabs && !target && view.tab === 'new' && !view.genre ? lsGet('streamlet.tmdb', '') : '';
  if (nhKey) { box.append(h('div', {class:'tspace'})); renderNewHot(box, tok, nhKey).catch(() => {}); return; }
  const heroBox = h('div'); if (!query && !(tabs && view.genre)) box.append(heroBox); else if (!target) box.append(h('div', {class:'tspace'}));
  if (tabs && !target) box.append(genreStrip());
  if (tabs && !target && view.tab === 'new') box.append(h('div', {class:'empty', style:'padding:6px 16px 0'}, h('p', null, 'Add your TMDB key in Settings to turn this tab into New & Hot: coming soon, trending and top 10.')));
  if (!target) { box.append(h('div', {id:'cwBox'})); renderCW(); }
  if (personal) { const pbox = h('div', {id:'pBox'}); box.append(pbox); renderPersonal(pbox, tok).then(ok => { if (!ok && hideCats && tok === homeTok) { personalSkip = true; renderHome(query, target); } }).catch(() => { if (hideCats && tok === homeTok) { personalSkip = true; renderHome(query, target); } }); }
  let heroDone = false, shown = 0;
  const jobs = [];
  for (const a of spaceAddons()) for (const cat of (a.manifest.catalogs||[])) {
    if (hideCats && jobs.length >= 2) break;                                    // only needed for the hero picture
    const info = catInfo(cat), ge = genreExtra(cat);
    let path, title = cat.name || cat.id;
    if (query) {
      if (!info.search) continue;
      path = `catalog/${cat.type}/${enc(cat.id)}/search=${enc(query)}.json`;
    } else if (tabs && !typeOK(view.tab, cat.type)) {
      continue;
    } else if (tabs && view.genre) {
      if (!ge || (ge.options.length && !ge.options.includes(view.genre)) || info.req.some(n => n !== 'genre') || NEW_RE.test(cat.id)) continue;
      path = `catalog/${cat.type}/${enc(cat.id)}/genre=${enc(view.genre)}.json`; title = view.genre;
    } else if (tabs && view.tab === 'new') {
      if (!(NEW_RE.test(cat.id) || NEW_RE.test(cat.name || ''))) continue;
      if (info.req.some(n => n !== 'genre')) continue;
      if (info.req.includes('genre')) {
        const o = ge && sortedOptions(ge.options)[0]; if (!o) continue;
        path = `catalog/${cat.type}/${enc(cat.id)}/genre=${enc(o)}.json`;
      } else path = `catalog/${cat.type}/${enc(cat.id)}.json`;
    } else {
      if (info.req.length) continue;
      path = `catalog/${cat.type}/${enc(cat.id)}.json`;
    }
    const strip = h('div', {class:'strip'});
    const sec = h('div', {class:'row'}, h('h2', null, title, ' ', h('small', null, '· ' + [an(a), TYPE_LABEL[cat.type]].filter(Boolean).join(' · '))), strip);
    const loading = h('div', {class:'spin'}, 'Loading…');
    sec.append(loading); if (!hideCats) box.append(sec);
    jobs.push(getJSON(`${a.base}/${path}`).then(r => {
      if (tok!==homeTok) return;
      const metas = (r.metas||[]).filter(x => visibleMeta(x, x.type || cat.type));
      if (!metas.length) { sec.remove(); return; }
      if (hideCats && heroDone) return;
      shown++; loading.remove();
      if (!heroDone && !query && heroBox.isConnected) {
        heroDone = true;
        const bgs = metas.filter(x => x.background).slice(0, 10), hm = bgs.length ? bgs[Math.floor(Math.random() * bgs.length)] : metas[0], ht = hm.type || cat.type;
        heroSlides = []; heroIdx = 0; heroBox.replaceChildren(buildTvHero()); setTvHero({a, m:hm, type:ht}, true);
        if (profile && !(view.genre)) { const tk = ++heroTok, ex = metas.filter(x => x.background && x !== hm).sort(() => Math.random() - .5).slice(0, 5).map(x => ({a, m:x, type:x.type || cat.type})); heroBuild({a, m:hm, type:ht}, ex, tk).catch(() => {}); }
      }
      if (hideCats) return;
      for (const m of metas) {
        const btn = h('button', {class:'card', onclick:()=>openDetail(a, m.type||cat.type, m)}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || ''));
        attachHold(btn, {itemId:m.id, type:m.type||cat.type, name:m.name, poster:m.poster, background:m.background, addonId:a.uid, _item:m});
        btn._hero = {a, m, type:m.type||cat.type};
        strip.append(btn);
      }
    }).catch(e => { if (tok!==homeTok) return; loading.textContent = "Couldn't load: " + e.message; loading.style.color='var(--err)'; }));
  }
  const none = query ? 'None of your addons support search.'
    : (tabs && view.genre) ? 'No catalogs offer this category here.'
    : (tabs && view.tab === 'new') ? 'None of your addons have a "new releases" catalog for this space.'
    : tabs ? 'No catalogs of this kind in this space.' : 'Your installed addons have no browsable catalogs.';
  if (!jobs.length) { if (!personal) box.append(h('div', {class:'empty'}, none)); }
  else if (!hideCats) Promise.all(jobs).then(() => { if (tok===homeTok && !shown && !box.querySelector('.spin')) box.append(h('div',{class:'empty'}, query ? 'No results.' : none)); });
}

let addonsTab = 'installed';
const CAP_NAMES = {catalog:'Catalogs', meta:'Info', stream:'Streams', subtitles:'Subtitles', addon_catalog:'Addon lists'};
function addonLogo(a){
  const w = h('span', {class:'alogo'}, (an(a) || '?').trim().charAt(0).toUpperCase());
  if (a.manifest.logo && /^https?:/.test(a.manifest.logo)) w.append(h('img', {src:a.manifest.logo, alt:'', loading:'lazy', onerror:e => e.target.remove()}));
  return w;
}
function renderAddons(){
  $('#adCount').textContent = addons.length ? `${addons.length} installed` : '';
  $('#adSeg').replaceChildren(...[['installed', 'Installed'], ['browse', 'Browse']].map(([k, l]) => h('button', {class:'chip' + (addonsTab === k ? ' on' : ''), type:'button', onclick:() => { addonsTab = k; renderAddons(); }}, l)));
  $('#adInstalled').hidden = addonsTab !== 'installed'; $('#adBrowse').hidden = addonsTab !== 'browse';
  if (addonsTab === 'browse') renderBrowse();
  const list = $('#list'); list.replaceChildren();
  if (!addons.length) list.append(h('div', {class:'empty'}, h('h2', null, 'No addons yet'), h('p', null, 'Addons bring in the movies, shows and streams. Browse a few popular ones to get started.'),
    h('button', {class:'btn', type:'button', onclick:() => { addonsTab = 'browse'; renderAddons(); }}, 'Browse addons')));
  for (const a of addons) {
    const caps = [...new Set(a.manifest.resources.map(r => typeof r === 'string' ? r : r.name))].map(r => CAP_NAMES[r]).filter(Boolean);
    list.append(h('button', {class:'acard', type:'button', onclick:() => editAddon(a.uid)},
      addonLogo(a),
      h('div', {class:'ainfo'}, h('b', {class:'aname'}, an(a)),
        h('div', {class:'acaps'}, caps.map(c => h('span', {class:'tag'}, c))),
        a.pending ? h('div', {class:'awarn'}, "Couldn't load yet. It will retry.") : (a.label ? h('div', {class:'asub'}, a.manifest.name) : null)),
      h('span', {class:'achev'}, '›')));
  }
}

function editAddon(uid){
  const a = addons.find(x => x.uid === uid); if (!a) return;
  const ed = $('#addonEd'); ed.hidden = false; ed.scrollTop = 0; pushLayer('aedit');
  const close = () => popLayer('aedit');
  const name = h('input', {class:'f', placeholder:a.manifest.name, maxlength:'40', style:'width:100%'}); name.value = a.label || '';
  const link = h('textarea', {class:'f', rows:'6', spellcheck:'false', autocapitalize:'off', autocorrect:'off', style:'width:100%;font-size:13px'}); link.value = a.url;
  const delBtn = h('button', {class:'btn ghost', type:'button'}, 'Remove this addon'); let armed = false;
  delBtn.onclick = () => {
    if (!armed) { armed = true; delBtn.textContent = 'Tap again to remove'; return; }
    addons = addons.filter(x => x.uid !== a.uid); save(); close(); toast('Removed ' + an(a));
  };
  const msg = h('div', {class:'msg', style:'margin-top:8px'});
  const run = async fn => { msg.className = 'msg'; msg.textContent = 'Checking…'; try { await fn(); } catch (e) { msg.className = 'msg err'; msg.textContent = e.message || 'Failed.'; } };
  ed.replaceChildren(
    h('div', {class:'bar', style:'padding-left:0;padding-right:0'}, h('button', {class:'btn ghost sm', onclick:close}, '← Back')),
    h('div', {class:'sheetbody', style:'padding:0 16px'},
      h('h2', {style:'margin:6px 0 2px'}, an(a)), h('p', {style:'margin:0 0 6px;color:var(--mut);font-size:13px'}, a.manifest.name + (a.manifest.version ? ' · v' + a.manifest.version : '') + ' · ' + a.uid),
      h('div', {class:'lbl'}, 'Name'), name,
      h('div', {class:'lbl'}, 'Link (includes your settings, and any private keys)'), link,
      h('div', {class:'rrow', style:'margin-top:8px'},
        h('button', {class:'btn ghost sm', type:'button', onclick:async () => { try { link.value = (await navigator.clipboard.readText()).trim(); } catch { toast('Paste the link into the box.'); } }}, 'Paste'),
        configurable(a) ? h('button', {class:'btn ghost sm', type:'button', onclick:() => openConfigure(link.value || a.url)}, "Open the addon's settings page ↗") : null),
      msg,
      h('div', {class:'rrow', style:'margin-top:14px'},
        h('button', {class:'btn', type:'button', onclick:() => run(async () => { await replaceAddon(a.uid, link.value, name.value.trim()); close(); toast('Saved'); })}, 'Save'),
        h('button', {class:'btn ghost', type:'button', onclick:() => run(async () => {
          const {url} = parseAddonUrl(link.value);
          if (addons.some(x => x.url === url)) throw new Error('That link is already installed. Change the settings first (edit the link, or use the settings page), then save as a copy.');
          const mf = await installAddon(link.value, {label:name.value.trim() || undefined});
          close(); toast('Added a copy of ' + mf.name);
        })}, 'Save as a new copy')),
      h('p', {class:'spin', style:'padding:10px 0 0'}, 'Tip: open the settings page, choose your options, copy the new link it gives you, paste it above and choose "Save as a new copy". Your original stays as it is, so both are available (for example "Torrentio" and "Torrentio #2").'),
      h('div', {style:'margin-top:22px'}, delBtn)));
}

