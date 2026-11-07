/* ---------- sound effects (tiny synthesized sounds, no files) ---------- */
const sfx = (() => {
  let ctx = null, bus = null, last = 0;
  const on = () => lsGet('streamlet.ui', {}).sound !== false;
  const ensure = () => {
    try {
      if (!ctx) {
        ctx = window.__sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
        const lp = ctx.createBiquadFilter(), master = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = .4; master.gain.value = .9;
        lp.connect(master); master.connect(ctx.destination);
        bus = lp;
      }
      if (ctx.state === 'suspended' && !window.__sfxCtx) ctx.resume();
    } catch {}
    return ctx;
  };
  // a soft rounded note: a sine plus a quiet octave, slow-ish attack, gentle decay
  const note = (f, dur, vol, t0 = 0) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .014); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    for (const [m, v] of [[1, 1], [2, .22]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f * m, t); o.frequency.exponentialRampToValueAtTime(f * m * .985, t + dur);
      og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .05);
    }
  };
  const whoosh = (t0, dur, vol) => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = .9;
    f.frequency.setValueAtTime(320, t); f.frequency.exponentialRampToValueAtTime(1700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * .28); g.gain.exponentialRampToValueAtTime(vol * .7, t + dur * .75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(t);
  };
  const snap = t0 => {                                               // a finger snap: sharp crack, a ringing "pop", a dull thump
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, sr = c.sampleRate;
    const noise = (dur, shape) => { const n = Math.floor(sr * dur), b = c.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, shape); const s2 = c.createBufferSource(); s2.buffer = b; return s2; };
    const crack = noise(.012, 2), hp = c.createBiquadFilter(), g1 = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1500; g1.gain.value = .32;
    crack.connect(hp); hp.connect(g1); g1.connect(bus); crack.start(t);
    const pop = noise(.09, 4), bp = c.createBiquadFilter(), g2 = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1050; bp.Q.value = 3.2; g2.gain.value = 1.7;
    pop.connect(bp); bp.connect(g2); g2.connect(bus); pop.start(t + .002);
    const th = c.createOscillator(), g3 = c.createGain();
    th.type = 'sine'; th.frequency.setValueAtTime(210, t); th.frequency.exponentialRampToValueAtTime(110, t + .1);
    g3.gain.setValueAtTime(.0001, t); g3.gain.exponentialRampToValueAtTime(.26, t + .005); g3.gain.exponentialRampToValueAtTime(.0001, t + .13);
    th.connect(g3); g3.connect(bus); th.start(t); th.stop(t + .16);
  };
  // the signature: a deep boom as the plug whips home, then a wide, warm chord that blooms, shimmers and fades slowly into the next screen (all synthesized, nothing sampled)
  let hall = null;
  const reverb = c => {                                              // a soft room: decaying noise as an impulse response
    if (hall) return hall;
    const len = Math.floor(c.sampleRate * 2.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i ? 1 : 1); }
    const lpIR = c.createBiquadFilter(); lpIR.type = 'lowpass'; lpIR.frequency.value = 1800;
    hall = c.createConvolver(); hall.buffer = ir;
    const wet = c.createGain(); wet.gain.value = .5; hall.connect(lpIR); lpIR.connect(wet); wet.connect(bus);
    return hall;
  };
  const bloom = t0 => {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + t0, room = reverb(c), out = c.createGain();
    out.gain.value = .32; out.connect(bus); out.connect(room);
    // the boom
    const bo = c.createOscillator(), bg = c.createGain();
    bo.type = 'sine'; bo.frequency.setValueAtTime(78, t); bo.frequency.exponentialRampToValueAtTime(41, t + .5);
    bg.gain.setValueAtTime(.0001, t); bg.gain.exponentialRampToValueAtTime(.55, t + .012); bg.gain.exponentialRampToValueAtTime(.0001, t + 1.3);
    bo.connect(bg); bg.connect(out); bo.start(t); bo.stop(t + 1.4);
    // the chord: open D with a ninth, each note doubled and slightly detuned, warmed by a filter that opens then slowly closes
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .7;
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1350, t + .6); lp.frequency.exponentialRampToValueAtTime(420, t + 4.6);
    const cg = c.createGain(); cg.gain.setValueAtTime(.0001, t); cg.gain.exponentialRampToValueAtTime(.17, t + .5); cg.gain.setValueAtTime(.17, t + .7); cg.gain.exponentialRampToValueAtTime(.0001, t + 5.6);
    lp.connect(cg); cg.connect(out);
    for (const f of [73.42, 110, 146.83, 185, 220, 329.63]) for (const dt of [-5, 5]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt;
      const g = c.createGain(); g.gain.value = f < 150 ? .7 : .38; o.connect(g); g.connect(lp); o.start(t); o.stop(t + 5.7);
    }
    // glassy shimmer on top that swells in late
    const sg = c.createGain(); sg.gain.setValueAtTime(.0001, t + .3); sg.gain.exponentialRampToValueAtTime(.03, t + 1.2); sg.gain.exponentialRampToValueAtTime(.0001, t + 5.2); sg.connect(out);
    const trem = c.createOscillator(), tg = c.createGain(); trem.frequency.value = 5.2; tg.gain.value = .35; trem.connect(tg);
    for (const f of [440, 587.33]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = .5; tg.connect(g.gain); o.connect(g); g.connect(sg); o.start(t); o.stop(t + 5.3); }
    trem.start(t); trem.stop(t + 5.3);
  };
  return {
    tick(held){ if (!on()) return; const n = performance.now(); if (n - last < (held ? 130 : 55)) return; last = n; note(392, .11, .028); },
    select(){ if (!on()) return; note(440, .14, .05); },
    back(){ if (!on()) return; note(294, .14, .045); },
    warm(){ ensure(); },                                              // create the audio engine early so nothing is slow at the moment it's needed
    decode(ab){ const c = ensure(); return c ? c.decodeAudioData(ab) : Promise.reject(new Error('no audio')); },
    playBuffer(buf){                                                  // plays a ready-made sound; returns how long (ms) the speaker takes to produce it, so the picture can wait for it
      const c = ensure(); if (!c || !buf) return 0;
      const s2 = c.createBufferSource(); s2.buffer = buf; s2.connect(c.destination); s2.start();
      return Math.min(250, Math.round((c.outputLatency || c.baseLatency || 0) * 1000 + 30));
    },
    bootLite(){ ensure(); whoosh(.08, 1.66, .06); snap(1.75); },      // fallback if boot.mp3 isn't ready: whoosh + snap only, cheap
    bootFull(){ ensure(); whoosh(.08, 1.66, .06); snap(1.75); bloom(1.78); }   // used only by tools/make-boot-sound.js to render boot.mp3 (too heavy to run live on a TV)
  };
})();
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const act = keyAct(e), el = document.activeElement;
  const typing = el && ((el.tagName === 'INPUT' && !el.readOnly && !/^(checkbox|radio|button|range|submit)$/.test(el.type)) || (el.tagName === 'TEXTAREA' && !el.readOnly));
  if (!remoteMode && (e.key.startsWith('Arrow') || e.key === 'Enter')) { remoteMode = true; document.body.classList.add('remote'); }
  if ((e.key === 'Enter' || e.keyCode === 23) && !typing && !e.repeat && remoteMode) sfx.select();
  if (act === 'back' && !typing && remoteMode) sfx.back();
  if (!$('#exitDlg').hidden && act === 'back') { e.preventDefault(); $('#exStay').click(); return; }
  if (!$('#player').hidden && $('#ppanel').hidden && $('#exitDlg').hidden && playerKey(e, act)) return;
  if (act === 'back') {
    if (typing) { if (e.key === 'Escape') el.blur(); return; }
    e.preventDefault(); history.back(); return;
  }
  const holdFn = el && (el._holdFn || (el._entry && (() => openMenu(el._entry, el._ctx))));
  if (holdFn && act === 'info') { e.preventDefault(); holdFn(); return; }
  if (holdFn && (e.key === 'Enter' || e.keyCode === 23)) {
    e.preventDefault();
    if (!e.repeat && !okHold) okHold = {el, fired:false, t:setTimeout(() => { if (okHold) { okHold.fired = true; holdFn(); } }, 480)};
    return;
  }
  if (!typing && !$('#search').hidden && document.body.classList.contains('tv')) {
    if (e.key === 'Backspace') { e.preventDefault(); sBack(); return; }
    if (/^[a-z0-9 ]$/i.test(e.key)) { e.preventDefault(); sType(e.key.toLowerCase()); return; }
  }
  if (e.key === 'Backspace' && !typing) { e.preventDefault(); history.back(); return; }
  if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
    if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    e.preventDefault();
    const now = performance.now(), gap = now - (window.__lastNav || 0), held = e.repeat || gap < 260;   // a remote may not flag repeats, so a quick follow-up counts as held too
    if (held && gap < 75) return;                                                                          // steady pace: extra repeats are dropped instead of piling up
    window.__lastNav = now;
    if (held) { document.body.classList.add('navheld'); clearTimeout(window.__nhT); window.__nhT = setTimeout(() => document.body.classList.remove('navheld'), 240); }   // while a key is held: no blur, no transitions, so every frame stays cheap
    const before = document.activeElement; moveFocus(e.key.slice(5).toLowerCase(), held); if (document.activeElement !== before) sfx.tick(held);
  }
}, true);

