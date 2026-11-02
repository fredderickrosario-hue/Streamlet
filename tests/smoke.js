// Quick checks that the main things still work.   node tests/smoke.js   (needs: npm i playwright)
// Starts its own tiny web server and a fake addon; nothing touches the network.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webmanifest': 'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const M = (id, name, y, genres, cast) => ({ id, type: 'movie', name, releaseInfo: String(y), genres, cast, poster: null });
const DB = {
  'search=tinker bell': [M('t1', 'Tinker Bell', 2008, ['Animation'])],
  'search=tom holland': [M('s1', 'Spider-Man: Homecoming', 2017, ['Action'], ['Tom Holland']), M('s2', 'Uncharted', 2022, ['Action'], ['Tom Holland'])],
  'genre=horror': [M('h1', 'Saw', 2004, ['Horror'])],
  'catalog/movie/top.json': [M('c1', 'Top One', 2020, ['Action'])],
};
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  ' + (extra || ''))); };

(async () => {
  await new Promise(r => server.listen(8199, r));
  const b = await chromium.launch();
  for (const [flavor, vw, vh] of [['web', 400, 800], ['phone', 400, 800], ['tv', 1280, 720]]) {
    console.log(flavor);
    const url = `http://localhost:8199/${flavor === 'web' ? '' : flavor + '/'}index.html`;
    const p = await b.newPage({ viewport: { width: vw, height: vh } }), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('https://mock.test/**', r => {
      const u = decodeURIComponent(r.request().url()).toLowerCase();
      const k = Object.keys(DB).find(x => u.includes('/' + x + (x.endsWith('.json') ? '' : '.json')) || u.endsWith(x));
      const base = { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } };
      if (u.includes('/meta/')) return r.fulfill({ ...base, body: JSON.stringify({ meta: { ...M('s1', 'Spider-Man: Homecoming', 2017, ['Action'], ['Tom Holland']), description: 'x', director: ['Jon Watts'] } }) });
      r.fulfill({ ...base, body: JSON.stringify({ metas: k ? DB[k] : [] }) });
    });
    await p.goto(url); await p.waitForTimeout(700);
    ok('page loads without errors', errs.length === 0, errs[0]);
    const r = await p.evaluate(async () => {
      document.querySelector('#intro')?.remove(); document.body.classList.remove('launch');
      for (const s of document.querySelectorAll('main>section')) s.hidden = true; $('#home').hidden = false;
      addons = [{ url: 'https://mock.test/manifest.json', base: 'https://mock.test', manifest: { id: 'm', name: 'Mock', version: '1', resources: ['catalog', 'meta'], types: ['movie'], catalogs: [{ type: 'movie', id: 'top', name: 'Top', extra: [{ name: 'search' }, { name: 'genre', options: ['Horror'] }] }] } }];
      ensureUids(); cur = { id: 'x', name: 'X', emoji: 'x', theme: 'violet', catalogs: ['not-installed'] };
      const out = {}, box = $('#rows');
      for (const q of ['Tinker bell', 'Tom Holland', 'horror']) { await renderHome(q, box); await new Promise(r => setTimeout(r, 400)); out[q] = [...document.querySelectorAll('.rgrid .card .t')].map(x => x.textContent); }
      out.rank = simScore('tinkerbell', 'Tinker Bell') > .9 && simScore('tinker bell', 'Tinker Bell and the Great Fairy Rescue') < simScore('tinker bell', 'Tinker Bell');
      out.sim = typeof findSimilar === 'function';
      return out;
    });
    ok('search finds a title even when the space cannot search', r['Tinker bell'].includes('Tinker Bell'), JSON.stringify(r['Tinker bell']));
    ok('search finds movies by actor', r['Tom Holland'].length === 2 && r['Tom Holland'][0].startsWith('Spider'), JSON.stringify(r['Tom Holland']));
    ok('search by genre works', r['horror'].includes('Saw'), JSON.stringify(r['horror']));
    ok('spacing and length ranking', r.rank === true);
    ok('similar titles function present', r.sim === true);
    // entry page: opens, tags are buttons that start a search
    const d = await p.evaluate(async () => {
      if (!profile) profile = { id: 'p1', name: 'Test', avatar: 0 };
      await openDetail(addons[0], 'movie', { id: 's1', type: 'movie', name: 'Spider-Man: Homecoming', releaseInfo: '2017', genres: ['Action'], cast: ['Tom Holland'] });
      await new Promise(r => setTimeout(r, 800));
      const pills = [...document.querySelectorAll('#detail .pillx')];
      return { n: pills.length, buttons: pills.every(x => x.tagName === 'BUTTON') };
    });
    ok('entry page opens with clickable tags', d.n > 0 && d.buttons, JSON.stringify(d));
    // shows: picking an episode (or "next") inside the player plays it from the same kind of source
    const ep = await p.evaluate(async () => {
      const eps = [1, 2, 3, 4].map(n => ({ id: 'tt:1:' + n, season: 1, episode: n, title: 'Ep ' + n }));
      const calls = []; const real = window.playNative; window.playNative = async (st, title, c) => { calls.push([st.name, c.ep.episode, c.next && c.next.episode, c.rest.length]); };
      addons[0].manifest = { ...addons[0].manifest, resources: [{ name: 'stream', types: ['series'], idPrefixes: ['tt'] }], types: ['series'] }; cur = { ...cur, streams: [addons[0].uid] };
      getJSON = async () => ({ streams: [{ url: 'http://x/a', name: 'A 1080p' }, { url: 'http://x/b', name: 'B 720p' }] });
      const prev = { url: 'http://x/b', name: 'B 720p' };
      const ctx = { type: 'series', id: eps[0].id, info: { item: { id: 'tt', name: 'Show' } }, alt: [], eps, ep: { season: 1, episode: 1 }, next: eps[1], rest: eps.slice(2, 6) };
      await autoPlayNext(ctx, prev); await playEpisodeOf(ctx, 1, 3, prev);
      return calls;
    });
    ok('next episode keeps the same kind of source and moves on', JSON.stringify(ep[0]) === JSON.stringify(['B 720p', 2, 3, 1]), JSON.stringify(ep));
    ok('picking an episode plays that one', JSON.stringify(ep[1]) === JSON.stringify(['B 720p', 3, 4, 0]), JSON.stringify(ep));
    // best source: language, quality limit, previously failed sources
    const bs = await p.evaluate(() => {
      settings.audioLang = 'any'; lsSet('streamlet.ui', { maxQ: '1080' });
      const mk = (n, t) => ({ url: 'http://x/' + n, name: n, title: t || '' });
      const list = [mk('Torrentio\n4K', '2160p HDR 👤 50'), mk('Torrentio\n1080p slow', '1080p 👤 5'), mk('Torrentio\n1080p fast', '1080p 👤 90'), mk('Torrentio\n720p', '720p 👤 500'), { name: 'no url' }];
      const top = rankStreams(list, 'x').map(x => x.name.split('\n')[1]);
      return top;
    });
    ok('auto-pick respects the quality limit and prefers more seeds', JSON.stringify(bs.slice(0, 3)) === JSON.stringify(['1080p fast', '1080p slow', '720p']), JSON.stringify(bs));
    const ap = await p.evaluate(async () => {
      lsSet('streamlet.ui', { autoPick: true });
      addons[0].manifest = { ...addons[0].manifest, resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }], types: ['movie'] }; cur = { ...cur, streams: [addons[0].uid] };
      getJSON = async () => ({ streams: [{ url: 'http://x/a', name: 'A\n720p' }, { url: 'http://x/b', name: 'B\n1080p' }] });
      const got = []; playStream = (st, title, ctx) => got.push([st.name.split('\n')[1], ctx._list.length]);
      const r = await autoPlay('movie', 'tt1', 'Movie', { info: { item: { id: 'tt1' } }, alt: [] });
      return { r, got, manual: !!(manualSources && true) };
    });
    ok('Play picks the best source and keeps the rest as fallbacks', ap.r === true && JSON.stringify(ap.got) === JSON.stringify([['1080p', 2]]), JSON.stringify(ap));
    // duplicates, release labels
    const dd = await p.evaluate(() => {
      const list = [{ m: { name: 'Tinker Bell', releaseInfo: '2008' }, type: 'movie' }, { m: { name: 'Tinker  Bell', year: 2008, poster: 'p.jpg' }, type: 'movie' }, { m: { name: 'Tinker Bell', releaseInfo: '2014' }, type: 'movie' }];
      const out = dedupeList(list, x => x.m, x => x.type);
      lsSet('streamlet.ui', { showUpcoming: true });
      const fut = relState({ id: 'a', name: 'X', released: new Date(Date.now() + 5 * 864e5).toISOString() }, 'movie');
      const old = relState({ id: 'b', name: 'Y', released: '2010-01-01' }, 'movie');
      noteTheaters({ id: 'c', type: 'movie', released: new Date(Date.now() - 20 * 864e5).toISOString() }, [{ url: 'x', name: 'Movie.2026.HDCAM' }]);
      const th = relState({ id: 'c', type: 'movie', name: 'Z' }, 'movie');
      noteTheaters({ id: 'c', type: 'movie', released: new Date(Date.now() - 20 * 864e5).toISOString() }, [{ url: 'x', name: 'Movie 1080p WEB-DL' }]);
      const gone = relState({ id: 'c', type: 'movie', name: 'Z' }, 'movie');
      lsSet('streamlet.ui', { showUpcoming: false });
      const hidden = visibleMeta({ id: 'a', name: 'X', released: new Date(Date.now() + 5 * 864e5).toISOString() }, 'movie');
      lsSet('streamlet.ui', {});
      return { n: out.length, first: out[0].m.poster || '', fut, old, th, gone, hidden };
    });
    ok('same movie from two addons shows once (poster wins)', dd.n === 2 && dd.first === 'p.jpg', JSON.stringify(dd));
    ok('upcoming and in-theater labels (recordings do not count as released)', dd.fut === 'upcoming' && dd.old === null && dd.th === 'theaters' && dd.gone === null && dd.hidden === false, JSON.stringify(dd));
    // spaces page
    const sp = await p.evaluate(() => { spaces = [{ id: 'a', name: 'A', emoji: '🍿', theme: 'violet', catalogs: [] }, { id: 'b', name: 'B', emoji: '🎌', theme: 'rose', catalogs: [] }]; showLauncher(); return document.querySelectorAll('.stile:not(.new)').length; });
    ok('spaces page shows every space', sp === 2, sp);
    // nav: active icon is filled
    const nv = await p.evaluate(() => { document.body.classList.remove('launch'); $('#launcher').hidden = true; showTab('settings'); const s = $('#tabSettings'); return s.classList.contains('on'); });
    ok('settings tab becomes active', nv);
    if (flavor === 'tv') {
      const c = await p.evaluate(async () => { document.body.classList.add('tv'); const u = 'https://mock.test/catalog/movie/top.json'; await getJSON(u); await new Promise(r => setTimeout(r, 300)); return (await caches.keys()).includes('streamlet-data'); });
      ok('TV remembers catalog rows', c);
    }
    ok('no errors after all of the above', errs.length === 0, errs[0]);
    await p.close();
  }
  await b.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
