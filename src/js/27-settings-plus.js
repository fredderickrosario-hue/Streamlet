/* ---------- Settings: categories, and the settings added on top of the original page ----------
   The original controls keep their ids and handlers (renderSettings); this file arranges them into categories
   and wires the newer ones. Global settings live in streamlet.ui (this device) or the profile; space settings
   live on the space itself (Spaces category, or the space editor). */
const SET_CATS = [['general', 'General'], ['spaces', 'Spaces'], ['playback', 'Playback'], ['personal', 'Personalization'], ['content', 'Content'],
  ['notif', 'Notifications'], ['tmdb', 'TMDB & addons'], ['storage', 'Storage & backup'], ['account', 'Account'], ['about', 'About']];
const uiGet = () => lsGet('streamlet.ui', {});
const uiSet = patch => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), ...patch});

/* ---- small helpers used elsewhere ---- */
const metaLang = () => uiGet().metaLang || '';
const spaceTheme = sp => { const t = uiGet().theme; return t && t !== 'space' && THEMES[t] ? t : sp ? sp.theme : 'ember'; };
const rowOn = k => ((uiGet().rows || {})[k]) !== false;
const rowCatOK = cat => { const id = String(cat.id || '').replace(/\.(m|s)$/, ''); return /^tm\.byw\d/.test(id) ? rowOn('byw') : id === 'tm.wl' ? rowOn('wl') : id === 'tm.rec' ? rowOn('rec') : true; };

/* genres: one list for every addon (Cinemeta names, TMDB movie and TV ids) */
const SG = [
  {n:'Action', names:['Action'], mv:[28], tv:[10759]}, {n:'Adventure', names:['Adventure'], mv:[12], tv:[10759]}, {n:'Animation', names:['Animation'], mv:[16], tv:[16]},
  {n:'Comedy', names:['Comedy'], mv:[35], tv:[35]}, {n:'Crime', names:['Crime'], mv:[80], tv:[80]}, {n:'Documentary', names:['Documentary'], mv:[99], tv:[99]},
  {n:'Drama', names:['Drama'], mv:[18], tv:[18]}, {n:'Family', names:['Family'], mv:[10751], tv:[10751]}, {n:'Fantasy', names:['Fantasy'], mv:[14], tv:[10765]},
  {n:'History', names:['History'], mv:[36], tv:[]}, {n:'Horror', names:['Horror'], mv:[27], tv:[]}, {n:'Kids', names:['Kids'], mv:[], tv:[10762]},
  {n:'Music', names:['Music'], mv:[10402], tv:[]}, {n:'Mystery', names:['Mystery'], mv:[9648], tv:[9648]}, {n:'Reality', names:['Reality', 'Reality-TV'], mv:[], tv:[10764]},
  {n:'Romance', names:['Romance'], mv:[10749], tv:[]}, {n:'Sci-Fi', names:['Science Fiction', 'Sci-Fi'], mv:[878], tv:[10765]}, {n:'Thriller', names:['Thriller'], mv:[53], tv:[]},
  {n:'War', names:['War', 'War & Politics'], mv:[10752], tv:[10768]}, {n:'Western', names:['Western'], mv:[37], tv:[37]}];
