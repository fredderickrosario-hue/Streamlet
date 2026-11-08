/* ---------- warm a space before it is shown: its rows are fetched first, so Home is full the moment it appears ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function warmSpace(sp, cap = 8000){
  if (!sp || !addons.length) return;
  const oc = cur, jobs = [];
  cur = sp;
  try {
    let n = 0;
    for (const a of spaceAddons()) for (const cat of (a.manifest.catalogs || [])) {
      if (n >= 12 || catInfo(cat).req.length) continue; n++;
      const url = `${a.base}/catalog/${cat.type}/${enc(cat.id)}.json`;
      jobs.push(getJSON(url).then(j => { warmC.set(url, {j, t:Date.now()}); (j.metas || []).filter(m => m.background).slice(0, 2).forEach(m => { const i = new Image(); i.src = m.background; }); }).catch(() => {}));
    }
    if (profile) { try { for (const s of personalSeeds().seeds.slice(0, 6)) jobs.push(personalRecs(s).catch(() => {})); } catch {} }   // the "Because you watched / liked" rows
  } finally { cur = oc; }
  await Promise.race([Promise.allSettled(jobs), sleep(cap)]);
}
/* a small loading screen, only if it takes more than a blink */
function warmCover(label, emoji){
  const el = h('div', {class:'spload'}, h('div', {class:'splring'}), emoji ? h('div', {class:'splem'}, emoji) : null, h('div', {class:'splnm'}, label || ''));
  const t = setTimeout(() => document.body.append(el), 160);
  return () => { clearTimeout(t); if (el.isConnected) { el.classList.add('out'); setTimeout(() => el.remove(), 250); } };
}
let opening = false;
async function openSpace(id){
  const sp = spaces.find(s => s.id === id); if (!sp || opening) return;
  opening = true; const done = warmCover(sp.name, sp.emoji);
  try { await warmSpace(sp, 6000); } catch {}
  enterSpace(id); done(); opening = false;
}
