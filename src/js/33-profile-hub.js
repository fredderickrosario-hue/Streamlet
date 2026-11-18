/* ---------- the Profile page: Profile and Settings in one. Your card at the top (select the picture to edit the profile and its own
   settings), then App settings, Account, Sources and About, then Sign out. Kids profiles only get their card. ---------- */
function meCard(){
  const pr = profile; if (!pr) return h('div');
  const kid = isKid(), hs = histGet().length, ws = wlGet().length;
  const pic = h('button', {type:'button', class:'pe-avbtn mepic', 'aria-label':'Edit profile', title:'Edit profile', onclick:async () => { if (await kidGate(null)) editProfile(pr.id); }},
    avatarEl(pr, 140), h('span', {class:'pbadge', 'aria-hidden':'true'}, PENCIL_SVG()));
  const others = profiles.filter(x => x.id !== pr.id);
  const swap = others.length ? h('div', {class:'meswap'}, h('div', {class:'meswh'}, 'Switch to'),
    h('div', {class:'meswr'}, ...others.slice(0, 6).map(x => h('button', {class:'meswb', type:'button', onclick:() => selectProfile(x)}, avatarEl(x, 64), h('span', null, x.name))))) : null;
  return h('div', {class:'mehub mehub2'},
    h('div', {class:'mehero'},
      h('div', {class:'meid'}, pic,
        h('div', {class:'metx'}, h('h2', null, pr.name), h('p', null, kid ? 'Kids profile' : user ? (user.email || 'Signed in') : 'This device only'),
          h('div', {class:'mestat'}, h('span', null, h('b', null, String(hs)), ' in progress'), h('span', null, h('b', null, String(ws)), ' in watchlist')),
          h('div', {class:'mebtns'},
            h('button', {class:'btn', type:'button', onclick:async () => { if (await kidGate(null)) showProfiles(); }}, 'Switch profile'),
            kid ? null : h('button', {class:'btn ghost', type:'button', onclick:() => { manageProfiles = true; showProfiles(); manageProfiles = true; renderProfiles(); }}, 'Manage profiles')))),
      swap));
}
let soArmed = 0;
function signOutAsk(e){
  const b = e && e.currentTarget, small = b && b.querySelector('small');
  if (Date.now() - soArmed > 4000) { soArmed = Date.now(); if (small) small.textContent = 'Select again to sign out. This device forgets the account and its data'; return; }
  (async () => { try { await FB.au.signOut(auth); } catch {} try { Object.keys(localStorage).filter(k => k.startsWith('streamlet.')).forEach(k => localStorage.removeItem(k)); } catch {} location.reload(); })();
}

/* Account > Security: password link and account deletion (with everything stored under it) */
function acctMoreFill(){
  const box = $('#acctMore'); if (!box) return;
  box.hidden = !(FB && user && user.email);
  if (box.hidden) return;
  const pw = $('#pwReset'), del = $('#acctDel');
  pw.onclick = async () => {
    pw.disabled = true;
    try { await FB.au.sendPasswordResetEmail(auth, user.email); $('#pwHint').textContent = `Link sent to ${user.email}. Check your inbox and spam folder`; toast('Password link sent'); }
    catch (e) { toast("Couldn't send it: " + (e.code || e.message)); }
    pw.disabled = false;
  };
  let armed = 0;
  del.onclick = async () => {
    if (Date.now() - armed > 6000) { armed = Date.now(); del.textContent = 'Select again to delete'; toast('This cannot be undone. Select Delete again to confirm'); return; }
    del.disabled = true; del.textContent = 'Deleting…';
    const {doc, deleteDoc, getDocs, collection} = FB.fs, uid = user.uid;
    try {
      for (const sub of ['profiles', 'sync']) { try { const q = await getDocs(collection(db, 'users', uid, sub)); for (const d of q.docs) await deleteDoc(d.ref); } catch {} }
      try { await deleteDoc(doc(db, 'users', uid)); } catch {}
      await FB.au.deleteUser(user);
      try { Object.keys(localStorage).filter(k => k.startsWith('streamlet.')).forEach(k => localStorage.removeItem(k)); } catch {}
      toast('Account deleted'); setTimeout(() => location.reload(), 1200);
    } catch (e) {
      del.disabled = false; del.textContent = 'Delete';
      if (e && e.code === 'auth/requires-recent-login') toast('For safety, sign out and sign in again, then delete the account right away');
      else toast("Couldn't delete the account: " + (e.code || e.message));
    }
  };
}

