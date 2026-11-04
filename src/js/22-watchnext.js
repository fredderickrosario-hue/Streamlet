/* ---------- Continue watching on the TV home screen (Watch Next): a tile opens the title where it was left ---------- */
setInterval(() => {
  const r = window.__wnResume;
  if (!r || !profile || !cur) return;                                     // wait until a profile and space are open
  window.__wnResume = null;
  if (r.profile && r.profile !== profile.id) return;
  const e = histGet().find(x => x.itemId === r.item);
  if (e) openResume(e); else toast("That title is no longer in Continue watching");
}, 500);
