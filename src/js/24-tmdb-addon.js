/* ---------- TMDB: built-in catalog addons (tmdb://all, tmdb://netflix, tmdb://disney, tmdb://kids), using the TMDB key from Settings.
   Titles carry their IMDb id (tt…) so every stream addon finds them; the details and episodes come from TMDB too. ---------- */
const TM_IMG = 'https://image.tmdb.org/t/p/';
const TM_REGION = 'CA';
const TM_FLAVORS = {
  all:     {name:'TMDB',          desc:'Trending, popular and top rated movies and shows, with search.'},
  netflix: {name:'Netflix (TMDB)', desc:'What is on Netflix in Canada, and Netflix originals.'},
  disney:  {name:'Disney+ (TMDB)', desc:'Disney, Pixar, Marvel, Star Wars and Disney Channel, like the Disney+ catalog.'},
  marvel:  {name:'Marvel (TMDB)',  desc:'The MCU in release order, Marvel shows, X-Men, Spider-Man and Marvel Animation.'},
  kids:    {name:'Kids (TMDB)',    desc:'Family movies rated G and PG, cartoons and kids shows. Search only finds kids titles.'}
};
const TM_MG = {Action:28, Adventure:12, Animation:16, Comedy:35, Crime:80, Documentary:99, Drama:18, Family:10751, Fantasy:14, History:36, Horror:27, Music:10402, Mystery:9648, Romance:10749, 'Science Fiction':878, Thriller:53, War:10752, Western:37};
const TM_TG = {'Action & Adventure':10759, Animation:16, Comedy:35, Crime:80, Documentary:99, Drama:18, Family:10751, Kids:10762, Mystery:9648, Reality:10764, 'Sci-Fi & Fantasy':10765, 'War & Politics':10768, Western:37};
const TM_KID_MG = ['Adventure', 'Animation', 'Comedy', 'Family', 'Fantasy', 'Music'], TM_KID_TG = ['Action & Adventure', 'Animation', 'Comedy', 'Family', 'Kids'];
const TM_KIDM = {certification_country:'US', 'certification.lte':'PG'};                 // kids movies: rated G or PG
/* each catalog: a TMDB list (paged) or a discover query; 'co:Name' and 'prov:Name' are looked up by name with your key */
const TM_CATS = {
  all: [
    {type:'movie',  id:'tm.trend', name:'Trending movies',  list:'/trending/movie/week'},
    {type:'movie',  id:'tm.pop',   name:'Popular movies',   list:'/movie/popular?region=' + TM_REGION},
    {type:'movie',  id:'tm.now',   name:'In theaters',      list:'/movie/now_playing?region=' + TM_REGION},
    {type:'movie',  id:'tm.top',   name:'Top rated movies', list:'/movie/top_rated'},
    {type:'series', id:'tm.trend', name:'Trending shows',   list:'/trending/tv/week'},
    {type:'series', id:'tm.pop',   name:'Popular shows',    list:'/tv/popular'},
    {type:'series', id:'tm.air',   name:'On the air',       list:'/tv/on_the_air'},
    {type:'series', id:'tm.top',   name:'Top rated shows',  list:'/tv/top_rated'}
  ],
  netflix: [
    {type:'series', id:'nf.orig', name:'Netflix originals',      disc:{with_networks:'213'}},
    {type:'series', id:'nf.pop',  name:'Popular shows on Netflix', disc:{with_watch_providers:'prov:Netflix'}},
    {type:'movie',  id:'nf.pop',  name:'Popular movies on Netflix', disc:{with_watch_providers:'prov:Netflix'}},
    {type:'movie',  id:'nf.top',  name:'Top rated on Netflix',   disc:{with_watch_providers:'prov:Netflix', sort_by:'vote_average.desc', 'vote_count.gte':'400'}},
    {type:'series', id:'nf.top',  name:'Top rated shows on Netflix', disc:{with_watch_providers:'prov:Netflix', sort_by:'vote_average.desc', 'vote_count.gte':'300'}}
  ],
  disney: [
    {type:'movie',  id:'dz.disney', name:'Disney',             disc:{with_companies:'co:Walt Disney Pictures'}},
    {type:'movie',  id:'dz.pixar',  name:'Pixar',              disc:{with_companies:'co:Pixar'}},
    {type:'movie',  id:'dz.anim',   name:'Disney Animation',   disc:{with_companies:'co:Walt Disney Animation Studios'}},
    {type:'movie',  id:'dz.marvel', name:'Marvel',             disc:{with_companies:'co:Marvel Studios'}},
    {type:'movie',  id:'dz.sw',     name:'Star Wars',          disc:{with_companies:'co:Lucasfilm Ltd.'}},
    {type:'series', id:'dz.plus',   name:'Popular on Disney+', disc:{with_watch_providers:'prov:Disney Plus'}},
    {type:'series', id:'dz.chan',   name:'Disney Channel',     disc:{with_networks:'54'}},
    {type:'series', id:'dz.marvel', name:'Marvel shows',       disc:{with_companies:'co:Marvel Studios'}},
    {type:'series', id:'dz.sw',     name:'Star Wars shows',    disc:{with_companies:'co:Lucasfilm Ltd.'}}
  ],
  kids: [
    {type:'movie',  id:'kd.pop',    name:'Family movies',      disc:{...TM_KIDM, with_genres:'10751'}},
    {type:'movie',  id:'kd.anim',   name:'Animated movies',    disc:{...TM_KIDM, with_genres:'16'}},
    {type:'movie',  id:'kd.disney', name:'Disney and Pixar',   disc:{...TM_KIDM, with_companies:'co:Walt Disney Pictures|co:Pixar|co:Walt Disney Animation Studios'}},
    {type:'series', id:'kd.shows',  name:'Kids shows',         disc:{with_genres:'10762'}},
    {type:'series', id:'kd.toons',  name:'Cartoons',           disc:{with_genres:'16,10762'}},
    {type:'series', id:'kd.chan',   name:'Disney Channel',     disc:{with_networks:'54'}}
  ]
};
/* ---------- Marvel (TMDB): the MCU from a hand-kept list (only titles Marvel Studios counts as the MCU), then the rest of Marvel, sorted by family.
   Titles are found on TMDB by name and year, so nothing here depends on an id typed by hand. 't|year|tv' marks a series. ---------- */
