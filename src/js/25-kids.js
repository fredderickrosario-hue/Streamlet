/* ---------- Kids profiles: a Kids space with the built-in kids catalogs is made the first time one is opened ---------- */
async function kidsReady(){
  if (spaces.some(s => s.kids)) return;
  let a = addons.find(x => x.url === 'tmdb://kids/manifest.json');
  if (!a) { try { await installAddon('tmdb://kids'); } catch {} a = addons.find(x => x.url === 'tmdb://kids/manifest.json'); }
  spaces.push({id:'kids', name:'Kids', emoji:'🧸', theme:'sun', catalogs:a ? [a.uid] : [], kids:true, tabs:true});
  saveSpaces(); launcherDirty = true;
  if (!tmKey()) toast('The Kids space needs a TMDB key in Settings to show titles');
}
