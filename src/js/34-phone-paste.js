/* ---------- type on your phone instead of the TV remote: a QR code opens paste.html on the phone, the text comes back encrypted
   through a short-lived Firestore document (pairings/{id}, like signing in with your phone and the profile picture) ---------- */
let ppPop = null;
function phoneText(title, hint){
  return new Promise(res => {
    if (!FB || !db || typeof qrcode !== 'function') { toast('Not connected. Check the internet and try again.'); return res(null); }
    const rnd = n => crypto.getRandomValues(new Uint8Array(n));
    const b64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const pid = b64(rnd(16)), kraw = rnd(16), ref = FB.fs.doc(db, 'pairings', pid);
    const url = new URL((FLAVOR === 'auto' ? '' : '../') + 'paste.html', location.href).href + '?t=' + encodeURIComponent(title) + '#' + pid + '.' + b64(kraw);
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    const box = h('div', {class:'qrbox'}); box.innerHTML = q.createSvgTag({cellSize:6, margin:0, scalable:true});
    const status = h('p', {class:'sub'}, 'Waiting for your phone…');
    let dead = false;
    const done = v => { if (dead) return; dead = true; FB.fs.deleteDoc(ref).catch(() => {}); W.remove();
      try { const i = layersOpen.lastIndexOf('ppaste'); if (i >= 0) { layersOpen.splice(i, 1); focusStack.splice(i, 1); if (!layersOpen.length) document.body.classList.remove('inlayer'); history.replaceState({page:pageNow(), layers:[...layersOpen]}, ''); } } catch {}
      ppPop = null; res(v); };
    const W = h('div', {id:'ppPop', class:'avpop', role:'dialog', 'aria-modal':'true', 'aria-label':title},
      h('div', {class:'avcard spcard'},
        h('div', {class:'avhead'}, h('h2', null, title), h('button', {class:'btn ghost sm', type:'button', onclick:() => done(null)}, 'Cancel')),
        h('div', {class:'avown tv'}, h('div', {class:'pairrow'}, box, h('div', {class:'pairtxt'},
          h('p', null, h('b', null, '1.'), " Scan the code with your phone's camera."),
          h('p', null, h('b', null, '2.'), ' Paste or type ' + (hint || 'it') + ' on your phone, then Send.'),
          h('p', null, h('b', null, '3.'), ' It fills in here by itself.'), status)))));
    document.body.append(W); ppPop = {cancel:() => done(null)};
    try { pushLayer('ppaste'); } catch {}
    W.querySelector('.btn').focus({preventScroll:true});
    (async () => {
      try { await FB.fs.setDoc(ref, {t:Date.now()}); } catch (e) { status.textContent = "Couldn't start: " + (e.code || e.message); return; }
      const t0 = Date.now();
      while (!dead && Date.now() - t0 < 10 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 1500)); if (dead) return;
        let d; try { d = await FB.fs.getDoc(ref); } catch { continue; }
        const v = d.exists() ? d.data() : null; if (!v || !v.ct) continue;
        try {
          const k = await crypto.subtle.importKey('raw', kraw, 'AES-GCM', false, ['decrypt']);
          const txt = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(v.iv)}, k, unb64(v.ct)))).text;
          return done(String(txt || '').trim().slice(0, 4000));
        } catch { status.textContent = "That didn't come through. Send it again from your phone."; FB.fs.setDoc(ref, {t:Date.now()}).catch(() => {}); }
      }
      if (!dead) status.textContent = 'The code expired. Cancel and try again.';
    })();
  });
}
LAYER_CLOSERS.ppaste = () => { if (ppPop) ppPop.cancel(); };
/* a "From phone" button beside a text field, on the TV only. After the text arrives the field gets it and its change handler runs */
function phoneBtn(inp, title, hint){
  if (!inp || inp._pb || !document.body.classList.contains('tv')) return;
  inp._pb = 1;
  const b = h('button', {class:'btn ghost sm pbtn', type:'button', title:'Type it on your phone'}, '📱 From phone');
  b.onclick = async () => {
    const v = await phoneText(title, hint); if (v == null) { b.focus({preventScroll:true}); return; }
    inp.value = v; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.dispatchEvent(new Event('change', {bubbles:true}));
    toast('Received from your phone'); inp.focus({preventScroll:true});
  };
  inp.after(b);
}
function phoneBtns(){
  phoneBtn($('#setTmdb'), 'TMDB API key', 'your TMDB API key');
  phoneBtn($('#tioKey'), 'Real-Debrid token', 'your Real-Debrid token (real-debrid.com/apitoken)');
  phoneBtn($('#addUrl'), 'Addon link', 'the addon link');
}