const MCU_PHASES = [
  ['Iron Man|2008', 'The Incredible Hulk|2008', 'Iron Man 2|2010', 'Thor|2011', 'Captain America: The First Avenger|2011', 'The Avengers|2012'],
  ['Iron Man 3|2013', 'Thor: The Dark World|2013', 'Captain America: The Winter Soldier|2014', 'Guardians of the Galaxy|2014', 'Avengers: Age of Ultron|2015', 'Ant-Man|2015'],
  ['Captain America: Civil War|2016', 'Doctor Strange|2016', 'Guardians of the Galaxy Vol. 2|2017', 'Spider-Man: Homecoming|2017', 'Thor: Ragnarok|2017', 'Black Panther|2018', 'Avengers: Infinity War|2018', 'Ant-Man and the Wasp|2018', 'Captain Marvel|2019', 'Avengers: Endgame|2019', 'Spider-Man: Far From Home|2019'],
  ['WandaVision|2021|tv', 'The Falcon and the Winter Soldier|2021|tv', 'Loki|2021|tv', 'Black Widow|2021', 'Shang-Chi and the Legend of the Ten Rings|2021', 'Eternals|2021', 'Hawkeye|2021|tv', 'Spider-Man: No Way Home|2021', 'Moon Knight|2022|tv', 'Doctor Strange in the Multiverse of Madness|2022', 'Ms. Marvel|2022|tv', 'Thor: Love and Thunder|2022', 'She-Hulk: Attorney at Law|2022|tv', 'Werewolf by Night|2022', 'Black Panther: Wakanda Forever|2022', 'The Guardians of the Galaxy Holiday Special|2022'],
  ['Ant-Man and the Wasp: Quantumania|2023', 'Guardians of the Galaxy Vol. 3|2023', 'Secret Invasion|2023|tv', 'The Marvels|2023', 'Echo|2024|tv', 'Deadpool & Wolverine|2024', 'Agatha All Along|2024|tv', 'Captain America: Brave New World|2025', 'Daredevil: Born Again|2025|tv', 'Thunderbolts*|2025', 'Ironheart|2025|tv'],
  ['The Fantastic Four: First Steps|2025', 'Wonder Man|2026|tv', 'Spider-Man: Brand New Day|2026', 'Avengers: Doomsday|2026']
];
const MCU_PHASE_NAMES = ['Phase One', 'Phase Two', 'Phase Three', 'Phase Four', 'Phase Five', 'Phase Six'];
/* the story's own order (Marvel's official timeline); The Fantastic Four: First Steps happens on another Earth, so it closes the list */
const MCU_CHRONO = ['Captain America: The First Avenger', 'Captain Marvel', 'Iron Man', 'Iron Man 2', 'The Incredible Hulk', 'Thor', 'The Avengers', 'Thor: The Dark World', 'Iron Man 3',
  'Captain America: The Winter Soldier', 'Guardians of the Galaxy', 'Guardians of the Galaxy Vol. 2', 'Avengers: Age of Ultron', 'Ant-Man', 'Captain America: Civil War', 'Black Widow',
  'Black Panther', 'Spider-Man: Homecoming', 'Doctor Strange', 'Thor: Ragnarok', 'Ant-Man and the Wasp', 'Avengers: Infinity War', 'Avengers: Endgame', 'Loki', 'WandaVision',
  'The Falcon and the Winter Soldier', 'Spider-Man: Far From Home', 'Shang-Chi and the Legend of the Ten Rings', 'Eternals', 'Spider-Man: No Way Home', 'Hawkeye',
  'Doctor Strange in the Multiverse of Madness', 'Moon Knight', 'Black Panther: Wakanda Forever', 'Echo', 'She-Hulk: Attorney at Law', 'Ms. Marvel', 'Thor: Love and Thunder',
  'Werewolf by Night', 'The Guardians of the Galaxy Holiday Special', 'Ant-Man and the Wasp: Quantumania', 'Guardians of the Galaxy Vol. 3', 'Secret Invasion', 'The Marvels',
  'Deadpool & Wolverine', 'Agatha All Along', 'Daredevil: Born Again', 'Captain America: Brave New World', 'Thunderbolts*', 'Ironheart', 'Wonder Man', 'Spider-Man: Brand New Day',
  'Avengers: Doomsday', 'The Fantastic Four: First Steps'];
