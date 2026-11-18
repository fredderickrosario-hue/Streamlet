(() => {
  const st = document.createElement('style'); st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.append(st);
  const vis = el => { if (el.closest('[hidden]')) return false; const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const key = el => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const nm = el => key(el) + ' "' + ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 20) + '"';
  window.__audit = () => {
    const top = el => { const r = el.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t) || t.contains(el)); };
    const els = [...document.querySelectorAll('button:not([disabled]),a[href],input:not([type=hidden]),select,textarea,[tabindex="0"]')].filter(e => vis(e) && top(e));
    const res = [], seen = new Set();
    for (const el of els.slice(0, 300)) {
      el.focus({preventScroll:true}); if (document.activeElement !== el) continue;
      const cs = getComputedStyle(el); let ext = 0;
      if (cs.outlineStyle !== 'none') ext = Math.max(ext, (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0));
      for (const m of cs.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)) { if (+m[4] > 0 && +m[3] <= 3) ext = Math.max(ext, +m[4]); }
      if (ext <= 0) { continue; }
      const r = el.getBoundingClientRect(), b = {l:r.left - ext, t:r.top - ext, r:r.right + ext, b:r.bottom + ext};
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const as = getComputedStyle(a); if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
        const ar = a.getBoundingClientRect(), bl = parseFloat(as.borderLeftWidth) || 0, bt = parseFloat(as.borderTopWidth) || 0;
        const c = {l:ar.left + bl, t:ar.top + bt, r:ar.left + bl + a.clientWidth, b:ar.top + bt + a.clientHeight};
        const iw = Math.max(0, Math.min(r.right, c.r) - Math.max(r.left, c.l)), ih = Math.max(0, Math.min(r.bottom, c.b) - Math.max(r.top, c.t));
        if (iw < r.width * .75 || ih < r.height * .75) break;            // mostly scrolled out of a scroller: not a styling cut
        const cut = [];
        // a scroller cuts what sits at its edge mid-scroll (normal); only count a side when the scroller is at that end
        const moreL = a.scrollLeft > 1, moreR = a.scrollLeft + a.clientWidth < a.scrollWidth - 1, moreT = a.scrollTop > 1, moreB = a.scrollTop + a.clientHeight < a.scrollHeight - 1;
        if (b.l < c.l - .5 && !moreL) cut.push('L' + Math.round(c.l - b.l)); if (b.r > c.r + .5 && !moreR) cut.push('R' + Math.round(b.r - c.r));
        if (b.t < c.t - .5 && !moreT) cut.push('T' + Math.round(c.t - b.t)); if (b.b > c.b + .5 && !moreB) cut.push('B' + Math.round(b.b - c.b));
        if (!cut.length && ((b.l < c.l - .5 && moreL) || (b.r > c.r + .5 && moreR) || (b.t < c.t - .5 && moreT) || (b.b > c.b + .5 && moreB))) break;   // scrolled to the edge of its row: fine
        if (cut.length) { const k = key(el) + '|' + key(a); if (!seen.has(k)) { seen.add(k); res.push(nm(el) + '  ⟂ ' + key(a) + ' ' + cut.join(' ')); } break; }
      }
    }
    if (document.activeElement) document.activeElement.blur();
    return res;
  };
  window.__inv = () => {
    const rad = {}, ico = {};
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      const box = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0) && el.tagName !== 'svg';
      if (box && cs.borderTopLeftRadius !== '0px' && !/%/.test(cs.borderTopLeftRadius)) { const r = el.getBoundingClientRect(); if (Math.round(r.width) === Math.round(r.height) && parseFloat(cs.borderTopLeftRadius) >= r.width / 2 - 1) continue; (rad[cs.borderTopLeftRadius] = rad[cs.borderTopLeftRadius] || {})[key(el)] = 1; }
      if (el.tagName === 'svg' && el.closest('button')) { const r = el.getBoundingClientRect(); const k = Math.round(r.width) + 'x' + Math.round(r.height); (ico[k] = ico[k] || {})[key(el.closest('button'))] = 1; }
    }
    const o = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Object.keys(v)]));
    return {rad:o(rad), ico:o(ico)};
  };
})();
