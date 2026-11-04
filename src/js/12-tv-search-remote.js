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
  for (const id of ['#loadov', '#exitDlg', '#menu', '#ppanel', '#player', '#addonEd', '#profEd', '#spaceEd', '#episode', '#detail']) { const e = $(id); if (e && !e.hidden) return e; }
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
  const b = $('#nav button.on:not(.gone)') || $('#tabHome');
  if (b) { b.focus({preventScroll:true}); return true; }
  return false;
}
/* TV rows: Up / Down go to the next row and land on its first item (a short row can't make you skip one). Sideways never leaves the row. */
const ROW_SEL = '.strip,.dacts2,.srow,.sfilter,.eplist,.slist,.cchips,.dsim,.tbtns,.dptabs';
function moveRow(dir, list, cur){
  const mine = cur.closest(ROW_SEL); if (!mine) return null;
  const seen = new Set(), rows = [];
  for (const el of list) {
    const k = el.closest(ROW_SEL) || el; if (seen.has(k)) continue; seen.add(k);
    const r = el.getBoundingClientRect(); rows.push({k, y:(r.top + r.bottom) / 2, first:el});
  }
  const cr = cur.getBoundingClientRect(), cy = (cr.top + cr.bottom) / 2;
  const cand = rows.filter(r => r.k !== mine && (dir === 'down' ? r.y > cy + 8 : r.y < cy - 8)).sort((p, q) => dir === 'down' ? p.y - q.y : q.y - p.y)[0];
  return cand ? cand.first : null;
}
/* any page: Up / Down goes to the nearest visual row, then to the item in it closest to where you were (rows = items sharing a line) */
function moveVisualRow(dir, list, cur){
  const cr = cur.getBoundingClientRect(), cy = (cr.top + cr.bottom) / 2, cx = (cr.left + cr.right) / 2, ch = cr.height;
  let best = null, by = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), y = (r.top + r.bottom) / 2, mid = Math.min(ch, r.height) / 2;
    if (Math.abs(y - cy) < mid) continue;                              // same line as where you are
    if (dir === 'down' ? y <= cy : y >= cy) continue;
    const d = Math.abs(y - cy); if (d < by - 2) by = d;
  }
  if (by === Infinity) return null;
  let bd = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), y = (r.top + r.bottom) / 2, mid = Math.min(ch, r.height) / 2;
    if (Math.abs(y - cy) < mid || (dir === 'down' ? y <= cy : y >= cy)) continue;
    if (Math.abs(Math.abs(y - cy) - by) > Math.max(12, r.height / 2)) continue;     // not the nearest line
    const dx = Math.abs((r.left + r.right) / 2 - cx) + (cx >= r.left && cx <= r.right ? -1e4 : 0);
    if (dx < bd) { bd = dx; best = el; }
  }
  return best;
}
function moveFocus(dir, rep){
  const root = ctxRoot(), cur = document.activeElement;
  const tv = document.body.classList.contains('tv') && root === document.body, inNav = !!(tv && cur && cur.closest && cur.closest('#nav'));
  if (tv && !inNav && (dir === 'left' || dir === 'right') && cur && cur.closest) {       // along a row: the neighbour is the next card, no need to measure everything
    const strip = cur.closest('.strip'), item = strip && (cur.closest('.strip > *') || cur);
    for (let sib = item && (dir === 'right' ? item.nextElementSibling : item.previousElementSibling); sib; sib = dir === 'right' ? sib.nextElementSibling : sib.previousElementSibling) {
      const t = sib.matches(FOCUSABLE) ? sib : sib.querySelector(FOCUSABLE);
      if (t && t.tabIndex >= 0 && !t.closest('.off,[hidden]')) { t.focus({preventScroll:true}); revealEl(t, dir, rep, tv, null); return; }
    }
  }
  let list = focusables(root);
  if (tv) {
    if (inNav) {
      if (dir === 'left') return;
      if (dir === 'right') {
        const content = list.filter(e => !e.closest('#nav'));
        const t = lastContentEl && lastContentEl.isConnected && content.includes(lastContentEl) ? lastContentEl : firstFocus(root, content);
        if (t) t.focus({preventScroll:true});
        return;
      }
      list = list.filter(e => e.closest('#nav'));
    } else list = list.filter(e => !e.closest('#nav'));
  }
  if (!cur || cur === document.body || !list.includes(cur)) { const f = firstFocus(root, list); if (f) f.focus({preventScroll:true}); return; }
  const entryTV = document.body.classList.contains('tv') && (root.id === 'detail' || root.id === 'episode');
  if ((dir === 'up' || dir === 'down') && !inNav && document.body.classList.contains('tv')) {
    const t = moveRow(dir, list, cur);
    if (t) { t.focus({preventScroll:true}); if (root === document.body) revealEl(t, dir, rep, tv, null); else revealEl(t, dir, rep, false, null); return; }
    if (cur.closest(ROW_SEL)) return;                       // already on the last (or first) row: stay put
    if (!entryTV) {
      const v = moveVisualRow(dir, list, cur);
      if (v) { v.focus({preventScroll:true}); if (root === document.body) revealEl(v, dir, rep, tv, null); else revealEl(v, dir, rep, false, null); return; }
    }
  }
  const a = cur.getBoundingClientRect(), ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    let prim, gap, off;
    if (dir === 'right' || dir === 'left') {
      if (dir === 'right' ? !(cx > ax + 1 && r.right > a.right) : !(cx < ax - 1 && r.left < a.left)) continue;
      prim = dir === 'right' ? Math.max(0, r.left - a.right) : Math.max(0, a.left - r.right);
      gap = Math.max(0, Math.max(a.top, r.top) - Math.min(a.bottom, r.bottom)); off = Math.abs(cy - ay);
      if ((tv || entryTV) && gap > 2) continue;           // never jump to another row sideways
    } else {
      if (dir === 'down' ? !(cy > ay + 1 && r.bottom > a.bottom) : !(cy < ay - 1 && r.top < a.top)) continue;
      prim = dir === 'down' ? Math.max(0, r.top - a.bottom) : Math.max(0, a.top - r.bottom);
      gap = Math.max(0, Math.max(a.left, r.left) - Math.min(a.right, r.right)); off = Math.abs(cx - ax);
    }
    const score = prim + gap * 4 + off * 0.5;
    if (score < bs) { bs = score; best = el; }
  }
  if (!best) {
    if (entryTV && root.id === 'episode' && (dir === 'left' || dir === 'right') && cur.closest('.dleft') && root._step) { root._step(dir === 'right' ? 1 : -1); return; }   // episode page: previous / next episode
    if (tv && !inNav && dir === 'left') focusNav(); return;
  }
  best.focus({preventScroll:true});
  let edge = null;
  if (document.body.classList.contains('tv') && (dir === 'up' || dir === 'down')) {
    const br = best.getBoundingClientRect();
    const more = list.some(e => e !== best && (dir === 'up' ? e.getBoundingClientRect().bottom < br.top + 2 : e.getBoundingClientRect().top > br.bottom - 2));
    if (!more) edge = dir === 'up' ? 'top' : 'bottom';
  }
  if (!inNav) revealEl(best, dir, rep, tv, edge);
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
let efT; new MutationObserver(() => { clearTimeout(efT); efT = setTimeout(ensureFocus, 220); })
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
