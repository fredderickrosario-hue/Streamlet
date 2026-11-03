/* ---------- Québec test: what do TVA+ and ICI Tou.tv give back for a show? (read-only, no login, nothing is stored) ---------- */
async function qcGet(url, headers){
  const N = nativePlayer();
  if (N && N.httpGet) { const r = await N.httpGet({url, headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', 'Accept-Language':'fr-CA,fr;q=0.9', ...(headers || {})}}); return r; }
  const r = await fetch(url, {headers}); return {status:r.status, body:await r.text(), url:r.url};
}
const qcHost = u => { try { return new URL(u).host; } catch { return '?'; } };
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
  // Brightcove (TVA+)
  const acct = (page.match(/players\.brightcove\.net\/(\d{6,})\//) || page.match(/"accountId"\s*:\s*"?(\d{6,})/) || [])[1] || (/tvaplus\.ca|qub\.ca/.test(url) ? '5481942443001' : '');
  const vid = (page.match(/"videoId"\s*:\s*"?(\d{10,})/) || page.match(/data-video-id="(\d{10,})"/) || page.match(/videoId=(\d{10,})/) || [])[1] || (url.match(/(\d{12,})\/?$/) || [])[1];
  L('', 'BRIGHTCOVE ' + (acct ? `account ${acct}` : 'not found') + (vid ? ` · video ${vid}` : ' · no video id in the page'));
  if (acct && vid) {
    try {
      const js = (await qcGet(`https://players.brightcove.net/${acct}/default_default/index.min.js`)).body || '';
      const pk = (js.match(/policyKey\s*:\s*"(BC[^"]+)"/) || [])[1];
      L('  policy key: ' + (pk ? 'found' : 'not found'));
      if (pk) {
        const r = await qcGet(`https://edge.api.brightcove.com/playback/v1/accounts/${acct}/videos/${vid}`, {Accept:'application/json;pk=' + pk});
        L(`  playback api: status ${r.status}`);
        let j = null; try { j = JSON.parse(r.body); } catch {}
        if (Array.isArray(j)) L('  error: ' + (j[0] && (j[0].error_subcode || j[0].message) || r.body.slice(0, 120)));
        else if (j) {
          const src = j.sources || [];
          L(`  title: ${j.name || '?'} · duration ${Math.round((j.duration || 0) / 60000)} min · ${src.length} sources`);
          for (const s of src.slice(0, 8)) L(`   - ${s.type || s.container || '?'} · ${qcHost(s.src || '')} · ${s.key_systems ? 'DRM: ' + Object.keys(s.key_systems).join(',') : 'no DRM'}`);
        }
      }
    } catch (e) { L('  failed: ' + e); }
  }
  // Radio-Canada
  if (/tou\.tv|radio-canada/.test(url)) {
    const id = (page.match(/"idMedia"\s*:\s*"?(\d{5,})/) || page.match(/idMedia=(\d{5,})/) || page.match(/media-(\d{5,})/) || url.match(/media-(\d{5,})/) || [])[1];
    L('', 'RADIO-CANADA ' + (id ? 'media ' + id : 'no media id found in the page'));
    if (id) for (const app of ['toutv', 'medianet']) {
      try {
        const r = await qcGet(`https://services.radio-canada.ca/media/validation/v2/?appCode=${app}&deviceType=ipad&connectionType=wifi&idMedia=${id}&output=json`);
        let j = null; try { j = JSON.parse(r.body); } catch {}
        const prot = j ? (j.protectionType || ((j.params || []).find(p => /protect|drm/i.test(p.name)) || {}).value || '-') : '-';
        L(`  ${app}: status ${r.status}` + (j ? ` · errorCode ${j.errorCode ?? '-'} · ${String(j.message || '').slice(0, 90)} · url ${j.url ? qcHost(j.url) : 'none'} · protection ${prot}` : ` · ${String(r.body).slice(0, 100)}`));
      } catch (e) { L(`  ${app}: failed ${e}`); }
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