const SLANGS = [['en', 'English'], ['fr', 'French'], ['es', 'Spanish'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['hi', 'Hindi'], ['it', 'Italian'], ['de', 'German'], ['pt', 'Portuguese']];
function tmGenreNames(ids, kind){
  const map = kind === 'tv' ? TM_TG : TM_MG, out = [];
  for (const id of ids || []) for (const [k, v] of Object.entries(map)) if (v === id) out.push(k);
  return out.length ? out : undefined;
}
/* Settings > Content: what may show in rows and search */
function contentOK(m){
  if (!m) return true;
  const u = uiGet();
  const min = +u.minRate || 0, r = parseFloat(m.imdbRating);
  if (min && r > 0 && r < min) return false;
  if ((u.hideG || []).length && Array.isArray(m.genres)) {
    const bad = new Set(SG.filter(g => u.hideG.includes(g.n)).flatMap(g => g.names));
    if (m.genres.some(g => bad.has(typeof g === 'string' ? g : g && g.name))) return false;
  }
  if ((u.langs || []).length && m.lang && !u.langs.includes(m.lang)) return false;
  return true;
}

/* ---- the page: a home list of sections, each opening its own page; search across every setting ---- */
const SET_ICONS = {
  account:'<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.8 3.8-5.6 7.2-5.6s6.3 1.8 7.2 5.6"/>',
  general:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
  spaces:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  playback:'<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M10 9.2v5.6l4.6-2.8z"/>',
  personal:'<path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  content:'<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  notif:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  tmdb:'<path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" transform="translate(.6 .6) scale(.9)"/>',
  storage:'<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>',
  about:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>'};
const SET_GROUPS = [['You', ['account']], ['App', ['general', 'spaces', 'playback', 'personal', 'content', 'notif']], ['Sources', ['tmdb']], ['Data', ['storage']], ['Help', ['about']]];
let setCatNow = null, setCatWant = null;
const setName = c => (SET_CATS.find(x => x[0] === c) || [c, c])[1];
function setSummary(c){                                                   // what each section is set to right now
  const u = uiGet(), on = (k, d) => u[k] === undefined ? d : u[k] !== false;
  const st = {last:'Opens your last space', launcher:'Opens the spaces page', space:'Opens ' + ((spaces.find(s => s.id === u.startSpace) || {}).name || 'a space')}[u.startup || 'last'];
  const q = {best:'best quality', 2160:'up to 4K', 1080:'up to 1080p', 720:'up to 720p'}[u.maxQ || 'best'] || 'best quality';
  const rows = ['hero', 'cw', 'byw', 'wl', 'rec', 'fav'].filter(rowOn).length, nt = {ep:true, season:true, wl:true, ...(u.nt || {})};
  const ntOn = [nt.ep && 'new episodes', nt.season && 'returning seasons', nt.wl && 'watchlist releases'].filter(Boolean);
  const hid = spaces.filter(s => s.hidden).length, lang = (settings && settings.subLang) || 'off';
  return {
    account:`${profile ? profile.name : 'Profile'} · ${user ? (user.email || 'Signed in') : 'Not signed in'}`,
    general:`${st} · ${u.theme && u.theme !== 'space' && THEMES[u.theme] ? THEMES[u.theme].n + ' colors' : 'colors follow each space'}`,
    spaces:`${spaces.length} space${spaces.length === 1 ? '' : 's'}${hid ? ` · ${hid} hidden` : ''} · order, visibility and settings`,
    playback:`${on('autoPick', true) ? 'Automatic source, ' + q : 'You pick the source'} · subtitles ${lang === 'off' ? 'off' : lang}`,
    personal:`${rows} of 6 home rows on`,
    content:[u.minRate ? u.minRate + '+ rating' : 'Any rating', (u.hideG || []).length ? `${u.hideG.length} genre${u.hideG.length > 1 ? 's' : ''} hidden` : '', (u.langs || []).length ? `${u.langs.length} language${u.langs.length > 1 ? 's' : ''}` : 'all languages', u.showUpcoming === false ? 'unreleased hidden' : ''].filter(Boolean).join(' · '),
    notif:ntOn.length ? ntOn.join(', ').replace(/^./, x => x.toUpperCase()) : 'Off',
    tmdb:`${lsGet('streamlet.tmdb', '') ? 'TMDB key set' : 'No TMDB key'} · ${addons.length} addon${addons.length === 1 ? '' : 's'}`,
    storage:'Space used, caches, backup and import',
    about:($('#verLine') && $('#verLine').textContent) || 'Version, credits and diagnostics'}[c] || '';
}
const setIcon = c => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'seticon'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = SET_ICONS[c] || ''; return s; };
const setItem = (c, title, sub, onclick) => h('button', {class:'setitem', type:'button', 'data-cat':c, onclick}, setIcon(c), h('span', {class:'setx'}, h('b', null, title), h('small', null, sub)), h('i', {class:'setchev', 'aria-hidden':'true'}, '›'));
function showSetHome(){
  const from = setCatNow; setCatNow = null;
  for (const el of document.querySelectorAll('#settings .setcat')) el.hidden = true;
  $('#setBack').hidden = true; $('#setTitle').textContent = 'Settings'; $('#settings').classList.remove('insub');
  const home = $('#setHome'); home.hidden = false;
  const q = h('input', {type:'search', class:'f setq', id:'setQ', placeholder:'Search settings', autocomplete:'off', spellcheck:'false', 'aria-label':'Search settings'});
  const list = h('div', {class:'setlist'});
  const paint = () => {
    const t = q.value.trim().toLowerCase();
    if (!t) { list.replaceChildren(...SET_GROUPS.map(([g, cats]) => h('div', {class:'setgrp'}, h('h3', {class:'sgh'}, g),
      h('div', {class:'setcard'}, ...cats.map(c => setItem(c, setName(c), setSummary(c), () => openSetCat(c))))))); return; }
    const hits = [];
    for (const cat of document.querySelectorAll('#settings .setcat')) for (const r of cat.querySelectorAll('.row2, .sprow')) {
      const off = r.closest('[hidden]'); if (off && off !== cat) continue;                     // rows that don't apply here (e.g. player settings on the web)
      const rt = r.querySelector('.rt'); if (!rt) continue;
      const title = (rt.firstChild && rt.firstChild.textContent || '').trim(), hint = ((rt.querySelector('small') || {}).textContent || '').trim();
      const gh = r.closest('.sgrp') && r.closest('.sgrp').querySelector('.sgh'), grp = gh ? gh.textContent.trim() : '';
      if ((title + ' ' + hint + ' ' + grp + ' ' + setName(cat.dataset.cat)).toLowerCase().includes(t)) hits.push({cat:cat.dataset.cat, r, title, hint});
    }
    list.replaceChildren(hits.length ? h('div', {class:'setcard'}, ...hits.slice(0, 30).map(x => setItem(x.cat, x.title || setName(x.cat), setName(x.cat) + (x.hint ? ' · ' + x.hint : ''), () => openSetCat(x.cat, x.r))))
      : h('p', {class:'gnote', style:'padding:10px 4px'}, `Nothing matches "${q.value.trim()}".`));
  };
  q.oninput = paint; paint();
  home.replaceChildren(q, list);
  if (from && document.body.classList.contains('tv') && !$('#settings').hidden) requestAnimationFrame(() => { const b = list.querySelector(`.setitem[data-cat="${from}"]`); if (b) b.focus(); });   // back on the section you came from
}
function openSetCat(c, row){
  if (!SET_CATS.some(x => x[0] === c)) return;
  if (!layersOpen.includes('setsub')) pushLayer('setsub');
  setCatNow = c;
  $('#setHome').hidden = true; $('#settings').classList.add('insub');
  for (const el of document.querySelectorAll('#settings .setcat')) el.hidden = el.dataset.cat !== c;
  $('#setBack').hidden = false; $('#setTitle').textContent = setName(c);
  const pad = $('#settings>.pad'); if (pad) pad.scrollTop = 0; window.scrollTo(0, 0);
  if (c === 'spaces') spacesList();
  if (c === 'storage') storageInfo();
  if (c === 'about') aboutInfo();
  if (c === 'tmdb') $('#adSum').textContent = `${addons.length} installed · install, remove and reorder the sources for your catalogs and streams`;
  requestAnimationFrame(() => {
    if (row) { row.scrollIntoView({block:'center'}); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1600); }
    if (document.body.classList.contains('tv')) { const f = (row || document.querySelector(`#settings .setcat[data-cat="${c}"]`)).querySelector('button:not([disabled]),input,select,textarea,summary'); if (f) f.focus({preventScroll:!!row}); }
  });
}
const setCat = c => openSetCat(c);
function settingsPlus(){
  const tv = document.body.classList.contains('tv'), u = uiGet();
  $('#setBack').onclick = () => popLayer('setsub');
  if (setCatWant) { const c = setCatWant; setCatWant = null; openSetCat(c); }
  else if (setCatNow && layersOpen.includes('setsub')) openSetCat(setCatNow);
  else showSetHome();

  /* General */
  const stS = $('#setStart'), stSp = $('#setStartSp');
  stS.value = u.startup || 'last';
  stSp.replaceChildren(...spaces.map(s => h('option', {value:s.id}, `${s.emoji} ${s.name}`))); stSp.value = u.startSpace && spaces.some(s => s.id === u.startSpace) ? u.startSpace : (spaces[0] || {}).id || '';
  $('#rowStartSp').hidden = stS.value !== 'space';
  stS.onchange = () => { uiSet({startup:stS.value, startSpace:stSp.value}); $('#rowStartSp').hidden = stS.value !== 'space'; };
  stSp.onchange = () => uiSet({startSpace:stSp.value});
  const ask = $('#setAsk'); $('#rowAsk').hidden = profiles.length < 2;
  ask.checked = localStorage.getItem('streamlet.profile.ask') !== '0';
  ask.onchange = () => { try { localStorage.setItem('streamlet.profile.ask', ask.checked ? '1' : '0'); } catch {} };
  const th = $('#setTheme');
  th.replaceChildren(h('option', {value:'space'}, 'Follow each space'), ...Object.entries(THEMES).map(([k, t]) => h('option', {value:k}, t.n || k)));
  th.value = u.theme && THEMES[u.theme] ? u.theme : 'space';
  th.onchange = () => { uiSet({theme:th.value}); applyTheme(spaceTheme(cur)); };
  const ml = $('#setMetaLang');
  ml.replaceChildren(...[['', 'English (default)'], ['fr-CA', 'Français (Canada)'], ['fr-FR', 'Français (France)'], ['es-ES', 'Español'], ['es-MX', 'Español (México)'], ['pt-BR', 'Português (Brasil)'],
    ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['ja-JP', '日本語'], ['ko-KR', '한국어']].map(([v, n]) => h('option', {value:v}, n)));
  ml.value = u.metaLang || '';
  ml.onchange = () => { uiSet({metaLang:ml.value}); try { tmMineMem.clear(); } catch {} toast('Rows and title pages use it as they load'); };
  const rg = $('#setRegion');
  rg.replaceChildren(...[['CA', 'Canada'], ['US', 'United States'], ['GB', 'United Kingdom'], ['FR', 'France'], ['BE', 'Belgium'], ['CH', 'Switzerland'], ['AU', 'Australia'], ['IE', 'Ireland'],
    ['NZ', 'New Zealand'], ['MX', 'Mexico'], ['ES', 'Spain'], ['DE', 'Germany'], ['IT', 'Italy'], ['BR', 'Brazil'], ['JP', 'Japan']].map(([v, n]) => h('option', {value:v}, n)));
  rg.value = u.region || 'CA';
  rg.onchange = () => { uiSet({region:rg.value}); TM_REGION = rg.value; toast('Fully applies the next time the app starts'); };

  /* Playback */
  const rs = $('#setRemSrc'); rs.checked = u.remSrc !== false; rs.onchange = () => uiSet({remSrc:rs.checked});
  const re = $('#setResume'); re.checked = u.resume !== false; re.onchange = () => uiSet({resume:re.checked});

  /* Personalization */
  for (const [id, k] of [['#setRowHero', 'hero'], ['#setRowCW', 'cw'], ['#setRowBYW', 'byw'], ['#setRowWL', 'wl'], ['#setRowRec', 'rec'], ['#setRowFav', 'fav']]) {
    const el = $(id); el.checked = rowOn(k);
    el.onchange = () => { uiSet({rows:{...(uiGet().rows || {}), [k]:el.checked}}); homeDirty(); };
  }

  /* Content */
  const mr = $('#setMinRate'); mr.value = String(u.minRate || 0); if (!mr.value) mr.value = '0';
  mr.onchange = () => { uiSet({minRate:+mr.value}); homeDirty(); };
  chipSet('#setHideG', SG.map(g => [g.n, g.n]), 'hideG');
  chipSet('#setLangs', SLANGS, 'langs');
  chipSet('#setFavG', SG.map(g => [g.n, g.n]), 'favG');

  /* Notifications */
  const nt = {ep:true, season:true, wl:true, sys:false, ...(u.nt || {})};
  for (const [id, k] of [['#setNtEp', 'ep'], ['#setNtSeason', 'season'], ['#setNtWl', 'wl']]) { const el = $(id); el.checked = nt[k]; el.onchange = () => uiSet({nt:{...(uiGet().nt || {}), [k]:el.checked}}); }
  const sys = $('#setNtSys'), canSys = 'Notification' in window && !nativePlayer();
  $('#rowNtSys').hidden = !canSys;
  sys.checked = canSys && nt.sys && Notification.permission === 'granted';
  sys.onchange = async () => {
    if (sys.checked) { let p = Notification.permission; if (p === 'default') p = await Notification.requestPermission(); if (p !== 'granted') { sys.checked = false; toast('Notifications are blocked for this site in your browser'); } }
    uiSet({nt:{...(uiGet().nt || {}), sys:sys.checked}});
  };
  const last = pget('notifiedAt', 0); $('#ntLast').textContent = last ? 'Last checked ' + new Date(last).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Notices appear when you open a space';
  $('#ntNow').onclick = async () => { if (!cur) { toast('Open a space first'); return; } const n = await notifyCheck(true); toast(n ? `${n} new notice${n > 1 ? 's' : ''}` : 'Nothing new right now'); };

  /* TMDB, storage, backup */
  $('#stClrTm').onclick = () => { let n = 0; for (const k of Object.keys(localStorage)) if (/^streamlet\.(tmcur|tmfind|tmids|tmimdb|tmlists|eotm\.|eochk|wlrel)/.test(k)) { localStorage.removeItem(k); n++; } try { tmMineMem.clear(); } catch {} toast(n ? 'TMDB data cleared' : 'Nothing saved yet'); };
  $('#stClrData').onclick = async () => { try { await caches.delete(DCACHE); } catch {} try { warmC.clear(); } catch {} storageInfo(); toast('Cleared'); homeDirty(); };
  $('#stClrTmp').onclick = () => { for (const k of ['streamlet.badsrc', 'streamlet.errlog', 'streamlet.syslog']) localStorage.removeItem(k); try { badStreams.clear(); } catch {} storageInfo(); toast('Cleared'); };
  $('#fbOut').onclick = fullBackupOut;
  $('#fbIn').onclick = () => $('#fbFile').click();
  $('#fbFile').onchange = e => { fullBackupIn(e.target.files[0]); e.target.value = ''; };
  $('#spNew').onclick = () => editSpace(null);
  /* Downloads (phone app) */
  $('#rowDl').hidden = $('#rowDlWifi').hidden = !dlOn();
  if (dlOn()) {
    const d = dlAll(), done = d.filter(x => x.status === 'done'), bytes = done.reduce((n, x) => n + (x.total || 0), 0);
    $('#dlUse').textContent = d.length ? `${done.length} ready${d.length > done.length ? ` · ${d.length - done.length} in progress` : ''}${bytes ? ' · ' + dlFmt(bytes) : ''}` : 'Movies and episodes saved on this phone';
    $('#dlOpen').onclick = openDownloads;
    const w = $('#setDlWifi'); w.checked = dlWifi(); w.onchange = () => uiSet({dlWifi:w.checked});
  }
}
let homeDirtyT = 0;
function homeDirty(){ clearTimeout(homeDirtyT); homeDirtyT = setTimeout(() => { try { if (cur && !$('#home').hidden) renderHome(); } catch {} }, 300); }   // Home redraws with the new settings when you go back to it
/* a row of toggle chips stored as a list in streamlet.ui */
function chipSet(sel, items, key){
  const box = $(sel), have = new Set(uiGet()[key] || []);
  box.replaceChildren(...items.map(([v, n]) => {
    const b = h('button', {class:'chip' + (have.has(v) ? ' on' : ''), type:'button', 'aria-pressed':have.has(v) ? 'true' : 'false'}, n);
    b.onclick = () => {
      const s = new Set(uiGet()[key] || []); if (s.has(v)) s.delete(v); else s.add(v);
      uiSet({[key]:[...s]}); b.classList.toggle('on', s.has(v)); b.setAttribute('aria-pressed', s.has(v) ? 'true' : 'false'); homeDirty();
    };
    return b;
  }));
}

