/* ---------- spaces (front menu) ---------- */
const THEMES = {
  ember: {n:'Ember',  acc:'#ff6b3d', bg:'#110c0a', panel:'#211714', panel2:'#2c1f1a'},   /* Streamlet's own colours: the launcher and new spaces */
  /* originals (kept so older saved spaces still work) */
  violet:{n:'Violet', acc:'#7c5cff', bg:'#0e0f13', panel:'#181a21', panel2:'#20232c'},
  sakura:{n:'Sakura', acc:'#ff5c93', bg:'#150d12', panel:'#22141c', panel2:'#2e1b26'},
  sky:   {n:'Sky',    acc:'#25b9ff', bg:'#0a1420', panel:'#112236', panel2:'#183049'},
  sun:   {n:'Sunny',  acc:'#ffb020', bg:'#14110a', panel:'#221c10', panel2:'#30271a'},
  gold:  {n:'Cinema', acc:'#e8b84a', bg:'#0b0b0b', panel:'#171717', panel2:'#242424'},
  mint:  {n:'Mint',   acc:'#2fd18b', bg:'#0a1411', panel:'#12201b', panel2:'#1a2e27'},
  /* streaming-style looks (original palettes, no logos) */
  googletv:{n:'Smart TV', acc:'#8ab4f8', bg:'#171a1f', panel:'#252a31', panel2:'#323943',
    font:"'Google Sans','Product Sans',Roboto,system-ui,sans-serif", r:'12px', rb:'24px', hw:'500', btnt:'#062e6f', tabs:true, allhist:true},
  netflix:{n:'Red Carpet', acc:'#e50914', bg:'#141414', panel:'#1f1f1f', panel2:'#2b2b2b',
    font:"'Helvetica Neue',Helvetica,Arial,Roboto,sans-serif", r:'4px', rb:'4px', hw:'700'},
  disney:{n:'Deep Blue', acc:'#3b8bff', bg:'#040714', panel:'#12183a', panel2:'#1c2556',
    font:"'Avenir Next',Avenir,Roboto,system-ui,sans-serif", r:'10px', rb:'8px', hw:'700', pb:'2px solid rgba(249,249,249,.16)'},
  anime: {n:'Orange Pop', acc:'#f47521', bg:'#121316', panel:'#1f2127', panel2:'#2c2f38',
    font:"Lato,Roboto,system-ui,sans-serif", r:'6px', rb:'5px', hw:'800', btnt:'#111'},
  marvel:{n:'Hero Red', acc:'#ec1d24', bg:'#0b0b0d', panel:'#17171a', panel2:'#26262b',
    font:"sans-serif-condensed,'Roboto Condensed','Arial Narrow',Impact,sans-serif", r:'0px', rb:'0px', hw:'800', up:true, ls:'.09em',
    clip:'polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)'}
};
Object.entries({ember:'#ffb547', violet:'#ff5cc8', sakura:'#ffb36b', sky:'#7c5cff', sun:'#ff5c5c', gold:'#b06b2a', mint:'#25b9ff', googletv:'#c58af9', netflix:'#8a1c24', disney:'#8b5cff', anime:'#ff4f7a', marvel:'#f7b500'})
  .forEach(([k, v]) => { if (THEMES[k]) THEMES[k].acc2 = v; });
