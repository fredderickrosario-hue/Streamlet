/* ---------- profile + settings pages ---------- */
function renderMe(){
  const box = $('#me'); if (!profile) return;
  const hs = histGet().length, ws = wlGet().length;
  box.replaceChildren(
    h('div', {class:'pagehead'}, h('h1', null, 'Profile')),
    h('div', {class:'pad'},
      h('div', {class:'addon mecard'}, h('div', {class:'mepav'}, avatarEl(profile, 88)),
        h('div', null, h('h2', {style:'margin:0;font-size:24px'}, profile.name), h('p', {style:'margin:4px 0 0;color:var(--mut)'}, user ? (user.email || 'Signed in') : 'This device only'))),
      h('div', {class:'mestats'}, h('div', {class:'addon'}, h('b', null, String(hs)), h('span', null, 'In progress')), h('div', {class:'addon'}, h('b', null, String(ws)), h('span', null, 'In watchlist'))),
      h('div', {class:'mebtns'},
        h('button', {class:'btn', type:'button', onclick:() => showProfiles()}, 'Switch profile'),
        h('button', {class:'btn ghost', type:'button', onclick:() => editProfile(profile.id)}, 'Edit profile')),
      profiles.length > 1 ? h('div', null, h('div', {class:'lbl'}, 'Switch quickly'),
        h('div', {class:'pchips'}, profiles.filter(x => x.id !== profile.id).map(x => h('button', {class:'chip', type:'button', onclick:() => selectProfile(x)}, avatarEl(x, 22), ' ' + x.name)))) : null,
      h('div', {class:'mebtns', style:'margin-top:18px'}, h('button', {class:'btn ghost sm', type:'button', onclick:() => { manageProfiles = true; showProfiles(); manageProfiles = true; renderProfiles(); }}, 'Manage profiles'))));
}
const APP_BUILD = '2.0';
function renderSettings(){
  fillAccountUI(); fillSettingsUI();
  const u = lsGet('streamlet.ui', {}), tv = document.body.classList.contains('tv');
  const au = $('#setAuto'), mq = $('#setMaxQ'), sk = $('#setSkip');
  au.checked = u.autoPick !== false; au.onchange = () => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), autoPick:au.checked});
  mq.value = u.maxQ || 'best'; mq.onchange = () => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), maxQ:mq.value});
  sk.value = String(u.skip || 10); sk.onchange = () => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), skip:Number(sk.value)});
  const sa = $('#setSrchAll'); sa.checked = u.srchAll !== false; sa.onchange = () => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), srchAll:sa.checked});
  const anim = $('#setAnim'), glass = $('#setGlass');
  anim.checked = u.anim !== false; glass.checked = u.glass === undefined ? !tv : u.glass !== false;
  anim.onchange = () => { lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), anim:anim.checked}); applyUI(); };
  glass.onchange = () => { lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), glass:glass.checked}); applyUI(); };
  const snd = $('#setSnd'); snd.checked = u.sound !== false;
  snd.onchange = () => { lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), sound:snd.checked}); if (snd.checked) sfx.select(); };
  $('#setPlay').hidden = !nativePlayer();
  for (const [id, k, d] of [['#setHw', 'hw', true], ['#setFps', 'fps', true], ['#setTun', 'tunnel', false], ['#setPass', 'pass', true]]) {
    const el = $(id); el.checked = u[k] === undefined ? d : u[k] !== false && !!u[k];
    el.onchange = () => lsSet('streamlet.ui', {...lsGet('streamlet.ui', {}), [k]:el.checked});
  }
  $('#verLine').textContent = `Streamlet · version ${APP_BUILD}` + (nativePlayer() ? ' · Android app' : '');
}
function applyUI(){
  const u = lsGet('streamlet.ui', {}), tv = document.body.classList.contains('tv');
  document.body.classList.toggle('noanim', u.anim === false);
  document.body.classList.toggle('noglass', u.glass === undefined ? tv : u.glass === false);
}
async function renderLog(){
  const box = $('#logBody'), when = t => new Date(t).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
  const play = lsGet('streamlet.errlog', []), sys = lsGet('streamlet.syslog', []), N = nativePlayer();
  let native = ''; try { if (N && N.getLog) native = ((await N.getLog()) || {}).log || ''; } catch {}
  const lines = [`Streamlet ${APP_BUILD} · ${document.body.classList.contains('tv') ? 'TV' : 'phone/web'} · ${innerWidth}x${innerHeight} · ${navigator.onLine ? 'online' : 'offline'}`, ''];
  lines.push('PLAYBACK ERRORS' + (play.length ? '' : ': none'));
  for (const e of play.slice(0, 15)) lines.push(`${when(e.t)} · ${e.title || 'Unknown'} · ${e.src || 'source'}${e.code ? ' · ' + e.code : ''}`);
  lines.push('', 'APP ERRORS' + (sys.length ? '' : ': none'));
  for (const e of sys.slice(0, 20)) lines.push(`${when(e.t)} · ${e.k} · ${e.m}${e.n > 1 ? ' (x' + e.n + ')' : ''}`);
  const ls = lsGet('streamlet.lastsearch', null);
  if (ls && ls.rows) { lines.push('', `LAST SEARCH: "${ls.q}" at ${when(ls.t)}`); for (const r of ls.rows.slice(0, 40)) lines.push(r); }
  if (N) lines.push('', 'ANDROID LOG' + (native.trim() ? '' : ': empty'), ...native.trim().split('\n').slice(-40));
  const text = lines.join('\n'), ta = h('textarea', {readonly:'', rows:'10', class:'f', style:'width:100%;font:12px/1.4 monospace;white-space:pre'}); ta.value = text;
  const copy = h('button', {class:'btn ghost sm', type:'button', onclick:async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch { toast('Select the text and copy it'); } }
  }}, 'Copy');
  const share = navigator.share ? h('button', {class:'btn ghost sm', type:'button', onclick:() => navigator.share({title:'Streamlet log', text}).catch(() => {})}, 'Share') : null;
  const clear = h('button', {class:'btn ghost sm', type:'button', onclick:async () => { lsSet('streamlet.errlog', []); lsSet('streamlet.syslog', []); try { if (N && N.clearLog) await N.clearLog(); } catch {} renderLog(); }}, 'Clear');
  box.replaceChildren(ta, h('div', {style:'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'}, copy, share, clear));
}
$('#logBox').addEventListener('toggle', () => { if ($('#logBox').open) renderLog(); });
{ const sync = () => { $('#offline').hidden = navigator.onLine; }; addEventListener('online', sync); addEventListener('offline', sync); sync(); }
/*@tv*/
document.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('scroll', () => { if (scrollX) scrollTo(0, scrollY); }, {passive:true});   // the TV page never scrolls sideways
document.addEventListener('dragstart', e => e.preventDefault());
{ // dim the screen after a few idle minutes so a static menu doesn't burn into the TV
  const el = h('div', {id:'idle'}); el.append(h('img', {src:(document.querySelector('.navbrand img') || {}).src || 'logo.svg', alt:''}));
  document.body.append(el);
  let t = 0, on = false;
  const arm = () => { clearTimeout(t); t = setTimeout(() => { if ($('#player').hidden) { on = true; el.classList.add('on'); } else arm(); }, 4 * 60 * 1000); };
  const wake = e => { if (on) { on = false; el.classList.remove('on'); if (e && e.type === 'keydown') { e.preventDefault(); e.stopImmediatePropagation(); } } arm(); };
  addEventListener('keydown', wake, true); addEventListener('mousemove', wake, true); addEventListener('click', wake, true); arm();
}
/*@end*/
$('#closeBtn').onclick = async () => {
  try { const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (A && A.exitApp) { await A.exitApp(); return; } } catch {}
  window.close(); toast('You can close this tab.');
};
$('#updBtn').onclick = async () => {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.reload();
};

