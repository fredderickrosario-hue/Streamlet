/* ---------- TV search page with its own on-screen keyboard (the TV's keyboard is slow) ---------- */
let sQuery = '', sT = 0;
const KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
function sPaint(){ const t = $('#stext'); t.textContent = sQuery; t.classList.toggle('ph', !sQuery); if (!sQuery) t.textContent = 'Search ' + (cur ? cur.name : '') + '…'; }

/* recent searches (per profile) */
const recentKey = () => 'streamlet.recent.' + (profile ? profile.id : 'x');
const recentGet = () => { const v = lsGet(recentKey(), []); return Array.isArray(v) ? v : []; };
function recentAdd(q){
  q = String(q || '').trim(); if (q.length < 2) return;
  lsSet(recentKey(), [q, ...recentGet().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 10));
  if (!$('#search').hidden) srPaint();
}
function srPaint(){
  const box = $('#srecent'), list = recentGet(); box.replaceChildren();
  if (!list.length) return;
  box.append(h('div', {class:'srhead'}, h('span', null, 'Recent searches'), h('button', {class:'srclear', type:'button', onclick:() => { lsSet(recentKey(), []); srPaint(); }}, 'Clear')));
  for (const q of list) box.append(h('button', {class:'srq', type:'button', onclick:() => { sQuery = q; sPaint(); clearTimeout(sT); renderHome(q, $('#sres')); }}, h('i', {class:'srico', 'aria-hidden':'true'}), h('span', null, q)));
}
/* what to watch next, from what has been watched: titles like your last few */
const recsCache = new Map();
async function renderRecs(box, tok){
  box.replaceChildren(h('h2', {class:'rhead'}, 'Recommended for you'), h('p', {class:'hint'}, 'Looking for titles you might like…'));
  const seeds = []; const seen = new Set();
  for (const e of [...histGet(), ...wdGet().map(x => ({itemId:x.itemId, itemType:x.type, name:x.name}))]) {
    const id = e.itemId; if (!id || seen.has(id)) continue; seen.add(id); seeds.push(e); if (seeds.length >= 3) break;
  }
  if (!seeds.length) { box.replaceChildren(h('div', {class:'empty', style:'padding-top:8vh'}, 'Type to search your addons. Recommendations appear here once you have watched something.')); return; }
  const sections = [];
  await Promise.all(seeds.map(async (e, i) => {
    try {
      const key = e.itemId; let list = recsCache.get(key);
      if (!list) {
        const a = addons.find(x => x.uid === e.addonId || x.manifest.id === e.addonId) || spaceAddons()[0] || addons[0], type = e.itemType || e.type;
        const ma = a && (supports(a, 'meta', type, e.itemId) ? a : addons.find(x => supports(x, 'meta', type, e.itemId)));
        let meta = {id:e.itemId, type, name:e.name}; if (ma) { const r = await getJSON(`${ma.base}/meta/${type}/${enc(e.itemId)}.json`); meta = {...meta, ...r.meta}; }
        list = (await findSimilar(a, type, meta)).slice(0, 12); recsCache.set(key, list);
      }
      sections[i] = {name:e.name, list};
    } catch {}
  }));
  if (tok !== sTok) return;
  const out = [h('h2', {class:'rhead'}, 'Recommended for you')];
  for (const sec of sections) {
    if (!sec || !sec.list.length) continue;
    const grid = h('div', {class:'rgrid'});
    for (const it of sec.list) {
      const {m, a, type} = it, btn = h('button', {class:'card', type:'button', onclick:() => openDetail(a, type, m)}, posterEl(m), h('div', {class:'t'}, m.name), h('div', {class:'s'}, m.releaseInfo || m.year || ''));
      attachHold(btn, {itemId:m.id, type, name:m.name, poster:m.poster, background:m.background, addonId:a.uid, _item:m});
      grid.append(btn);
    }
    out.push(h('div', {class:'rsep'}, 'Because you watched ' + sec.name), grid);
  }
  box.replaceChildren(...(out.length > 1 ? out : [h('div', {class:'empty', style:'padding-top:8vh'}, 'Type to search your addons.')]));
}
let sTok = 0;
function sRun(){
  clearTimeout(sT); const tok = ++sTok;
  sT = setTimeout(() => {
    const box = $('#sres');
    if (!sQuery.trim()) { homeTok++; renderRecs(box, tok); return; }
    renderHome(sQuery.trim(), box);
  }, 450);
}
function sType(c){ sQuery += c; sPaint(); sRun(); }
function sBack(){ sQuery = sQuery.slice(0, -1); sPaint(); sRun(); }
function renderSearch(){
  const g = $('#kgrid');
  if (!g.children.length) {
    for (const k of KEYS) g.append(h('button', {class:'kkey', type:'button', onclick:() => sType(k)}, k));
    g.append(h('button', {class:'kkey wide', type:'button', onclick:() => sType(' ')}, 'space'),
             h('button', {class:'kkey wide', type:'button', onclick:sBack}, '⌫ delete'),
             h('button', {class:'kkey wide', type:'button', onclick:() => { sQuery = ''; sPaint(); sRun(); }}, 'clear'));
  }
  sPaint(); srPaint(); sRun();
}
function navAvatar(){
  const b = $('#tabMe'); if (!b || !profile) return;
  let w = b.querySelector('.navav');
  if (!w) { w = h('span', {class:'navav'}); const sv = b.querySelector('svg'); if (sv) sv.replaceWith(w); else b.prepend(w); }
  w.replaceChildren(avatarEl(profile, 26));
}

