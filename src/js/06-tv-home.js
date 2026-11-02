/* ---------- TV home: full-bleed hero that follows the focused title ---------- */
let tvHeroCtx = null, tvHeroT = 0;
function buildTvHero(){
  return h('div', {class:'tvhero'}, h('div', {class:'tbg'}), h('div', {class:'tin'}));
}
function setTvHero(ctx, instant){
  const box = $('#rows .tvhero'); if (!box || !ctx) return;
  tvHeroCtx = ctx;
  const m = ctx.m, tbg = box.querySelector('.tbg'), tin = box.querySelector('.tin');
  const src = m.background || m.poster;
  if (src && !(tbg.lastChild && tbg.lastChild.dataset.src === src)) {
    const img = h('img', {alt:'', 'data-src':src}); img.onerror = () => img.remove();
    img.onload = () => { requestAnimationFrame(() => img.classList.add('on')); setTimeout(() => { for (const o of [...tbg.children]) if (o !== img && o !== tbg.lastChild) o.remove(); }, 800); };
    img.src = src; tbg.append(img);
    if (instant) img.classList.add('on');
  }
  const gen = (Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : []).slice(0, 3);
  const bits = [m.releaseInfo || m.year, m.runtime, ...gen].filter(Boolean);
  const title = h('div', {class:'ttitle'}, m.name);
  const logo = m.logo ? h('img', {class:'tlogo', src:m.logo, alt:m.name, onerror:e => e.target.replaceWith(title)}) : title;
  tin.replaceChildren(logo,
    h('div', {class:'tmeta'}, m.imdbRating ? h('span', {class:'timdb'}, '★ ' + m.imdbRating) : null, ...bits.map(x => h('span', null, String(x)))),
    m.description ? h('p', {class:'tdesc'}, m.description) : null,
    h('div', {class:'tbtns'},
      h('button', {class:'hb p', type:'button', onclick:() => openDetail(ctx.a, ctx.type, m)}, '▶  Play'),
      h('button', {class:'hb s', type:'button', onclick:() => openDetail(ctx.a, ctx.type, m)}, 'More info')));
}
document.addEventListener('focusin', e => {
  if (!document.body.classList.contains('tv')) return;
  const c = e.target.closest && e.target.closest('button.card');
  if (!c || !c._hero || !c._hero.m || c._hero.m === (tvHeroCtx || {}).m) return;
  clearTimeout(tvHeroT); tvHeroT = setTimeout(() => setTvHero(c._hero), 170);
});
addEventListener('scroll', () => document.body.classList.toggle('scr', scrollY > 30), {passive:true});
/*@phone*/
{ let ly = 0, busy = false;                                           // hide the top bar when scrolling down, show it when scrolling up
  addEventListener('scroll', () => {
    if (busy) return; busy = true;
    requestAnimationFrame(() => {
      busy = false;
      const b = document.body, y = scrollY, d = y - ly;
      if (b.classList.contains('tv') || document.activeElement === $('#q')) { ly = y; return; }
      if (y < 60) { b.classList.remove('tbhide'); ly = y; }
      else if (d > 8) { b.classList.add('tbhide'); ly = y; }
      else if (d < -8) { b.classList.remove('tbhide'); ly = y; }
    });
  }, {passive:true});
}
/*@end*/

let homeTok = 0;
let view = {tab:'home', genre:''};
const NEW_RE = /\b(new|latest|recent|release|releases|airing|year)\b/i;
const TYPE_LABEL = {movie:'Movies', series:'Shows', anime:'Anime', tv:'TV', channel:'Channels'};
const spaceTabs = () => !!(cur && (cur.tabs ?? (THEMES[cur.theme] || {}).tabs));
const typeOK = (tab, t) => tab==='home' || tab==='new' || (tab==='movie' ? t==='movie' : ['series','anime','tv'].includes(t));
function genreExtra(cat){
  const e = (cat.extra || []).find(x => x.name === 'genre');
  if (e) return {options:e.options || [], required:!!e.isRequired};
  if ((cat.extraSupported || []).includes('genre')) return {options:[], required:(cat.extraRequired || []).includes('genre')};
  return null;
}
const sortedOptions = o => (o.length && o.every(x => /^\d{4}$/.test(x))) ? [...o].sort((x,y) => y - x) : o;

let srchOn = false;
const SRCH_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
const X_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function closeSearch(){ srchOn = false; const had = $('#q').value; $('#q').value = ''; $('#q').blur(); if (had.trim()) renderHome(''); else renderTabs(); }
function spaceGenres(){
  const genres = [];
  for (const ad of spaceAddons()) for (const cat of (ad.manifest.catalogs || [])) {
    const ge = genreExtra(cat);
    if (!ge || !typeOK(view.tab, cat.type) || NEW_RE.test(cat.id)) continue;
    for (const o of ge.options) if (!/^\d{4}$/.test(o) && !genres.includes(o)) genres.push(o);
  }
  return genres.sort((x,y) => x.localeCompare(y));
}
const gHue = g => { let n = 0; for (const c of g) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
let gFocus = null;
function genreStrip(){
  const gs = spaceGenres(), el = h('div', {class:'gstrip'});
  if (!gs.length) { el.hidden = true; return el; }
  for (const g of gs) el.append(h('button', {class:'gtile' + (view.genre === g ? ' on' : ''), type:'button', style:`--gh:${gHue(g)}`,
    onclick:() => { gFocus = g; view = {tab:view.tab, genre:view.genre === g ? '' : g}; pushPage(); renderHome(); }}, g));
  if (gFocus) { const t = [...el.children].find(x => x.textContent === gFocus); gFocus = null; if (t) requestAnimationFrame(() => t.focus({preventScroll:true})); }
  return el;
}
function renderTabs(){
  const bar = $('#tabsBar'), q = $('#q'), tv = isTVui();
  syncNav();
  const searching = srchOn || !!q.value.trim();
  if (searching && bar.dataset.mode === 's' && bar.contains(q)) return;       // keep focus while typing
  const had = document.activeElement && bar.contains(document.activeElement) && document.activeElement !== q ? (document.activeElement.id || document.activeElement.textContent) : null;
  bar.dataset.mode = searching ? 's' : 't';
  if (!searching && bar.contains(q)) $('header').append(q);
  if (tv) { if (bar.contains(q)) $('header').append(q); bar.replaceChildren(); bar.hidden = true; return; }
  document.body.classList.toggle('srch', searching);
  const ps = $('#phSearch'), pp = $('#phSpace');
  if (ps) {                                                              // phone: search and spaces live in the sticky top bar
    ps.innerHTML = searching ? X_SVG : SRCH_SVG;
    ps.onclick = () => { if (searching) closeSearch(); else { srchOn = true; renderTabs(); $('#q').focus(); } };
    pp.onclick = () => showLauncher();
  }
  if (searching) { bar.hidden = false; bar.replaceChildren(q); q.hidden = false; return; }
  if (!spaceTabs() || !addons.length) { bar.hidden = true; bar.replaceChildren(); return; }
  bar.hidden = false;
  const chip = (id, label) => h('button', {class:'chip'+(view.tab===id ? ' on' : ''), onclick:() => { view = {tab:id, genre:''}; pushPage(); renderHome(); }}, label);
  bar.replaceChildren(chip('home','Home'), chip('movie','Movies'), chip('series','Shows'), chip('new','New releases'));
  if (had) { const t = [...bar.children].find(c => c.id === had || c.textContent === had); if (t) t.focus({preventScroll:true}); }
}