/* ---------- profile picker ---------- */
let manageProfiles = false;
function showProfiles(){
  cur = null; applyTheme('violet');
  document.body.classList.add('launch'); document.body.style.overflow = '';
  $('#launcher').hidden = true; $('#login').hidden = true; $('#detail').hidden = true; $('#player').hidden = true; $('#spaceEd').hidden = true; $('#profEd').hidden = true;
  manageProfiles = false; renderProfiles();
  window.scrollTo(0,0); pushPage();
}
let pfx = false;
const nextFrames = n => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const animDone = a => new Promise(r => { a.onfinish = r; a.oncancel = r; });
async function pickProfileFx(pr, tile){
  const av = tile && tile.querySelector('.av');
  if (pfx) return;
  if (!av || !av.animate || document.body.classList.contains('noanim')) { selectProfile(pr); return; }
  pfx = true;
  const r0 = av.getBoundingClientRect();
  const f = h('div', {class:'pflight'}, avatarEl(pr, 100));
  const cover = h('div', {class:'pcover'});
  const P = $('#profiles');
  let hideEl = null;
  try {
    document.body.append(cover, f);
    // calibrate: how many screen px does 1 CSS px / 1 px of translate cover here?
    f.style.cssText = 'left:0;top:0;width:100px;height:100px;transform:none';
    const a0 = f.getBoundingClientRect(), kw = a0.width / 100 || 1;
    f.style.width = f.style.height = (r0.width / kw) + 'px';
    f.firstChild.style.width = f.firstChild.style.height = '100%';
    const b0 = f.getBoundingClientRect(); f.style.transform = 'translate(100px,100px)';
    const b1 = f.getBoundingClientRect(); f.style.transform = 'none';
    const kt = (b1.left - b0.left) / 100 || kw;
    const T = (x, y, sc) => `translate(${(x - b0.left) / kt}px,${(y - b0.top) / kt}px) scale(${sc})`;
    const vp = cover.getBoundingClientRect(), W = vp.width, H = vp.height;
    const S1 = 1.4, start = T(r0.left, r0.top, 1), mid = T(W / 2 - r0.width * S1 / 2, H / 2 - r0.height * S1 / 2, S1);
    f.style.transform = start; av.style.visibility = 'hidden';
    P.style.transition = 'opacity .35s'; P.style.opacity = '0';
    cover.animate([{opacity:0}, {opacity:1}], {duration:380, fill:'forwards', easing:'ease'});
    await animDone(f.animate([{transform:start}, {transform:mid}], {duration:480, easing:'cubic-bezier(.25,.8,.25,1)', fill:'forwards'}));
    await new Promise(r => setTimeout(r, 320));                      // hold in the middle
    selectProfile(pr); P.style.opacity = ''; P.style.transition = '';
    await nextFrames(3);
    let tgt = null, tr = null, prevR = null;
    for (let i = 0; i < 45 && !tgt; i++) {                            // up to ~2.5 s for the destination to exist and sit still
      await new Promise(r => setTimeout(r, 55));
      const t = document.querySelector('#tabMe .navav .av') || document.querySelector('.lhead .spaceBtn .av');
      const r = t && t.getBoundingClientRect();
      if (r && r.width > 2) { if (prevR && Math.abs(r.left - prevR.left) < .5 && Math.abs(r.top - prevR.top) < .5) { tgt = t; tr = r; } prevR = r; }
    }
    if (!tgt) {
      cover.animate([{opacity:1}, {opacity:0}], {duration:350, fill:'forwards'}); await animDone(f.animate([{opacity:1}, {opacity:0}], {duration:350, fill:'forwards'}));
    } else {
      hideEl = tgt.closest('.navav') || tgt; hideEl.style.visibility = 'hidden';
      const end = T(tr.left, tr.top, tr.width / r0.width);
      cover.animate([{opacity:1}, {opacity:0}], {duration:700, fill:'forwards', easing:'ease'});
      await animDone(f.animate([{transform:mid}, {transform:end}], {duration:700, easing:'cubic-bezier(.45,0,.2,1)', fill:'forwards'}));
    }
  } catch { try { selectProfile(pr); } catch {} }
  finally { if (hideEl) hideEl.style.visibility = ''; f.remove(); cover.remove(); P.style.opacity = ''; P.style.transition = ''; pfx = false; }
}
function renderProfiles(){
  const P = $('#profiles'); P.hidden = false;
  const ask = h('input', {type:'checkbox'}); ask.checked = localStorage.getItem('streamlet.profile.ask') !== '0';
  ask.onchange = () => { try { localStorage.setItem('streamlet.profile.ask', ask.checked ? '1' : '0'); } catch {} };
  P.replaceChildren(
    h('h1', null, manageProfiles ? 'Manage profiles' : "Who's watching?"),
    h('div', {class:'pgrid'},
      ...profiles.map(pr => h('button', {class:'ptile', type:'button', onclick:ev => manageProfiles ? editProfile(pr.id) : pickProfileFx(pr, ev.currentTarget)},
        h('div', {class:'pav'}, avatarEl(pr, 88), manageProfiles ? h('span', {class:'pe'}, '✎') : null), h('div', null, pr.name))),
      manageProfiles && profiles.length < 8 ? h('button', {class:'ptile', type:'button', onclick:() => editProfile(null)}, h('div', {class:'pav add'}, '+'), h('div', null, 'Add profile')) : null),
    h('div', {class:'lnks', style:'justify-content:center;margin-top:22px'},
      h('button', {class:'lnk', type:'button', onclick:() => { manageProfiles = !manageProfiles; renderProfiles(); }}, manageProfiles ? 'Done' : 'Manage profiles')),
    manageProfiles && profiles.length > 1 ? h('label', {class:'chk', style:'justify-content:center'}, ask, h('span', null, "Ask who's watching when the app opens")) : null);
}
function editProfile(id){
  const isNew = !id;
  const pr = isNew ? {id:'p'+Date.now().toString(36), name:'', emoji:PROFILE_EMOJIS[profiles.length % PROFILE_EMOJIS.length], color:PROFILE_COLORS[profiles.length % PROFILE_COLORS.length], avatar:'a:' + ((profiles.length * 7 + 3) % AV_COUNT)}
                   : JSON.parse(JSON.stringify(profiles.find(x => x.id === id)));
  const ed = $('#profEd'); ed.hidden = false; ed.scrollTop = 0; pushLayer('pedit');
  const close = () => popLayer('pedit');
  const name = h('input', {class:'f', placeholder:'Name', maxlength:'16', style:'width:100%;font-size:18px'}); name.value = pr.name;
  const prev = h('div', {class:'avprev'});
  const grid = h('div', {class:'avgrid'});
  const paint = () => {
    prev.replaceChildren(avatarEl(pr, 104));
    grid.replaceChildren(...Array.from({length:AV_COUNT}, (_, i) => h('button', {type:'button', class:'avb' + (pr.avatar === 'a:' + i ? ' on' : ''), 'aria-label':'Avatar ' + (i + 1), onclick:() => { pr.avatar = 'a:' + i; paint(); }}, avatarEl({avatar:'a:' + i}, 64))));
  };
  paint();
  const emojis = h('div', {class:'emojis'}, PROFILE_EMOJIS.map(e => h('button', {type:'button', onclick:() => { pr.avatar = ''; pr.emoji = e; paint(); }}, e)));
  const del = h('button', {class:'btn ghost', type:'button'}, 'Delete profile'); let armed = false;
  del.onclick = () => {
    if (profiles.length < 2) { toast('Keep at least one profile.'); return; }
    if (!armed) { armed = true; del.textContent = 'Tap again to delete'; return; }
    profiles = profiles.filter(x => x.id !== pr.id); saveProfiles(); cloudDeleteProfile(pr.id);
    try { Object.keys(localStorage).filter(k => k.startsWith(`streamlet.p.${pr.id}.`)).forEach(k => localStorage.removeItem(k)); } catch {}
    if (profile && profile.id === pr.id) profile = null;
    launcherDirty = true; close();
  };
  ed.replaceChildren(
    h('div', {class:'bar', style:'padding-left:0;padding-right:0'}, h('button', {class:'btn ghost sm', onclick:close}, '← Cancel')),
    h('div', {style:'padding:0 16px 40px'},
      h('h2', {style:'margin:6px 0 12px'}, isNew ? 'New profile' : 'Edit profile'),
      prev, h('div', {class:'lbl'}, 'Name'), name,
      h('div', {class:'lbl'}, 'Choose an avatar'), grid,
      h('div', {class:'lbl'}, 'Or use an emoji'), emojis,
      h('div', {style:'display:flex;gap:10px;margin-top:20px'},
        h('button', {class:'btn', type:'button', onclick:() => {
          if (!name.value.trim()) { toast('Give it a name.'); return; }
          pr.name = name.value.trim();
          const i = profiles.findIndex(x => x.id === pr.id); if (i >= 0) profiles[i] = pr; else profiles.push(pr);
          if (profile && profile.id === pr.id) profile = pr;
          saveProfiles(); launcherDirty = true; close();
        }}, 'Save'),
        isNew ? null : del)));
}

