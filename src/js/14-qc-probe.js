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
async function qcProbe(input, out){
  const L = (...t) => out.push(...t), url = String(input).trim();
  if (!/^https:\/\//.test(url)) { L('Paste a full https:// address of a show or episode page.'); return; }
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
  L('', 'Done. Nothing was saved and no password was used.');
}
$('#qcRun').onclick = async () => {
  const box = $('#qcOut'), out = []; box.value = 'Testing…'; $('#qcRun').disabled = true;
  try { await qcProbe($('#qcUrl').value, out); } catch (e) { out.push('Crashed: ' + e); }
  box.value = out.join('\n'); $('#qcRun').disabled = false;
};
$('#qcCopy').onclick = async () => { const b = $('#qcOut'); try { await navigator.clipboard.writeText(b.value); toast('Copied'); } catch { b.select(); try { document.execCommand('copy'); toast('Copied'); } catch {} } };