/* ---- Spaces: order, visibility, edit ---- */
function spacesList(){
  const box = $('#spList'); if (!box) return;
  const mine = spacesFor();
  const move = (id, d) => { const i = spaces.findIndex(s => s.id === id), j = i + d; if (i < 0 || j < 0 || j >= spaces.length) return; [spaces[i], spaces[j]] = [spaces[j], spaces[i]]; saveSpaces(); launcherDirty = true; spacesList(); requestAnimationFrame(() => { const b = box.querySelector(`[data-sp="${id}"] .${d < 0 ? 'up' : 'dn'}`); if (b && !b.disabled) b.focus(); else { const r = box.querySelector(`[data-sp="${id}"] button:not([disabled])`); if (r) r.focus(); } }); };
  box.replaceChildren(...mine.map((s, i) => {
    const t = THEMES[s.theme] || THEMES.ember, n = s.catalogs.filter(id => addons.find(x => x.uid === id)).length;
    const show = h('input', {type:'checkbox'}); show.checked = !s.hidden;
    show.onchange = () => { const sp = spaces.find(x => x.id === s.id); if (!sp) return; if (!show.checked && spaces.filter(x => !x.hidden).length <= 1) { show.checked = true; toast('Keep at least one space visible'); return; } sp.hidden = !show.checked; saveSpaces(); launcherDirty = true; spacesList(); };
    return h('div', {class:'sprow' + (s.hidden ? ' off' : ''), 'data-sp':s.id},
      h('span', {class:'spsw', style:`background:linear-gradient(135deg,${t.acc},${t.acc2 || t.acc})`}),
      h('span', {class:'rt'}, `${s.emoji} ${s.name}`, h('small', null, [s.catalogs.length ? `${n} addon${n === 1 ? '' : 's'}` : 'All addons', s.kids ? 'For kids' : '', s.subs && s.subs !== 'off' ? 'Own subtitles' : '', s.hidden ? 'Hidden' : ''].filter(Boolean).join(' · '))),
      h('span', {class:'spbtns'},
        h('button', {class:'btn ghost sm ic up', type:'button', 'aria-label':'Move up', disabled:i === 0 ? '' : null, onclick:() => move(s.id, -1)}, '↑'),
        h('button', {class:'btn ghost sm ic dn', type:'button', 'aria-label':'Move down', disabled:i === mine.length - 1 ? '' : null, onclick:() => move(s.id, 1)}, '↓'),
        h('label', {class:'spshow'}, show, h('span', null, 'Show')),
        h('button', {class:'btn ghost sm', type:'button', onclick:() => editSpace(s.id)}, 'Edit')));
  }));
}