function posterEl(meta){
  const p = h('div', {class:'poster'}, (meta.name||'?').trim().charAt(0).toUpperCase());
  if (meta.poster) p.append(h('img', {src:meta.poster, loading:'lazy', decoding:'async', alt:'', onerror:e=>e.target.remove()}));
  const iid = meta.itemId || meta.id;
  if (iid) { p.dataset.iid = iid; if (watchedHas(iid)) p.append(h('span', {class:'rib'})); }
  return p;
}

function renderCW(){
  const box = $('#cwBox'); if (!box) return;
  box.replaceChildren();
  const query = $('#q').value.trim();
  if (query || !cur || (spaceTabs() && (view.tab !== 'home' || view.genre))) return;
  const hist = histForSpace(); if (!hist.length) return;
  const strip = h('div', {class:'strip'});
  for (const e of hist) {
    const pct = e.dur ? Math.min(100, Math.round(e.pos / e.dur * 100)) : 0;
    const label = (e.ep ? `S${e.ep.season ?? 1}:E${e.ep.episode ?? '?'}` : '') + (e.upnext ? ' · Up next' : (e.dur ? (e.ep ? ' · ' : '') + Math.max(1, Math.round((e.dur - e.pos) / 60)) + 'm left' : ''));
    const po = posterEl({name:e.name, poster:e.poster, itemId:e.itemId});
    if (e.upnext) po.append(h('span', {class:'upn'}, 'UP NEXT')); else po.append(h('div', {class:'pg'}, h('i', {style:`width:${pct}%`})));
    strip.append(h('div', {class:'card cwc'},
      (() => { const b = h('button', {class:'cwb', type:'button', onclick:() => openResume(e)}, po, h('div', {class:'t'}, e.name), h('div', {class:'s'}, label)); attachHold(b, {itemId:e.itemId, type:e.itemType, name:e.name, poster:e.poster, background:e.background, addonId:e.addonId}, {cw:e}); return b; })(),
      ));
  }
  box.append(h('div', {class:'row'}, h('h2', null, 'Continue watching'), strip));
}

