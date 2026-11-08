/* ---------- episode order: the catalog's numbering, or TMDB's ----------
   Some shows are numbered differently by the catalog and by the files out there (The Office S4: hour-long
   episodes split in two parts in the catalog, one file each in most releases). For those shows only, the
   page offers TMDB's order; the choice changes the episode list, the ids sent to sources and subtitles,
   and moves your watched marks across. */
const eoPrefs = () => mapGet('streamlet.eporder');
const eoOn = id => eoPrefs()[id] === 'tmdb';
const eoMem = new Map();
async function eoVideos(id){                                              // TMDB's episode list for a show, kept 3 days
  const k = 'streamlet.eotm.' + id, hit = eoMem.get(id) || lsGet(k, null);
  if (hit && Date.now() - hit.t < 3 * 864e5 && Array.isArray(hit.v)) { eoMem.set(id, hit); return hit.v; }
  const r = await tmMeta('series', id), v = (r.meta.videos || []).filter(x => x.season >= 0);
  const rec = {t:Date.now(), v}; eoMem.set(id, rec); try { lsSet(k, rec); } catch {}
  return v;
}
/* every series page fetched from an addon passes through here: with TMDB order on, its episodes are swapped */
async function eoApply(url, j){
  try {
    if (!j || !j.meta || url.startsWith('tmdb://') || !/\/meta\/series\//.test(url)) return j;
    const m = j.meta; if (!/^tt\d+$/.test(m.id || '') || !eoOn(m.id) || !lsGet('streamlet.tmdb', '')) return j;
    const v = await eoVideos(m.id); if (!v.length) return j;
    return {...j, meta:{...m, videos:v, _rawVideos:m.videos || []}};
  } catch { return j; }
}
const eoCount = vids => { const c = {}; for (const v of vids || []) { const s = v.season ?? 1; if (s >= 1) c[s] = (c[s] || 0) + 1; } return c; };
/* does TMDB number this show differently? (the newest season of a running show is left out: it is often a step behind) */
async function eoCheck(meta){
  const raw = meta._rawVideos || meta.videos || [];
  if (!/^tt\d+$/.test(meta.id || '') || !raw.length || !lsGet('streamlet.tmdb', '')) return null;
  const k = 'streamlet.eochk', all = mapGet(k), c = all[meta.id];
  if (c && Date.now() - c.t < 7 * 864e5) return c.diff;
  let diff = null;
  try {
    const f = await tmdbGet(`/find/${meta.id}?external_source=imdb_id`, tmKey()), hit = (f.tv_results || [])[0];
    if (hit) {
      const d = await tmdbGet(`/tv/${hit.id}`, tmKey()), mine = eoCount(raw), last = Math.max(...Object.keys(mine).map(Number));
      const ended = /ended|canceled/i.test(d.status || '');
      const rows = (d.seasons || []).filter(s => s.season_number >= 1 && (ended || s.season_number < last) && mine[s.season_number] && s.episode_count && s.episode_count !== mine[s.season_number])
        .map(s => ({s:s.season_number, cat:mine[s.season_number], tm:s.episode_count}));
      diff = rows.length ? rows : false;
    } else diff = false;
  } catch { return null; }
  all[meta.id] = {t:Date.now(), diff}; const ks = Object.keys(all); if (ks.length > 300) delete all[ks[0]]; lsSet(k, all);
  return diff;
}
/* old numbering -> new numbering (each old episode -> the new episode(s) it becomes), matched by season and air date (two parts aired the same night become one episode) */
function eoPairs(from, to){
  const day = v => String(v.released || '').slice(0, 10), out = new Map(), key = v => (v.season ?? 1) + ':' + day(v);
  const byKey = new Map(); for (const v of to) { if (!day(v)) continue; const g = byKey.get(key(v)) || []; g.push(v); byKey.set(key(v), g); }
  const seen = new Map();
  for (const v of from) {
    const g = byKey.get(key(v)); if (!g) continue;
    const i = seen.get(key(v)) || 0; seen.set(key(v), i + 1);
    const fromN = from.filter(x => key(x) === key(v)).length;
    out.set(v, g.length >= fromN ? g.slice(Math.floor(i * g.length / fromN), Math.floor((i + 1) * g.length / fromN)) : [g[Math.floor(i * g.length / fromN)]]);   // one part -> one episode, or one long episode -> its parts
  }
  return out;
}
function eoMoveMarks(id, from, to){                                       // watched in the old numbering -> watched in the new one
  if (!profile) return;
  const pairs = eoPairs(from, to), gotAll = new Map();
  for (const [a, bs] of pairs) for (const b of bs) { const r = gotAll.get(b) || {n:0, d:0}; r.n++; if (epDone(id, a.season ?? 1, a.episode)) r.d++; gotAll.set(b, r); }
  const seasons = new Set([...pairs.keys()].map(v => v.season ?? 1).filter(s => s >= 1));
  const clear = from.filter(v => seasons.has(v.season ?? 1) && epDone(id, v.season ?? 1, v.episode));
  const mark = [...gotAll].filter(([, r]) => r.d && r.d === r.n).map(([b]) => b);
  if (clear.length) epMark(id, clear, false);
  if (mark.length) epMark(id, mark, true);
}
/* the section under Cast & crew: only on shows where the two orders differ */
function eoSection(meta, reload){
  const box = h('section', {class:'drow deorder', hidden:true});
  eoCheck(meta).then(diff => {
    if (!diff && !eoOn(meta.id)) return;
    const on = eoOn(meta.id), rows = diff || [];
    const ex = rows.slice(0, 2).map(r => `Season ${r.s}: ${r.cat} in the catalog, ${r.tm} on TMDB`).join(' · ');
    const pick = want => async () => {
      if (want === eoOn(meta.id)) return;
      toast('Switching episode order…');
      try {
        const raw = meta._rawVideos || meta.videos || [], tm = await eoVideos(meta.id);
        const m = eoPrefs(); if (want) m[meta.id] = 'tmdb'; else delete m[meta.id]; lsSet('streamlet.eporder', m);
        if (want) eoMoveMarks(meta.id, raw, tm); else eoMoveMarks(meta.id, tm, raw);
        try { scheduleSync(); } catch {}
        reload();
      } catch (e) { toast("Couldn't load TMDB's episode list: " + (e.message || e)); }
    };
    box.replaceChildren(h('h3', {class:'drt'}, 'Episode order'),
      h('p', {class:'eohint'}, (ex ? ex + '. ' : '') + 'Pick the one your sources use: if episode titles and videos don\'t match, switch.'),
      h('div', {class:'cchips eochips'},
        h('button', {class:'chip' + (on ? '' : ' on'), type:'button', onclick:pick(false)}, 'Catalog order'),
        h('button', {class:'chip' + (on ? ' on' : ''), type:'button', onclick:pick(true)}, 'TMDB order')));
    box.hidden = false;
  }).catch(() => {});
  return box;
}
