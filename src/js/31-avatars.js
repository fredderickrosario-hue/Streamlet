/* ---------- profile pictures: rows of drawn avatars (Streamlet characters, monsters, DiceBear packs), an emoji row, or your own picture.
   Stored on the profile as a:<n> (Streamlet), m:<n> (monster), d:<pack>/<n> (pack file), e:<emoji>|<palette> or img:<data url> (200 px JPEG).
   Emoji only from Emoji 12 (2019) or older, so older Android TVs and Samsung TVs draw them all. ---------- */
const AV_GRAD = [['#ff7eb3','#ff5f8d'],['#7c5cff','#4fc3ff'],['#34d399','#22d3ee'],['#f6a23c','#ff6b6b'],['#a78bfa','#f9a8d4'],['#38bdf8','#6366f1'],
  ['#fb7185','#fbbf24'],['#2dd4bf','#818cf8'],['#fda4af','#fde68a'],['#22c55e','#14b8a6'],['#f43f5e','#fb923c'],['#334155','#64748b'],['#0ea5e9','#22d3ee'],['#c084fc','#6366f1']];

/* monsters: drawn in code from a number, like the Streamlet characters */
function monSvg(n){
  let s = (n + 1) * 2654435761 >>> 0; const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = 0; i < 6; i++) r();
  const pick = a => a[Math.floor(r() * a.length)];
  const BODY = [['#7ed957','#5cb83a'],['#a66cff','#8248e6'],['#ff9f43','#f07f1a'],['#2dd4bf','#16a394'],['#ff6b9d','#e84a7f'],['#ffd23f','#f0b400'],['#4ea8ff','#2b86e6'],['#ff5e57','#e03b34'],['#9be15d','#6cc04a'],['#c084fc','#a35bea']];
  const BG = [['#1f2a44','#3b1f4a'],['#2b1d3d','#123a4a'],['#3a1f2b','#1d2b45'],['#14324a','#2d1a3f']];
  const [c1, c2] = BODY[n % BODY.length], bg = BG[n % BG.length], dk = '#241b2f', gid = 'mg' + n + '_' + Math.floor(r() * 1e6);
  const shape = Math.floor(r() * 5), eyesN = pick([1, 2, 2, 2, 3]), horn = Math.floor(r() * 5), mouth = Math.floor(r() * 4);
  let body = '', top = 30;
  if (shape === 0) { body = `<circle cx="50" cy="60" r="30" fill="${c1}"/><path d="M50 30a30 30 0 0 1 0 60z" fill="${c2}"/>`; top = 31; }
  else if (shape === 1) { body = `<ellipse cx="50" cy="58" rx="24" ry="33" fill="${c1}"/><path d="M50 25a24 33 0 0 1 0 66z" fill="${c2}"/>`; top = 26; }
  else if (shape === 2) { body = `<rect x="20" y="30" width="60" height="58" rx="18" fill="${c1}"/><path d="M50 30h12a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H50z" fill="${c2}"/>`; top = 31; }
  else if (shape === 3) { body = `<path d="M20 92V58a30 30 0 0 1 60 0v34l-10-8-10 8-10-8-10 8-10-8z" fill="${c1}"/><path d="M50 28a30 30 0 0 1 30 30v34l-10-8-10 8-10-8z" fill="${c2}"/>`; top = 29; }
  else { body = `<path d="M50 24C70 24 82 44 82 64c0 16-14 26-32 26S18 80 18 64c0-20 12-40 32-40z" fill="${c1}"/><path d="M50 24c20 0 32 20 32 40 0 16-14 26-32 26z" fill="${c2}"/>`; top = 25; }
  const spots = Array.from({length:Math.floor(r() * 4)}, () => `<circle cx="${(28 + r() * 44).toFixed(1)}" cy="${(70 + r() * 14).toFixed(1)}" r="${(2 + r() * 3).toFixed(1)}" fill="#fff" opacity=".22"/>`).join('');
  let hornS = '';
  if (horn === 1) hornS = `<path d="M33 ${top + 6}l-6-18 14 12z" fill="#fff4d6"/><path d="M67 ${top + 6}l6-18-14 12z" fill="#efe0b8"/>`;
  else if (horn === 2) hornS = `<path d="M46 ${top + 2}l4-20 4 20z" fill="#fff4d6"/>`;
  else if (horn === 3) hornS = `<path d="M38 ${top + 4}q-6-14-12-16M62 ${top + 4}q6-14 12-16" stroke="${dk}" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="26" cy="${top - 12}" r="4.5" fill="#ffd23f"/><circle cx="74" cy="${top - 12}" r="4.5" fill="#ffd23f"/>`;
  else if (horn === 4) hornS = `<path d="M26 ${top + 16}l-6-20 18 10z" fill="${c1}"/><path d="M74 ${top + 16}l6-20-18 10z" fill="${c2}"/>`;
  const eye = (x, y, rr) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="#fff"/><circle cx="${x + rr * .2}" cy="${y + rr * .15}" r="${rr * .5}" fill="${dk}"/><circle cx="${x + rr * .38}" cy="${y - rr * .12}" r="${rr * .18}" fill="#fff"/>`;
  const ey = top + 22;
  const eyes = eyesN === 1 ? eye(50, ey, 11) : eyesN === 2 ? eye(39, ey, 7.5) + eye(61, ey, 7.5) : eye(36, ey + 2, 6) + eye(50, ey - 5, 6.5) + eye(64, ey + 2, 6);
  const my = ey + 20;
  let m = '';
  if (mouth === 0) m = `<path d="M38 ${my}q12 10 24 0" fill="none" stroke="${dk}" stroke-width="3" stroke-linecap="round"/><path d="M42 ${my + 3}l2 5 2-4zM54 ${my + 4}l2 4 2-5z" fill="#fff"/>`;
  else if (mouth === 1) m = `<path d="M36 ${my - 2}h28q0 14-14 14t-14-14z" fill="${dk}"/><path d="M38 ${my - 2}l3 4 3-4 3 4 3-4 3 4 3-4 3 4 3-4z" fill="#fff"/><ellipse cx="50" cy="${my + 8}" rx="6" ry="3" fill="#ff7a9a"/>`;
  else if (mouth === 2) m = `<path d="M36 ${my}l5-4 5 4 4-4 4 4 5-4 5 4" fill="none" stroke="${dk}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  else m = `<ellipse cx="50" cy="${my + 1}" rx="7" ry="5" fill="${dk}"/><path d="M45 ${my - 2}h10" stroke="#fff" stroke-width="2"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#${gid})"/><g transform="translate(50 60) scale(1.16) translate(-50 -60)">${hornS}${body}${spots}${eyes}${m}</g></svg>`;
}

