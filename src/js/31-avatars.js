/* ---------- profile pictures: the drawn Streamlet characters, emoji avatars in categories, or your own picture.
   Stored on the profile as  a:<n> (drawn), e:<emoji>|<palette> (emoji on a gradient) or img:<data url> (your picture, 200 px JPEG).
   Emoji only from Emoji 12 (2019) or older, so older Android TVs and Samsung TVs draw them all. ---------- */
const AV_GRAD = [['#ff7eb3','#ff5f8d'],['#7c5cff','#4fc3ff'],['#34d399','#22d3ee'],['#f6a23c','#ff6b6b'],['#a78bfa','#f9a8d4'],['#38bdf8','#6366f1'],
  ['#fb7185','#fbbf24'],['#2dd4bf','#818cf8'],['#fda4af','#fde68a'],['#22c55e','#14b8a6'],['#f43f5e','#fb923c'],['#334155','#64748b'],['#0ea5e9','#22d3ee'],['#c084fc','#6366f1']];
const AV_CATS = [
  {id:'draw', name:'Streamlet', drawn:true},
  {id:'animals', name:'Animals', list:'🐶 🐱 🦊 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦉 🐴 🐺 🐰 🐻 🐹 🐭 🦝 🐙 🦈 🐳 🐬 🦒 🦓 🐘 🦔 🦩 🦜 🐢 🦦 🦥 🐝 🦋 🐞 🦀 🐠 🐊'},
  {id:'people', name:'People', list:'👩‍🚀 👨‍🚀 👩‍🎤 👨‍🎤 👩‍🍳 👨‍🍳 👩‍🎨 👨‍🎨 👩‍🔬 👨‍🔬 👩‍💻 👨‍💻 👩‍🚒 👨‍🚒 👮‍♀️ 👮‍♂️ 🕵️‍♀️ 🕵️‍♂️ 👷‍♀️ 👷‍♂️ 👸 🤴 👩‍🌾 👨‍🌾 👩‍🏫 👨‍🏫 👩‍⚕️ 👨‍⚕️ 👩‍✈️ 👨‍✈️ 💃 🕺 🤠 👶 👵 👴 🎅 🤶 💂‍♀️ 🏄‍♀️'},
  {id:'creatures', name:'Creatures', list:'🐉 🐲 🦄 🦖 🦕 🧜‍♀️ 🧜‍♂️ 🧚‍♀️ 🧚‍♂️ 🧞‍♂️ 🧞‍♀️ 🧙‍♀️ 🧙‍♂️ 🧝‍♀️ 🧝‍♂️ 🧛‍♀️ 🧛‍♂️ 🧟‍♀️ 🧟‍♂️ 👽 👾 🤖 👻 💀 🎃 👹 👺 🤡 🦸‍♀️ 🦸‍♂️ 🦹‍♀️ 🦹‍♂️'},
  {id:'faces', name:'Faces', list:'😎 🤠 🥳 🤓 😇 🤩 😜 🤗 😴 🤯 🥶 🥵 😈 🤑 😋 🤪 🧐 😏 😺 😸 😻 🙀 🙈 🙉 🙊 💩'},
  {id:'food', name:'Food', list:'🍕 🍔 🌮 🌯 🍟 🍩 🍪 🧁 🍰 🍦 🍭 🍫 🍿 🥨 🧀 🥑 🍓 🍉 🍍 🍒 🍣 🍜 🥟 🍙 🥞 🧇'},
  {id:'nature', name:'Nature & space', list:'🌵 🌻 🌸 🍄 🌴 🍁 🌈 ⭐ 🌙 ☀️ ⚡ ❄️ 🔥 🌊 🌋 🏔️ 🪐 🚀 🛸 ☄️ 🌍 🌌 🎄 🌷'},
  {id:'play', name:'Sports & play', list:'⚽ 🏀 🏈 ⚾ 🎾 🏐 🏒 🥊 🏓 🎳 ⛳ 🛹 🏆 🎮 🎲 ♟️ 🎯 🎸 🥁 🎧 🎨 🎤 🏎️ 🚲'},
  {id:'own', name:'Your picture', own:true}];
AV_CATS.forEach((c, ci) => { if (c.list) c.items = c.list.split(' ').map((e, i) => 'e:' + e + '|' + ((i * 5 + ci * 3) % AV_GRAD.length)); });