/* ---- Storage ---- */
async function storageInfo(){
  const el = $('#stUse'); if (!el) return;
  const mb = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  let ls = 0; for (const k of Object.keys(localStorage)) if (k.startsWith('streamlet')) ls += (k.length + (localStorage.getItem(k) || '').length) * 2;
  let rows = 0; try { rows = (await (await caches.open(DCACHE)).keys()).length; } catch {}
  let total = ''; try { const e = await navigator.storage.estimate(); if (e && e.usage) total = ' · ' + mb(e.usage) + ' in all'; } catch {}
  el.textContent = `Settings, lists and history ${mb(ls)} · ${rows} saved rows and pages${total}`;
}
function fullBackupOut(){
  const data = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith('streamlet.') && !/^streamlet\.(errlog|syslog|badsrc)$/.test(k)) data[k] = localStorage.getItem(k);
  const a = h('a', {href:URL.createObjectURL(new Blob([JSON.stringify({app:'streamlet', kind:'full', v:1, at:Date.now(), data})], {type:'application/json'})), download:`streamlet-full-backup-${new Date().toISOString().slice(0, 10)}.json`});
  document.body.append(a); a.click(); a.remove(); toast('Full backup saved');
}
let fbArmed = null;
function fullBackupIn(file){
  if (!file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt); if (!d || d.app !== 'streamlet' || d.kind !== 'full' || !d.data) throw 0;
    const n = Object.keys(d.data).length, b = $('#fbIn');
    fbArmed = d; b.textContent = `Replace everything (${n} items)?`; b.classList.add('warn');
    setTimeout(() => { if (fbArmed === d) { fbArmed = null; b.textContent = 'Restore'; b.classList.remove('warn'); } }, 10000);
    b.onclick = () => {
      if (fbArmed !== d) { $('#fbFile').click(); return; }
      for (const k of Object.keys(localStorage)) if (k.startsWith('streamlet.')) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(d.data)) if (k.startsWith('streamlet.')) try { localStorage.setItem(k, v); } catch {}
      toast('Restored. Restarting…'); setTimeout(() => location.reload(), 900);
    };
  }).catch(() => toast('That is not a Streamlet full backup (for watch history files, use Watch history backup)'));
}