/* custom controls (TV layout) */
const fmtClock = t => { t = Math.max(0, Math.round(t || 0)); const h_ = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h_ ? h_ + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); };
function updateCtl(){
  const v = $('#vid'); if ($('#pctl').hidden) return;
  $('#pfill').style.width = (v.duration ? v.currentTime / v.duration * 100 : 0) + '%';
  $('#ptime').textContent = fmtClock(v.currentTime) + ' / ' + fmtClock(v.duration);
  $('#pPlay').textContent = v.paused ? '▶' : '⏸';
}
for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata']) $('#vid').addEventListener(ev, updateCtl);
$('#pPlay').onclick = playerToggle; $('#pRew').onclick = () => playerSeek(-10); $('#pFwd').onclick = () => playerSeek(10);
$('#pseek').addEventListener('click', e => { const v = $('#vid'), r = e.currentTarget.getBoundingClientRect(); if (v.duration) { v.currentTime = v.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); showBar(); } });

/* ---------- intro animation: boot, wait, draw the logo (plug attached all along), shake, hold, fade ---------- */
(function(){
  const el = $('#intro');
  if (navigator.webdriver && !/[?&]intro/.test(location.search)) { el.remove(); return; }
  const spin = el.querySelector('.ispin'), ring = el.querySelector('.iring'), play = el.querySelector('.iplay'), plug = el.querySelector('.iplug'), glow = el.querySelector('.iglow');
  const w = $('#iword'), lock = el.querySelector('.ilock'), lk = {w:null};
  let bootBuf = null;                                                // fallback path only: the boot sound as a ready-made file, decoded now, played the moment the animation starts
  w.append('Stream', h('span', {class:'lgr'}, 'let'));
  w.style.opacity = '0';
  let len = 1800; try { len = ring.getTotalLength(); } catch {}
  ring.style.strokeDasharray = len; ring.style.strokeDashoffset = len; play.style.opacity = '0'; plug.style.opacity = '0'; glow.style.opacity = '0';
  const clamp = t => Math.max(0, Math.min(1, t)), inout = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, out = t => 1 - Math.pow(1 - t, 3), back = t => { const c = 1.70158; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const seg = (n, a, d) => clamp((n - a) / d);
  const PLAY_END = 4800;                                            // everything has finished and the logo has been held for a moment
  const appShown = () => !$('#profiles').hidden || !$('#launcher').hidden || !$('#login').hidden || document.body.classList.contains('onhome');
  let done = false, n = 0, last = null;
  let vid = null;
  const end = () => { if (done) return; done = true; el.classList.add('out');
    if (vid) { const gone = () => el.remove(); vid.onended = gone; setTimeout(gone, 9000); }      // the video keeps playing (invisible) so the sound can fade out on its own
    else setTimeout(() => el.remove(), 800); };
  const render = n => {
    const sp = out(seg(n, 250, 1500));                              // swirl: starts small, blurred and spinning, then settles into the ring
    glow.style.opacity = out(seg(n, 300, 1800));
    plug.style.opacity = out(seg(n, 250, 500));
    const gp = Math.max(.001, out(seg(n, 250, 1500))); ring.style.strokeDasharray = gp + ' 2'; ring.style.strokeDashoffset = 2 * gp + 1;   // pathLength is 1: the cord grows out of the plug
    spin.setAttribute('transform', `rotate(${260 * (1 - sp)} 487 520) translate(487 520) scale(${.45 + .55 * sp}) translate(-487 -520)`);
    ring.style.filter = sp < 1 ? `blur(${14 * Math.pow(1 - sp, 1.5)}px)` : 'none';
    const pp = back(seg(n, 1750, 550));
    play.style.opacity = clamp(seg(n, 1750, 200)); play.setAttribute('transform', `translate(520 510) scale(${.3 + .7 * pp}) translate(-520 -510)`);
    const q = seg(n, 1750, 750), ang = 34 * Math.sin(q * Math.PI * 6) * Math.exp(-3.4 * q);   // the moment the swirl stops the plug whips and settles
    plug.setAttribute('transform', `rotate(${ang} 765 424)`);
    if (lk.w == null) {                                              // measured once, in layout pixels, before anything moves
      lk.w = lock.offsetWidth; lk.wl = w.offsetLeft; lk.ww = w.offsetWidth;
      lk.lw = el.querySelector('.ilogo').getBoundingClientRect().width;                  // the logo's own width (the name now overlaps its empty right margin)
      lk.l = lk.w / 2 - lk.lw / 2;                                   // logo starts in the middle of the screen
      lk.p = Math.min(lk.lw * .86, lk.wl - 2);                                            // the plug's right edge: the name comes out from right behind it
      lk.t = lk.p + lk.l - lk.ww - lk.wl;                            // and starts completely hidden there
    }
    const k = inout(seg(n, 2650, 900)), tl = (1 - k) * lk.l, tw = (1 - k) * lk.t;
    el.querySelector('.ilogo').style.transform = `translateX(${tl}px)`;
    w.style.transform = `translateX(${tw}px)`;
    const hide = Math.max(0, Math.min(lk.ww + 14, lk.p + tl - (lk.wl + tw)));     // the wall travels with the plug: only what has slid out past it shows
    w.style.clipPath = `inset(-12px -12px -12px ${hide}px)`;
  };
  render(0); el.querySelector('.ilogo').style.opacity = '1'; w.style.opacity = '1';   // set the first frame before anything is shown
  window.__introSet = x => { done = true; render(x); };
  const frame = ts => {
    if (done) return;
    if (last === null) { last = ts; const lat = bootBuf ? sfx.playBuffer(bootBuf) : (sfx.bootLite(), 0); n = -lat; }   // the picture waits for the speaker's delay so sound and image line up
    n += Math.min(ts - last, 50);                                   // a slow start only slows the animation down; it never skips it
    last = ts;
    render(n);
    if (n >= PLAY_END && appShown()) { end(); return; }
    requestAnimationFrame(frame);
  };
  setTimeout(end, 14000);                                           // safety net only
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(frame), 400)));
  const startJS = () => {                                           // fallback: the same animation drawn live (used when the video can't play)
    try { sfx.warm(); fetch(new URL((FLAVOR === 'auto' ? '' : '../') + 'boot.mp3', location.href)).then(r => r.arrayBuffer()).then(ab => sfx.decode(ab)).then(b => { bootBuf = b; }).catch(() => {}); } catch {}
    if (document.readyState === 'complete') ready(); else addEventListener('load', ready, {once:true});
  };
  if (FLAVOR !== 'tv') { startJS(); return; }                       // phone and web keep the live animation (a wide video looks like an embed on a portrait screen)
  /* Normally the intro is a ready-made video (picture and sound together, hardware decoded): smooth even while the page is still loading. */
  vid = h('video', {id:'ivid', src:new URL((FLAVOR === 'auto' ? '' : '../') + 'boot.mp4', location.href).href, preload:'auto', playsinline:'', 'disable-pip':'', poster:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg4hICAABIACcc7ivtAAAAAElFTkSuQmCC'});   // own poster: the web view's default one is a big play button
  el.classList.add('vid'); el.prepend(vid);
  let began = false;
  const fallback = () => { if (began || done) return; began = true; try { vid.pause(); } catch {} vid.remove(); vid = null; el.classList.remove('vid'); startJS(); };
  vid.addEventListener('error', fallback);
  vid.addEventListener('playing', () => { if (began) return; began = true; clearTimeout(giveUp);
    const show = () => vid && (vid.style.opacity = '1');                      // invisible until a real picture is there
    if (vid.requestVideoFrameCallback) vid.requestVideoFrameCallback(show); else setTimeout(show, 80);
    const poll = setInterval(() => { if (done || !vid) return clearInterval(poll); if (vid.currentTime >= PLAY_END / 1000 && appShown()) { clearInterval(poll); end(); } }, 100); }, {once:true});
  const giveUp = setTimeout(fallback, 4000);                         // nothing playing after 4 s (autoplay blocked, slow network): draw it live instead
  const go = () => { const r = vid.play(); if (r && r.catch) r.catch(fallback); };
  if (vid.readyState >= 3) go(); else vid.addEventListener('canplay', go, {once:true});
})();

/* ---------- boot ---------- */
history.replaceState({guard:true}, '');
try { const N = nativePlayer(); if (N && N.setKeepAwake) N.setKeepAwake({on:true}); } catch {}
initProfiles();
startAuth();
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(()=>{});