/* drawn avatar packs, made with DiceBear (dicebear.com) and served as files from avatars/<pack>/<n>.svg; credits in Settings > About */
const AV_PACKS = [['monsters', 'Monsters'], ['robots', 'Robots'], ['adventurers', 'Adventurers'], ['toons', 'Toon heads'], ['smiles', 'Big smiles'],
  ['portraits', 'Portraits'], ['sketches', 'Sketches'], ['notion', 'Doodle people'], ['classics', 'Classics'], ['pixel', 'Pixel heroes']];
const AV_BASE = () => (FLAVOR === 'auto' ? '' : '../') + 'avatars/';
const AV_EMOJI_ROW = '🐶 🦊 🐼 🐯 🦁 🐸 🐵 🦉 🦄 🐙 🐳 🦖 🐉 👽 👾 🤖 👻 🎃 🧙‍♂️ 🧛‍♀️ 🧜‍♀️ 🦸‍♂️ 👩‍🚀 🥷 😎 🤠 🥳 🤓 🤩 😈 🍕 🍩 🍿 🌵 🌈 🔥 🚀 ⚽ 🎮 🎸'.replace('🥷 ', '').split(' ')
  .map((e, i) => 'e:' + e + '|' + ((i * 5) % AV_GRAD.length));

function avPaint(el, v){
  if (/^e:/.test(v)) {
    const [e, p] = v.slice(2).split('|'), g = AV_GRAD[(+p || 0) % AV_GRAD.length];
    el.style.background = `linear-gradient(135deg,${g[0]},${g[1]})`;
    el.replaceChildren(h('span', {class:'ave'}, e));
    return true;
  }
  if (/^m:\d+$/.test(v)) { el.innerHTML = monSvg(+v.slice(2)); return true; }
  if (/^d:[a-z]+\/\d+$/.test(v)) { el.style.background = '#2a2233'; el.replaceChildren(h('img', {class:'avimg', src:AV_BASE() + v.slice(2) + '.webp', decoding:'async', alt:'', loading:'lazy', draggable:'false'})); return true; }
  if (/^img:data:image\//.test(v)) { el.style.background = '#222'; el.replaceChildren(h('img', {class:'avimg', src:v.slice(4), alt:'', draggable:'false'})); return true; }
  return false;
}

/* the picker: a sheet of rows you scroll sideways (your picture first, emoji last) */
const UPLOAD = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="12" width="32" height="26" rx="5" fill="none" stroke="#fff" stroke-width="3"/><circle cx="18" cy="21" r="3.2" fill="#fff"/><path d="M11 35l9-9 6 6 5-5 7 8" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';
let avPop = null;
function avPicker(pr, onPick){
  let stopOwn = null;
  const pick = v => { pr.avatar = v; onPick(); avClose(); };
  const tile = v => h('button', {type:'button', class:'avb' + (pr.avatar === v ? ' on' : ''), 'aria-label':'Picture', onclick:() => pick(v)}, avatarEl({avatar:v}, 88));
  /* rows are filled when they come near the screen (or the row above gets the focus): opening stays quick on a TV */
  const lazy = [];
  const row = (title, make, now) => { const strip = h('div', {class:'avstrip'}), sec = h('section', {class:'avrow'}, h('h3', null, title), strip);
    sec._fill = () => { if (sec._done) return; sec._done = 1; strip.replaceChildren(...make()); }; if (now) sec._fill(); else lazy.push(sec); return sec; };
  const mineIs = (re) => re.test(pr.avatar || '');
  const ownBox = h('div', {class:'avownbox', hidden:true});
  const upBtn = h('button', {type:'button', class:'avb avup', 'aria-label':'Use your own picture'});
  upBtn.innerHTML = `<span class="av">${UPLOAD}</span>`;
  upBtn.onclick = () => {
    if (!ownBox.hidden) { ownBox.hidden = true; if (stopOwn) { stopOwn(); stopOwn = null; } return; }
    ownBox.hidden = false; stopOwn = avOwn(ownBox, pr, pick);
    const f = ownBox.querySelector('button'); if (f) f.focus(); ownBox.scrollIntoView({block:'nearest'});
  };
  const mine = /^img:/.test(pr.avatar || '') ? [tile(pr.avatar)] : [];
  const rows = [
    h('section', {class:'avrow'}, h('h3', null, 'Your picture'), h('div', {class:'avstrip'}, upBtn, ...mine), ownBox),
    row('Animal friends', () => Array.from({length:AV_COUNT}, (_, i) => tile('a:' + i)), true),
    ...AV_PACKS.map(([k, name], j) => row(name, () => Array.from({length:24}, (_, i) => tile(k === 'monsters' ? 'm:' + i : 'd:' + k + '/' + i)),
      j < 2 || mineIs(k === 'monsters' ? /^m:/ : new RegExp('^d:' + k + '/')))),
    row('Emoji', () => AV_EMOJI_ROW.map(tile), mineIs(/^e:/))];
  const W = h('div', {id:'avPop', class:'avpop', role:'dialog', 'aria-modal':'true', 'aria-label':'Choose a picture'},
    h('div', {class:'avcard'},
      h('div', {class:'avhead'}, h('h2', null, 'Choose a picture'), h('button', {class:'btn ghost sm', type:'button', onclick:() => avClose()}, 'Close')),
      h('div', {class:'avbody'}, rows)));
  document.body.append(W);
  const body = W.querySelector('.avbody'), secs = rows.slice();
  let io = null;
  try { io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target._fill && e.target._fill(); io.unobserve(e.target); } }, {root:body, rootMargin:'400px 0px'}); lazy.forEach(x => io.observe(x)); }
  catch { lazy.forEach(x => x._fill()); }
  const idle = window.requestIdleCallback || (f => setTimeout(f, 60));
  const more = () => { const x = lazy.find(r => !r._done); if (!x || !avPop) return; x._fill(); idle(more); };   // the rest, one row at a time when the device is free
  setTimeout(() => idle(more), 350);
  body.addEventListener('focusin', e => { const i = secs.indexOf(e.target.closest('.avrow')); for (const k of [i + 1, i + 2]) if (secs[k] && secs[k]._fill) secs[k]._fill(); });
  avPop = {W, stop:() => { if (stopOwn) stopOwn(); if (io) io.disconnect(); }};
  try { pushLayer('avpop'); } catch {}
  const on = W.querySelector('.avb.on') || W.querySelector('.avrow:nth-child(2) .avb');
  if (on) { on.focus({preventScroll:true}); on.scrollIntoView({block:'center', inline:'center'}); }
}
function avClose(fromBack){
  if (!avPop) return;
  const p = avPop; avPop = null; p.stop(); p.W.remove();
  if (!fromBack) { try { if (layersOpen[layersOpen.length - 1] === 'avpop') popLayer('avpop'); } catch {} }
  const b = document.querySelector('#profEd .pe-avbtn'); if (b) b.focus({preventScroll:true});
}
LAYER_CLOSERS.avpop = () => avClose(true);