/* ---- About ---- */
function aboutInfo(){
  const tv = document.body.classList.contains('tv'), N = nativePlayer();
  const kind = N ? (tv ? 'Android TV app' : 'Android app') : (matchMedia('(display-mode: standalone)').matches ? 'Installed web app' : 'Web');
  const info = [['Device', kind], ['Screen', `${innerWidth} × ${innerHeight}`], ['Profiles', String(profiles.length)], ['Spaces', String(spaces.length)], ['Addons', String(addons.length)],
    ['Account', user ? 'Signed in, synced' : 'This device only']];
  $('#abInfo').replaceChildren(...info.map(([k, v]) => h('div', {class:'abrow'}, h('span', null, k), h('b', null, v))));
  $('#abCred').replaceChildren(
    h('p', null, h('b', null, 'TMDB. '), 'Titles, artwork, lists and release dates come from The Movie Database. This product uses the TMDB API but is not endorsed or certified by TMDB.'),
    h('p', null, h('b', null, 'Your addons. '), 'Catalogs, streams and subtitles come from the addons you installed: ', addons.map(a => `${an(a)}${a.manifest && a.manifest.version ? ' ' + a.manifest.version : ''}`).join(', ') || 'none yet', '.'),
    h('p', null, h('b', null, 'Built with '), 'Media3 ExoPlayer and VLC (Android player), Capacitor, Firebase (sync). Skip times from IntroDB and AniSkip when available.'),
    h('p', {class:'muted'}, 'Streamlet does not host or provide any content.'));
}

