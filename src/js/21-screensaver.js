/*@tv*/
/* ---------- screensaver: a black screen and the Streamlet plug slithering around like the old bouncing-logo savers, its cord following behind like a snake ---------- */
(function(){
  const cfg = () => lsGet('streamlet.ui', {});
  const enabled = () => cfg().saver !== false;
  const delay = () => Math.max(1, +cfg().saverMin || 5) * 60 * 1000;
  const cv = h('canvas', {id:'saver'}); document.body.append(cv);
  const ctx = cv.getContext('2d');
  let on = false, raf = 0, idleT = 0, W = 0, H = 0, S = 1;
  let x = 0, y = 0, psi = 0, t0 = 0, last = 0, bounceAt = 0, trail = [];
  const BODY = new Path2D('M-100 -66H100Q124 -66 124 -42V12Q124 74 62 82L38 120H-38L-62 82Q-124 74 -124 12V-42Q-124 -66 -100 -66Z');
  const PRONG = new Path2D(); PRONG.roundRect ? (PRONG.roundRect(-74, -148, 38, 104, 19), PRONG.roundRect(36, -148, 38, 104, 19)) : (PRONG.rect(-74, -148, 38, 104), PRONG.rect(36, -148, 38, 104));
  const fit = () => { const d = Math.min(window.devicePixelRatio || 1, 1.5); W = innerWidth; H = innerHeight; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0); S = H / 1080; };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const TAIL = [162, 75, 255], HEAD = [32, 216, 245];
  function frame(ts){
    if (!on) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    const t = (ts - t0) / 1000, speed = 150 * S, m = 150 * S;
    const heading = psi + 0.55 * Math.sin(t * 1.9);                      // the weaving that makes it a snake
    let vx = Math.cos(heading) * speed, vy = Math.sin(heading) * speed;
    x += vx * dt; y += vy * dt;
    if (ts - bounceAt > 250) {
      if ((x < m && vx < 0) || (x > W - m && vx > 0)) { psi = Math.PI - psi; bounceAt = ts; }
      else if ((y < m * 1.6 && vy < 0) || (y > H - m && vy > 0)) { psi = -psi; bounceAt = ts; }
    }
    x = Math.max(m * .5, Math.min(W - m * .5, x)); y = Math.max(m, Math.min(H - m * .5, y));
    const lp = trail[trail.length - 1];
    if (!lp || Math.hypot(x - lp[0], y - lp[1]) >= 5 * S) trail.push([x, y]);
    const maxN = 240; if (trail.length > maxN) trail.splice(0, trail.length - maxN);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = trail.length;
    for (let i = 1; i < n; i++) {                                           // the cord: thin and purple at the tail, thick and cyan near the plug
      const k = i / n, c = mix(TAIL, HEAD, k);
      ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.lineWidth = (6 + 18 * k) * S * 1.1;
      ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
    }
    const nx = Math.cos(heading), ny = Math.sin(heading);                   // the plug: prongs lead, the cord leaves from its back
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(ny, nx) + Math.PI / 2); ctx.scale(.4 * S * 1.35, .4 * S * 1.35); ctx.translate(0, -112);
    const g = ctx.createLinearGradient(-124, -66, 124, 120); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ddd3ff');
    ctx.fillStyle = g; ctx.fill(PRONG); ctx.fill(BODY); ctx.restore();
  }
  function start(){
    if (on || document.hidden) return;
    on = true; fit(); trail = []; x = W * (.25 + Math.random() * .5); y = H * (.25 + Math.random() * .5); psi = Math.random() * Math.PI * 2;
    t0 = performance.now(); last = 0; bounceAt = 0; cv.classList.add('on'); raf = requestAnimationFrame(frame);
  }
  function stop(){ if (!on) return; on = false; cancelAnimationFrame(raf); cv.classList.remove('on'); setTimeout(() => { if (!on) ctx.clearRect(0, 0, cv.width, cv.height); }, 900); }
  function arm(){
    clearTimeout(idleT); if (!enabled()) return;
    idleT = setTimeout(() => {
      const v = $('#vid'), playing = !$('#player').hidden && v && !v.paused && !v.ended;
      if (playing) arm(); else start();
    }, delay());
  }
  window.saverStart = start; window.saverStop = stop; window.saverArm = arm;
  const wake = e => {
    if (on) { stop(); if (e && (e.type === 'keydown' || e.type === 'click')) { e.preventDefault(); e.stopImmediatePropagation(); } }
    arm();
  };
  let mx = 0, my = 0;
  window.addEventListener('keydown', wake, true);
  window.addEventListener('click', wake, true);
  window.addEventListener('touchstart', wake, true);
  window.addEventListener('mousemove', e => { if (Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) > 6) { mx = e.clientX; my = e.clientY; wake(e); } }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else arm(); });
  addEventListener('resize', () => { if (on) fit(); });
  arm();
})();
/*@end*/
