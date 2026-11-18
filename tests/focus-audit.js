// Focus ring check: opens ~35 screens (TV:  W=tv node tests/focus-audit.js   phone:  W=phone node tests/focus-audit.js),
// focuses every button on each and fails if a highlight ring is cut by its row, card or page. Run before every push.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'), out = process.env.OUT || path.join(require('os').tmpdir(), 'streamlet-focus'); fs.mkdirSync(out, {recursive:true});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webmanifest': 'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const hues = [12, 200, 280, 40, 160, 330, 90, 240, 0, 120];
const svg = (w, hh, n, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hues[n%10]},55%,38%)"/><stop offset="1" stop-color="hsl(${(hues[n%10]+50)%360},60%,16%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w*.7}" cy="${hh*.3}" r="${w*.25}" fill="rgba(255,255,255,.12)"/><text x="50%" y="${hh*.82}" font-family="sans-serif" font-weight="800" font-size="${w/7}" fill="#fff" text-anchor="middle">${label||''}</text></svg>`;
const names = ['Northfall','The Quiet Hour','Ember Coast','Glass City','Wildline','Paper Moons','Low Tide','Iron Bloom','Saltwater','Deep Signal','Kingsroad','After Dark'];
const mv = (i, t) => ({ id: 'tt10' + i + (t === 'series' ? '5' : '0'), type: t, name: names[i % 12] + (t === 'series' ? '' : ''), releaseInfo: String(2015 + i % 10), poster: `https://img.test/p/${i}.svg`, background: `https://img.test/b/${i}.svg`, genres: ['Drama', 'Thriller'], imdbRating: '7.' + i % 10 });
const videos = []; for (const s of [1, 2]) for (let e = 1; e <= 8; e++) videos.push({ id: `tt1005:${s}:${e}`, season: s, episode: e, title: 'Episode title ' + e, released: new Date(Date.UTC(2024, s * 3, e * 7)).toISOString(), thumbnail: `https://img.test/b/${e}.svg`, overview: 'A short summary of what happens in this episode, two lines long at most on a phone.' });
(async () => {
  await new Promise(r => server.listen(+(process.env.PORT || 8301), r));
  const b = await chromium.launch();
  const W = process.env.W || 'tv'; let cuts = 0; const p = await b.newPage({ viewport: W === 'tv' ? { width: 960, height: 540 } : { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://www.gstatic.com/**', r => r.abort());
  await p.route('https://img.test/**', r => { const u = r.request().url(), m = u.match(/\/(p|b)\/(\d+)/); const n = +(m ? m[2] : 0); r.fulfill({ status: 200, contentType: 'image/svg+xml', body: m && m[1] === 'b' ? svg(1280, 720, n, '') : svg(400, 600, n, names[n % 12]) }); });
  await p.route('https://image.tmdb.org/**', r => { const n = (r.request().url().length % 10); r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(400, 600, n, names[n]) }); });
  await p.route('https://api.themoviedb.org/**', r => {
    const u = r.request().url(), base = { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (/external_ids/.test(u)) return r.fulfill({ ...base, body: JSON.stringify({ imdb_id: 'tt1000' }) });
    if (/\/tv\/\d+\?|\/tv\/\d+$/.test(u)) return r.fulfill({ ...base, body: JSON.stringify({ next_episode_to_air: { air_date: '2026-11-20', season_number: 3, episode_number: 1 } }) });
    const res = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, title: names[i], name: names[i], poster_path: '/p' + i + '.jpg', backdrop_path: '/b' + i + '.jpg', release_date: '2026-11-' + String(5 + i).padStart(2, '0'), first_air_date: '2026-11-' + String(5 + i).padStart(2, '0'), media_type: i % 2 ? 'tv' : 'movie' }));
    r.fulfill({ ...base, body: JSON.stringify({ results: res }) });
  });
  await p.route('https://mock.test/**', r => {
    const u = decodeURIComponent(r.request().url()), base = { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
    if (u.endsWith('manifest.json')) return r.fulfill({ ...base, body: JSON.stringify(MAN) });
    if (u.includes('/meta/series/')) return r.fulfill({ ...base, body: JSON.stringify({ meta: { ...mv(0, 'series'), id: 'tt1005', name: 'Northfall', description: 'A detective returns to the frozen town she left twenty years ago, where a disappearance reopens old wounds.', cast: ['Ana Reyes', 'Tom Hale', 'Mira Ko'], director: ['J. Watts'], runtime: '52 min', videos } }) });
    if (u.includes('/meta/movie/')) return r.fulfill({ ...base, body: JSON.stringify({ meta: { ...mv(1, 'movie'), id: 'tt1010', name: 'The Quiet Hour', description: 'Two strangers stuck in an airport overnight discover they share a secret that could change both their lives.', cast: ['Lee Park', 'Sam Ortiz'], director: ['K. Lane'], runtime: '1h 48min' } }) });
    if (u.includes('/stream/')) return r.fulfill({ ...base, body: JSON.stringify({ streams: [{ name: 'Mock\n4K', title: 'Northfall.S01E01.2160p.WEB-DL.DV.HDR.Atmos\n💾 12.4 GB 👤 210', url: 'https://x.test/a.mkv' }, { name: 'Mock\n1080p', title: 'Northfall.S01E01.1080p.WEB.H264\n💾 2.1 GB', url: 'https://x.test/b.mkv' }, { name: 'Mock\n720p', title: 'Northfall 720p', url: 'https://x.test/c.mkv' }] }) });
    if (u.includes('/catalog/series')) return r.fulfill({ ...base, body: JSON.stringify({ metas: Array.from({ length: 10 }, (_, i) => mv(i + 2, 'series')) }) });
    return r.fulfill({ ...base, body: JSON.stringify({ metas: Array.from({ length: 10 }, (_, i) => mv(i, 'movie')) }) });
  });
  const MAN = { id: 'mock.addon', name: 'Mock Cinema', version: '1.0.0', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [{ type: 'movie', id: 'top', name: 'Popular', extra: [{ name: 'genre', options: ['Action', 'Comedy', 'Drama', 'Horror'] }, { name: 'search' }] }, { type: 'series', id: 'top', name: 'Popular', extra: [{ name: 'genre', options: ['Action', 'Comedy', 'Drama'] }, { name: 'search' }] }] };

  await p.goto('http://localhost:' + (process.env.PORT || 8301) + '/' + W + '/index.html'); await p.waitForTimeout(1500);
  const shot = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, name + '.png') }); console.log('shot', name); };
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(160); } };
  await ev(async () => {
    document.querySelector('#intro')?.remove();
    addons = [{ url: 'https://mock.test/manifest.json', base: 'https://mock.test', manifest: await (await fetch('https://mock.test/manifest.json')).json() }];
    addons.push({ url: 'https://mock2.test/manifest.json', base: 'https://mock.test', manifest: { id: 'subs', name: 'Subtitles Pro', version: '2.1', resources: ['subtitles'], types: ['movie', 'series'], catalogs: [] } });
    ensureUids(); save(); lsSet('streamlet.tmdb', 'testkey');
    remoteMode = true; document.body.classList.add('remote');
  });
  await ev(async () => { await selectProfile(profiles[0]); try { await openSpace(spaces[0].id); } catch (e) {} if (!cur) cur = spaces[0]; });
  await p.waitForTimeout(2500);
  await ev(() => { lsSet('streamlet.welcomed', 1); document.querySelector('#welcome')?.remove(); layersOpen.length = 0; focusStack.length = 0; document.body.classList.remove('inlayer'); });
  await p.addScriptTag({ path: path.join(__dirname, 'focus-auditor.js') });
  await ev(() => { profiles.push({id:'p2', name:'Partner', avatar:'d:portraits/3'}, {id:'p3', name:'Kid', avatar:'a:7', kids:true}, {id:'p4', name:'Grandma', avatar:'m:4'}); saveProfiles(); });
  await p.keyboard.press('Shift');
  const report = {};
  const scr = async (name, setup, wait = 700, arg) => {
    try { await ev(setup, arg); } catch (e) { console.log('setup fail', name, e.message.slice(0, 120)); return; }
    await p.waitForTimeout(wait);
    await p.screenshot({ path: path.join(out, name + '.png') });
    const r = await ev(n => __audit(n), name); const inv = await ev(() => __inv());
    report[name] = {cut:r, inv};
    cuts += r.length; if (r.length) console.log('CUT', W, name, '\n   ' + r.join('\n   '));
  };
  const reset = () => ev(() => { for (const id of ['#avPop', '#spPop', '#pinPop']) document.querySelector(id)?.remove(); for (const id of ['#profEd', '#spaceEd', '#detail', '#episode', '#exitDlg']) { const e = document.querySelector(id); if (e) e.hidden = true; } layersOpen.length = 0; focusStack.length = 0; document.body.classList.remove('inlayer'); });
  await scr('home', () => { showTab('home'); });
  await ev(() => window.scrollTo(0, 600)); await scr('home-scrolled', () => {});
  await scr('detail-movie', () => { openDetail(addons[0], 'movie', { id: 'tt1010', type: 'movie', name: 'The Quiet Hour' }); }, 2500);
  await reset();
  await scr('detail-series', () => { openDetail(addons[0], 'series', { id: 'tt1005', type: 'series', name: 'Northfall' }); }, 2500);
  await reset();
  await scr('mylist', () => { showTab('watch'); });
  await scr('search', () => { if (isTVui()) showTab('search'); else { srchOn = true; renderTabs(); } }, 1200);
  await reset();
  await scr('profile', () => { showTab('settings'); });
  for (const c of ['app', 'account', 'tmdb', 'about']) { await scr('set-' + c, (c) => { showTab('settings'); openSetCat(c); }, 600, c); }
  await scr('addons', () => { showTab('addons'); }, 800);
  await scr('editor', () => { showTab('settings'); editProfile(profile.id); }, 800);
  for (const c of ['pspaces', 'pstart', 'personal', 'content', 'notif']) { await scr('ed-' + c, (c) => { peSubOpen(c, document.querySelector('#profEd .pe2-r'), () => {}); }, 500, c); }
  await reset();
  await scr('avpop', () => { editProfile(profile.id); document.querySelector('.pe-avbtn').click(); }, 800);
  await reset();
  await scr('spaceswitch', () => { showTab('home'); spaceSwitch(); }, 600);
  await reset();
  await scr('launcher', () => { showLauncher(); }, 600);
  await scr('launcher-edit', () => { [...document.querySelectorAll('#launcher .chip')].find(b => /Edit spaces/.test(b.textContent))?.click(); }, 500);
  await scr('spaceeditor', () => { editSpace(spaces[0].id); }, 800);
  await reset();
  await scr('profiles', () => { showProfiles(); }, 600);
  await scr('profiles-manage', () => { manageProfiles = true; renderProfiles(); }, 500);
  await scr('pin', () => { pinPad('Enter the PIN'); }, 500);
  await reset();
  await scr('episode', () => { openDetail(addons[0], 'series', { id: 'tt1005', type: 'series', name: 'Northfall' }); }, 2500);
  await scr('episode-page', () => { document.querySelector('#detail .ep')?.click(); }, 2000);
  await reset();
  await scr('addon-editor', () => { showTab('addons'); document.querySelector('#list .acard')?.click(); }, 800);
  await reset();
  await scr('player', () => { playStream({ name: 'Mock\n1080p', title: 'Northfall.mp4', url: 'https://x.test/a.mp4' }, 'Northfall'); }, 2500);
  await ev(() => { try { stopPlayer(); } catch {} }); await reset();
  await scr('login', () => { showLogin(); }, 800);
  await ev(() => { $('#login').hidden = true; });
  await scr('welcome', () => { lsSet('streamlet.welcomed', 0); const keep = addons; addons = addons.filter(a => isTio(a.url)); welcomeMaybe(); addons = keep; }, 600);
  await scr('welcome-2', () => { wz.step = 1; wzDraw(); }, 400);
  await scr('welcome-3', () => { wz.step = 2; wzDraw(); }, 400);
  await ev(() => { document.querySelector('#welcome')?.remove(); lsSet('streamlet.welcomed', 1); }); await reset();
  await scr('exit', () => { showTab('home'); $('#exitDlg').hidden = false; }, 400);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(W, cuts ? cuts + ' cut focus ring(s)' : 'no cut focus rings', errs.length ? 'errors: ' + errs.slice(0, 3).join(' | ') : ''); await b.close(); server.close(); process.exitCode = cuts || errs.length ? 1 : 0;
})();
