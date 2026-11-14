/* ---------- first launch: pick your spaces, then a TMDB key (or Cinemeta without one), then Real-Debrid. Shown once, on a device whose
   addons are only the built-in Torrentio (a signed-in account that already has addons never sees it). ---------- */
const WZ_SPACES = [
  {id:'aio',     name:'Cinema',  emoji:'🍿', icon:'cinema', theme:'googletv', desc:'Everything: movies and shows', tmdb:'tmdb://all'},
  {id:'netflix', name:'Netflix', emoji:'📺', icon:'tv', theme:'netflix',  desc:"What's on Netflix in Canada", tmdb:'tmdb://netflix'},
  {id:'disney',  name:'Disney',  emoji:'🏰', icon:'castle', theme:'disney',   desc:'Disney, Pixar and Disney Channel', tmdb:'tmdb://disney'},
  {id:'marvel',  name:'Marvel',  emoji:'🦸', icon:'hero', theme:'marvel',   desc:'The MCU in story order, then the rest', tmdb:'tmdb://marvel'},
  {id:'anime',   name:'Anime',   emoji:'🍥', icon:'naruto', theme:'anime',    desc:'Anime, from Kitsu', kitsu:true},
  {id:'kids',    name:'Kids',    emoji:'🧸', icon:'bear', theme:'sky',      desc:'Family movies and cartoons', tmdb:'tmdb://kids', kids:true}];
const CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json', KITSU = 'https://anime-kitsu.strem.fun/manifest.json';
let wz = null;