const MCU_HEROES = [
  ['The Avengers',       ['The Avengers', 'Avengers: Age of Ultron', 'Avengers: Infinity War', 'Avengers: Endgame', 'Avengers: Doomsday']],
  ['Iron Man',           ['Iron Man', 'Iron Man 2', 'Iron Man 3']],
  ['Captain America',    ['Captain America: The First Avenger', 'Captain America: The Winter Soldier', 'Captain America: Civil War', 'The Falcon and the Winter Soldier', 'Captain America: Brave New World']],
  ['Thor',               ['Thor', 'Thor: The Dark World', 'Thor: Ragnarok', 'Thor: Love and Thunder']],
  ['Spider-Man',         ['Spider-Man: Homecoming', 'Spider-Man: Far From Home', 'Spider-Man: No Way Home', 'Spider-Man: Brand New Day']],
  ['Guardians of the Galaxy', ['Guardians of the Galaxy', 'Guardians of the Galaxy Vol. 2', 'The Guardians of the Galaxy Holiday Special', 'Guardians of the Galaxy Vol. 3']],
  ['Hulk',               ['The Incredible Hulk', 'She-Hulk: Attorney at Law']],
  ['Doctor Strange',     ['Doctor Strange', 'Doctor Strange in the Multiverse of Madness']],
  ['Ant-Man',            ['Ant-Man', 'Ant-Man and the Wasp', 'Ant-Man and the Wasp: Quantumania']],
  ['Black Panther',      ['Black Panther', 'Black Panther: Wakanda Forever', 'Ironheart']],
  ['Captain Marvel',     ['Captain Marvel', 'Ms. Marvel', 'The Marvels']],
  ['Black Widow and Hawkeye', ['Black Widow', 'Hawkeye', 'Echo', 'Thunderbolts*']],
  ['Wanda and Agatha',   ['WandaVision', 'Agatha All Along']],
  ['Loki',               ['Loki']],
  ['Daredevil',          ['Daredevil: Born Again']]
];
/* the rest of Marvel: never in the MCU lists above */
const MARVEL_MORE = [
  ['X-Men (before the MCU)', ['X-Men|2000', 'X2|2003', 'X-Men: The Last Stand|2006', 'X-Men Origins: Wolverine|2009', 'X-Men: First Class|2011', 'The Wolverine|2013', 'X-Men: Days of Future Past|2014', 'Deadpool|2016', 'X-Men: Apocalypse|2016', 'Logan|2017', 'Deadpool 2|2018', 'Dark Phoenix|2019', 'The New Mutants|2020', 'Legion|2017|tv', 'The Gifted|2017|tv']],
  ['Spider-Man (Sony)', ['Spider-Man|2002', 'Spider-Man 2|2004', 'Spider-Man 3|2007', 'The Amazing Spider-Man|2012', 'The Amazing Spider-Man 2|2014', 'Spider-Man: Into the Spider-Verse|2018', 'Spider-Man: Across the Spider-Verse|2023']],
  ['Venom and Sony villains', ['Venom|2018', 'Venom: Let There Be Carnage|2021', 'Morbius|2022', 'Madame Web|2024', 'Venom: The Last Dance|2024', 'Kraven the Hunter|2024']],
  ['Fantastic Four (before the MCU)', ['Fantastic Four|2005', 'Fantastic Four: Rise of the Silver Surfer|2007', 'Fantastic Four|2015']],
  ['Marvel Television', ['Agents of S.H.I.E.L.D.|2013|tv', 'Agent Carter|2015|tv', 'Daredevil|2015|tv', 'Jessica Jones|2015|tv', 'Luke Cage|2016|tv', 'Iron Fist|2017|tv', 'The Defenders|2017|tv', 'The Punisher|2017|tv', 'Inhumans|2017|tv', 'Runaways|2017|tv', 'Cloak & Dagger|2018|tv', 'Helstrom|2020|tv']],
  ['Marvel animation', ['What If...?|2021|tv', 'I Am Groot|2022|tv', "X-Men '97|2024|tv", 'Your Friendly Neighborhood Spider-Man|2025|tv', 'Eyes of Wakanda|2025|tv', 'Marvel Zombies|2025|tv', 'X-Men: The Animated Series|1992|tv', 'Spider-Man: The Animated Series|1994|tv', 'The Spectacular Spider-Man|2008|tv', 'Avengers Assemble|2013|tv']],
  ['More Marvel movies', ['Blade|1998', 'Blade II|2002', 'Blade: Trinity|2004', 'Hulk|2003', 'Daredevil|2003', 'Elektra|2005', 'The Punisher|2004', 'Punisher: War Zone|2008', 'Ghost Rider|2007', 'Ghost Rider: Spirit of Vengeance|2012']]
];
const MCU_ALL = MCU_PHASES.flat(), mcuEntry = t => MCU_ALL.find(x => x.split('|')[0] === t) || t;
const tmCur = (id, name, list) => ({type:'movie', id, name, cur:list});
TM_CATS.marvel = [
  tmCur('mv.chrono', 'MCU in story order', MCU_CHRONO.map(mcuEntry)),
  tmCur('mv.release', 'MCU in release order', MCU_ALL),
  ...MCU_PHASES.map((p, i) => tmCur('mv.p' + (i + 1), 'MCU ' + MCU_PHASE_NAMES[i], p)),
  ...MCU_HEROES.map(([n, l], i) => tmCur('mv.h' + i, n, l.map(mcuEntry))),
  ...MARVEL_MORE.map(([n, l], i) => tmCur('mv.m' + i, n, l))
];
TM_FLAVORS.marvel.desc = 'The MCU only (story order, release order, the six phases, each hero), then the rest of Marvel sorted by family: X-Men, Sony Spider-Man, Fantastic Four, Marvel Television, animation.';
/* one title from the list -> its TMDB entry (looked up once, kept on this device) */
const tmCurMap = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmcur', {})); })();
let tmCurT = 0;
async function tmFind(spec){
  const [t, y, k] = spec.split('|'), kind = k === 'tv' ? 'tv' : 'movie', key = kind + '|' + t + '|' + y, map = tmCurMap();
  if (map[key]) return map[key];
  const r = await tmLimit(() => tmdbGet(`/search/${kind}?query=${enc(t.replace(/\*$/, ''))}&include_adult=false`, tmKey())), res = r.results || [];
  const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, ''), yr = x => +String(x.release_date || x.first_air_date || '').slice(0, 4);
  const near = res.filter(x => Math.abs(yr(x) - +y) <= 1);
  const hit = near.find(x => norm(x.title || x.name) === norm(t)) || near[0] || res.find(x => norm(x.title || x.name) === norm(t));
  if (!hit) return null;
  const v = {id:hit.id, title:hit.title, name:hit.name, poster_path:hit.poster_path, backdrop_path:hit.backdrop_path, overview:hit.overview, release_date:hit.release_date, first_air_date:hit.first_air_date, vote_average:hit.vote_average, _k:kind};
  map[key] = v; clearTimeout(tmCurT); tmCurT = setTimeout(() => lsSet('streamlet.tmcur', map), 1500);
  return v;
}
async function tmCurated(c, skip){
  const part = c.cur.slice(skip, skip + 20);
  const found = await Promise.all(part.map(s => tmFind(s).catch(() => null)));
  return {metas:(await Promise.all(found.filter(x => x && x.poster_path).map(x => tmPreview(x, x._k)))).filter(Boolean)};
}
const tmKey = () => lsGet('streamlet.tmdb', '');
/* at most 6 TMDB lookups at a time: a fresh Marvel space looks up a few hundred titles, and TMDB slows down past ~40 a second */
const tmSlots = {n:0, q:[]};
function tmLimit(fn){
  return new Promise((ok, no) => {
    const run = () => { tmSlots.n++; fn().then(ok, no).finally(() => { tmSlots.n--; const nx = tmSlots.q.shift(); if (nx) nx(); }); };
    if (tmSlots.n < 6) run(); else tmSlots.q.push(run);
  });
}
const tmGenres = (fl, type) => fl === 'kids' ? (type === 'movie' ? TM_KID_MG : TM_KID_TG) : Object.keys(type === 'movie' ? TM_MG : TM_TG);
const tmListName = id => (lsGet('streamlet.tmlists', {}) || {})[id] || 'TMDB list';
function tmManifest(fl){
  const lm = /^list-(\d+)$/.exec(fl);
  if (lm) return {id:'app.streamlet.tmdb.list.' + lm[1], version:'1.0.0', name:tmListName(lm[1]), description:'A TMDB list, in its own order (whoever keeps the list keeps it up to date). Needs your TMDB key.',
    resources:['catalog', {name:'meta', types:['movie', 'series'], idPrefixes:['tt', 'tmdb:']}], types:['movie', 'series'], idPrefixes:['tt', 'tmdb:'],
    catalogs:[{type:'movie', id:'ls.' + lm[1], name:tmListName(lm[1]), extra:[{name:'skip', isRequired:false}]}]};
  const f = TM_FLAVORS[fl] || TM_FLAVORS.all;
  const catalogs = (TM_CATS[fl] || TM_CATS.all).map(c => c.cur ? {type:c.type, id:c.id, name:c.name, extra:[{name:'skip', isRequired:false}]}
    : {type:c.type, id:c.id, name:c.name, genres:tmGenres(fl, c.type), extra:[{name:'genre', options:tmGenres(fl, c.type), isRequired:false}, {name:'skip', isRequired:false}]});
  for (const type of ['movie', 'series']) catalogs.push({type, id:'tm.search', name:'Search', extra:[{name:'search', isRequired:true}]});
  return {id:'app.streamlet.tmdb.' + fl, version:'1.0.0', name:f.name, description:f.desc + ' Needs your TMDB key in Settings.',
    resources:['catalog', {name:'meta', types:['movie', 'series'], idPrefixes:['tt', 'tmdb:']}], types:['movie', 'series'], idPrefixes:['tt', 'tmdb:'], catalogs};
}
/* names to TMDB ids (companies, streaming services), looked up once and kept */
const tmIds = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmids', {})); })();
async function tmResolve(tok){
  const ids = tmIds(); if (ids[tok]) return ids[tok];
  const [kind, name] = [tok.slice(0, tok.indexOf(':')), tok.slice(tok.indexOf(':') + 1)], low = name.toLowerCase();
  let id = '';
  if (kind === 'co') {
    const r = await tmdbGet(`/search/company?query=${enc(name)}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.name.toLowerCase() === low) || res.find(x => x.name.toLowerCase().startsWith(low)) || res[0];
    id = hit ? String(hit.id) : '';
  } else if (kind === 'kw') {
    const r = await tmdbGet(`/search/keyword?query=${enc(name)}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.name.toLowerCase() === low) || res[0];
    id = hit ? String(hit.id) : '';
  } else if (kind === 'prov') {
    const r = await tmdbGet(`/watch/providers/tv?watch_region=${TM_REGION}`, tmKey()), res = r.results || [];
    const hit = res.find(x => x.provider_name.toLowerCase() === low) || res.find(x => x.provider_name.toLowerCase().includes(low));
    id = hit ? String(hit.provider_id) : '';
  }
  if (id) { ids[tok] = id; lsSet('streamlet.tmids', ids); }
  return id;
}
async function tmParams(disc){
  const out = {};
  for (const [k, v] of Object.entries(disc)) {
    if (v === 'today') { out[k] = new Date().toISOString().slice(0, 10); continue; }
    if (/(^|[|,])(co|prov|kw):/.test(v)) {
      const parts = await Promise.all(v.split('|').map(p => /^(co|prov|kw):/.test(p) ? tmResolve(p) : p));
      const ok = parts.filter(Boolean); if (!ok.length) throw new Error('Not found on TMDB: ' + v);
      out[k] = ok.join('|');
      if (k === 'with_watch_providers') out.watch_region = TM_REGION;
    } else out[k] = v;
  }
  return out;
}
/* TMDB id -> IMDb id, kept on this device (they never change) */
const tmImdbMap = (() => { let m = null; return () => (m = m || lsGet('streamlet.tmimdb', {})); })();
let tmImdbT = 0;
async function tmImdb(kind, id){
  const map = tmImdbMap(), k = kind[0] + id;
  if (k in map) return map[k];
  let tt = '';
  try { const r = await tmLimit(() => tmdbGet(`/${kind}/${id}/external_ids`, tmKey())); tt = r.imdb_id || ''; } catch { return ''; }
  map[k] = tt; clearTimeout(tmImdbT); tmImdbT = setTimeout(() => lsSet('streamlet.tmimdb', map), 1500);
  return tt;
}
const tmYear = x => String(x.release_date || x.first_air_date || '').slice(0, 4);
async function tmPreview(x, kind){
  const tt = await tmImdb(kind, x.id);
  return {id:tt || `tmdb:${kind}:${x.id}`, type:kind === 'tv' ? 'series' : 'movie', name:x.title || x.name || '',
    poster:x.poster_path ? TM_IMG + 'w342' + x.poster_path : '', background:x.backdrop_path ? TM_IMG + 'w1280' + x.backdrop_path : '',
    description:x.overview || '', releaseInfo:tmYear(x), imdbRating:x.vote_average ? x.vote_average.toFixed(1) : undefined};
}
/* kids search: only titles in kids genres, never adult ones */
function tmKidOk(x, kind){
  if (x.adult) return false;
  const g = x.genre_ids || [];
  if (g.some(n => [27, 80, 53, 10752, 10749, 10768].includes(n))) return false;
  return kind === 'movie' ? g.includes(10751) || g.includes(16) : g.includes(10762) || g.includes(10751);
}
async function tmCatalog(fl, type, id, extra){
  const kind = type === 'series' ? 'tv' : 'movie', page = Math.floor((+extra.skip || 0) / 20) + 1;
  let r;
  if (id.startsWith('ls.')) {                                              // a TMDB list: movies and shows mixed, in the list's order
    const r2 = await tmdbGet(`/list/${id.slice(3)}?page=${page}`, tmKey());
    const items2 = (r2.items || []).filter(x => x.poster_path && (x.media_type === 'movie' || x.media_type === 'tv'));
    return {metas:await Promise.all(items2.map(x => tmPreview(x, x.media_type)))};
  }
  if (id === 'tm.search') {
    if (!extra.search) return {metas:[]};
    r = await tmdbGet(`/search/${kind}?query=${enc(extra.search)}&include_adult=false&page=${page}`, tmKey());
    if (fl === 'kids') r.results = (r.results || []).filter(x => tmKidOk(x, kind));
  } else {
    const c = (TM_CATS[fl] || []).find(x => x.id === id && x.type === type); if (!c) return {metas:[]};
    if (c.cur) return tmCurated(c, +extra.skip || 0);
    const gmap = kind === 'movie' ? TM_MG : TM_TG, gid = extra.genre && gmap[extra.genre];
    if (c.list && !gid) r = await tmdbGet(c.list + (c.list.includes('?') ? '&' : '?') + 'page=' + page, tmKey());
    else {
      const p = await tmParams(c.disc || {});
      if (gid) p.with_genres = p.with_genres ? p.with_genres + ',' + gid : String(gid);
      if (c.list && /top_rated/.test(c.list)) { p.sort_by = 'vote_average.desc'; p['vote_count.gte'] = '500'; }
      const q = new URLSearchParams({sort_by:'popularity.desc', include_adult:'false', page:String(page), ...p});
      r = await tmdbGet(`/discover/${kind}?${q}`, tmKey());
    }
  }
  const items = (r.results || []).filter(x => x.poster_path && (x.media_type ? x.media_type === kind : true));
  return {metas:await Promise.all(items.map(x => tmPreview(x, kind)))};
}
async function tmMeta(type, id){
  const kind = type === 'series' ? 'tv' : 'movie';
  let tid;
  if (id.startsWith('tmdb:')) tid = id.split(':')[2];
  else {
    const f = await tmdbGet(`/find/${id}?external_source=imdb_id`, tmKey()), hit = (kind === 'tv' ? f.tv_results : f.movie_results) || [];
    if (!hit.length) throw new Error('Not on TMDB');
    tid = hit[0].id;
  }
  const d = await tmdbGet(`/${kind}/${tid}?append_to_response=external_ids,credits,images,videos&include_image_language=en,null`, tmKey());
  const imdb = d.imdb_id || (d.external_ids || {}).imdb_id || '', mid = id.startsWith('tt') ? id : (imdb || id);
  const logos = (d.images || {}).logos || [], logo = logos.find(l => l.iso_639_1 === 'en') || logos[0];
  const trailer = ((d.videos || {}).results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
  const run = d.runtime || (d.episode_run_time || [])[0];
  const meta = {id:mid, type, name:d.title || d.name || '', imdb_id:imdb || undefined,
    poster:d.poster_path ? TM_IMG + 'w500' + d.poster_path : '', background:d.backdrop_path ? TM_IMG + 'original' + d.backdrop_path : '',
    logo:logo ? TM_IMG + 'w500' + logo.file_path : undefined, description:d.overview || '',
    releaseInfo:kind === 'tv' ? [tmYear(d), d.status === 'Ended' && d.last_air_date ? d.last_air_date.slice(0, 4) : ''].filter(Boolean).join('–') + (d.status === 'Ended' ? '' : '–') : tmYear(d),
    year:tmYear(d), genres:(d.genres || []).map(g => g.name), runtime:run ? run + ' min' : undefined, imdbRating:d.vote_average ? d.vote_average.toFixed(1) : undefined,
    cast:((d.credits || {}).cast || []).slice(0, 10).map(c => c.name), director:((d.credits || {}).crew || []).filter(c => c.job === 'Director').map(c => c.name),
    trailers:trailer ? [{source:trailer.key, type:'Trailer'}] : [], status:d.status, tmdbStatus:d.status || '', tmdbNext:!!d.next_episode_to_air};
  if (kind === 'tv') {
    const nums = (d.seasons || []).map(s => s.season_number), videos = [];
    for (let i = 0; i < nums.length; i += 20) {
      const chunk = nums.slice(i, i + 20), r = await tmdbGet(`/tv/${tid}?append_to_response=${chunk.map(n => 'season/' + n).join(',')}`, tmKey());
      for (const n of chunk) for (const e of ((r['season/' + n] || {}).episodes || []))
        videos.push({id:`${mid}:${n}:${e.episode_number}`, season:n, episode:e.episode_number, title:e.name || `Episode ${e.episode_number}`, name:e.name,
          released:e.air_date ? e.air_date + 'T05:00:00.000Z' : undefined, thumbnail:e.still_path ? TM_IMG + 'w500' + e.still_path : undefined, overview:e.overview || '', description:e.overview || ''});
    }
    meta.videos = videos;
  }
  return {meta};
}
async function tmRoute(url){
  const m = /^tmdb:\/\/([^/]+)\/(.*?)(\.json)?(\?.*)?$/.exec(url); if (!m) throw new Error('Bad TMDB address');
  const fl = TM_FLAVORS[m[1]] || /^list-\d+$/.test(m[1]) ? m[1] : 'all', path = m[2];
  if (path === 'manifest') {
    const lm = /^list-(\d+)$/.exec(fl);
    if (lm && tmKey()) { try { const r = await tmdbGet(`/list/${lm[1]}?page=1`, tmKey()); const n = lsGet('streamlet.tmlists', {}) || {}; n[lm[1]] = r.name || 'TMDB list'; lsSet('streamlet.tmlists', n); } catch {} }   // the list's own name for its row
    return tmManifest(fl);
  }
  if (!tmKey()) throw new Error('Add your TMDB key in Settings to use this addon');
  const ck = url.replace(/^tmdb:\/\//, 'https://tmdb.streamlet.invalid/');      // the device cache only takes web addresses
  const hit = await dataGet(ck); if (hit && hit.age < dFresh(ck)) return hit.json;
  const parts = path.split('/').map((x, i) => i < 3 ? decodeURIComponent(x) : x);   // the extras stay encoded: a genre can hold '&'
  let j;
  try {
    if (parts[0] === 'catalog') j = await tmCatalog(fl, parts[1], parts[2], Object.fromEntries(new URLSearchParams(parts[3] || '')));
    else if (parts[0] === 'meta') j = await tmMeta(parts[1], parts[2]);
    else throw new Error('Not supported');
  } catch (e) { if (hit) return hit.json; throw e; }                     // offline or TMDB busy: the last copy is better than nothing
  dataPut(ck, j);
  return j;
}
/* installed copies always answer with the current catalog list */
for (const a of addons) if (a.url && a.url.startsWith('tmdb://')) { const fl = a.url.slice(7).split('/')[0]; a.manifest = tmManifest(TM_FLAVORS[fl] || /^list-\d+$/.test(fl) ? fl : 'all'); }
