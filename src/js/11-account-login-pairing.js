/* ---------- accounts + cloud sync (Firebase Auth + Firestore) ---------- */
const FB_CONFIG = {
  apiKey: "AIzaSyB1Ail6UMc7ou1S67kIJl7OPOEzzm_gyZM",
  authDomain: "streamlet-9439d.firebaseapp.com",
  projectId: "streamlet-9439d",
  storageBucket: "streamlet-9439d.firebasestorage.app",
  messagingSenderId: "838065755328",
  appId: "1:838065755328:web:ffd0becf3ab0314bb04925"
};
const FB_VER = '10.14.1';
let syncErr = '';
let FB = null, auth = null, db = null, user = null, syncState = 'local', lastSync = 0, syncT = null, firstAuth = true, listening = false, booted = false;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const ek = k => encodeURIComponent(k).replace(/\./g, '%2E');
const clean = o => JSON.parse(JSON.stringify(o));
const metaGet = () => lsGet('streamlet.meta', {});
function stamp(k){ const m = metaGet(); m[k] = Date.now(); lsSet('streamlet.meta', m); scheduleSync(); }
function noteErr(e){ syncErr = (e && (e.code || e.message)) || 'unknown error'; syncState = 'error'; fillAccountUI(); }
/* Cloud pushes: a normal change goes out after 1.5 s; playback progress (every few seconds while watching) waits up to a minute,
   and anything waiting goes out at once when the app is hidden or closed. Only documents that really changed are written. */
