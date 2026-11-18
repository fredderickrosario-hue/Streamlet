/* Streamlet picture cropper: drag to move, pinch / wheel / slider to zoom, inside a circle. Used by the app (profile picture)
   and by avatar.html (picture sent from a phone to the TV). makeCropper(file) → Promise<{el, result()}>; result() gives a 256 px JPEG data URL. */
function makeCropper(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not a picture')); };
    img.onload = () => {
      const S = 240, W = img.naturalWidth, H = img.naturalHeight, base = S / Math.min(W, H);
      let z = 1, x = 0, y = 0;                                             // zoom on top of "cover", and the picture's offset from centre (in view px)
      const wrap = document.createElement('div'); wrap.className = 'crop';
      wrap.innerHTML = '<div class="cropw"><img class="cropg" alt="" draggable="false"><div class="cropv"><img alt="" draggable="false"></div></div><input class="cropz" type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><p class="croph">Drag to move · pinch or slide to zoom</p>';
      const view = wrap.querySelector('.cropw'), pic = wrap.querySelector('.cropv img'), ghost = wrap.querySelector('.cropg'), zr = wrap.querySelector('.cropz');
      pic.src = ghost.src = url;                                           // the part outside the circle shows faded, to see what's around
      const clamp = () => { const s = base * z, mx = Math.max(0, (W * s - S) / 2), my = Math.max(0, (H * s - S) / 2); x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y)); };
      const paint = () => { clamp(); const s = base * z; for (const im of [pic, ghost]) { im.style.width = W * s + 'px'; im.style.height = H * s + 'px'; im.style.transform = `translate(${x - W * s / 2}px,${y - H * s / 2}px)`; } zr.value = z; };
      const zoomTo = nz => { const k = Math.min(4, Math.max(1, nz)) / z; z *= k; x *= k; y *= k; paint(); };
      const pts = new Map(); let last = null, pinch = 0;
      view.addEventListener('pointerdown', e => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; e.preventDefault(); });
      view.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomTo(z * d / pinch); pinch = d; return; }
        if (last) { x += e.clientX - last[0]; y += e.clientY - last[1]; paint(); }
        last = [e.clientX, e.clientY];
      });
      const up = e => { pts.delete(e.pointerId); pinch = 0; last = pts.size ? [...pts.values()][0] : null; };
      view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
      view.addEventListener('wheel', e => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, {passive:false});
      zr.oninput = () => zoomTo(+zr.value);
      wrap.tabIndex = -1;
      wrap.addEventListener('keydown', e => {                              // arrows move, + / - zoom (remote, keyboard)
        const m = {ArrowLeft:[12, 0], ArrowRight:[-12, 0], ArrowUp:[0, 12], ArrowDown:[0, -12]}[e.key];
        if (m && e.target !== zr) { x += m[0]; y += m[1]; paint(); e.preventDefault(); }
        if (e.key === '+' || e.key === '=') zoomTo(z * 1.1); if (e.key === '-') zoomTo(z / 1.1);
      });
      paint();
      res({el:wrap, result(){
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const s = base * z, sx = (W * s / 2 - x - S / 2) / s, sy = (H * s / 2 - y - S / 2) / s, sw = S / s;
        c.getContext('2d').drawImage(img, sx, sy, sw, sw, 0, 0, 256, 256);
        URL.revokeObjectURL(url); return c.toDataURL('image/jpeg', .86);
      }});
    };
    img.src = url;
  });
}
if (typeof window !== 'undefined') window.makeCropper = makeCropper;
