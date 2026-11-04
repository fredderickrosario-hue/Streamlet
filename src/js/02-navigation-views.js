/* ---------- navigation: Android back button + exit prompt ---------- */
let navSuppress = false, pageKey = '', launcherDirty = false, exiting = false, replaceNext = false;
const layersOpen = [];                 // overlays currently open, bottom to top: detail, player, panel | editor
const pageNow = () => !$('#login').hidden ? {k:'login'}
  : !$('#profiles').hidden ? {k:'profiles'}
  : document.body.classList.contains('launch') ? {k:'launcher'}
  : !$('#search').hidden ? {k:'search'}
  : !$('#addons').hidden ? {k:'addons'}
  : !$('#watch').hidden ? {k:'watch'}
  : !$('#settings').hidden ? {k:'settings'}
  : !$('#me').hidden ? {k:'me'}
  : {k:'space', id:cur && cur.id, tab:view.tab, genre:view.genre};
function pushPage(){
  if (navSuppress) return;
  const p = pageNow(), k = JSON.stringify(p);
  if (k === pageKey) return;
  pageKey = k;
  if (document.body.classList.contains('tv') && !layersOpen.length && history.state && !history.state.guard) replaceNext = true;   // TV: tabs and filters don't pile up in the Back history
  if (replaceNext) { replaceNext = false; history.replaceState({page:p, layers:[...layersOpen]}, ''); return; }
  history.pushState({page:p, layers:[...layersOpen]}, '');
}
const focusStack = [];
function pushLayer(name){
  if (navSuppress) return;
  focusStack.push(document.activeElement);
  layersOpen.push(name); document.body.classList.add('inlayer');
  history.pushState({page:pageNow(), layers:[...layersOpen]}, '');
}
function popLayer(name){
  const i = layersOpen.lastIndexOf(name);
  if (i < 0) return;
  history.go(-(layersOpen.length - i));
}
/* "Finding the best source…" screen: Back or Cancel stops it */
let loadCancelled = false, loadFinishing = false;
function showLoading(title){
  loadCancelled = false;
  $('#loadov').hidden = false; if (!layersOpen.includes('load')) pushLayer('load');
}
function hideLoading(){                                                     // resolves once the Back stack has settled, so the player can open right after
  return new Promise(res => {
    if (!layersOpen.includes('load')) { $('#loadov').hidden = true; return res(); }
    loadFinishing = true; const t = setTimeout(() => { loadFinishing = false; res(); }, 500);
    addEventListener('popstate', () => { clearTimeout(t); setTimeout(() => { loadFinishing = false; res(); }, 30); }, {once:true});
    popLayer('load');
  });
}
$('#loadov').onclick = () => { if (layersOpen.includes('load')) popLayer('load'); };            // a tap (or Back) stops it
const LAYER_CLOSERS = {
  load:   () => { $('#loadov').hidden = true; if (!loadFinishing) loadCancelled = true; },
  panel:  () => { $('#ppanel').hidden = true; $('#pback').hidden = true; showBar(); },
  player: () => stopPlayer(),
  detail: () => { $('#detail').hidden = true; document.body.style.overflow = ''; if (!$('#home').hidden) renderCW(); },
  editor: () => { $('#spaceEd').hidden = true; applyTheme(cur ? cur.theme : 'violet'); },
  pedit:  () => { $('#profEd').hidden = true; if (!$('#me').hidden) renderMe(); },
  menu:   () => { $('#menu').hidden = true; },
  nfimp:  () => { $('#nfImp').hidden = true; },
  episode: () => { $('#episode').hidden = true; },
  aedit:  () => { $('#addonEd').hidden = true; if (!$('#addons').hidden) renderAddons(); }
};
function rememberSpace(id){ pset('last', id); }
function applyPage(p){
  if (p.k === 'login') showLogin();
  else if (p.k === 'profiles') showProfiles();
  else if (p.k === 'launcher') showLauncher();
  else if (['addons', 'watch', 'settings', 'me', 'search'].includes(p.k)) showTab(p.k);
  else if (p.k === 'space') {
    const sp = spaces.find(x => x.id === p.id);
    if (!sp) { showLauncher(); return; }
    cur = sp; rememberSpace(sp.id); applyTheme(sp.theme); $('#q').value = ''; view = {tab:p.tab || 'home', genre:p.genre || ''}; showTab('home');
  }
}
/* TV Back button: entry -> home -> side menu -> (home) -> close-app prompt */
function tvBackStep(){
  if (!document.body.classList.contains('tv') || document.body.classList.contains('launch') || !cur) return false;
  const inNav = document.activeElement && document.activeElement.closest && document.activeElement.closest('#nav');
  const repush = () => { if (history.state && history.state.guard) { pageKey = ''; pushPage(); } };
  if (!inNav) {
    if (!$('#home').hidden && view.genre) { view = {tab:view.tab, genre:''}; renderHome(); repush(); return true; }
    if (!$('#search').hidden && sQuery) { sQuery = ''; sPaint(); sRun(); repush(); return true; }
    if (focusNav()) { repush(); return true; }
    return false;
  }
  if ($('#home').hidden || view.tab !== 'home') { tvTab('home'); repush(); focusNav(); return true; }
  return false;
}
window.addEventListener('popstate', e => {
  if (exiting) return;
  const st = e.state;
  if (!st || st.guard) { if (tvBackStep()) return; $('#exitDlg').hidden = false; return; }
  $('#exitDlg').hidden = true;
  const want = st.layers || [];
  let restore = null;
  while (layersOpen.length > want.length) { const l = layersOpen.pop(); restore = focusStack.pop() || restore; if (LAYER_CLOSERS[l]) LAYER_CLOSERS[l](); }
  document.body.classList.toggle('inlayer', layersOpen.length > 0);
  if (restore && remoteMode) setTimeout(() => { if (restore.isConnected && !restore.closest('[hidden]')) restore.focus({preventScroll:true}); }, 60);
  const k = JSON.stringify(st.page);
  navSuppress = true;
  try {
    if (k !== pageKey) { pageKey = k; applyPage(st.page); }
    else if (launcherDirty && !want.length && (st.page.k === 'launcher' || st.page.k === 'profiles')) applyPage(st.page);
  } finally { navSuppress = false; }
  launcherDirty = false;
});
$('#exStay').onclick = () => { $('#exitDlg').hidden = true; pageKey = JSON.stringify(pageNow()); history.pushState({page:pageNow(), layers:[]}, ''); };
$('#exGo').onclick = () => {
  try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch {}
  try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A && A.exitApp) { A.exitApp(); return; } } catch {}
  exiting = true; history.back(); setTimeout(() => { try { window.close(); } catch {} }, 150);
};