let syncSoft = false, syncTsoft = false, pushing = false, pushAgain = false;
const pushSig = {};
function scheduleSync(){
  if (!user || !db) return;
  const soft = syncSoft;
  if (syncT && (soft || !syncTsoft)) return;                     // already queued, and that push will carry this change too
  clearTimeout(syncT); syncTsoft = soft; syncState = 'syncing';
  syncT = setTimeout(runPush, soft ? 60000 : 1500);
}
function runPush(){
  syncT = null;
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  pushAll().catch(noteErr).finally(() => { pushing = false; if (pushAgain) { pushAgain = false; runPush(); } });
}
function flushSync(){ if (syncT) { clearTimeout(syncT); runPush(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSync(); });
addEventListener('pagehide', flushSync);

async function loadFirebase(){
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [app, au, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  return {app, au, fs};
}

async function applyRemoteAddons(list){
  const items = list.map(x => typeof x === 'string' ? {url:x} : x);
  const have = Object.fromEntries(addons.map(a => [a.url, a])), out = [];
  await Promise.all(items.map(async (it, i) => {
    const old = have[it.url], meta = {label: it.label || undefined};
    if (it.uid) meta.uid = it.uid;
    if (old && !old.pending) { out[i] = {...old, ...meta}; return; }
    const {url, base} = parseAddonUrl(it.url);
    try {
      const manifest = await getJSON(url);
      if (!manifest || !manifest.id || !Array.isArray(manifest.resources)) throw new Error('bad manifest');
      manifest.types = manifest.types || []; out[i] = {url, base, manifest, ...meta};
    } catch {
      out[i] = old ? {...old, ...meta} : {url, base, pending:true, ...meta, manifest:{id:'pending:' + it.url, name:it.url.replace(/^https?:\/\//, '').replace(/\/manifest\.json.*$/, ''), description:"Couldn't load this addon yet (offline?). It will retry on the next sync.", resources:[], types:[], catalogs:[]}};
    }
  }));
  addons = out.filter(Boolean); ensureUids();
  try { localStorage.setItem('streamlet.addons', JSON.stringify(addons)); } catch {}
}
async function mergeFamily(R){
  const m = metaGet(); let changed = false; R = R || {};
  if (R.profiles && (R.profilesT || 0) > (m.profilesT || 0)) { profiles = R.profiles; lsSet('streamlet.profiles', profiles); m.profilesT = R.profilesT; changed = true; if (profile) profile = profiles.find(x => x.id === profile.id) || profile; }
  if (R.spaces && (R.spacesT || 0) > (m.spacesT || 0)) { spaces = R.spaces; lsSet('streamlet.spaces2', spaces); m.spacesT = R.spacesT; changed = true; if (cur) cur = spaces.find(x => x.id === cur.id) || cur; }
  if (R.addons) {
    const rT = R.addonsT || 0, lT = m.addonsT || 0;
    if (rT > lT || lT === 0) {
      const rUrls = R.addons.map(x => typeof x === 'string' ? x : x.url);
      const localOnly = lT === 0 ? addons.filter(a => !rUrls.includes(a.url)).map(a => ({url:a.url, uid:a.uid, label:a.label})) : [];
      const sig = () => JSON.stringify(addons.map(a => [a.url, a.uid, a.label || '']));
      const before = sig();
      await applyRemoteAddons([...R.addons, ...localOnly]);
      m.addonsT = localOnly.length ? Date.now() : rT;
      if (sig() !== before) changed = true;
    }
  } else if (addons.length && !m.addonsT) m.addonsT = Date.now();
  if (R.repos && (R.reposT || 0) > (m.reposT || 0)) { lsSet('streamlet.repos', R.repos); m.reposT = R.reposT; }
  if (!m.tmdbT && lsGet('streamlet.tmdb', '')) m.tmdbT = 1;                      // a key entered before this synced: push it unless the account already has a newer one
  if (typeof R.tmdb === 'string' && (R.tmdbT || 0) > (m.tmdbT || 0)) { lsSet('streamlet.tmdb', R.tmdb); m.tmdbT = R.tmdbT; try { fillTmdb(); } catch {} }
  lsSet('streamlet.meta', m);
  return changed;
}
function mergeColl(id, key, remKey, rEntries, rRemoved, cap, kf = 'itemId'){
  const rem = {...plsGet(id, remKey, {})};
  for (const [k, t] of Object.entries(rRemoved || {})) { const kk = decodeURIComponent(k); if ((rem[kk] || 0) < t) rem[kk] = t; }
  const map = {}, local = plsGet(id, key, []);
  for (const e of local) map[e[kf]] = e;
  for (const e of Object.values(rEntries || {})) if (e && e[kf] && (!map[e[kf]] || (map[e[kf]].t || 0) < (e.t || 0))) map[e[kf]] = e;
  let out = Object.values(map).filter(e => (e.t || 0) > (rem[e[kf]] || 0)).sort((a, b) => b.t - a.t);
  if (cap) out = out.slice(0, cap);
  plsSet(id, remKey, rem);
  if (JSON.stringify(out) !== JSON.stringify(local)) { plsSet(id, key, out); return true; }
  return false;
}
function packColl(id, key, remKey, deleteField, kf = 'itemId'){
  const list = plsGet(id, key, []), rem = plsGet(id, remKey, {}), entries = {}, remP = {};
  for (const e of list) entries[ek(e[kf])] = e;
  for (const [k, t] of Object.entries(rem)) { remP[ek(k)] = t; if (!entries[ek(k)]) entries[ek(k)] = deleteField(); }
  const out = {}; for (const [k, v] of Object.entries(entries)) out[k] = (v && v._methodName) ? v : clean(v);
  return {entries:out, rem:clean(remP), any:list.length > 0 || Object.keys(rem).length > 0};
}
/* The two big lists (every episode, every watched title) live in their own documents, in chunks: one profile document holding thousands of entries
   goes over Firestore's limit (too many indexed fields) and then nothing in that profile syncs at all. */
const BLOBS = [['eps', 'epRemoved', 'k'], ['watched', 'wdRemoved', 'itemId']], blobLast = {}, blobN = {};
async function pushBlobs(pid){
  const {doc, setDoc, deleteDoc} = FB.fs, base = ['users', user.uid, 'sync'];
  for (const [key, remKey] of BLOBS) {
    const list = plsGet(pid, key, []), rem = plsGet(pid, remKey, {}), tag = pid + '|' + key;
    if (!list.length && !Object.keys(rem).length && !blobN[tag]) continue;
    const str = JSON.stringify({l:list, r:Object.fromEntries(Object.entries(rem).map(([k, t]) => [ek(k), t]))});
    if (blobLast[tag] === str) continue;
    const parts = []; for (let i = 0; i < str.length; i += 200000) parts.push(str.slice(i, i + 200000));
    for (let i = 0; i < parts.length; i++) await setDoc(doc(db, ...base, `b__${pid}__${key}__${i}`), {pid, key, i, n:parts.length, s:parts[i], t:Date.now()});
    for (let i = parts.length; i < (blobN[tag] || 0); i++) deleteDoc(doc(db, ...base, `b__${pid}__${key}__${i}`)).catch(() => {});
    blobLast[tag] = str; blobN[tag] = parts.length;
  }
}
function mergeBlobs(docs){
  const groups = {}; let changed = false;
  for (const d of docs) { const x = d.data && d.data(); if (!x || !x.pid || typeof x.s !== 'string') continue; const g = groups[x.pid + '|' + x.key] || (groups[x.pid + '|' + x.key] = {pid:x.pid, key:x.key, n:x.n, p:[]}); g.p[x.i] = x.s; }
  for (const g of Object.values(groups)) {
    const spec = BLOBS.find(b => b[0] === g.key); if (!spec) continue;
    let whole = true; for (let i = 0; i < g.n; i++) if (typeof g.p[i] !== 'string') whole = false;
    if (!whole) continue;                                          // wait until every piece has arrived
    try { const o = JSON.parse(g.p.join('')); if (mergeColl(g.pid, spec[0], spec[1], o.l, o.r, 3000, spec[2])) { changed = true; if (g.key === 'eps') epReset(); } } catch {}
  }
  return changed;
}
function mergeProfile(id, R){
  let changed = false;
  const lT = plsGet(id, 'settingsT', 0), rT = R.settingsT || 0;
  if (R.settings && rT > lT) {
    plsSet(id, 'settings', R.settings); plsSet(id, 'settingsT', rT); changed = true;
    if (profile && profile.id === id) { settings = {subLang:'off', audioLang:'any', ...R.settings}; fillSettingsUI(); }
  }
  const removed = {...plsGet(id, 'removed', {})};
  for (const [k, t] of Object.entries(R.removed || {})) { const kk = decodeURIComponent(k); if ((removed[kk] || 0) < t) removed[kk] = t; }
  const map = {}, local = plsGet(id, 'history', []);
  for (const e of local) map[e.itemId] = e;
  for (const e of Object.values(R.entries || {})) if (e && e.itemId && (!map[e.itemId] || (map[e.itemId].t || 0) < (e.t || 0))) map[e.itemId] = e;
  const out = Object.values(map).filter(e => (e.t || 0) > (removed[e.itemId] || 0)).sort((a, b) => b.t - a.t).slice(0, 60);
  if (JSON.stringify(out) !== JSON.stringify(local)) { plsSet(id, 'history', out); changed = true; }
  plsSet(id, 'removed', removed);
  const wrem = {...plsGet(id, 'wlRemoved', {})};
  for (const [k, t] of Object.entries(R.wremoved || {})) { const kk = decodeURIComponent(k); if ((wrem[kk] || 0) < t) wrem[kk] = t; }
  const wmap = {}, wlocal = plsGet(id, 'watchlist', []);
  for (const e of wlocal) wmap[e.itemId] = e;
  for (const e of Object.values(R.watch || {})) if (e && e.itemId && (!wmap[e.itemId] || (wmap[e.itemId].t || 0) < (e.t || 0))) wmap[e.itemId] = e;
  const wout = Object.values(wmap).filter(e => (e.t || 0) > (wrem[e.itemId] || 0)).sort((a, b) => b.t - a.t);
  if (JSON.stringify(wout) !== JSON.stringify(wlocal)) { plsSet(id, 'watchlist', wout); changed = true; }
  plsSet(id, 'wlRemoved', wrem);
  { const sl = {...plsGet(id, 'shows', {})}, srem = {...plsGet(id, 'showsRemoved', {})}; let ch = false;
    for (const [k, t] of Object.entries(R.showsremoved || {})) { const kk = decodeURIComponent(k); if ((srem[kk] || 0) < t) srem[kk] = t; }
    plsSet(id, 'showsRemoved', srem);
    for (const k of Object.keys(sl)) if ((srem[k] || 0) >= (sl[k].t || 0)) { delete sl[k]; ch = true; }                         // the shows you follow (name, picture, space) travel with the account, so every device knows them
    for (const [k, v] of Object.entries(R.shows || {})) { const kk = decodeURIComponent(k); if (v && v.n && (srem[kk] || 0) < (v.t || 0) && (!sl[kk] || (sl[kk].t || 0) < (v.t || 0))) { sl[kk] = v; ch = true; } }
    if (ch) { plsSet(id, 'shows', Object.fromEntries(Object.entries(sl).sort((x, y) => (y[1].t || 0) - (x[1].t || 0)).slice(0, 200))); changed = true; epReset(); } }
  if (mergeColl(id, 'likes', 'likeRemoved', R.likes, R.likeremoved, 1000)) changed = true;
  if (mergeColl(id, 'watched', 'wdRemoved', R.wd, R.wdremoved, 3000)) changed = true;
  if (showsBackfill(id)) changed = true;
  if (mergeColl(id, 'eps', 'epRemoved', R.eps, R.epremoved, 3000, 'k')) { changed = true; epReset(); }
  return changed;
}
async function pushAll(){
  if (!user || !db) return;
  const {doc, setDoc, deleteField} = FB.fs, m = metaGet(), base = ['users', user.uid], fam = {}; let blobErr = null;
  if (m.profilesT) { fam.profiles = profiles; fam.profilesT = m.profilesT; }
  if (m.spacesT) { fam.spaces = spaces; fam.spacesT = m.spacesT; }
  if (m.addonsT) { fam.addons = addons.map(a => ({url:a.url, uid:a.uid, label:a.label || null})); fam.addonsT = m.addonsT; }
  if (m.reposT) { fam.repos = reposGet(); fam.reposT = m.reposT; }
  if (m.tmdbT) { fam.tmdb = lsGet('streamlet.tmdb', '') || ''; fam.tmdbT = m.tmdbT; }
  if (Object.keys(fam).length) { const sig = JSON.stringify(fam); if (sig !== pushSig.fam) { await setDoc(doc(db, ...base, 'sync', 'family'), clean(fam), {merge:true}); pushSig.fam = sig; } }
  for (const p of profiles) {
    const hist = plsGet(p.id, 'history', []), removed = plsGet(p.id, 'removed', {}), sT = plsGet(p.id, 'settingsT', 0);
    const wl = plsGet(p.id, 'watchlist', []), wlrem = plsGet(p.id, 'wlRemoved', {});
    const wdp = {any: plsGet(p.id, 'watched', []).length > 0 || Object.keys(plsGet(p.id, 'wdRemoved', {})).length > 0}, epp = {any: plsGet(p.id, 'eps', []).length > 0 || Object.keys(plsGet(p.id, 'epRemoved', {})).length > 0}, lkp = packColl(p.id, 'likes', 'likeRemoved', deleteField), shp = plsGet(p.id, 'shows', {});
    if (!hist.length && !Object.keys(removed).length && !sT && !wl.length && !Object.keys(wlrem).length && !wdp.any && !epp.any && !lkp.any && !Object.keys(shp).length) continue;
    const entries = {}, rem = {};
    for (const e of hist) entries[ek(e.itemId)] = e;
    for (const [k, t] of Object.entries(removed)) { rem[ek(k)] = t; if (!entries[ek(k)]) entries[ek(k)] = deleteField(); }
    const payload = clean({entries:{}, removed:rem});
    for (const [k, v] of Object.entries(entries)) payload.entries[k] = (v && v._methodName) ? v : clean(v);
    const wentries = {}, wremP = {};
    for (const e of wl) wentries[ek(e.itemId)] = e;
    for (const [k, t] of Object.entries(wlrem)) { wremP[ek(k)] = t; if (!wentries[ek(k)]) wentries[ek(k)] = deleteField(); }
    payload.watch = {}; payload.wremoved = clean(wremP);
    for (const [k, v] of Object.entries(wentries)) payload.watch[k] = (v && v._methodName) ? v : clean(v);
    payload.shows = Object.fromEntries(Object.entries(shp).map(([k, v]) => [ek(k), clean(v)])); payload.showsremoved = Object.fromEntries(Object.entries(plsGet(p.id, 'showsRemoved', {})).map(([k, t]) => [ek(k), t])); payload.likes = lkp.entries; payload.likeremoved = lkp.rem; payload.eps = deleteField(); payload.epremoved = deleteField(); payload.wd = deleteField(); payload.wdremoved = deleteField();   // moved to their own documents (pushBlobs)
    if (sT) { payload.settings = plsGet(p.id, 'settings', {}); payload.settingsT = sT; }
    const sig = JSON.stringify(payload);
    if (sig !== pushSig[p.id]) { await setDoc(doc(db, ...base, 'profiles', p.id), payload, {merge:true}); pushSig[p.id] = sig; }
    try { await pushBlobs(p.id); } catch (e) { blobErr = blobErr || e; }
  }
  if (blobErr) throw blobErr;                                      // shown in Settings → Account as the sync error
  syncState = 'synced'; lastSync = Date.now(); fillAccountUI();
}
async function cloudDeleteProfile(id){
  if (!user || !db) return;
  try { await FB.fs.deleteDoc(FB.fs.doc(db, 'users', user.uid, 'profiles', id)); } catch {}
}
async function initialSync(){
  const {doc, getDoc, getDocs, collection} = FB.fs, base = ['users', user.uid];
  const fam = await getDoc(doc(db, ...base, 'sync', 'family'));
  await mergeFamily(fam.exists() ? fam.data() : null);
  if (addons.some(a => a.pending)) await applyRemoteAddons(addons.map(a => a.url));
  const ps = await getDocs(collection(db, ...base, 'profiles'));
  ps.forEach(d => mergeProfile(d.id, d.data()));
  try { const bs = await getDocs(collection(db, ...base, 'sync')), arr = []; bs.forEach(d => { if (d.id.startsWith('b__')) arr.push(d); }); mergeBlobs(arr); } catch {}
  await pushAll();
}
function refreshUI(){
  if (!booted || !$('#player').hidden) return;
  navSuppress = true;
  try {
    if (!$('#profiles').hidden) renderProfiles();
    else if (!$('#launcher').hidden) showLauncher();
    else if (!$('#home').hidden) renderCW();
    else if (!$('#addons').hidden) renderAddons();
    else if (!$('#watch').hidden) renderWatch();
    else if (!$('#settings').hidden) renderSettings();
    else if (!$('#me').hidden) renderMe();
  } finally { navSuppress = false; }
}
function startListeners(){
  if (listening || !db || !user) return; listening = true;
  const {doc, collection, onSnapshot} = FB.fs, base = ['users', user.uid];
  onSnapshot(doc(db, ...base, 'sync', 'family'), async snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    if (await mergeFamily(snap.data())) refreshUI();
  });
  onSnapshot(collection(db, ...base, 'sync'), snap => {
    if (snap.metadata.hasPendingWrites) return;
    if (mergeBlobs(snap.docs.filter(d => d.id.startsWith('b__')))) refreshUI();
  });
  onSnapshot(collection(db, ...base, 'profiles'), snap => {
    if (snap.metadata.hasPendingWrites) return;
    let ch = false; snap.docChanges().forEach(c => { if (c.type !== 'removed' && mergeProfile(c.doc.id, c.doc.data())) ch = true; });
    if (ch) refreshUI();
  });
}

/* ----- login screen ----- */
const AUTH_ERRORS = {
  'auth/invalid-credential':'Wrong email or password.', 'auth/wrong-password':'Wrong email or password.', 'auth/user-not-found':'No account with that email. Tap "Create account".',
  'auth/email-already-in-use':'That email already has an account. Tap "Sign in".', 'auth/weak-password':'Password needs at least 6 characters.', 'auth/invalid-email':"That email doesn't look right.",
  'auth/popup-closed-by-user':'Sign-in was cancelled.', 'auth/popup-blocked':'Your browser blocked the Google popup. Use email instead, or allow popups.',
  'auth/unauthorized-domain':"This site isn't authorised in Firebase yet (Authentication → Settings → Authorized domains).",
  'auth/operation-not-allowed':"That sign-in method isn't enabled in Firebase yet.", 'auth/network-request-failed':"Can't reach the server. Check your connection.", 'auth/too-many-requests':'Too many tries. Wait a minute.'
};
const authMsg = e => AUTH_ERRORS[e && e.code] || ('Sign-in failed' + (e && e.code ? ' (' + e.code + ')' : '') + '.');
function showLoginSplash(text){
  document.body.classList.add('launch'); $('#login').hidden = false;
  $('#login').replaceChildren(h('h1', null, 'Stream', h('span', {style:'color:var(--acc)'}, 'let')), h('p', {class:'sub'}, text));
}
/*@tv*/
/* ---------- sign in with your phone: the TV shows a QR code, the phone signs in and hands the login over (encrypted with a key that only lives in the code) ---------- */
var qrcode=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=b(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=M(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=b(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1})},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(o*r,n*r,r,r)},f};t.stringToBytes=(t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}}).default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),b=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},M=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();qrcode.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)},function(t){"function"==typeof define&&define.amd?define([],t):"object"==typeof exports&&(module.exports=t())}(function(){return qrcode});
async function showPairing(){
  if (!FB || !db) { toast('Not connected yet. Try again in a moment.'); return; }
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  const b64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const pid = b64(rnd(16)), kraw = rnd(16);
  const url = new URL((FLAVOR === 'auto' ? '' : '../') + 'pair.html', location.href).href + '#' + pid + '.' + b64(kraw);
  const L = $('#login'), ref = FB.fs.doc(db, 'pairings', pid);
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  const box = h('div', {class:'qrbox'}); box.innerHTML = qr.createSvgTag({cellSize:6, margin:0, scalable:true});
  const status = h('p', {class:'sub', style:'margin:14px 0 0'}, 'Waiting for your phone…');
  let dead = false;
  const stop = () => { dead = true; FB.fs.deleteDoc(ref).catch(() => {}); };
  L.hidden = false; L.style.maxWidth = '860px';
  L.replaceChildren(
    h('h1', null, 'Sign in with your phone'),
    h('div', {class:'pairrow'},
      box,
      h('div', {class:'pairtxt'},
        h('p', null, h('b', null, '1.'), " Scan the code with your phone's camera."),
        h('p', null, h('b', null, '2.'), ' Sign in with Google or email on your phone.'),
        h('p', null, h('b', null, '3.'), ' This screen continues by itself.'),
        status)),
    h('div', {class:'lrow', style:'justify-content:center;margin-top:18px'}, h('button', {class:'btn ghost', type:'button', style:'width:260px', onclick:() => { stop(); showLogin(); }}, 'Cancel')));
  const first = L.querySelector('button'); if (first) first.focus({preventScroll:true});
  try { await FB.fs.setDoc(ref, {t:Date.now()}); } catch (e) { status.textContent = "Couldn't start: " + (e.code || e.message) + '. The sign-in rules may not be set up yet.'; return; }
  const t0 = Date.now();
  while (!dead && Date.now() - t0 < 10 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 2000));
    if (dead || L.hidden || !L.querySelector('.qrbox')) { stop(); return; }
    let d; try { d = await FB.fs.getDoc(ref); } catch { continue; }
    const v = d.exists() ? d.data() : null;
    if (!v || !v.ct) continue;
    try {
      const k = await crypto.subtle.importKey('raw', kraw, 'AES-GCM', false, ['decrypt']);
      const p = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(v.iv)}, k, unb64(v.ct))));
      status.textContent = 'Signing in…';
      dead = true; FB.fs.deleteDoc(ref).catch(() => {});
      if (p.g) await FB.au.signInWithCredential(auth, FB.au.GoogleAuthProvider.credential(p.id, p.at));
      else await FB.au.signInWithEmailAndPassword(auth, p.e, p.p);
      return;
    } catch (e) { dead = true; status.textContent = "That didn't work (" + (e.code || e.message) + '). Cancel and try again.'; return; }
  }
  if (!dead) { stop(); status.textContent = 'The code expired. Cancel and try again.'; }
}
/*@end*/
function showLogin(){
  applyTheme('violet'); cur = null; document.body.classList.add('launch'); document.body.style.overflow = '';
  $('#launcher').hidden = true; $('#profiles').hidden = true; $('#detail').hidden = true; $('#player').hidden = true;
  const L = $('#login'); L.hidden = false; L.style.maxWidth = '';
  const email = h('input', {class:'f', type:'email', placeholder:'Email', autocomplete:'email', inputmode:'email', autocapitalize:'off'});
  const pass = h('input', {class:'f', type:'password', placeholder:'Password', autocomplete:'current-password'});
  const msg = h('div', {class:'msg err', style:'min-height:22px;margin:8px 0 0'});
  const busy = async fn => { msg.className = 'msg'; msg.textContent = 'One moment…'; try { await fn(); } catch (e) { msg.className = 'msg err'; msg.textContent = authMsg(e); } };
  const need = () => { if (!email.value.trim() || !pass.value) throw Object.assign(new Error('x'), {code:'auth/invalid-credential'}); };
  L.replaceChildren(
    h('h1', null, 'Stream', h('span', {style:'color:var(--acc)'}, 'let')),
    h('p', {class:'sub'}, 'Sign in to sync your profiles, addons and progress on every device.'),
    ...(typeof showPairing === 'function' ? [h('button', {class:'btn', type:'button', style:'width:100%;margin-bottom:14px', onclick:() => showPairing()}, 'Sign in with your phone'), h('div', {class:'or'}, 'or')] : []),
    ...(nativePlayer()
      ? [h('p', {class:'sub', style:'font-size:13px;margin:-8px 0 14px'}, "Google sign-in isn't available inside the app. Tap \"Forgot password?\" with your Google email once to set a password, then sign in below. It's the same account and data.")]
      : [h('button', {class:'gbtn', type:'button', onclick:() => busy(() => FB.au.signInWithPopup(auth, new FB.au.GoogleAuthProvider()))},
          h('b', {style:'color:#4285f4;font-size:18px'}, 'G'), 'Continue with Google'),
         h('div', {class:'or'}, 'or use email')]),
    email, pass,
    h('div', {class:'lrow'},
      h('button', {class:'btn', type:'button', onclick:() => busy(() => { need(); return FB.au.signInWithEmailAndPassword(auth, email.value.trim(), pass.value); })}, 'Sign in'),
      h('button', {class:'btn ghost', type:'button', onclick:() => busy(() => { need(); return FB.au.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value); })}, 'Create account')),
    msg,
    h('div', {class:'lnks', style:'justify-content:center'},
      h('button', {class:'lnk', type:'button', onclick:() => busy(async () => {
        if (!email.value.trim()) throw Object.assign(new Error('x'), {code:'auth/invalid-email'});
        await FB.au.sendPasswordResetEmail(auth, email.value.trim()); msg.className = 'msg ok'; msg.textContent = 'Password reset email sent.';
      })}, 'Forgot password?'),
      h('button', {class:'lnk', type:'button', onclick:() => { try { localStorage.setItem('streamlet.skipLogin', '1'); } catch {} replaceNext = true; initProfiles(); bootApp(); }}, 'Continue without an account')));
  window.scrollTo(0,0); pushPage();
}