const THEME_DEFAULTS = {font:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif", r:'10px', rb:'10px', up:false, ls:'0', hw:'650', clip:'none', pb:'none', btnt:'#fff'};
function applyTheme(key){
  const th = THEMES[key] || THEMES.ember;
  const t = {...THEME_DEFAULTS, ...th, font:THEME_DEFAULTS.font, r:THEME_DEFAULTS.r, rb:THEME_DEFAULTS.rb, hw:THEME_DEFAULTS.hw, up:false, ls:'0', clip:'none', pb:'none'}, r = document.documentElement.style;   // spaces differ by colors only
  const set = (k,v) => r.setProperty(k,v);
  set('--acc',t.acc); set('--acc2',t.acc2 || t.acc); set('--bg',t.bg); set('--panel-s',t.panel);
  set('--panel','color-mix(in srgb,' + t.panel + ' 62%,transparent)'); set('--panel2','color-mix(in srgb,' + t.panel2 + ' 72%,transparent)');
  set('--font',t.font); set('--r',t.r); set('--rb',t.rb); set('--tt',t.up?'uppercase':'none'); set('--ls',t.ls); set('--hw',t.hw);
  set('--clip',t.clip); set('--pb',t.pb); set('--btn',t.btn||t.acc); set('--btnt',t.btnt);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t.bg;
}
const DEFAULT_SPACES = [
  {id:'aio',     name:'AIO',     emoji:'🌐', theme:'googletv', catalogs:[]},
  {id:'netflix', name:'Netflix', emoji:'🍿', theme:'netflix',  catalogs:[]},
  {id:'disney',  name:'Disney',  emoji:'🏰', theme:'disney',   catalogs:[]},
  {id:'anime',   name:'Anime',   emoji:'🍥', theme:'anime',    catalogs:[]},
  {id:'marvel',  name:'Marvel',  emoji:'🦸', theme:'marvel',   catalogs:[]}
];
let spaces = null;
try { spaces = JSON.parse(localStorage.getItem('streamlet.spaces2') || 'null'); } catch {}
if (!Array.isArray(spaces) || !spaces.length) spaces = JSON.parse(JSON.stringify(DEFAULT_SPACES));
const isKid = () => !!(profile && profile.kids);
const spacesFor = () => isKid() ? spaces.filter(s => s.kids) : spaces;      // what this profile may open
const saveSpaces = () => { try { localStorage.setItem('streamlet.spaces2', JSON.stringify(spaces)); } catch {} stamp('spacesT'); };
let cur = null; // the space you're currently in
const spaceAddons = () => (cur && cur.catalogs.length) ? addons.filter(a => cur.catalogs.includes(a.uid)) : addons;
const streamPool = () => (cur && cur.streams && cur.streams.length) ? addons.filter(a => cur.streams.includes(a.uid)) : addons;

function enterSpace(id){
  cur = spaces.find(s => s.id===id); if (!cur) return;
  spEdit = false;
  rememberSpace(cur.id); applyTheme(spaceTheme(cur)); $('#q').value = ''; view = {tab:'home', genre:''}; showTab('home');
  try { notifySoon(); } catch {}
}
let spEdit = false;
const PENCIL_SVG = () => { const d = document.createElement('span'); d.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 0l0 0a2 2 0 0 1 0 3L8 19z"/><path d="M14 7l3 3"/></svg>'; return d.firstChild; };
function showLauncher(){
  cur = null; applyTheme(spaceTheme(null));
  document.body.classList.add('launch'); document.body.style.overflow = '';
  $('#detail').hidden = true; $('#player').hidden = true; $('#spaceEd').hidden = true;
  $('#profiles').hidden = true; $('#login').hidden = true; const L = $('#launcher'); L.hidden = false;
  const editBtn = h('button', {class:'chip' + (spEdit ? ' on' : ''), type:'button'}, spEdit ? 'Done' : 'Edit spaces');
  editBtn.onclick = () => { spEdit = !spEdit; editBtn.textContent = spEdit ? 'Done' : 'Edit spaces'; editBtn.classList.toggle('on', spEdit); L.classList.toggle('editing', spEdit); };
  const tile = sp => {
    const t = THEMES[sp.theme] || THEMES.ember;
    const nInst = sp.catalogs.filter(id => addons.find(x => x.uid === id)).length;
    const names = sp.catalogs.length ? (nInst ? nInst + (nInst === 1 ? ' addon' : ' addons') : '') : 'All addons';
    const btn = h('button', {class:'stile', type:'button', style:`--c1:${t.acc};--c2:${t.acc2 || t.acc}`, onclick:() => { if (spEdit) editSpace(sp.id); else openSpace(sp.id); }},
      h('span', {class:'sem'}, sp.emoji), h('span', {class:'stx'}, h('span', {class:'snm'}, sp.name), h('span', {class:'sds'}, names || 'Selected addon not installed')));
    attachLong(btn, () => { if (!isKid()) editSpace(sp.id); });
    return h('div', {class:'swrap'}, btn, h('span', {class:'sedit', 'aria-hidden':'true'}, PENCIL_SVG()));
  };
  L.replaceChildren(
    h('div', {class:'lhead'}, h('h1', null, 'Stream', h('span', {style:'color:var(--acc)'}, 'let')),
      h('button', {class:'spaceBtn', type:'button', onclick:() => showProfiles()}, profile ? [avatarEl(profile, 22), ' ' + profile.name] : 'Profile', h('i', null, '⇄'))),
    h('div', {class:'lmid'},
      h('h2', {class:'ltitle' + (addons.length ? '' : ' noadd')}, addons.length ? 'What are we watching?' : 'Add an addon first'),
      addons.length ? null : h('p', {class:'lsub'}, 'Open Addons, install one, then pick a space.'),
      h('div', {class:'sgrid'}, ...spacesFor().filter(sp => !sp.hidden || spEdit).map(tile),
        h('div', {class:'swrap newwrap'}, h('button', {class:'stile new', type:'button', onclick:() => editSpace(null)}, h('span', {class:'sem'}, '＋'), h('span', {class:'stx'}, h('span', {class:'snm'}, 'New space')))))),
    h('div', {class:'lfoot'},
      h('button', {class:'chip', type:'button', onclick:() => { document.body.classList.remove('launch'); $('#launcher').hidden = true; $('#profiles').hidden = true; $('#login').hidden = true; showTab('addons'); }}, 'Addons'),
      editBtn));
  L.classList.toggle('editing', spEdit);
  window.scrollTo(0,0);
  pushPage();
}
function editSpace(id){
  const isNew = !id;
  const s = isNew ? {id:'s'+Date.now().toString(36), name:'', emoji:'📺', theme:'ember', catalogs:[]} : JSON.parse(JSON.stringify(spaces.find(x=>x.id===id)));
  const ed = $('#spaceEd'); ed.hidden = false; ed.scrollTop = 0; applyTheme(s.theme); pushLayer('editor');
  const close = () => popLayer('editor');
  const name = h('input', {class:'f', placeholder:'Name (e.g. Anime)', style:'flex:1'}); name.value = s.name;
  const emoji = h('input', {class:'f', maxlength:'4', style:'width:70px;text-align:center;font-size:22px'}); emoji.value = s.emoji;
  const sw = h('div', {class:'swatches'});
  const tabsCb = h('input', {type:'checkbox'}); tabsCb.checked = !!(s.tabs ?? (THEMES[s.theme] || {}).tabs);
  tabsCb.onchange = () => { s.tabs = tabsCb.checked; };
  const kidsCb = h('input', {type:'checkbox'}); kidsCb.checked = !!s.kids; kidsCb.onchange = () => { s.kids = kidsCb.checked; };
  const paintSw = () => { sw.replaceChildren(...Object.entries(THEMES).map(([k,t]) =>
    h('button', {type:'button', class:'sw'+(s.theme===k?' on':''), title:t.n, style:`background:${t.acc}`, onclick:()=>{ s.theme=k; applyTheme(k); if (s.tabs === undefined) tabsCb.checked = !!THEMES[k].tabs; paintSw(); }}))); };
  paintSw();
  const withCats = addons.filter(a => (a.manifest.catalogs||[]).length);
  const withStreams = addons.filter(a => hasRes(a, 'stream'));
  const sboxes = withStreams.map(a => { const cb = h('input', {type:'checkbox'}); cb.checked = (s.streams || []).includes(a.uid); return {a, cb}; });
  const boxes = withCats.map(a => { const cb = h('input', {type:'checkbox'}); cb.checked = s.catalogs.includes(a.uid); return {a, cb}; });
  const del = h('button', {class:'btn ghost', type:'button'}, 'Delete space');
  let armed = false;
  del.onclick = () => {
    if (spaces.length < 2) { toast('Keep at least one space.'); return; }
    if (!armed) { armed = true; del.textContent = 'Tap again to delete'; return; }
    spaces = spaces.filter(x => x.id !== s.id); saveSpaces(); launcherDirty = true; close();
  };
  const prev = h('div', {class:'swrap sprev'});
  const paintPrev = () => {
    const t = THEMES[s.theme] || THEMES.ember;
    prev.replaceChildren(h('div', {class:'stile', style:`--c1:${t.acc};--c2:${t.acc2 || t.acc}`},
      h('span', {class:'sem'}, emoji.value.trim() || '📺'), h('span', {class:'stx'}, h('span', {class:'snm'}, name.value.trim() || 'New space'), h('span', {class:'sds'}, 'Preview'))));
  };
  const SP_EMOJI = ['🌐','🍿','🏰','🍥','🦸','🎬','📺','🎮','⚽','👶','🎵','🔥','🌙','⭐','🚀','🐉','🎭','🧠','🍜','🌍'];
  if (emoji.value && !SP_EMOJI.includes(emoji.value)) SP_EMOJI.unshift(emoji.value);
  const eg = h('div', {class:'egrid'});
  const paintEg = () => eg.replaceChildren(...SP_EMOJI.map(e => h('button', {type:'button', class:'eb' + (emoji.value === e ? ' on' : ''), onclick:() => { emoji.value = e; paintEg(); paintPrev(); }}, e)));
  const NAMES = ['AIO', 'Movies', 'Shows', 'Anime', 'Kids', 'Netflix', 'Disney', 'Marvel'];
  const quick = h('div', {class:'srow nm-row'}, NAMES.map(n => h('button', {type:'button', class:'chip', onclick:() => { name.value = n; paintPrev(); }}, n)));
  name.addEventListener('input', paintPrev); name.style.width = '100%';
  const swDraw = () => sw.replaceChildren(...Object.entries(THEMES).map(([k, t]) =>
    h('button', {type:'button', class:'sw' + (s.theme === k ? ' on' : ''), title:t.n, 'aria-label':t.n, style:`background:linear-gradient(135deg,${t.acc},${t.acc2 || t.acc})`, onclick:() => { s.theme = k; applyTheme(k); if (s.tabs === undefined) tabsCb.checked = !!THEMES[k].tabs; swDraw(); paintPrev(); }})));
  swDraw(); paintEg(); paintPrev();
  const tgl = (cb, title, sub) => h('label', {class:'tgl'}, h('span', null, h('b', null, title), sub ? h('small', null, sub) : null), cb);
  const langRow = (title, key, first) => { const sel = h('select', {class:'sel'}, h('option', {value:''}, 'Same as Settings'), h('option', {value:first[0]}, first[1]), ...LANGS.map(l => h('option', {value:l.c[0]}, l.n))); sel.value = s[key] || ''; sel.onchange = () => { s[key] = sel.value; }; return h('label', {class:'tgl'}, h('span', null, h('b', null, title)), sel); };
  ed.replaceChildren(
    h('div', {class:'bar', style:'padding-left:0;padding-right:0'}, h('button', {class:'btn ghost sm', onclick:close}, '← Cancel')),
    h('div', {class:'sedwrap'},
      h('h2', {class:'sedh'}, isNew ? 'New space' : 'Edit space'),
      h('div', {class:'sedgrid'},
        h('div', {class:'sedcol'}, prev, h('div', {class:'lbl'}, 'Name'), name, quick, h('div', {class:'lbl'}, 'Icon'), eg),
        h('div', {class:'sedcol'},
          h('div', {class:'lbl'}, 'Theme'), sw,
          h('div', {class:'lbl'}, 'Options'), tgl(tabsCb, 'Browse tabs', 'Home, Movies, Shows and genre tiles'), tgl(kidsCb, 'For kids', 'Kids profiles can open this space'),
          h('div', {class:'lbl'}, 'Language in this space'), langRow('Audio', 'audio', ['any', 'Any']), langRow('Subtitles', 'subs', ['off', 'Off']), h('p', {class:'spin hint2'}, 'For example anime: Japanese audio with English subtitles.'),
          h('div', {class:'lbl'}, 'Catalog addons'),
          withCats.length ? h('div', null, boxes.map(({a, cb}) => tgl(cb, an(a)))) : h('p', {class:'spin', style:'padding:0'}, 'No catalog addons installed yet.'),
          h('p', {class:'spin hint2'}, 'Leave all off to use every installed addon.'),
          withStreams.length > 1 ? h('div', null, h('div', {class:'lbl'}, 'Stream addons'),
            h('div', null, sboxes.map(({a, cb}) => tgl(cb, an(a)))),
            h('p', {class:'spin hint2'}, 'Only these are asked for streams in this space. Leave all off to use all of them.')) : null)),
      h('div', {class:'sedact'},
        h('button', {class:'btn', type:'button', onclick:() => {
          if (!name.value.trim()) { toast('Give it a name.'); return; }
          s.name = name.value.trim(); s.emoji = emoji.value.trim() || '📺';
          s.catalogs = boxes.filter(x => x.cb.checked).map(x => x.a.uid);
          s.streams = sboxes.filter(x => x.cb.checked).map(x => x.a.uid);
          const i = spaces.findIndex(x => x.id === s.id); if (i >= 0) spaces[i] = s; else spaces.push(s);
          saveSpaces(); launcherDirty = true; close();
        }}, 'Save'),
        isNew ? null : del)));
}



