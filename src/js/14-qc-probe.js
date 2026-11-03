/* ---------- Québec test: what do TVA+ and ICI Tou.tv give back for a show? (read-only, no login, nothing is stored) ---------- */
async function qcGet(url, headers){
  const N = nativePlayer();
  if (N && N.httpGet) { const r = await N.httpGet({url, headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language':'fr-CA,fr;q=0.9', ...(headers || {})}}); return r; }
  const r = await fetch(url, {headers}); return {status:r.status, body:await r.text(), url:r.url};
}
const qcHost = u => { try { return new URL(u).host; } catch { return '?'; } };
async function qcPlaylist(u, L){
  try {
    const r = await qcGet(String(u).replace(/^http:/, 'https:')), t = r.body || '';
    const keys = [...new Set((t.match(/#EXT-X-(?:SESSION-)?KEY:[^\n]*/g) || []).map(x => (x.match(/METHOD=([A-Z0-9-]+)/) || [])[1] + (/KEYFORMAT="([^"]+)"/.test(x) ? ' ' + x.match(/KEYFORMAT="([^"]+)"/)[1].replace(/^urn:uuid:/, '').slice(0, 12) : '')))];
    const res = [...t.matchAll(/RESOLUTION=(\d+x\d+)/g)].map(m => m[1]);
    L(`    playlist: status ${r.status} · ${t.startsWith('#EXTM3U') ? 'valid HLS' : 'not HLS'} · variants ${res.length ? [...new Set(res)].join(' ') : '-'} · encryption: ${keys.length ? keys.join(', ') : 'none'} · audio tracks ${(t.match(/TYPE=AUDIO/g) || []).length} · subtitle tracks ${(t.match(/TYPE=SUBTITLES/g) || []).length}`);
  } catch (e) { L('    playlist failed: ' + e); }
}
function qcOutline(obj, L, max = 120){
  const outline = [], sh = (o, path, d) => {
    if (!o || typeof o !== 'object' || d > 9 || outline.length > max) return;
    if (Array.isArray(o)) { outline.push(`${path} [${o.length}]`); if (o[0]) sh(o[0], path + '[0]', d + 1); if (o.length > 1 && o[o.length - 1] && typeof o[o.length - 1] === 'object') sh(o[o.length - 1], path + '[last]', d + 1); return; }
    for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') sh(v, path + '.' + k, d + 1); else if (/id|slug|url|href|season|episode|media|title|name|duration|date|video|reference/i.test(k)) outline.push(`${path}.${k} = ${String(v).slice(0, 48)}`); }
  };
  sh(obj, '', 0); for (const t of outline.slice(0, max)) L('  ' + t);
}
async function qcSigned(idMedia, L){
  const N = nativePlayer();
  if (!N || !N.touGet) { L('Needs the updated Android app.'); return; }
  L(`SIGNED-IN TEST · media ${idMedia}`);
  for (const [dt, tech] of [['ipad', 'hls'], ['multiams', 'dash'], ['desktop', 'hls'], ['androidtv', 'hls']]) {
    try {
      const r = await N.touGet({url:`https://services.radio-canada.ca/media/validation/v2/?appCode=toutv&connectionType=hd&deviceType=${dt}&idMedia=${idMedia}&multibitrate=true&output=json&tech=${tech}&manifestVersion=2`});
      let j = null; try { j = JSON.parse(r.body); } catch {}
      const prot = j ? (j.protectionType || ((j.params || []).find(p => /protect|drm|license/i.test(p.name)) || {}).name || '-') : '-';
      L(`  ${dt}/${tech}: status ${r.status}` + (j ? ` · errorCode ${j.errorCode ?? '-'} · ${String(j.message || '').slice(0, 80)} · url ${j.url ? qcHost(j.url) : 'none'} · protection ${prot}${j.params ? ' · params: ' + j.params.map(p => p.name).slice(0, 8).join(',') : ''}` : ` · ${String(r.body).slice(0, 100)}`));
      if (j && j.url && /m3u8|hls/i.test(j.url + tech)) await qcPlaylist(j.url, L);
    } catch (e) { L(`  ${dt}/${tech}: failed ${e}`); }
  }
}
async function qcCatalogTest(path, L){
  const N = nativePlayer();
  if (!N || !N.touGet) { L('Needs the updated Android app.'); return; }
  const [show, ep] = path.toLowerCase().split('/'), ids = new Set();
  L(`TOU.TV CATALOG (signed in) · ${show}/${ep}`);
  for (const u of [`show/${show}/${ep}`, `show/${show}/${ep.replace(/e\d+$/, '')}`, `show/${show}`]) {
    try {
      const r = await N.touGet({url:`https://services.radio-canada.ca/ott/catalog/v2/toutv/${u}?device=web&tier=Member`});
      const body = String(r.body || ''); let j = null, perr = ''; try { j = JSON.parse(body); } catch (e) { perr = String(e.message).slice(0, 90); }
      L(`  ${u}: status ${r.status} · ${body.length} chars · ${j ? 'json' : 'not json: ' + perr}`);
      if (!j) { L('    starts: ' + body.slice(0, 260).replace(/\s+/g, ' ')); L('    ends: ' + body.slice(-120).replace(/\s+/g, ' ')); }
      const keys = new Map(); for (const m of body.matchAll(/"([A-Za-z]*(?:[Mm]edia|[Pp]layback|[Pp]lay)[A-Za-z]*)"\s*:\s*("[^"]{0,50}"|\d+)/g)) if (!keys.has(m[1]) && keys.size < 14) keys.set(m[1], m[2]);
      L('    media-like keys: ' + ([...keys].map(([k, v]) => k + '=' + v).join(' · ') || 'none'));
      if (j) qcOutline(j, L, 45);
      for (const m of body.matchAll(/"(?:idMedia|mediaId|formattedIdMedia|playbackId)"\s*:\s*"?(\d{5,})/g)) ids.add(m[1]);
    } catch (e) { L(`  ${u}: failed ${e}`); }
  }
  L('', 'media ids found: ' + ([...ids].slice(0, 6).join(', ') || 'none'));
  if (ids.size) { L(''); await qcSigned([...ids][0], L); }
}
async function qcProbe(input, out){
  const L = (...t) => out.push(...t), url = String(input).trim();
  if (/^[a-z0-9-]+\/s\d+e\d+$/i.test(url)) { await qcCatalogTest(url, L); L('', 'Done.'); return; }
  if (/^\d{5,9}$/.test(url)) { await qcSigned(url, L); L('', 'Done.'); return; }
  if (!/^https:\/\//.test(url)) { L('Paste a full https:// address of a show or episode page, or a media number for the signed-in test.'); return; }
  L(`Streamlet ${APP_BUILD} · ${nativePlayer() ? 'native' : 'browser (blocked by CORS probably)'} · ${new Date().toISOString()}`, '');
  L('PAGE ' + qcHost(url));
  let page = '';
  try {
    const r = await qcGet(url, {Accept:'text/html,application/xhtml+xml'}); page = r.body || '';
    L(`  status ${r.status} · ${page.length} chars · final host ${qcHost(r.url || url)}`);
    const has = re => (page.match(re) || []).length;
    L(`  next-data:${has(/__NEXT_DATA__/g)} · brightcove:${has(/brightcove/gi)} · m3u8:${has(/\.m3u8/g)} · drm/widevine:${has(/widevine|drm\b/gi)} · protectionType:${has(/protectionType/g)} · login words:${has(/connexion|se connecter|log ?in/gi)}`);
  } catch (e) { L('  failed: ' + e); }
  // what the page's own data says about videos (key names and ids only, no personal data)
  const nd = (page.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  const ids = new Set(), hits = [];
  if (nd) {
    try {
      const walk = (o, path, d) => {
        if (!o || d > 14 || hits.length > 40) return;
        if (Array.isArray(o)) { o.slice(0, 3).forEach((x, i) => walk(x, path + '[' + i + ']', d + 1)); return; }
        if (typeof o === 'object') for (const [k, v] of Object.entries(o)) {
          if (/brightcove|videoId|mediaId|playback|drm|entitle|premium|auth|subscri|geo|stream|source/i.test(k) && (typeof v !== 'object' || v === null)) hits.push(`${path}.${k} = ${String(v).slice(0, 60)}`);
          if (/^(brightcoveId|videoId|mediaId|referenceId)$/i.test(k) && v) ids.add(String(v));
          walk(v, path + '.' + k, d + 1);
        }
      };
      walk(JSON.parse(nd), '', 0);
    } catch (e) { L('  next-data parse failed: ' + e); }
    try {                                                                  // shape of the data: key names and list sizes only
      const outline = [], sh = (o, path, d) => {
        if (!o || typeof o !== 'object' || d > 8 || outline.length > 140) return;
        if (Array.isArray(o)) { outline.push(`${path} [${o.length}]`); if (o[0]) sh(o[0], path + '[0]', d + 1); if (o.length > 1 && o[o.length - 1] && typeof o[o.length - 1] === 'object') sh(o[o.length - 1], path + '[last]', d + 1); return; }
        for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') sh(v, path + '.' + k, d + 1); else if (/id|slug|url|href|season|episode|media|title|name/i.test(k)) outline.push(`${path}.${k} = ${String(v).slice(0, 48)}`); }
      };
      sh(JSON.parse(nd), '', 0); L('', 'PAGE SHAPE'); for (const t of outline.slice(0, 140)) L('  ' + t.replace(/^\.props\.pageProps/, '~'));
    } catch {}
    L('', 'PAGE DATA (' + nd.length + ' chars) · candidate video ids: ' + ([...ids].slice(0, 8).join(', ') || 'none'));
    for (const t of hits.slice(0, 30)) L('  ' + t);
  }
  const allIds = [...new Set([...(page.match(/\b\d{13}\b/g) || [])])].slice(0, 6);
  L('  13-digit numbers on page: ' + (allIds.join(', ') || 'none'));
  // TVA+ / QUB content API: the same data the site itself loads for a show, season or episode
  if (/tvaplus\.ca|qub\.ca/.test(url) && nd) {
    let ent = null; try { ent = JSON.parse(nd).props.pageProps.staticEntity; } catch {}
    const eid = ent && ent.id;
    L('', 'CONTENT API · entity ' + (eid || 'not found'));
    if (eid) for (const host of ['www.tvaplus.ca', 'www.qub.ca']) {
      try {
        const r = await qcGet(`https://${host}/proxy/pfu/content-delivery-service/v1/entities?id=${eid}`);
        let j = null; try { j = JSON.parse(r.body); } catch {}
        L(`  ${host}: status ${r.status} · ${(r.body || '').length} chars · ${j ? 'json' : String(r.body).slice(0, 80)}`);
        if (j) { qcOutline(j, L, 90); break; }
      } catch (e) { L(`  ${host}: failed ${e}`); }
    }
  }
  // Brightcove (TVA+)
  const acct = (page.match(/players\.brightcove\.net\/(\d{6,})\//) || page.match(/"accountId"\s*:\s*"?(\d{6,})/) || [])[1] || (/tvaplus\.ca|qub\.ca/.test(url) ? '5481942443001' : '');
  const vid0 = (page.match(/"videoId"\s*:\s*"?(\d{10,})/) || page.match(/data-video-id="(\d{10,})"/) || page.match(/videoId=(\d{10,})/) || [])[1] || (url.match(/(\d{12,})\/?$/) || [])[1];
  L('', 'BRIGHTCOVE ' + (acct ? `account ${acct}` : 'not found') + (vid0 ? ` · first video ${vid0}` : ' · no video id in the page'));
  const accts = [...new Set([acct, ...allIds.filter(x => /^(5481942443001|5813221784001)$/.test(x) || (page.match(new RegExp('brightcove[^\\n]{0,80}' + x)) || []).length)])].filter(Boolean).slice(0, 3);
  const vids = [...new Set([vid0, ...ids, ...allIds].filter(x => x && !accts.includes(x)))].slice(0, 4);
  for (const ac of accts) for (const vd of vids) {
    L(`  trying account ${ac} · video ${vd}`);
    try {
      const js = (await qcGet(`https://players.brightcove.net/${ac}/default_default/index.min.js`)).body || '';
      const pk = (js.match(/policyKey\s*:\s*"(BC[^"]+)"/) || [])[1];
      if (!pk) { L('    no policy key'); continue; }
      const r = await qcGet(`https://edge.api.brightcove.com/playback/v1/accounts/${ac}/videos/${vd}`, {Accept:'application/json;pk=' + pk});
      let j = null; try { j = JSON.parse(r.body); } catch {}
      if (Array.isArray(j)) { L(`    status ${r.status} · ${j[0] && (j[0].error_subcode || j[0].message)}`); continue; }
      const src = (j && j.sources) || [];
      L(`    status ${r.status} · ${j && j.name || '?'} · ${Math.round(((j && j.duration) || 0) / 60000)} min · ${src.length} sources`);
      for (const x of src.slice(0, 8)) L(`     - ${x.type || x.container || '?'} · ${qcHost(x.src || '')} · ${x.key_systems ? 'DRM: ' + Object.keys(x.key_systems).join(',') : 'no DRM'}`);
      const hls = src.find(x => /mpegurl/i.test(x.type || '') && x.src && !x.key_systems);
      if (hls) await qcPlaylist(hls.src, L);
    } catch (e) { L('    failed: ' + e); }
  }
  // Radio-Canada
  if (/tou\.tv|radio-canada/.test(url)) {
    const cand = new Set();
    for (const re of [/"idMedia"\s*:\s*"?(\d{5,})/g, /idMedia=(\d{5,})/g, /"mediaId"\s*:\s*"?(\d{5,})/gi, /data-media-?id="(\d{5,})"/gi, /media-(\d{5,})/g, /"idMedia\\?":\\?"?(\d{5,})/g]) for (const m of page.matchAll(re)) cand.add(m[1]);
    for (const m of url.matchAll(/(?:media-|episodes?\/|\/)(\d{5,})/g)) cand.add(m[1]);
    L('', 'RADIO-CANADA candidate media ids: ' + ([...cand].slice(0, 6).join(', ') || 'none'));
    let shown = 0;
    for (const id of [...cand].slice(0, 5)) for (const app of ['toutv', 'medianet']) {
      try {
        const r = await qcGet(`https://services.radio-canada.ca/media/validation/v2/?appCode=${app}&deviceType=ipad&connectionType=wifi&idMedia=${id}&output=json`);
        let j = null; try { j = JSON.parse(r.body); } catch {}
        const prot = j ? (j.protectionType || ((j.params || []).find(p => /protect|drm/i.test(p.name)) || {}).value || '-') : '-';
        L(`  ${id} ${app}: status ${r.status}` + (j ? ` · errorCode ${j.errorCode ?? '-'} · ${String(j.message || '').slice(0, 80)} · url ${j.url ? qcHost(j.url) : 'none'} · protection ${prot}` : ` · ${String(r.body).slice(0, 80)}`));
        if (j && j.url && shown < 2) { shown++; await qcPlaylist(j.url, L); }
      } catch (e) { L(`  ${id} ${app}: failed ${e}`); }
    }
  }
  // Tou.tv catalog service: ask for the episode itself (guessing the endpoint names used by Radio-Canada's apps)
  const tt = url.match(/tou\.tv\/([a-z0-9-]+)\/(s\d+e\d+)/i);
  if (tt) {
    const [, show, ep] = tt, id = `${show}/${show}/${ep}`.toLowerCase();
    L('', `TOU.TV CATALOG · ${show} ${ep}`);
    const found = new Set();
    for (const u of [
      `https://services.radio-canada.ca/ott/catalog/v2/toutv/content/${show}/${show}/${ep}?device=web&version=4`,
      `https://services.radio-canada.ca/ott/catalog/v2/toutv/content/${show}/${ep}?device=web&version=4`,
      `https://services.radio-canada.ca/ott/catalog/v2/toutv/show/${show}?device=web&version=4`,
      `https://services.radio-canada.ca/ott/catalog/v2/toutv/episode/${show}/${ep}?device=web&version=4`,
      `https://services.radio-canada.ca/ott/toutv-api/v2/assets/${show}/${ep}`,
      `https://services.radio-canada.ca/ott/tou-tv-api/v2/assets/${show}/${ep}`,
      `https://services.radio-canada.ca/ott/catalog/v2/toutv/assets/${show}/${ep}`,
      `https://ici.tou.tv/_next/data/${(page.match(/"buildId":"([^"]+)"/) || [])[1] || 'x'}/${show}/${ep}.json`]) {
      try {
        const r = await qcGet(u), body = String(r.body || '');
        let j = null; try { j = JSON.parse(body); } catch {}
        L(`  ${u.replace('https://', '').slice(0, 96)} → ${r.status} ${j ? 'json ' + body.length : body.slice(0, 70).replace(/\s+/g, ' ')}`);
        if (j && r.status === 200) {
          qcOutline(j, L, 40);
          for (const m of body.matchAll(/"(?:idMedia|mediaId|formattedIdMedia)"\s*:\s*"?(\d{5,})/g)) found.add(m[1]);
          const ps = body.match(/"playSession"\s*:\s*\{[^}]*\}/); if (ps) L('  playSession: ' + ps[0].replace(/https?:\/\/[^"]+/g, u2 => qcHost(u2)).slice(0, 160));
        }
      } catch (e) { L('  failed ' + u.slice(8, 60) + ': ' + e); }
    }
    for (const id2 of [...found].slice(0, 4)) {
      try {
        const r = await qcGet(`https://services.radio-canada.ca/media/validation/v2/?appCode=toutv&deviceType=ipad&connectionType=wifi&idMedia=${id2}&output=json`);
        let j = null; try { j = JSON.parse(r.body); } catch {}
        L(`  media ${id2}: errorCode ${j && j.errorCode} · ${String(j && j.message || '').slice(0, 80)} · url ${j && j.url ? qcHost(j.url) : 'none'}`);
        if (j && j.url) await qcPlaylist(j.url, L);
      } catch (e) { L('  media failed: ' + e); }
    }
  }
  // How does Tou.tv sign people in? Look for the login addresses and client ids in the page and its scripts (names only; nothing is sent)
  if (/tou\.tv/.test(url) && page) {
    L('', 'TOU.TV LOGIN DISCOVERY');
    const srcs = [...new Set([...page.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(m => m[1]))].map(x => x.startsWith('http') ? x : 'https://ici.tou.tv' + x);
    L('  scripts on page: ' + srcs.length);
    const hits = new Set(), scan = (txt, where) => {
      for (const m of txt.matchAll(/https?:\/\/[a-z0-9.-]*(?:login|auth|oauth|b2c|identity|account|signin|sso)[a-z0-9.\/_?=&%-]{0,120}/gi)) hits.add(m[0].slice(0, 150));
      for (const m of txt.matchAll(/(?:client_?id|clientId|policy|authority|tenant|redirect_?uri|redirectUri|scope)["']?\s*[:=]\s*["']([^"']{6,140})["']/gi)) hits.add(m[0].slice(0, 170));
    };
    scan(page, 'page');
    for (const u of srcs.slice(0, 14)) { try { const r = await qcGet(u); if (r.status === 200) scan(String(r.body), u); } catch {} }
    const list = [...hits].filter(x => !/googletagmanager|google-analytics|facebook|doubleclick|schema\.org|w3\.org/i.test(x)).slice(0, 45);
    L(list.length ? list.map(x => '  ' + x).join('\n') : '  nothing found');
  }
  L('', 'Done. Nothing was saved and no password was used.');
}
$('#qcRun').onclick = async () => {
  const box = $('#qcOut'), out = []; box.value = 'Testing…'; $('#qcRun').disabled = true;
  try { await qcProbe($('#qcUrl').value, out); } catch (e) { out.push('Crashed: ' + e); }
  box.value = out.join('\n'); $('#qcRun').disabled = false;
};
$('#qcCopy').onclick = async () => { const b = $('#qcOut'); try { await navigator.clipboard.writeText(b.value); toast('Copied'); } catch { b.select(); try { document.execCommand('copy'); toast('Copied'); } catch {} } };
