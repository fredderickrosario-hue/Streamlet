/* ---------- quick space switcher: a pop-up over what you're watching (the ⇄ space button, the TV menu's Spaces).
   The full spaces page stays the front door and the place to manage spaces: "Manage spaces" at the bottom opens it. ---------- */
let spPop = null;
function spaceSwitch(){
  if (!cur || !profile) return showLauncher();
  if (spPop) return;
  const list = spacesFor().filter(sp => !spHidden(sp));
  const tile = sp => {
    const t = THEMES[sp.theme] || THEMES.ember, here = sp.id === cur.id;
    return h('button', {type:'button', class:'stile sptile' + (here ? ' here' : ''), style:`--c1:${t.acc};--c2:${t.acc2 || t.acc}`, 'aria-current':here ? 'true' : 'false',
      onclick:() => { if (here) spClose(); else { spClose(false, true); openSpace(sp.id); } }},
      h('span', {class:'sem'}, spIcon(sp)), h('span', {class:'stx'}, h('span', {class:'snm'}, sp.name), here ? h('span', {class:'sds'}, 'You are here') : null));
  };
  const W = h('div', {id:'spPop', class:'avpop sppop', role:'dialog', 'aria-modal':'true', 'aria-label':'Switch space'},
    h('div', {class:'avcard spcard'},
      h('div', {class:'avhead'}, h('h2', null, 'Switch space'), h('button', {class:'btn ghost sm', type:'button', onclick:() => spClose()}, 'Close')),
      h('div', {class:'spgrid'}, list.map(tile)),
      h('div', {class:'spfoot'}, h('button', {class:'chip', type:'button', onclick:() => { spClose(false, true); showLauncher(); }}, isKid() ? 'All spaces' : 'Manage spaces'))));
  document.body.append(W);
  spPop = {W, back:document.activeElement};
  try { pushLayer('spop'); } catch {}
  const f = W.querySelector('.sptile.here') || W.querySelector('.sptile'); if (f) f.focus({preventScroll:true});
}
function spClose(fromBack, leaving){                                    // leaving = going somewhere else: drop the layer without a history step,
  if (!spPop) return;                                                      // or the Back it takes would bring the old space's page back
  const p = spPop; spPop = null; p.W.remove();
  if (leaving) { try { const i = layersOpen.lastIndexOf('spop'); if (i >= 0) { layersOpen.splice(i, 1); focusStack.splice(i, 1); if (!layersOpen.length) document.body.classList.remove('inlayer'); history.replaceState({page:pageNow(), layers:[...layersOpen]}, ''); } } catch {} return; }
  if (!fromBack) { try { if (layersOpen[layersOpen.length - 1] === 'spop') popLayer('spop'); } catch {} }
  try { if (p.back && p.back.isConnected) p.back.focus({preventScroll:true}); } catch {}
}
LAYER_CLOSERS.spop = () => spClose(true);
