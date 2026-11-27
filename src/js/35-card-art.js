/* ---------- TV card art: the wide picture with the title written in it (TMDB's language-tagged backdrops), or the title logo laid
   over a clean wide picture. Fetched when a card comes on screen, remembered on this device for a month ---------- */
const ART_LS = 'streamlet.art';
let artMap = null, artSaveT = 0;
const artMem = () => artMap || (artMap = lsGet(ART_LS, {}) || {});
const artSave = () => { clearTimeout(artSaveT); artSaveT = setTimeout(() => {
  const m = artMem(), ks = Object.keys(m); if (ks.length > 2500) ks.sort((a, b) => (m[a].t || 0) - (m[b].t || 0)).slice(0, ks.length - 2000).forEach(k => delete m[k]);
  lsSet(ART_LS, m); }, 2000); };
const artBusy = new Map();
function artFor(meta){
  const id = String(meta.itemId || meta.id || ''); if (!id || typeof tmKey !== 'function' || !tmKey()) return Promise.resolve(null);
  const hit = artMem()[id]; if (hit && Date.now() - hit.t < 30 * 864e5) return Promise.resolve(hit);
  if (artBusy.has(id)) return artBusy.get(id);
  const p = (async () => {
    let ref = null;
    if (/^tt\d+$/.test(id)) ref = await tmIdOf(id);
    else { const m = /^tmdb:(\d+)/.exec(id); if (m) ref = {k:(meta.type === 'movie' ? 'movie' : 'tv'), id:m[1]}; }
    if (!ref) { artMem()[id] = {t:Date.now()}; artSave(); return artMem()[id]; }
    const l2 = String(metaLang() || navigator.language || 'en').slice(0, 2).toLowerCase();
    let r; try { r = await tmLimit(() => tmdbGet(`/${ref.k}/${ref.id}/images?include_image_language=${l2},en,null`, tmKey())); } catch { return null; }
    const rank = x => (x.iso_639_1 === l2 ? 2 : 1) * 100 + (x.vote_average || 0);
    const titled = (r.backdrops || []).filter(b => b.iso_639_1 === l2 || b.iso_639_1 === 'en').sort((a, b) => rank(b) - rank(a))[0];
    const logo = (r.logos || []).filter(b => b.iso_639_1 === l2 || b.iso_639_1 === 'en').sort((a, b) => rank(b) - rank(a))[0];
    const clean = (r.backdrops || []).filter(b => !b.iso_639_1).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
    const out = {t:Date.now()};
    if (titled) out.u = TM_IMG + 'w780' + titled.file_path;
    else if (logo) { out.l = TM_IMG + 'w300' + logo.file_path; if (clean) out.u = TM_IMG + 'w780' + clean.file_path; }
    artMem()[id] = out; artSave(); return out;
  })().finally(() => artBusy.delete(id));
  artBusy.set(id, p); return p;
}
const artKnown = meta => { const id = String(meta.itemId || meta.id || ''), x = id && artMem()[id]; return x && Date.now() - x.t < 30 * 864e5 ? x : null; };
/* no titled art: the wide picture (or the poster over a blurred copy) with the title written on it */
function wideFallback(p, meta){
  p.classList.remove('pend', 'art'); p.querySelectorAll('img,.wname').forEach(x => x.remove());
  const bg = meta.background && meta.background !== meta.poster ? meta.background : null;
  if (bg) p.prepend(h('img', {src:bg, decoding:'async', alt:'', onerror:e => { e.target.remove(); if (meta.poster) { p.classList.add('fit'); p.prepend(h('img', {class:'wfill', src:meta.poster, alt:''}), h('img', {class:'wfit', src:meta.poster, alt:''})); } }}));
  else if (meta.poster) { p.classList.add('fit'); p.prepend(h('img', {class:'wfill', src:meta.poster, decoding:'async', alt:''}), h('img', {class:'wfit', src:meta.poster, decoding:'async', alt:''})); }
  if (bg) p.append(h('span', {class:'wname'}, meta.name || ''));
}
function artShow(p, a){
  p.classList.remove('pend', 'fit'); p.querySelectorAll('img,.wname').forEach(x => x.remove());
  if (a.u) p.prepend(h('img', {src:a.u, decoding:'async', alt:'', onerror:() => wideFallback(p, p._artMeta || {})}));
  if (a.l) p.append(h('img', {class:'wlogo', src:a.l, alt:'', decoding:'async'}));
  p.classList.add('art');
}
let artIO = null;
function artWatch(p, meta){
  if (!('IntersectionObserver' in window)) return;
  p._artMeta = meta;
  if (!artIO) artIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { artIO.unobserve(e.target); artApply(e.target); } }, {rootMargin:'300px 600px'});
  artIO.observe(p);
}
async function artApply(p){
  const meta = p._artMeta || {};
  const slow = setTimeout(() => { if (p.classList.contains('pend')) wideFallback(p, meta); }, 3000);   // TMDB slow: don't leave it empty
  const a = await artFor(meta).catch(() => null); clearTimeout(slow);
  if (!p.isConnected) return;
  if (a && (a.u || a.l)) {                                            // load the picture first, then swap: no half-drawn card
    if (!a.u) return artShow(p, a);
    const img = new Image(); img.decoding = 'async';
    img.onload = () => artShow(p, a); img.onerror = () => wideFallback(p, meta); img.src = a.u;
  } else if (p.classList.contains('pend') || !p.classList.contains('art')) wideFallback(p, meta);
}