function welcomeMaybe(){
  if (lsGet('streamlet.welcomed', 0) || $('#welcome')) return;
  if (addons.some(a => !isTio(a.url))) { lsSet('streamlet.welcomed', 1); return; }       // already set up (this device, or the account)
  const have = new Set(spaces.map(s => s.id));
  wz = {step:0, pick:new Set(WZ_SPACES.filter(s => have.has(s.id)).map(s => s.id)), key:lsGet('streamlet.tmdb', '') || '', rd:rdKey()};
  if (!wz.pick.size) wz.pick.add('aio');
  document.body.append(h('div', {id:'welcome', class:'welcome', role:'dialog', 'aria-modal':'true'}));
  try { pushLayer('welcome'); } catch {}
  wzDraw();
}
LAYER_CLOSERS.welcome = () => {                                            // Back: one step back, never out of the setup
  if (!$('#welcome')) return;
  if (wz && wz.step > 0 && wz.step < 3) { wz.step--; wzDraw(); }
  setTimeout(() => { if ($('#welcome')) pushLayer('welcome'); }, 0);
};
const wzLink = (url, text) => h('a', {href:url, target:'_blank', rel:'noopener', class:'wzlink'}, text || url.replace(/^https:\/\/(www\.)?/, ''));
function wzQr(url){                                                        // on a TV, open the page on your phone instead
  if (!document.body.classList.contains('tv') || typeof qrcode !== 'function') return null;
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const box = h('div', {class:'qrbox wzqr'}); box.innerHTML = q.createSvgTag({cellSize:4, margin:0, scalable:true});
  return h('div', {class:'wzqrrow'}, box, h('p', {class:'sub'}, 'Scan to open it on your phone. A key pasted on your phone reaches the TV too once both are signed in to the same account.'));
}
function wzDraw(){
  const W = $('#welcome'); if (!W || !wz) return;
  const dots = h('div', {class:'wzdots'}, [0, 1, 2].map(i => h('i', {class:i === wz.step ? 'on' : i < wz.step ? 'done' : ''})));
  const msg = h('p', {class:'wzmsg', 'aria-live':'polite'});
  let body;
  if (wz.step === 0) {
    const grid = h('div', {class:'wzgrid'}, WZ_SPACES.map(s => {
      const t = THEMES[s.theme] || THEMES.ember, on = wz.pick.has(s.id);
      const b = h('button', {type:'button', class:'stile wztile' + (on ? ' on' : ''), 'aria-pressed':on ? 'true' : 'false', style:`--c1:${t.acc};--c2:${t.acc2 || t.acc}`},
        h('span', {class:'sem'}, spIcon(s)), h('span', {class:'stx'}, h('span', {class:'snm'}, s.name), h('span', {class:'sds'}, s.desc)), h('span', {class:'wzck'}, on ? '✓' : ''));
      b.onclick = () => { if (wz.pick.has(s.id)) { if (wz.pick.size === 1) { msg.textContent = 'Keep at least one space'; return; } wz.pick.delete(s.id); } else wz.pick.add(s.id); wzDraw(); W.querySelectorAll('.wztile')[WZ_SPACES.indexOf(s)]?.focus({preventScroll:true}); };
      return b;
    }));
    body = [h('h1', null, 'Welcome to Stream', h('span', {style:'color:var(--acc)'}, 'let')),
      h('p', {class:'sub'}, 'Streamlet is split into ', h('b', null, 'spaces'), '. Each space is like its own small app, with its own rows, colors and Continue watching. Pick the ones you want. You can add, remove or make your own later in Settings > Spaces.'),
      grid, msg,
      h('div', {class:'wzbtns'}, h('button', {class:'btn', type:'button', onclick:() => { wz.step = 1; wzDraw(); }}, 'Next'))];
  } else if (wz.step === 1) {
    const inp = h('input', {class:'f', type:'text', placeholder:'TMDB API key', value:wz.key, autocomplete:'off', spellcheck:'false', autocapitalize:'off'});
    const go = async () => {
      const k = inp.value.trim(); if (!k) { msg.textContent = 'Paste your key, or choose "Skip, use Cinemeta".'; inp.focus(); return; }
      msg.textContent = 'Checking…';
      try {
        const r = await fetch('https://api.themoviedb.org/3/configuration?api_key=' + encodeURIComponent(k));
        if (r.status === 401) { msg.textContent = 'TMDB rejected that key. Copy the "API Key", not the long "Read Access Token".'; return; }
        if (!r.ok) throw new Error(r.status);
      } catch (e) { if (!/^\d/.test(String(e.message))) { msg.textContent = "Couldn't reach TMDB. Check the connection, or skip for now."; return; } }
      wz.key = k; wz.step = 2; wzDraw();
    };
    body = [h('h1', null, 'Your TMDB key'),
      h('p', {class:'sub'}, 'TMDB fills your spaces with posters, rows and release dates. A key is free and takes about two minutes:'),
      h('ol', {class:'wzhow'},
        h('li', null, 'Make a free account at ', wzLink('https://www.themoviedb.org/signup'), '.'),
        h('li', null, 'Open ', wzLink('https://www.themoviedb.org/settings/api'), ' and choose ', h('b', null, 'Create'), ', then ', h('b', null, 'Developer'), '.'),
        h('li', null, 'Accept the terms and fill in the short form: name it ', h('b', null, 'Streamlet'), ', give any web address and a one-line summary like "my own streaming app".'),
        h('li', null, 'Copy the ', h('b', null, 'API Key'), ' (the short one) and paste it here.')),
      wzQr('https://www.themoviedb.org/settings/api'),
      h('div', {class:'inrow'}, inp), msg,
      h('div', {class:'wzbtns'},
        h('button', {class:'btn ghost', type:'button', onclick:() => { wz.step = 0; wzDraw(); }}, 'Back'),
        h('button', {class:'btn ghost', type:'button', onclick:() => { wz.key = ''; wz.step = 2; wzDraw(); }}, 'Skip, use Cinemeta'),
        h('button', {class:'btn', type:'button', onclick:go}, 'Continue')),
      h('p', {class:'sub wzfine'}, 'Without a key, your spaces show Cinemeta\'s popular movies and shows instead. Add a key later in Settings > TMDB & addons and Netflix, Disney, Marvel and Kids switch to their own rows.')];
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  } else if (wz.step === 2) {
    const inp = h('input', {class:'f', type:'password', placeholder:'Real-Debrid API token', value:wz.rd, autocomplete:'off', spellcheck:'false', autocapitalize:'off'});
    const go = async () => {
      const k = inp.value.trim(); if (!k) { msg.textContent = 'Paste your token, or choose "Later".'; inp.focus(); return; }
      msg.textContent = 'Checking…';
      try {
        const r = await fetch('https://api.real-debrid.com/rest/1.0/user', {headers:{Authorization:'Bearer ' + k}});
        if (r.status === 401 || r.status === 403) { msg.textContent = 'Real-Debrid rejected that token.'; return; }
        if (r.ok) { const u = await r.json(); if (u.type !== 'premium') { msg.textContent = `That's ${u.username}, but the account isn't premium. Sources won't play until it is.`; wz.rd = k; setTimeout(() => wzFinish(), 2500); return; } }
      } catch {}
      wz.rd = k; wzFinish();
    };
    body = [h('h1', null, 'Real-Debrid'),
      h('p', {class:'sub'}, 'Torrentio is built in and finds the sources. ', h('b', null, 'Real-Debrid'), ' (a paid service) turns them into videos Streamlet can play right away.'),
      h('ol', {class:'wzhow'},
        h('li', null, 'Sign in at ', wzLink('https://real-debrid.com'), ' with a premium account.'),
        h('li', null, 'Open ', wzLink('https://real-debrid.com/apitoken'), ' and copy your token.'),
        h('li', null, 'Paste it here.')),
      wzQr('https://real-debrid.com/apitoken'),
      h('div', {class:'inrow'}, inp), msg,
      h('div', {class:'wzbtns'},
        h('button', {class:'btn ghost', type:'button', onclick:() => { wz.step = 1; wzDraw(); }}, 'Back'),
        h('button', {class:'btn ghost', type:'button', onclick:() => { wz.rd = ''; wzFinish(); }}, 'Later'),
        h('button', {class:'btn', type:'button', onclick:go}, 'Finish')),
      h('p', {class:'sub wzfine'}, 'You can add or change it anytime in Settings > TMDB & addons > Torrentio.')];
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  } else {
    body = [h('h1', null, wz.done ? "You're all set" : 'Setting up…'), h('div', {class:'wzlog'}, (wz.log || []).map(l => h('p', null, l))),
      wz.done ? h('div', {class:'wzbtns'}, h('button', {class:'btn', type:'button', onclick:wzClose}, 'Start watching')) : null];
  }
  W.replaceChildren(h('div', {class:'wzcard'}, wz.step < 3 ? dots : null, ...body.filter(Boolean)));
  const f = W.querySelector(wz.step === 0 ? '.wztile' : wz.step === 3 ? '.btn' : 'input');
  if (f) f.focus({preventScroll:true});
}