/* ---------- views ---------- */
const TAB_SECTIONS = {home:'#home', search:'#search', watch:'#watch', addons:'#addons', settings:'#settings', me:'#me'};
const TAB_BUTTONS = {home:'#tabHome', search:'#nvSearch', watch:'#tabWatch', addons:'#tabAddons', settings:'#tabSettings', me:'#tabMe'};
const TAB_TITLES = {watch:'My List', addons:'Addons', settings:'Settings', me:'Profile'};
function movePill(){
  const nav = $('#nav'), pill = $('#navPill'), b = nav.querySelector('button.on');
  if (!b || !nav.offsetWidth) return;
  if (document.body.classList.contains('tv')) { pill.style.setProperty('--py', b.offsetTop + 'px'); pill.style.setProperty('--ph', b.offsetHeight + 'px'); }
  else { pill.style.setProperty('--px', b.offsetLeft + 'px'); pill.style.setProperty('--pw', b.offsetWidth + 'px'); }
}
addEventListener('resize', () => setTimeout(movePill, 50));
function showTab(name){
  if (!cur && name === 'home') return showLauncher();
  document.body.classList.remove('launch'); $('#launcher').hidden = true; $('#profiles').hidden = true; $('#login').hidden = true;
  navAvatar();
  for (const [k, sel] of Object.entries(TAB_SECTIONS)) { $(sel).hidden = k !== name; $(TAB_BUTTONS[k]).classList.toggle('on', k === name); }
  $('#spaceBtn').replaceChildren(cur ? cur.emoji+' '+cur.name : 'Spaces', h('i',null,'⇄'));
  $('#q').hidden = name !== 'home'; $('#pageTitle').hidden = true; document.body.classList.toggle('onhome', name === 'home'); document.body.classList.toggle('pgfix', ['watch', 'addons', 'settings', 'me'].includes(name)); document.body.classList.toggle('srchpg', name === 'search');
  $('#q').placeholder = cur ? 'Search '+cur.name+'…' : 'Search…';
  if (name === 'home') renderHome($('#q').value.trim());
  else if (name === 'search') renderSearch();
  else if (name === 'watch') renderWatch();
  else if (name === 'addons') renderAddons();
  else if (name === 'settings') renderSettings();
  else if (name === 'me') renderMe();
  window.scrollTo(0,0);
  syncNav(); movePill(); requestAnimationFrame(movePill);
  pushPage();
}
for (const [k, sel] of Object.entries(TAB_BUTTONS)) $(sel).onclick = () => showTab(k);
$('#spaceBtn').onclick = () => showLauncher();
const isTVui = () => document.body.classList.contains('tv');
function tvTab(t){ if (!cur) return showLauncher(); srchOn = false; $('#q').value = ''; view = {tab:t, genre:''}; showTab('home'); }
$('#tabHome').onclick = () => { if (isTVui()) tvTab('home'); else showTab('home'); };
$('#nvMovies').onclick = () => tvTab('movie'); $('#nvShows').onclick = () => tvTab('series'); $('#nvNew').onclick = () => tvTab('new');
$('#nvSpace').onclick = () => showLauncher();
$('#nvSearch').onclick = () => { if (!cur) return showLauncher(); if (isTVui()) { showTab('search'); setTimeout(() => { const k = $('.kkey'); if (k) k.focus({preventScroll:true}); }, 60); return; } if (srchOn || $('#q').value.trim()) { closeSearch(); return; } if ($('#home').hidden) showTab('home'); srchOn = true; renderTabs(); $('#q').focus(); };
$('#nav').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) e.target.closest('button').classList.add('prs'); });
$('#nav').addEventListener('keyup', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.classList.remove('prs'); });
$('#nav').addEventListener('click', e => {
  if (!isTVui() || !e.target.closest('button')) return;
  const settle = () => {
    const a = document.activeElement; if (!a || !a.closest || !a.closest('#nav')) return;
    const content = focusables(document.body).filter(x => !x.closest('#nav'));
    const t = firstFocus(document.body, content);
    if (t) t.focus({preventScroll:true}); else a.blur();
  };
  setTimeout(settle, 160); setTimeout(settle, 800);
});
function syncNav(){
  try {
    const home = !$('#home').hidden, st = !!(cur && spaceTabs()), tv = isTVui(), sr = srchOn || !!$('#q').value.trim();
    const set = (id, on, show = true) => { const b = $(id); b.classList.toggle('on', !!on); b.classList.toggle('gone', !show); };
    set('#nvMovies', home && st && !sr && view.tab === 'movie', st); set('#nvShows', home && st && !sr && view.tab === 'series', st); set('#nvNew', home && st && !sr && view.tab === 'new', st);
    set('#nvSearch', home && sr || !$('#search').hidden); set('#nvSpace', false);
    if (tv) $('#tabHome').classList.toggle('on', home && !sr && (!st || view.tab === 'home'));
  } catch {}
}