/* ---------- kids PIN: a kids profile can ask for a 4-digit PIN before anyone leaves it (switching profile, managing profiles, editing) ---------- */
async function pinHash(pid, pin){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('streamlet-pin:' + pid + ':' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const kidFrom = () => profile || profiles.find(x => x.id === lsGet('streamlet.profile.last', null)) || null;
async function kidGate(target){                                            // true = go ahead
  const from = kidFrom();
  if (!from || !from.kids || !from.pin || (target && target.id === from.id)) return true;
  if (kidGate.ok && Date.now() - kidGate.ok < 60000) return true;          // a minute after the right PIN, no asking again
  const ok = await pinPad(`Enter ${from.name}'s PIN`, async v => (await pinHash(from.id, v)) === from.pin);
  if (ok) kidGate.ok = Date.now();
  return !!ok;
}
/* a 4-digit pad that works with a remote, a mouse or the keyboard. check(v) → true when right; without check it returns the digits */
function pinPad(title, check){
  return new Promise(res => {
    let v = '', busy = false;
    const dots = h('div', {class:'pindots'}), msg = h('p', {class:'pinmsg', 'aria-live':'polite'});
    const paintD = () => dots.replaceChildren(...[0, 1, 2, 3].map(i => h('i', {class:i < v.length ? 'on' : ''})));
    const done = r => { W.remove(); document.removeEventListener('keydown', kd, true); try { const i = layersOpen.lastIndexOf('pin'); if (i >= 0) { layersOpen.splice(i, 1); focusStack.splice(i, 1); if (!layersOpen.length) document.body.classList.remove('inlayer'); history.replaceState({page:pageNow(), layers:[...layersOpen]}, ''); } } catch {} pinPad.cancel = null; res(r); };
    const add = async d => {
      if (busy || v.length >= 4) return; v += d; paintD();
      if (v.length < 4) return;
      if (!check) return done(v);
      busy = true; const ok = await check(v); busy = false;
      if (ok) return done(true);
      msg.textContent = 'Wrong PIN. Try again.'; W.querySelector('.pindots').classList.add('shake'); setTimeout(() => { v = ''; paintD(); W.querySelector('.pindots').classList.remove('shake'); }, 450);
    };
    const del = () => { v = v.slice(0, -1); paintD(); msg.textContent = ''; };
    const key = (label, fn, cls) => h('button', {type:'button', class:'pinkey' + (cls ? ' ' + cls : ''), onclick:fn}, label);
    const W = h('div', {id:'pinPop', class:'avpop pinpop', role:'dialog', 'aria-modal':'true', 'aria-label':title},
      h('div', {class:'avcard pincard'}, h('h2', null, title), dots, msg,
        h('div', {class:'pingrid'}, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => key(String(n), () => add(String(n)))), key('Cancel', () => done(false), 'pinx'), key('0', () => add('0')), key('⌫', del, 'pinx'))));
    const kd = e => { if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); add(e.key); } else if (e.key === 'Backspace' && document.activeElement && !document.activeElement.matches('input')) { e.preventDefault(); del(); } };
    document.addEventListener('keydown', kd, true);
    document.body.append(W); paintD();
    pinPad.cancel = () => done(false);
    try { pushLayer('pin'); } catch {}
    const f = W.querySelector('.pinkey'); if (f) f.focus({preventScroll:true});
  });
}
LAYER_CLOSERS.pin = () => { if (pinPad.cancel) pinPad.cancel(); };