/* ----- account card (Addons tab) ----- */
function fillAccountUI(){
  const c = $('#acctCard'); if (!c) return;
  const status = {local:'Not synced', syncing:'Syncing…', synced:'Synced' + (lastSync ? ' · ' + new Date(lastSync).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''), error:'Sync problem: ' + syncErr + (/permission|denied/i.test(syncErr) ? ' (publish the Firestore rules in the Firebase console)' : '')}[syncState] || '';
  if (!FB) { c.replaceChildren(h('p', {style:'margin:0'}, "Cloud sync isn't available right now (offline?). The app still works on this device.")); return; }
  if (!user) {
    c.replaceChildren(h('p', {style:'margin:0 0 10px'}, 'Not signed in. Your data only lives on this device.'),
      h('button', {class:'btn sm', type:'button', onclick:() => showLogin()}, 'Sign in to sync'));
    return;
  }
  let armed = false;
  const out = h('button', {class:'btn ghost sm', type:'button'}, 'Sign out');
  out.onclick = async () => {
    if (!armed) { armed = true; out.textContent = 'Tap again (clears this device)'; return; }
    try { await FB.au.signOut(auth); } catch {}
    try { Object.keys(localStorage).filter(k => k.startsWith('streamlet.')).forEach(k => localStorage.removeItem(k)); } catch {}
    location.reload();
  };
  c.replaceChildren(h('div', {style:'font-weight:650'}, user.email || user.displayName || 'Signed in'), h('p', {style:'margin:2px 0 4px'}, status),
    h('p', {style:'margin:0 0 10px;font-size:13px'}, addons.length + ' addon' + (addons.length === 1 ? '' : 's') + ' on this device' + (addons.some(a => a.pending) ? ' · some could not load yet' : '')),
    h('div', {style:'display:flex;gap:8px;flex-wrap:wrap'},
      h('button', {class:'btn ghost sm', type:'button', onclick:async () => { syncState = 'syncing'; fillAccountUI(); try { await initialSync(); syncErr = ''; refreshUI(); } catch (e) { noteErr(e); } }}, 'Sync now'), out));
}