/* your own picture: a file on a phone or computer; on a TV, a QR code opens avatar.html on your phone, which sends the picture back
   through a short-lived encrypted Firestore document (the same pairings/{id} rules as signing in with your phone) */
function avOwn(body, pr, pick){
  const tv = document.body.classList.contains('tv');
  const mine = null;
  if (!tv || typeof qrcode !== 'function') {
    const inp = h('input', {type:'file', accept:'image/*', hidden:true});
    const msg = h('p', {class:'sub'}, 'Any photo or picture. It is cropped to a square from the middle.');
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      let cr; try { cr = await makeCropper(f); } catch { msg.textContent = "That file isn't a picture Streamlet can open."; return; }
      const use = h('button', {class:'btn', type:'button', onclick:() => pick('img:' + cr.result())}, 'Use this picture');
      const again = h('button', {class:'btn ghost', type:'button', onclick:() => inp.click()}, 'Choose another');
      body.replaceChildren(h('div', {class:'avown'}, cr.el, h('div', {class:'mebtns', style:'justify-content:center'}, again, use), inp));
      use.focus({preventScroll:true});
    };
    body.replaceChildren(h('div', {class:'avown'}, mine, h('button', {class:'btn', type:'button', onclick:() => inp.click()}, 'Choose a picture'), msg, inp));
    return null;
  }
  if (!FB || !db) { body.replaceChildren(h('div', {class:'avown'}, mine, h('p', {class:'sub'}, 'Not connected. Check the internet, then try again.'))); return null; }
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  const b64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const pid = b64(rnd(16)), kraw = rnd(16);
  const url = new URL((FLAVOR === 'auto' ? '' : '../') + 'avatar.html', location.href).href + '#' + pid + '.' + b64(kraw);
  const ref = FB.fs.doc(db, 'pairings', pid);
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const box = h('div', {class:'qrbox'}); box.innerHTML = qr.createSvgTag({cellSize:6, margin:0, scalable:true});
  const status = h('p', {class:'sub'}, 'Waiting for your phone…');
  body.replaceChildren(h('div', {class:'avown tv'}, mine, h('div', {class:'pairrow'}, box, h('div', {class:'pairtxt'},
    h('p', null, h('b', null, '1.'), " Scan the code with your phone's camera."),
    h('p', null, h('b', null, '2.'), ' Pick a photo on your phone.'),
    h('p', null, h('b', null, '3.'), ' It shows up here by itself.'), status))));
  let dead = false;
  (async () => {
    try { await FB.fs.setDoc(ref, {t:Date.now()}); } catch (e) { status.textContent = "Couldn't start: " + (e.code || e.message); return; }
    const t0 = Date.now();
    while (!dead && Date.now() - t0 < 10 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 2000));
      if (dead) return;
      let d; try { d = await FB.fs.getDoc(ref); } catch { continue; }
      const v = d.exists() ? d.data() : null; if (!v || !v.ct) continue;
      try {
        const k = await crypto.subtle.importKey('raw', kraw, 'AES-GCM', false, ['decrypt']);
        const pt = new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(v.iv)}, k, unb64(v.ct)));
        const img = JSON.parse(pt).img;
        if (!/^data:image\/jpeg;base64,/.test(img) || img.length > 400000) throw new Error('bad picture');
        dead = true; FB.fs.deleteDoc(ref).catch(() => {}); pick('img:' + img); return;
      } catch { status.textContent = "That didn't come through. Try again from your phone."; FB.fs.setDoc(ref, {t:Date.now()}).catch(() => {}); }
    }
    if (!dead) status.textContent = 'The code expired. Select the picture button again for a new one.';
  })();
  return () => { dead = true; FB.fs.deleteDoc(ref).catch(() => {}); };
}