/* ---- Notifications: new episodes, returning seasons, watchlist releases ---- */
let ntT = 0;
function notifySoon(){ clearTimeout(ntT); ntT = setTimeout(() => notifyCheck(false).catch(() => {}), 4000); }
async function notifyCheck(force){
  if (!profile || !cur) return 0;
  const u = uiGet(), nt = {ep:true, season:true, wl:true, sys:false, ...(u.nt || {})};
  if (!nt.ep && !nt.season && !nt.wl) return 0;
  if (!force && Date.now() - pget('notifiedAt', 0) < 20 * 60e3) return 0;      // at most every 20 minutes
  const seen = pget('notified', {}), out = [];
  if (nt.ep || nt.season) for (const x of await heroFind(cur)) {
    if ((x.rank === 0 && !nt.ep) || (x.rank === 1 && !nt.season)) continue;
    const key = x.m.id + '|' + x.tag; if (seen[key]) continue;
    out.push({key, name:x.m.name, tag:x.tag, img:x.m.poster, open:() => openDetail(x.a, 'series', x.m)});
  }
  const tk = lsGet('streamlet.tmdb', '');
  if (nt.wl && tk) {
    const rel = lsGet('streamlet.wlrel', {}), now = Date.now();
    for (const e of wlHere().filter(x => x.type === 'movie' && /^tt\d+$/.test(x.itemId)).slice(0, 15)) {
      let r = rel[e.itemId];
      if (!r || now - r.t > 864e5) {
        try {
          const f = await tmdbGet(`/find/${e.itemId}?external_source=imdb_id`, tk), mv = (f.movie_results || [])[0];
          let d = mv && mv.release_date || '';
          if (mv) { try { const rd = await tmdbGet(`/movie/${mv.id}/release_dates`, tk); const pick = reg => ((rd.results || []).find(x => x.iso_3166_1 === reg) || {}).release_dates || []; const dig = [...pick(TM_REGION), ...pick('US')].filter(x => x.type === 4 || x.type === 5).map(x => x.release_date).sort()[0]; if (dig) d = dig; } catch {} }
          r = rel[e.itemId] = {t:now, d};
        } catch { continue; }
      }
      const day = r.d ? Date.parse(r.d) : 0;
      if (!day || day > now || now - day > 45 * 864e5) continue;
      const key = e.itemId + '|out'; if (seen[key]) continue;
      out.push({key, name:e.name, tag:'Now available', img:e.poster, open:() => openWL(e)});
    }
    lsSet('streamlet.wlrel', rel);
  }
  pset('notifiedAt', Date.now());
  if (!out.length) return 0;
  for (const x of out) seen[x.key] = Date.now();
  pset('notified', Object.fromEntries(Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 300)));
  ntShow(out);
  if (nt.sys && 'Notification' in window && Notification.permission === 'granted' && document.hidden !== false) for (const x of out.slice(0, 3)) try { new Notification(x.name, {body:x.tag, icon:x.img || 'logo.svg'}); } catch {}
  return out.length;
}
function ntShow(list){
  const old = $('#ntCard'); if (old) old.remove();
  const tv = document.body.classList.contains('tv');
  const card = h('div', {id:'ntCard', class:'ntcard', role:'status'},
    h('div', {class:'nthd'}, h('b', null, 'New for you'), tv ? null : h('button', {class:'x', type:'button', 'aria-label':'Close', onclick:() => card.remove()}, '✕')),
    ...list.slice(0, 3).map(x => h(tv ? 'div' : 'button', {class:'ntit', type:tv ? null : 'button', onclick:tv ? null : () => { card.remove(); x.open(); }},
      x.img ? h('img', {src:x.img, alt:''}) : h('span', {class:'ntimg'}), h('span', null, h('b', null, x.name), h('small', null, x.tag)))),
    list.length > 3 ? h('p', {class:'ntmore'}, `and ${list.length - 3} more`) : null);
  document.body.append(card);
  setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 400); }, tv ? 9000 : 12000);
}