/* ---------- TV / remote control ---------- */
const mqTV = matchMedia('(min-width:1000px) and (orientation:landscape), (min-width:560px) and (max-height:620px) and (orientation:landscape)');
let remoteMode = FLAVOR === 'tv', forceTV = false;
const isTVDevice = () => FLAVOR === 'tv' ? true : FLAVOR === 'phone' ? false : forceTV || mqTV.matches || /Tizen|SMART-?TV|Web0S|AFTT|BRAVIA|Android TV|CrKey|GoogleTV/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('tv');
function syncTV(){
  const tv = isTVDevice(), was = document.body.classList.contains('tv'); document.body.classList.toggle('tv', tv);
  const z = !tv ? 1 : innerWidth >= 1280 ? Math.min(2, innerWidth / 1280) : Math.max(0.62, innerWidth / 1100);
  document.documentElement.style.zoom = tv ? String(z) : '';
  document.documentElement.style.setProperty('--vh', (innerHeight / z / 100) + 'px');
  if (tv !== was) { try { if (cur && !$('#home').hidden && !document.body.classList.contains('launch')) renderHome(); } catch {} }
  if (tv) { remoteMode = true; document.body.classList.add('remote'); }
  try { applyUI(); movePill(); } catch {}
  const v = $('#vid'); if (v && !$('#player').hidden) { v.controls = !tv; $('#pctl').hidden = !tv; }
}
mqTV.addEventListener('change', syncTV); addEventListener('resize', syncTV); syncTV();
{ const NP = nativePlayer(); if (NP && FLAVOR === 'auto') NP.device().then(d => { forceTV = !!(d && d.isTV); syncTV(); }).catch(() => {}); }
try { if (window.tizen && tizen.tvinputdevice) ['MediaPlayPause','MediaPlay','MediaPause','MediaStop','MediaFastForward','MediaRewind','Info','ColorF0Red','ColorF2Yellow'].forEach(k => { try { tizen.tvinputdevice.registerKey(k); } catch {} }); } catch {}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
function ctxRoot(){
  for (const id of ['#loadov', '#exitDlg', '#updDlg', '#menu', '#ppanel', '#player', '#addonEd', '#profEd', '#spaceEd', '#episode', '#detail']) { const e = $(id); if (e && !e.hidden) return e; }
  return document.body;
}
function focusables(root){
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => {
    if (el.tabIndex < 0 || el.closest('.off,[hidden]') || el.closest('#vid')) return false;
    const dt = el.closest('details'); if (dt && !dt.open && !(el.tagName === 'SUMMARY' && el.parentElement === dt)) return false;      // content of a closed <details> is not reachable
    if (el.style.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2;
  });
}
let lastContentEl = null;
document.addEventListener('focusin', e => { if (e.target.closest && !e.target.closest('#nav')) lastContentEl = e.target; });
function focusNav(){
  const b = [...document.querySelectorAll('#nav button.on:not(.gone)')].find(x => x.offsetParent) || $('#tabHome');   // a hidden tab (Addons on TV) can't take focus
  if (b) { b.focus({preventScroll:true}); return true; }
  return false;
}
/* ---------- remote navigation: predictable lines instead of "nearest thing on screen" ----------
   A screen is a stack of lines. A line is a row of cards (one strip, even the cards scrolled off it) or the controls that sit side by side.
   Left / Right walk along the line; past its start, Left opens the side menu. Up / Down go to the line above / below and land on
   the card you last had in that row, or the one under where you were. Columns (side menu, search keyboard, search results) keep
   Up / Down to themselves; Left / Right cross between them. */