/* ----- startup ----- */
function bootApp(){
  booted = true;
  const lastP = profiles.find(x => x.id === lsGet('streamlet.profile.last', null)) || profiles[0];
  const upd = Date.now() - (lsGet('streamlet.upd', 0) || 0) < 20 * 60 * 1000;     // restarted while installing an update: skip the profile picker, land on Settings
  if (upd) { lsSet('streamlet.upd', 0); selectProfile(lastP).then(() => { try { showTab('settings'); } catch {} }); return; }
  if (profiles.length > 1 && localStorage.getItem('streamlet.profile.ask') !== '0') showProfiles(); else selectProfile(lastP);
}
let earlyBoot = false;
async function onUser(u){
  const first = firstAuth; firstAuth = false; user = u;
  if (u) lsSet('streamlet.wasUser', 1);
  if (u && first && earlyBoot) {                                  // the app is already open from this device's own data: sync quietly behind it
    earlyBoot = false; syncState = 'syncing';
    try { await withTimeout(initialSync(), 20000); syncErr = ''; } catch (e) { noteErr(e); }
    startListeners(); initProfiles(); refreshUI(); fillAccountUI();
    return;
  }
  if (u) {
    syncState = 'syncing';
    try { await withTimeout(initialSync(), 20000); syncErr = ''; } catch (e) { noteErr(e); }
    startListeners();
    if (first) { initProfiles(); bootApp(); }
    else { replaceNext = true; initProfiles(); bootApp(); }
  } else if (first) {
    if (earlyBoot) { earlyBoot = false; if (localStorage.getItem('streamlet.skipLogin') !== '1') showLogin(); }
    else if (localStorage.getItem('streamlet.skipLogin') === '1') bootApp(); else showLogin();
  } else { fillAccountUI(); }
}
async function startAuth(){
  // a device that has been signed in before opens straight from its own saved data; the sync happens behind the scenes
  if ((lsGet('streamlet.wasUser', 0) || localStorage.getItem('streamlet.skipLogin') === '1') && lsGet('streamlet.profile.last', null)) { earlyBoot = true; initProfiles(); bootApp(); }
  else showLoginSplash('Loading…');
  try { FB = await withTimeout(loadFirebase(), 8000); }
  catch { FB = null; syncState = 'local'; $('#login').hidden = true; if (!booted) bootApp(); return; }
  try {
    const app = FB.app.initializeApp(FB_CONFIG);
    auth = FB.au.getAuth(app);
    try { db = FB.fs.initializeFirestore(app, {localCache: FB.fs.persistentLocalCache()}); } catch { db = FB.fs.getFirestore(app); }
    FB.au.onAuthStateChanged(auth, onUser);
  } catch { FB = null; $('#login').hidden = true; if (!booted) bootApp(); }
}