/* drawn into an avatar span made by avatarEl (08-repo-profiles-avatars.js) */
function avPaint(el, v){
  if (/^e:/.test(v)) {
    const [e, p] = v.slice(2).split('|'), g = AV_GRAD[(+p || 0) % AV_GRAD.length];
    el.style.background = `linear-gradient(135deg,${g[0]},${g[1]})`;
    el.replaceChildren(h('span', {class:'ave'}, e));
    return true;
  }
  if (/^img:data:image\//.test(v)) { el.style.background = '#222'; el.replaceChildren(h('img', {class:'avimg', src:v.slice(4), alt:'', draggable:'false'})); return true; }
  return false;
}

/* the picker: a pop-up over the profile editor, one tab per category */
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16z" fill="#fff" stroke="#1b1b22" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="#1b1b22" stroke-width="1.6"/></svg>';
let avPop = null;
function avPicker(pr, onPick){
  const cat0 = /^img:/.test(pr.avatar || '') ? 'own' : /^e:/.test(pr.avatar || '') ? (AV_CATS.find(c => c.items && c.items.includes(pr.avatar)) || AV_CATS[1]).id : 'draw';
  let catNow = cat0, stopOwn = null;
  const tabs = h('div', {class:'avtabs', role:'tablist'}), body = h('div', {class:'avbody'});
  const W = h('div', {id:'avPop', class:'avpop', role:'dialog', 'aria-modal':'true', 'aria-label':'Choose a picture'},
    h('div', {class:'avcard'},
      h('div', {class:'avhead'}, h('h2', null, 'Choose a picture'), h('button', {class:'btn ghost sm', type:'button', onclick:() => avClose()}, 'Close')),
      tabs, body));
  const pick = v => { pr.avatar = v; onPick(); avClose(); };
  const tile = v => h('button', {type:'button', class:'avb' + (pr.avatar === v ? ' on' : ''), 'aria-label':'Picture', onclick:() => pick(v)}, avatarEl({avatar:v}, 72));
  const show = id => {
    if (stopOwn) { stopOwn(); stopOwn = null; }
    catNow = id;
    tabs.querySelectorAll('button').forEach(b => { const on = b.dataset.c === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const c = AV_CATS.find(x => x.id === id);
    if (c.drawn) body.replaceChildren(h('div', {class:'avgrid'}, Array.from({length:AV_COUNT}, (_, i) => tile('a:' + i))));
    else if (c.items) body.replaceChildren(h('div', {class:'avgrid'}, c.items.map(tile)));
    else stopOwn = avOwn(body, pr, pick);
    body.scrollTop = 0;
  };
  tabs.replaceChildren(...AV_CATS.map(c => {
    const b = h('button', {type:'button', role:'tab', class:'chip', 'data-c':c.id}, c.name);
    b.onclick = () => show(c.id);
    b.onfocus = () => { if (document.body.classList.contains('tv') && catNow !== c.id) show(c.id); };   // on the TV, moving along the tabs is enough
    return b;
  }));
  document.body.append(W);
  avPop = {W, stop:() => { if (stopOwn) stopOwn(); }};
  try { pushLayer('avpop'); } catch {}
  show(catNow);
  const f = body.querySelector('.avb.on') || tabs.querySelector('.on'); if (f) f.focus({preventScroll:false});
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
function avShrink(file){
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 200;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 200, 200);
      URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('not a picture')); };
    img.src = u;
  });
}
function avOwn(body, pr, pick){
  const tv = document.body.classList.contains('tv');
  const mine = /^img:/.test(pr.avatar || '') ? h('div', {class:'avown-cur'}, avatarEl(pr, 120), h('button', {class:'btn', type:'button', onclick:() => pick(pr.avatar)}, 'Keep this picture')) : null;
  if (!tv || typeof qrcode !== 'function') {
    const inp = h('input', {type:'file', accept:'image/*', hidden:true});
    const msg = h('p', {class:'sub'}, 'Any photo or picture. It is cropped to a square from the middle.');
    inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; msg.textContent = 'One moment…'; try { pick('img:' + await avShrink(f)); } catch { msg.textContent = "That file isn't a picture Streamlet can open."; } };
    body.replaceChildren(h('div', {class:'avown'}, mine, h('button', {class:'btn', type:'button', onclick:() => inp.click()}, 'Choose a picture'), msg, inp));
    return null;
  }
  if (!FB || !db) { body.replaceChildren(h('div', {class:'avown'}, mine, h('p', {class:'sub'}, 'Not connected. Check the internet and open this tab again.'))); return null; }
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
    if (!dead) status.textContent = 'The code expired. Open this tab again for a new one.';
  })();
  return () => { dead = true; FB.fs.deleteDoc(ref).catch(() => {}); };
}