const ROW_SEL = '.strip,.dacts2,.srow,.sfilter,.eplist,.slist,.cchips,.dsim,.tbtns,.dptabs,.rrow';
const ZONE_SEL = '#nav,#search .skb,#search .sres,#profEd .pecol,#spaceEd .sedcol';
const zoneMem = new WeakMap();                                            // column -> where you were in it
const rowMem = new WeakMap();                                             // row -> the card you were on
let navEl = null, navVert = false;                                         // the card that set the column you are travelling down (kept across short lines)
document.addEventListener('focusin', e => {
  const el = e.target; if (!el || !el.closest) return;
  const row = el.closest(ROW_SEL); if (row) rowMem.set(row, el);
  const zone = el.closest(ZONE_SEL); if (zone) zoneMem.set(zone, el);
  if (!navVert) navEl = el;
});
const midX = r => (r.left + r.right) / 2, midY = r => (r.top + r.bottom) / 2;
function navLines(list){
  const rows = new Map(), loose = [];
  for (const el of list) {
    const row = el.closest(ROW_SEL);
    if (row) { if (!rows.has(row)) rows.set(row, {row, els:[]}); rows.get(row).els.push(el); }
    else loose.push({el, r:el.getBoundingClientRect()});
  }
  const lines = [];
  for (const L of rows.values()) { const r = L.els[0].getBoundingClientRect(); L.y = midY(r); L.top = r.top; L.bottom = r.bottom; lines.push(L); }
  loose.sort((p, q) => midY(p.r) - midY(q.r));
  let band = null;
  for (const x of loose) {
    const y = midY(x.r);
    if (band && y >= band.top && y <= band.bottom) { band.els.push(x.el); band.top = Math.min(band.top, x.r.top); band.bottom = Math.max(band.bottom, x.r.bottom); continue; }
    band = {row:null, els:[x.el], y, top:x.r.top, bottom:x.r.bottom}; lines.push(band);
  }
  lines.sort((p, q) => p.y - q.y);
  for (const L of lines) if (!L.row) L.els.sort((p, q) => midX(p.getBoundingClientRect()) - midX(q.getBoundingClientRect()));
  return lines;
}
/* where Up / Down lands in a line */
function navLand(L, x, fromRow){
  if (L.row) {
    if (L.row.matches('.eplist') && L.row !== fromRow) { const p = L.els.find(e => e.matches('.ep[data-pref]')); if (p) return p; }   // episode rows: the first one not watched
    const m = rowMem.get(L.row); if (m && m.isConnected && L.els.includes(m)) return m;
    const sr = L.row.getBoundingClientRect();
    const shown = L.els.filter(e => { const r = e.getBoundingClientRect(); return r.right > sr.left + 4 && r.left < sr.right - 4; });
    const pool = shown.length ? shown : L.els;
    return pool.reduce((b, e) => Math.abs(midX(e.getBoundingClientRect()) - x) < Math.abs(midX(b.getBoundingClientRect()) - x) ? e : b, pool[0]);
  }
  let best = L.els[0], bd = Infinity;
  for (const e of L.els) { const r = e.getBoundingClientRect(), d = x >= r.left && x <= r.right ? -1 : Math.abs(midX(r) - x); if (d < bd) { bd = d; best = e; } }
  return best;
}
/* the other columns of this screen (never the side menu) */
const navZones = (root, list) => [...new Set(list.map(e => e.closest(ZONE_SEL)).filter(z => z && !z.matches('#nav') && root.contains(z)))];
function zoneEnter(z, list, y, x){                                         // back where you were in that column, or the item level with you
  const els = list.filter(e => z.contains(e)); if (!els.length) return null;
  const m = zoneMem.get(z); if (m && m.isConnected && els.includes(m)) return m;
  if (y == null) return navLines(els)[0] ? navLand(navLines(els)[0], x, null) : els[0];
  return els.reduce((b, e) => { const r = e.getBoundingClientRect(), d = Math.abs(midY(r) - y) * 3 + Math.abs(midX(r) - x); return !b || d < b.d ? {e, d} : b; }, null).e;
}
function navGo(t, dir, rep, revealIt, edge){
  t.focus({preventScroll:true});
  if (revealIt) revealEl(t, dir, rep, document.body.classList.contains('tv') && ctxRoot() === document.body, edge);
}
function moveFocus(dir, rep){
  const root = ctxRoot(), cur = document.activeElement, body = root === document.body;
  const tv = document.body.classList.contains('tv') && body, inNav = !!(tv && cur && cur.closest && cur.closest('#nav'));
  let list = focusables(root);
  if (!cur || cur === document.body || !list.includes(cur)) { const f = firstFocus(root, inNav ? list : list.filter(e => !e.closest('#nav'))); if (f) f.focus({preventScroll:true}); return; }
  const zone = cur.closest(ZONE_SEL), zoneList = zone ? list.filter(e => zone.contains(e)) : list.filter(e => !e.closest(ZONE_SEL));
  const lines = navLines(zoneList), li = lines.findIndex(L => L.els.includes(cur)), L = lines[li];
  const cr = cur.getBoundingClientRect();
  if (dir === 'left' || dir === 'right') {
    navVert = false;
    const i = L.els.indexOf(cur), t = L.els[i + (dir === 'right' ? 1 : -1)];
    if (t) { navGo(t, dir, rep, !inNav, null); return; }
    /* end of the line: cross to the next column */
    if (inNav) {
      if (dir === 'right') { const content = list.filter(e => !e.closest('#nav')); const back = lastContentEl && lastContentEl.isConnected && content.includes(lastContentEl) ? lastContentEl : firstFocus(root, content); if (back) back.focus({preventScroll:true}); }
      return;
    }
    {                                                                      // the next column over (search keyboard / results, editor columns)
      const zr = (zone || cur).getBoundingClientRect();
      const side = navZones(root, list).filter(z => z !== zone).map(z => ({z, r:z.getBoundingClientRect()}))
        .filter(({r}) => (dir === 'right' ? r.left >= zr.right - 8 : r.right <= zr.left + 8) && r.bottom > cr.top - 40 && r.top < cr.bottom + 40)
        .sort((a, b) => dir === 'right' ? a.r.left - b.r.left : b.r.right - a.r.right)[0];
      if (side) { const t2 = zoneEnter(side.z, list, midY(cr), midX(cr)); if (t2) { navGo(t2, dir, rep, true, null); return; } }
    }
    if (root.id === 'episode' && document.body.classList.contains('tv') && cur.closest('.dleft') && root._step) { root._step(dir === 'right' ? 1 : -1); return; }   // episode page: previous / next episode
    if (tv && dir === 'left') focusNav();
    return;
  }
  /* Up / Down: the next line, same column */
  let N = lines[li + (dir === 'down' ? 1 : -1)];
  const cols = inNav ? [] : navZones(root, list).filter(z => z !== zone && !(zone && zone.matches('#search .skb, #search .sres') && z.matches('#search .skb, #search .sres')));
  if (!inNav && (!zone || !N)) {                                            // a column below / above may be nearer than the next line: enter it (the left one first)
    const ref = zone && !N ? zone.getBoundingClientRect() : cr;
    const zs = cols.map(z => ({z, r:z.getBoundingClientRect()})).filter(({r}) => dir === 'down' ? r.top >= ref.bottom - 8 : r.bottom <= ref.top + 8);
    const nearest = zs.length ? zs.reduce((b, c) => (dir === 'down' ? c.r.top < b.r.top - 40 || (Math.abs(c.r.top - b.r.top) <= 40 && c.r.left < b.r.left) : c.r.bottom > b.r.bottom + 40 || (Math.abs(c.r.bottom - b.r.bottom) <= 40 && c.r.left < b.r.left)) ? c : b) : null;
    const nY = N ? N.y : null;
    if (nearest && (nY == null || (dir === 'down' ? nearest.r.top < nY : nearest.r.bottom > nY))) { const t2 = zoneEnter(nearest.z, list, null, nearest.r.left); if (t2) { navGo(t2, dir, rep, true, null); return; } }
    if (zone && !N) {                                                       // the end of a column: carry on into whatever is above / below it on the page
      const outer = list.filter(e => !e.closest(ZONE_SEL)).map(e => ({e, r:e.getBoundingClientRect()})).filter(({r}) => dir === 'down' ? r.top >= ref.bottom - 4 : r.bottom <= ref.top + 4);
      if (outer.length) { const best = outer.reduce((b, c) => (dir === 'down' ? c.r.top < b.r.top - 4 : c.r.bottom > b.r.bottom + 4) || (Math.abs(c.r.top - b.r.top) <= 4 && Math.abs(midX(c.r) - midX(cr)) < Math.abs(midX(b.r) - midX(cr))) ? c : b); navGo(best.e, dir, rep, true, null); return; }
    }
  }
  if (!N) return;                                                          // first / last line: stay put
  const xr = navEl && navEl.isConnected && navEl !== cur && !navEl.closest('#nav') === !inNav ? navEl.getBoundingClientRect() : cr;
  const x = xr.width > 280 ? xr.left + 30 : midX(xr);                      // from a wide field, the line below starts at its left
  const t = navLand(N, x, L.row);
  const edge = N === lines[0] ? 'top' : N === lines[lines.length - 1] ? 'bottom' : null;
  navVert = true;                                                          // focus events run inside .focus(): the column stays the one you started in
  try { navGo(t, dir, rep, !inNav, document.body.classList.contains('tv') ? edge : null); } finally { navVert = false; }
}
/* keep strips aligned to the card grid, scroll one card at a time, short eased animation */
let scrollAnim = 0;
/* TV entry page: two snapped halves. Anything focused in the lower half slides it up; rows and lists scroll to the focused item. */
function tvEntryReveal(el, lock){
  const p2 = !!el.closest('.dp2');
  lock.classList.toggle('p2', p2);
  const tp = lock.querySelector('.dtop'); if (tp) tp.classList.toggle('scrolled', p2);        // the small title shows up top on the lower half
  lock.scrollTop = 0; window.scrollTo(0, 0);
  if (!p2) return;
  const dp = el.closest('.dp2'), row = el.closest('.drow'), dr = dp.getBoundingClientRect(), k = dr.height / (dp.offsetHeight || dr.height) || 1;
  if (row) {
    const want = row === dp.querySelector('.drow') ? 0 : dp.scrollTop + (row.getBoundingClientRect().top - dr.top - 74 * k) / k;
    dp.scrollTo({top:Math.max(0, want), behavior:'smooth'});
  }
  const hs = el.closest('.srow,.sfilter,.eplist,.slist,.dsim,.cchips');
  if (hs) {
    const item = el.closest('.srow > *, .sfilter > *, .eplist > *, .slist > *, .dsim > *') || el, sr = hs.getBoundingClientRect(), br = item.getBoundingClientRect(), kk = sr.width / (hs.offsetWidth || sr.width) || 1, m = 70 * kk;
    if (item === hs.firstElementChild) hs.scrollTo({left:0, behavior:'smooth'});
    else if (item === hs.lastElementChild) hs.scrollTo({left:1e7, behavior:'smooth'});
    else if (br.right > sr.right - m) hs.scrollTo({left:hs.scrollLeft + (br.right - (sr.right - m)) / kk, behavior:'smooth'});
    else if (br.left < sr.left + m) hs.scrollTo({left:hs.scrollLeft - (sr.left + m - br.left) / kk, behavior:'smooth'});
  }
}
/* pages whose title stays fixed (watchlist, addons, settings, profile, search): only their own scroller moves */
function scrollNested(el, edge){
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const c = getComputedStyle(a);
    if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && a.scrollHeight > a.clientHeight + 4) {
      const ar = a.getBoundingClientRect(), er = el.getBoundingClientRect(), k = ar.height / (a.clientHeight || ar.height) || 1, m = 64 * k;
      if (edge === 'top') a.scrollTo({top:0, behavior:'smooth'});
      else if (edge === 'bottom') a.scrollTo({top:a.scrollHeight, behavior:'smooth'});
      else { const off = ((er.top + er.bottom) - (ar.top + ar.bottom)) / 2 / k; if (Math.abs(off) > 40) a.scrollTo({top:Math.max(0, a.scrollTop + off), behavior:'smooth'}); }   // keep the focused item mid-screen
      return true;
    }
  }
  return false;
}
function revealEl(el, dir, rep, tv, edge){
  if (document.body.classList.contains('tv') && el.closest('.pecol-r') && scrollNested(el, edge)) return;
  if (document.body.classList.contains('tv') && (document.body.classList.contains('pgfix') || document.body.classList.contains('srchpg')) && !el.closest('#detail,#episode,.sheet') && scrollNested(el, edge)) return;
  if (!tv) {
    if (document.body.classList.contains('tv')) {
      const lock = el.closest('#detail,#episode');
      if (lock && (lock.id === 'detail' || lock.id === 'episode') && el.closest('.dleft, .dp2')) { tvEntryReveal(el, lock); return; }
      if (lock) {                                                    // entry pages never scroll themselves; only their list does
        const hs = el.closest('.srow,.sfilter');                       // season / filter chips scroll sideways inside their own row
        if (hs) {
          const sr = hs.getBoundingClientRect(), br = el.getBoundingClientRect(), k = sr.width / (hs.offsetWidth || sr.width) || 1, m = 28 * k;
          if (el === hs.firstElementChild) hs.scrollLeft = 0;
          else if (el === hs.lastElementChild) hs.scrollLeft = 1e7;
          else if (br.right > sr.right - m) hs.scrollLeft += (br.right - (sr.right - m)) / k;
          else if (br.left < sr.left + m) hs.scrollLeft -= (sr.left + m - br.left) / k;
        }
        const sc = el.closest('.eplist,.slist,.dsim');
        if (sc) {
          const item = el.closest('.eplist > *, .slist > *, .dsim > *') || el, sr = sc.getBoundingClientRect(), br = item.getBoundingClientRect();
          const k = sr.height / (sc.offsetHeight || sr.height) || 1, m = 56 * k;
          if (item === sc.firstElementChild) sc.scrollTop = 0;
          else if (item === sc.lastElementChild) sc.scrollTop = 1e7;
          else if (br.top < sr.top + m) sc.scrollTop -= (sr.top + m - br.top) / k;
          else if (br.bottom > sr.bottom - m) sc.scrollTop += (br.bottom - (sr.bottom - m)) / k;
        }
        lock.scrollTop = 0; window.scrollTo(0, 0);
        return;
      }
      const sh = el.closest('.sheet');
      if (sh) {                                                      // editors: keep the focused control clear of the sticky bar and the bottom edge
        const sr = sh.getBoundingClientRect(), br = el.getBoundingClientRect();
        const k = sr.height / (sh.clientHeight || sr.height) || 1, mt = 96 * k, mb = 72 * k;
        if (edge === 'top') sh.scrollTop = 0;
        else if (edge === 'bottom') sh.scrollTop = 1e7;
        else { const off = ((br.top + br.bottom) - (sr.top + sr.bottom)) / 2 / k; if (Math.abs(off) > 40) sh.scrollTop += off; }
        return;
      }
      el.scrollIntoView({block:'nearest', inline:'nearest', behavior:'auto'}); return;
    } el.scrollIntoView({block: dir === 'up' || dir === 'down' ? 'center' : 'nearest', inline: dir === 'left' || dir === 'right' ? 'center' : 'nearest', behavior: rep ? 'auto' : 'smooth'}); return; }
  cancelAnimationFrame(scrollAnim);                                         // an old slide must never fight a newer key press
  const strip = el.closest('.strip'), y0 = scrollY, x0 = strip ? strip.scrollLeft : 0;
  if (strip) {
    const item = el.closest('.strip > *') || el, sr = strip.getBoundingClientRect(), br = item.getBoundingClientRect();
    const k = sr.width / (strip.offsetWidth || sr.width) || 1, pad = (parseFloat(getComputedStyle(strip).paddingLeft) || 0) * k;
    const sib = item.nextElementSibling || item.previousElementSibling;
    const pitch = sib ? Math.abs(sib.getBoundingClientRect().left - br.left) : br.width + 14 * k;
    const over = br.right - (sr.right - pad), under = (sr.left + pad) - br.left;
    if (over > 1) strip.scrollLeft = x0 + Math.ceil(over / pitch) * pitch / k;
    else if (under > 1) strip.scrollLeft = Math.max(0, x0 - Math.ceil(under / pitch) * pitch / k);
  }
  if (edge) window.scrollTo(0, edge === 'top' ? 0 : 1e7);                 // last item in that direction: show the whole end of the page
  else if (el.closest('.tvhero')) window.scrollTo(0, 0);
  else if (strip && (dir === 'up' || dir === 'down') && strip.parentElement) strip.parentElement.scrollIntoView({block:'center', inline:'nearest'});   // moving between rows: the row snaps to the middle of the screen
  else if (!strip && (dir === 'up' || dir === 'down')) el.scrollIntoView({block:'center', inline:'nearest'});
  else (strip || el).scrollIntoView({block:'nearest', inline:'nearest'});
  const y1 = scrollY, x1 = strip ? strip.scrollLeft : 0;
  if (y0 === y1 && x0 === x1) return;
  window.scrollTo(0, y0); if (strip) strip.scrollLeft = x0;
  cancelAnimationFrame(scrollAnim);
  const t0 = performance.now(), D = rep ? 95 : strip && (dir === 'up' || dir === 'down') ? 280 : 140;   // held keys: a short glide from wherever the page is now, so the scroll is one continuous motion instead of a jump per step
  const step = t => { const kk = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - kk, rep ? 2 : 3); window.scrollTo(0, y0 + (y1 - y0) * e); if (strip) strip.scrollLeft = x0 + (x1 - x0) * e; if (kk < 1) scrollAnim = requestAnimationFrame(step); };
  scrollAnim = requestAnimationFrame(step);
}
function firstFocus(root, list){
  list = list || focusables(root);
  const pick = sel => list.find(el => el.matches(sel));
  return pick('#pPlay') || pick('.dacts2 .hb.p') || pick('.kkey') || pick('.hero2 .hb.p, .tvhero .hb.p') || pick('.resbtn') || pick('.dsec .chip.on') || pick('.ep, .scard') || pick('.stile:not(.new), .space, .ptile, #exStay, .sec .btn, .stream, .opt, .gbtn') || pick('.card, .cwb') || list[0];
}
let autoEl = null;
function ensureFocus(){
  if (!remoteMode) return;
  const root = ctxRoot(), cur = document.activeElement;
  const typing = cur && /INPUT|TEXTAREA/.test(cur.tagName);
  const valid = cur && cur !== document.body && root.contains(cur) && cur.getBoundingClientRect().width > 0 && !cur.closest('.off');
  if (valid) {
    // the first focus we placed automatically may have been a placeholder before the banner / rows loaded: upgrade it once
    if (cur === autoEl) { const hero = focusables(root).find(el => el.matches('.hero2 .hb.p, .tvhero .hb.p')); if (hero && hero !== cur) { hero.focus({preventScroll:true}); autoEl = hero; } }
    return;
  }
  if (typing) return;
  const f = firstFocus(root); if (f) { f.focus({preventScroll:true}); autoEl = f; }
}
let efT; new MutationObserver(() => { if (!remoteMode) return; clearTimeout(efT); efT = setTimeout(ensureFocus, 220); })   // touch screens have no focus to keep
  .observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden', 'class']});