/* ---- Personalization: a row from your preferred genres ---- */
async function favRow(box, tok, tab){
  const u = uiGet(), fav = (u.favG || []).map(n => SG.find(g => g.n === n)).filter(Boolean), tk = lsGet('streamlet.tmdb', '');
  if (!rowOn('fav') || !fav.length || !tk || isKid()) return;
  const strip = h('div', {class:'strip'}), sec = h('div', {class:'row'}, h('h2', null, 'Your genres ', h('small', null, '· ' + fav.map(g => g.n).join(', '))), strip);
  box.append(sec);
  const mv = [...new Set(fav.flatMap(g => g.mv))], tv = [...new Set(fav.flatMap(g => g.tv))];
  const q = (kind, ids) => ids.length ? tmdbGet(`/discover/${kind}?with_genres=${ids.join('|')}&sort_by=popularity.desc&vote_count.gte=150&include_adult=false`, tk).then(r => (r.results || []).filter(x => x.poster_path).slice(0, 14)) : Promise.resolve([]);
  try {
    const [m, t] = await Promise.all([tab === 'series' ? [] : q('movie', mv), tab === 'movie' ? [] : q('tv', tv)]);
    const mix = []; for (let i = 0; i < Math.max(m.length, t.length); i++) { if (m[i]) mix.push([m[i], 'movie']); if (t[i]) mix.push([t[i], 'tv']); }
    const metas = (await Promise.all(mix.slice(0, 20).map(([x, k]) => tmPreview(x, k).catch(() => null)))).filter(x => x && visibleMeta(x, x.type));
    if (tok !== homeTok) return;
    if (!metas.length) { sec.remove(); return; }
    for (const m2 of metas) {
      const a = addons.find(x => supports(x, 'meta', m2.type, m2.id)) || spaceAddons()[0]; if (!a) continue;
      const btn = h('button', {class:'card', onclick:() => openDetail(a, m2.type, m2)}, posterEl(m2), h('div', {class:'t'}, m2.name), h('div', {class:'s'}, m2.releaseInfo || ''));
      attachHold(btn, {itemId:m2.id, type:m2.type, name:m2.name, poster:m2.poster, background:m2.background, addonId:a.uid, _item:m2});
      strip.append(btn);
    }
  } catch { sec.remove(); }
}
