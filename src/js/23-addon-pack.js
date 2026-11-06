/* ---------- the Streamlet addon pack: offered once per account at sign-in (addon-pack.json beside the app) ---------- */
const PACK_SKIP = /torrentio/i;
async function packLoad(){
  try {
    const r = await fetch(new URL((/\/(tv|phone)\/[^/]*$/.test(location.pathname) ? '../' : '') + 'addon-pack.json', location.href).href, {cache:'no-cache'});
    const j = r.ok ? await r.json() : null;
    return (j && Array.isArray(j.addons) ? j.addons : []).filter(x => x && x.url && !PACK_SKIP.test(x.url));
  } catch { return []; }
}
async function packOffer(u){
  if (!u) return;
  const key = 'streamlet.packAsked.' + u.uid; if (lsGet(key, 0)) return;
  const pack = await packLoad();
  const missing = pack.filter(x => !addons.some(a => a.url === x.url || a.url === x.url.replace(/\/manifest\.json$/, '') + '/manifest.json'));
  if (!missing.length) { lsSet(key, 1); return; }
  const m = $('#menu'); if (!m.hidden) { setTimeout(() => packOffer(u), 3000); return; }
  lsSet(key, 1);
  const go = async () => {
    popLayer('menu'); toast(`Installing ${missing.length} addon${missing.length === 1 ? '' : 's'}…`);
    let ok = 0, bad = [];
    for (const x of missing) { try { await installAddon(x.url, x.label ? {label:x.label} : {}); ok++; } catch { bad.push(x.name || hostOf(x.url)); } }
    try { renderAddons(); refreshUI(); } catch {}
    toast(bad.length ? `Installed ${ok}. Couldn't install: ${bad.join(', ')}` : `Installed ${ok} addon${ok === 1 ? '' : 's'}`);
  };
  m.replaceChildren(h('div', {class:'box'},
    h('h3', null, 'Install the Streamlet addon pack?'),
    h('p', {class:'hint', style:'margin:0 0 12px'}, 'Adds the catalogs and sources this app is set up with: ' + missing.map(x => x.name || hostOf(x.url)).join(', ') + '. You can remove any of them later in Addons.'),
    h('button', {class:'opt', type:'button', onclick:go}, `Install ${missing.length} addon${missing.length === 1 ? '' : 's'}`),
    h('button', {class:'opt', type:'button', onclick:() => popLayer('menu')}, 'Not now')));
  m.hidden = false; pushLayer('menu');
  m.onclick = ev => { if (ev.target === m) popLayer('menu'); };
}
/* the owner's side: copy the installed addons (without Torrentio or the built-in ones) in the pack's format */
$('#packExport').onclick = async () => {
  const list = addons.filter(a => /^https?:/.test(a.url) && !PACK_SKIP.test(a.url) && !PACK_SKIP.test(a.manifest && a.manifest.id || ''))
    .map(a => ({name:an(a), url:a.url, ...(a.label ? {label:a.label} : {})}));
  const text = JSON.stringify({addons:list}, null, 2);
  try { await navigator.clipboard.writeText(text); toast(`Copied ${list.length} addons`); }
  catch { const ta = h('textarea', {class:'f', rows:'8', style:'width:100%'}); ta.value = text; $('#packExport').after(ta); ta.focus(); ta.select(); toast('Select the text and copy it'); }
};