const KEYMAP = {Escape:'back', BrowserBack:'back', GoBack:'back', MediaPlayPause:'playpause', MediaPlay:'play', MediaPause:'pause', MediaStop:'stop',
  MediaFastForward:'ff', MediaRewind:'rw', MediaTrackNext:'ff', MediaTrackPrevious:'rw', ContextMenu:'info', Info:'info', Delete:'info'};
const KEYCODES = {10009:'back', 10252:'playpause', 415:'play', 19:'pause', 413:'stop', 417:'ff', 412:'rw', 457:'info', 403:'info', 405:'info'};
const keyAct = e => KEYMAP[e.key] || KEYCODES[e.keyCode] || '';

function playerSeek(d){ const v = $('#vid'); v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + d)); toast((d > 0 ? '+' : '') + d + 's'); showBar(); }
function playerToggle(){ const v = $('#vid'); if (v.paused) v.play().catch(() => {}); else v.pause(); showBar(); }
function playerKey(e, act){
  const v = $('#vid'), barOn = !$('#pbar').classList.contains('off'), a = document.activeElement;
  if (act === 'playpause') { e.preventDefault(); playerToggle(); return true; }
  if (act === 'play') { e.preventDefault(); v.play().catch(() => {}); showBar(); return true; }
  if (act === 'pause') { e.preventDefault(); v.pause(); showBar(); return true; }
  if (act === 'stop') { e.preventDefault(); popLayer('player'); return true; }
  if (act === 'ff') { e.preventDefault(); playerSeek(30); return true; }
  if (act === 'rw') { e.preventDefault(); playerSeek(-10); return true; }
  if (!document.body.classList.contains('tv')) return false;
  if (!barOn) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); playerSeek(-10); return true; }
    if (e.key === 'ArrowRight') { e.preventDefault(); playerSeek(10); return true; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playerToggle(); return true; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); showBar(); $('#pPlay').focus({preventScroll:true}); return true; }
  } else {
    showBar();
    if (a && a.id === 'pseek' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); playerSeek(e.key === 'ArrowLeft' ? -10 : 10); return true; }
  }
  return false;
}
let okHold = null;
document.addEventListener('keyup', e => {
  if (!okHold || !(e.key === 'Enter' || e.keyCode === 23)) return;
  const hd = okHold; okHold = null; clearTimeout(hd.t);
  e.preventDefault(); e.stopImmediatePropagation();
  if (!hd.fired && hd.el.isConnected) hd.el.click();
}, true);