/* the spaces you picked, each with its own catalog addon: TMDB with a key, Cinemeta without one, Kitsu for Anime */
async function wzFinish(){
  wz.step = 3; wz.log = []; wzDraw();
  const log = t => { wz.log.push(t); wzDraw(); };
  if (wz.key) { lsSet('streamlet.tmdb', wz.key); stamp('tmdbT'); }
  if (wz.rd) { rdKeySet(wz.rd); try { tioApply({...tioCfg(), realdebrid:wz.rd}, true); } catch {} }
  const uidOf = url => (addons.find(a => a.url === url || a.url === url.replace(/\/manifest\.json$/, '') + '/manifest.json' || a.url === url + '/manifest.json') || {}).uid;
  const need = async (url, name) => { if (uidOf(url)) return uidOf(url); try { await installAddon(url); log('✓ ' + name); } catch { log(`✗ ${name} couldn't be installed. Add it later from Addons.`); } return uidOf(url); };
  const picked = WZ_SPACES.filter(s => wz.pick.has(s.id)), cine = [];
  const out = [];
  for (const s of picked) {
    let uid = null;
    if (s.kitsu) uid = await need(KITSU, 'Kitsu Anime');
    else if (wz.key) uid = await need(s.tmdb, s.id === 'aio' ? 'TMDB' : s.name + ' (TMDB)');
    else { uid = await need(CINEMETA, 'Cinemeta'); cine.push(s.id); }
    const old = spaces.find(x => x.id === s.id);
    out.push({...(old || {id:s.id, name:s.name, emoji:s.emoji, icon:s.icon, theme:s.theme}), ...(s.kids ? {kids:true} : {}), catalogs:uid ? [uid] : []});
  }
  spaces = out; saveSpaces();
  lsSet('streamlet.wzCine', cine);                                          // these switch to TMDB once a key is added
  log(wz.rd ? '✓ Torrentio with Real-Debrid' : '• Torrentio without Real-Debrid. Add a token in Settings to play.');
  wz.done = true; wzDraw();
}
function wzClose(){
  lsSet('streamlet.welcomed', 1); wz = null;
  $('#welcome')?.remove();
  try { const i = layersOpen.lastIndexOf('welcome'); if (i >= 0) { layersOpen.splice(i, 1); focusStack.splice(i, 1); if (!layersOpen.length) document.body.classList.remove('inlayer'); history.replaceState({page:pageNow(), layers:[...layersOpen]}, ''); } } catch {}
  try { showLauncher(); } catch {}
}
/* a TMDB key added later: the spaces set up with Cinemeta get their own TMDB rows */
async function wzUpgrade(){
  const ids = lsGet('streamlet.wzCine', []); if (!Array.isArray(ids) || !ids.length || !lsGet('streamlet.tmdb', '')) return;
  lsSet('streamlet.wzCine', []);
  const cineUid = (addons.find(a => /v3-cinemeta\.strem\.io/.test(a.url)) || {}).uid;
  let n = 0;
  for (const id of ids) {
    const s = WZ_SPACES.find(x => x.id === id), sp = spaces.find(x => x.id === id);
    if (!s || !s.tmdb || !sp || !(sp.catalogs.length === 1 && sp.catalogs[0] === cineUid)) continue;   // changed by hand since: left alone
    try { await installAddon(s.tmdb); const a = addons.find(x => x.url.startsWith(s.tmdb)); if (a) { sp.catalogs = [a.uid]; n++; } } catch {}
  }
  if (n) { saveSpaces(); try { homeDirty(); } catch {} toast(`${n} space${n === 1 ? '' : 's'} now use${n === 1 ? 's' : ''} TMDB`); }
}
