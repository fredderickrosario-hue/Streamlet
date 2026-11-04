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
    // a space can have its own languages
    const lg = await p.evaluate(() => { settings = { subLang: 'off', audioLang: 'any' }; const before = [effAudio(), effSub()]; cur = { ...cur, audio: 'jpn', subs: 'eng' }; const after = [effAudio(), effSub()]; cur = { ...cur, audio: '', subs: '' }; return { before, after, back: [effAudio(), effSub()] }; });
    ok('space languages override the Settings ones', JSON.stringify(lg.before) === '["any","off"]' && JSON.stringify(lg.after) === '["jpn","eng"]' && JSON.stringify(lg.back) === '["any","off"]', JSON.stringify(lg));
    // first letters: titles with a word starting with them, popular first, no "contains" matches
    const sh = await p.evaluate(() => {
      const mk = (name, r) => ({ id: name, type: 'movie', name, imdbRating: r });
      const items = new Map(); for (const [n, r] of [['Gojo Stories', '5'], ['Joker', '8.4'], ['Jolt', '6.1'], ['Ajo Blanco', '4.8'], ['Jobs', '7']]) items.set('m|' + n, { m: mk(n, r), a: {}, type: 'movie', rank: 0, score: relevance('jo', mk(n, r)) + parseFloat(r) / 200, exact: true });
      return rankResults(items).map(x => x.m.name);
    });
    ok('short search shows prefix titles, popular first', JSON.stringify(sh) === JSON.stringify(['Joker', 'Jobs', 'Jolt']), JSON.stringify(sh));
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
    {
      const r = await p.evaluate(() => {
        const id = 'tt999', sorted = [1, 2, 3].map(e => ({id:`${id}:1:${e}`, season:1, episode:e}));
        epPut(id, 1, 1, {pos:100, dur:1000, done:false}); const a = epNext(id, sorted);
        epPut(id, 1, 1, {pos:0, dur:1000, done:true}); const b = epNext(id, sorted);
        epMark(id, sorted, true); const c = epDone(id, 1, 3);
        epMark(id, sorted, false); const d = epDone(id, 1, 2);
        return a.resume && a.v.episode === 1 && !b.resume && b.v.episode === 2 && c && !d;
      });
      ok('per-episode store: progress, next episode, mark season', r);
    }
    {
      const r = await p.evaluate(async () => {
        const page = ent => ({status:200, body:`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{staticEntity:ent}}})}</script> /tva/show-x/saison-1 /tva/show-x/saison-2`});
        window.Capacitor = {isNativePlatform:() => true, Plugins:{ExoPlayer:{httpGet: async ({url}) => {
          if (url.endsWith('/tva/show-x')) return page({name:'Show X', longDescription:'d', thumbnailImage:{url:'https://img/x.jpg'}});
          if (/saison-\d\/tous-les-episodes/.test(url)) { const s = url.match(/saison-(\d)/)[1]; return page({associatedEntities:[{slug:`/tva/show-x/saison-${s}/episode-1-le-debut-123`, seasonNumber:+s, episodeNumber:1, mainImage:{url:'https://img/e.jpg'}}]}); }
          if (/episode-1-le-debut/.test(url)) return page({name:'Le début', videoId:'999', longDescription:'resume', durationMillis:2400000, startDate:'2026-10-30T20:00:00Z'});
          if (url.includes('index.min.js')) return {status:200, body:'x policyKey:"BCpk123" y'};
          if (url.includes('/videos/999')) return {status:200, body:JSON.stringify({sources:[{type:'application/x-mpegURL', src:'http://m/a.m3u8'}, {container:'MP4', src:'http://m/a.mp4', height:1080}]})};
          return {status:404, body:''};
        }}}};
        localStorage.setItem('streamlet.qcshows', JSON.stringify(['https://www.tvaplus.ca/tva/show-x']));
        const man = await qcRoute('qc://tva/manifest.json'), cat = await qcRoute('qc://tva/catalog/series/qc-shows.json');
        const mr = await qcRoute('qc://tva/meta/series/' + encodeURIComponent('qc:tva:/tva/show-x') + '.json'); if (!mr.meta) return 'no meta: ' + JSON.stringify(mr).slice(0, 200); const meta = mr.meta;
        const st = (await qcRoute('qc://tva/stream/series/' + encodeURIComponent(meta.videos[1].id) + '.json')).streams;
        return man.name === 'Québec' && cat.metas[0].name === 'Show X' && meta.videos.length === 2 && meta.videos[1].season === 2 && meta.videos[1].title === 'Le début' && meta.videos[1].released.startsWith('2026-10-30') && st.length === 2 && st[0].url.startsWith('https://') && /1080p/.test(st[1].title);
      }).catch(e => String(e));
      ok('Québec addon: catalog, episodes, streams from mocked TVA+ pages', r === true, r);
      await p.evaluate(() => { delete window.Capacitor; });
    }
    {
      const r = await p.evaluate(async () => {
        window.Capacitor = {isNativePlatform:() => true, Plugins:{ExoPlayer:{httpGet: async ({url}) => {
          if (url.endsWith('/tele/stat/site/episodes')) return {status:200, body:'<meta property="og:title" content="STAT | ICI Télé"><meta property="og:image" content="https://img/s.jpg"> <a href="/tele/stat/site/episodes/1281067/mardi-27-octobre-2026">x</a><a href="/tele/stat/site/episodes/1281000/mardi-20-octobre-2026">y</a>'};
          if (url.includes('/episodes/1281067/')) return {status:200, body:'<a href="/x/media-10791494/a">m</a> 1281067'};
          if (url.includes('idMedia=10791494')) return {status:200, body:JSON.stringify({errorCode:0, url:'http://cdn/a.m3u8'})};
          return {status:200, body:JSON.stringify({errorCode:6})};
        }}}};
        localStorage.setItem('streamlet.qcshows', JSON.stringify(['https://ici.radio-canada.ca/tele/stat/site/episodes']));
        qcMem.clear();
        const meta = (await qcRoute('qc://tva/meta/series/' + encodeURIComponent('qc:rc:stat') + '.json')).meta;
        const st = (await qcRoute('qc://tva/stream/series/' + encodeURIComponent(meta.videos[1].id) + '.json')).streams;
        window.__cm = true;
        return meta.name === 'STAT' && meta.videos.length === 2 && meta.videos[0].released.startsWith('2026-10-20') && st.length === 1 && st[0].url === 'https://cdn/a.m3u8';
      }).catch(e => String(e));
      ok('Québec addon: Radio-Canada episodes and stream (mocked)', r === true, r);
      await p.evaluate(() => { delete window.Capacitor; });
    }
    {
      const r = await p.evaluate(async () => {
        window.Capacitor = {isNativePlatform:() => true, Plugins:{ExoPlayer:{httpGet: async ({url}) => {
          if (url.includes('cinemeta')) return {status:200, body:JSON.stringify({meta:{videos:[{season:5, episode:7, released:'2026-10-28T00:00:00.000Z'}, {season:5, episode:6, released:'2026-10-21T00:00:00.000Z'}]}})};
          if (url.endsWith('/tele/stat/site/episodes')) return {status:200, body:'<meta property="og:title" content="STAT"> <a href="/tele/stat/site/episodes/1281067/mardi-27-octobre-2026">x</a>'};
          if (url.includes('/episodes/1281067/')) return {status:200, body:'media-10791494'};
          if (url.includes('idMedia=10791494')) return {status:200, body:JSON.stringify({errorCode:0, url:'https://cdn/a.m3u8'})};
          return {status:200, body:JSON.stringify({errorCode:6})};
        }}}};
        qcMem.clear(); localStorage.removeItem('streamlet.qcseen.stat');
        const m = await qcRoute('qc://tva/manifest.json');
        const ok7 = (await qcRoute('qc://tva/stream/series/' + encodeURIComponent('tt22037002:5:7') + '.json')).streams, ok6 = (await qcRoute('qc://tva/stream/series/' + encodeURIComponent('tt22037002:5:6') + '.json')).streams;
        return supports({manifest:m}, 'stream', 'series', 'tt22037002:5:7') && !supports({manifest:m}, 'stream', 'series', 'tt999:1:1') && ok7.length === 1 && ok6.length === 0;
      }).catch(e => String(e));
      ok('Québec addon: a Cinemeta episode of Stat gets the matching Radio-Canada stream', r === true, r);
      await p.evaluate(() => { delete window.Capacitor; });
    }
    {
      const r = await p.evaluate(async () => {
        const id = 'tt555', old = cur;
        cur = {id:'sp1', allHistory:true, catalogs:[], streams:[]};
        addons.push({uid:'m.test', url:'https://m.test/manifest.json', base:'https://m.test', manifest:{id:'m.test', name:'M', resources:[{name:'meta', types:['series'], idPrefixes:['tt']}], types:['series']}});
        const real = getJSON; getJSON = async u => u.includes('/meta/series/') ? {meta:{id, name:'Show Q', poster:'p', videos:[
          {id:id + ':1:1', season:1, episode:1, released:'2020-01-01T00:00:00Z'}, {id:id + ':1:2', season:1, episode:2, released:'2020-01-08T00:00:00Z'}, {id:id + ':1:3', season:1, episode:3, released:'2999-01-01T00:00:00Z'}]}} : real(u);
        pset('shows', {[id]:{n:'Show Q', ty:'series', sp:'sp1', t:Date.now(), a:'m.test'}});
        epMark(id, [{season:1, episode:1}], true); nuMem.clear();
        const a = await nextEpisodeCards(new Set());
        epMark(id, [{season:1, episode:2}], true); nuMem.clear();
        const b = await nextEpisodeCards(new Set());
        getJSON = real; cur = old; addons.pop();
        return a.length === 1 && a[0].ep.episode === 2 && a[0].upnext && b.length === 0;
      }).catch(e => String(e));
      ok('Continue watching: next aired episode of a started show, none when only future ones remain', r === true, r);
    }
    {
      const r = await p.evaluate(() => {
        const id = 'tt777', v = (e, rel) => ({id:`${id}:1:${e}`, season:1, episode:e, released:rel || '2020-01-01T00:00:00Z'}), vids = [v(1), v(2), v(3), v(4), v(5, '2999-01-01T00:00:00Z')];
        const none = countUnwatched(id, vids);
        epMark(id, [vids[1]], true); const a = countUnwatched(id, vids);                  // watched 2: episodes 3 and 4 are new, 1 is before the first watched
        epMark(id, [vids[3]], true); const b = countUnwatched(id, vids);                  // watched 2 and 4: 3 is missed
        cntMem.set(id, 3); const el = ribEl(id); const ok = el && el.dataset.n === '3' && el.className === 'rib cnt'; cntMem.delete(id);
        return none === 0 && a === 2 && b === 1 && ok;
      });
      ok('Poster mark: counts new and missed episodes after the first one watched', r);
    }
    {
      const r = await p.evaluate(async () => {
        const id = 'tt888', old = cur;
        cur = {id:'sp1', allHistory:true, catalogs:[], streams:[]};
        addons.push({uid:'m.test2', url:'https://m.test2/manifest.json', base:'https://m.test2', manifest:{id:'m.test2', name:'M2', resources:[{name:'meta', types:['series'], idPrefixes:['tt']}], types:['series']}});
        const real = getJSON; getJSON = async u => u.includes('/meta/series/') ? {meta:{id, name:'Show R', videos:[{id:id + ':1:1', season:1, episode:1, released:'2020-01-01T00:00:00Z'}, {id:id + ':1:2', season:1, episode:2, released:'2020-01-08T00:00:00Z'}]}} : real(u);
        pset('shows', {[id]:{n:'Show R', ty:'series', sp:'sp1', t:Date.now(), a:'m.test2'}});
        epMark(id, [{season:1, episode:2}], true); epMark(id, [{season:1, episode:2}], false); nuMem.clear();     // watched episode 2, then took it off the list
        const a = await nextEpisodeCards(new Set());
        getJSON = real; cur = old; addons.pop();
        return a.length === 1 && a[0].ep.episode === 2;
      }).catch(e => String(e));
      ok('Continue watching: an episode taken off the watched list is offered again', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const real = getJSON;
        getJSON = async u => {
          if (u.includes('/catalog/series/top/search=Show%20A')) return {metas:[{id:'tt901', name:'Show A', releaseInfo:'2020', genres:['Animation']}]};
          if (u.includes('/catalog/movie/top/search=A%20Movie')) return {metas:[{id:'tt902', name:'A Movie', releaseInfo:'2019'}]};
          if (u.includes('/meta/series/tt901')) return {meta:{genres:['Animation'], videos:[{season:1, episode:1, name:'Pilot'}, {season:1, episode:2, name:'Second One'}, {season:1, episode:3, name:'Third'}]}};
          if (u.includes('/catalog/')) return {metas:[]};
          return real(u);
        };
        const csv = 'Title,Date\n"Show A: Season 1: Pilot",1/2/24\n"Show A: Season 1: Second One",1/3/24\n"Show A: Season 1: Not Real",1/4/24\n"A Movie",1/5/24\nUnknown Thing,1/6/24\n';
        const list = await nfBuild(csv, () => {});
        const a = list.find(g => g.name === 'Show A'), m = list.find(g => g.name === 'A Movie'), u = list.find(g => g.name === 'Unknown Thing');
        spaces = spaces || []; const sid = 'sp-test';
        for (const g of list) { g.include = !!g.match; g.space = sid; }
        const res = nfApply(list);
        getJSON = real;
        return list.length === 1 && a.found === 2 && a.missed === 1 && nfAnimeish(a) && !m && !u && epDone('tt901', 1, 1) && epDone('tt901', 1, 2) && !epDone('tt901', 1, 3) && !watchedHas('tt902') && pget('shows', {}).tt901.sp === sid && res.nEp === 2 && res.nMovie === 0;
      }).catch(e => String(e));
      ok('Netflix import: shows only, episodes matched and marked watched into the chosen space', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const old = cur; cur = {id:'sp1', allHistory:true, catalogs:[], streams:[]};
        pset('shows', {tt321:{n:'Show L', ty:'series', sp:'sp1', t:Date.now(), a:'x', p:''}});
        epMark('tt321', [{season:1, episode:2}], true);
        const out = [];
        for (const [id] of ML_TABS) { mlTab = id; renderWatch(); await new Promise(r => setTimeout(r, 30)); out.push(id + ':' + $('#wlGrid').children.length); }
        mlTab = 'list'; cur = old;
        return $('#watch h1').textContent === 'My List' && out[1] === 'watching:1' && out[2] === 'history:1' && out.length === 4;
      }).catch(e => String(e));
      ok('My List: tabs render (watchlist, watching, history, for you)', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const old = cur, rw = renderWatch; let n = 0; cur = {id:'sp1', allHistory:true, catalogs:[], streams:[]};
        renderWatch = (...a) => { n++; return rw(...a); };
        mlTab = 'watching'; renderWatch(); await new Promise(r => setTimeout(r, 400));
        renderWatch = rw; mlTab = 'list'; cur = old;
        return n < 5 ? true : 'renderWatch ran ' + n + ' times';
      }).catch(e => String(e));
      ok('My List: the Watching tab does not redraw itself in a loop', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const oc = cur, ofs = findSimilar, rj = getJSON, ot = view;
        cur = {id:'sp1', allHistory:true, tabs:true, catalogs:[], streams:[]};
        pset('shows', {tt777:{n:'Show P', ty:'series', sp:'sp1', t:Date.now(), a:addons[0].uid, p:''}});
        recsCache.clear();
        findSimilar = async () => [1, 2, 3, 4].map(i => ({a:addons[0], type:'series', m:{id:'ttr' + i, name:'Rec ' + i, type:'series'}}));
        const heads = async tab => { view = {tab, genre:''}; await renderHome(''); await new Promise(r => setTimeout(r, 500)); return [...document.querySelectorAll('#rows .row h2')].map(x => x.textContent); };
        likeAdd({itemId:'ttL1', type:'movie', name:'Liked Movie', addonId:addons[0].uid}); const c1 = cur; cur = {id:'other', catalogs:[], streams:[]}; const lk = likeHas('ttL1') === false && likeHere().length === 0; cur = c1; const lk2 = likeHas('ttL1'); likeRemove('ttL1'); pset('likes', []);
        const home = await heads('home'), shows = await heads('series');
        findSimilar = ofs; cur = oc; view = ot; pset('shows', {});
        return lk && lk2 && home.some(x => x === 'Because you watched Show P') && home.includes('Your next watch') && !shows.some(x => /Because you/.test(x)) ? true : JSON.stringify({home, shows});
      }).catch(e => String(e));
      ok('Home: personal rows (next watch, because you watched); catalogs stay on the Movies / Shows tabs', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const oc = cur, ob = addons.slice(), og = getJSON; let hits = 0;
        const a = {uid:'wm', base:'https://warm.test', manifest:{id:'wm', name:'W', resources:['catalog'], types:['movie'], catalogs:[{type:'movie', id:'top', name:'Top'}]}};
        addons = [a]; warmC.clear();
        getJSON = async u => { hits++; return {metas:[{id:'ttw', name:'W'}]}; };
        await warmSpace({id:'spw', name:'Warm', emoji:'🔥', theme:'violet', catalogs:[]}, 3000);
        const has = warmC.has('https://warm.test/catalog/movie/top.json');
        getJSON = og; addons = ob; cur = oc; warmC.clear();
        return has && hits === 1 ? true : JSON.stringify({has, hits});
      }).catch(e => String(e));
      ok("Warm: a space's catalogs are fetched ahead and kept for a moment", r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const id = profile.id, before = plsGet(id, 'shows', {});
        plsSet(id, 'shows', {});
        const ch = mergeProfile(id, {shows:{tt555:{n:'Remote Show', ty:'series', sp:'anime', t:123, a:'x', p:''}}});
        const got = plsGet(id, 'shows', {}).tt555; plsSet(id, 'shows', before);
        return ch && got && got.n === 'Remote Show' && got.sp === 'anime' ? true : JSON.stringify({ch, got});
      }).catch(e => String(e));
      ok('Sync: shows you follow come from the account to a new device', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const id = profile.id, b = [plsGet(id, 'shows', {}), plsGet(id, 'history', [])];
        plsSet(id, 'shows', {}); plsSet(id, 'history', [{k:'x', itemId:'ttBF', itemType:'series', name:'Old Show', poster:'', space:'anime', t:5}]);
        const ch = showsBackfill(id), got = plsGet(id, 'shows', {}).ttBF;
        plsSet(id, 'shows', b[0]); plsSet(id, 'history', b[1]);
        return ch && got && got.sp === 'anime' && got.n === 'Old Show' ? true : JSON.stringify({ch, got});
      }).catch(e => String(e));
      ok('Shows list is rebuilt from the history for shows watched before it existed', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const id = profile.id, b = [plsGet(id, 'eps', []), plsGet(id, 'epRemoved', {})];
        plsSet(id, 'eps', []); plsSet(id, 'epRemoved', {});
        const list = Array.from({length:4000}, (_, i) => ({k:'ttB|1|' + i, itemId:'ttB', s:1, e:i, pos:0, dur:0, done:true, t:1000 + i}));
        const str = JSON.stringify({l:list, r:{}}), parts = []; for (let i = 0; i < str.length; i += 200000) parts.push(str.slice(i, i + 200000));
        const docs = parts.map((s2, i) => ({id:'b__' + id + '__eps__' + i, data:() => ({pid:id, key:'eps', i, n:parts.length, s:s2})}));
        const partial = mergeBlobs(docs.slice(0, 1)), got = mergeBlobs(docs), n = plsGet(id, 'eps', []).length;
        plsSet(id, 'eps', b[0]); plsSet(id, 'epRemoved', b[1]); epReset();
        return parts.length > 1 && !partial && got && n === 3000 ? true : JSON.stringify({parts:parts.length, partial, got, n});
      }).catch(e => String(e));
      ok('Sync: big lists travel in chunks and are only applied once every piece has arrived', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        const d = n => new Date(Date.now() + n * 864e5).toISOString();
        const fresh = nsCompute({videos:[{id:'a', season:1, episode:1, released:d(-400)}, {id:'b', season:2, episode:1, released:d(-10)}, {id:'c', season:2, episode:2, released:d(-3)}, {id:'f', season:3, episode:1, released:d(40)}]});
        const old = nsCompute({videos:[{id:'a', season:1, episode:1, released:d(-400)}, {id:'b', season:2, episode:1, released:d(-200)}]});
        const newShow = nsCompute({videos:[{id:'a', season:1, episode:1, released:d(-5)}]});
        const ot = tmdbGet, hb = homeTok; nhMem.clear();
        tmdbGet = async path => ({results:[1, 2, 3].map(i => ({id:i, title:'T' + i, name:'T' + i, poster_path:'/p' + i + '.jpg', release_date:'2030-01-0' + i, first_air_date:'2030-01-0' + i, media_type:i === 2 ? 'tv' : 'movie'}))});
        const box = document.createElement('div'); const ok2 = await renderNewHot(box, homeTok, 'k'); tmdbGet = ot;
        const heads = [...box.querySelectorAll('h2')].map(x => x.textContent), ranks = box.querySelectorAll('.nhrank').length, dates = box.querySelectorAll('.rtag.upcoming').length;
        return fresh === 2 && old === 0 && newShow === 0 && ok2 && heads.includes('Coming soon') && heads.includes('Top 10 shows today') && ranks >= 3 && dates >= 3 ? true : JSON.stringify({fresh, old, newShow, ok2, heads, ranks, dates});
      }).catch(e => String(e));
      ok('New & Hot rows (coming soon, top 10) and New season detection', r === true, r);
    }
    {
      const r = await p.evaluate(async () => {
        if (!document.body.classList.contains('tv')) return true;
        const i = document.createElement('input'); i.type = 'text'; document.body.append(i);
        await new Promise(r => setTimeout(r, 50));
        const locked = i.readOnly && i.getAttribute('inputmode') === 'none';
        i.focus(); const still = i.readOnly;
        i.click(); await new Promise(r => setTimeout(r, 30));
        const open = !i.readOnly && i.getAttribute('inputmode') === 'text';
        i.blur(); await new Promise(r => setTimeout(r, 30));
        const back = i.readOnly; i.remove();
        return locked && still && open && back ? true : JSON.stringify({locked, still, open, back});
      }).catch(e => String(e));
      ok('TV: a text box only opens its keyboard when you click it', r === true, r);
    }
    ok('no errors after all of the above', errs.length === 0, errs[0]);
    await p.close();
  }
  await b.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
