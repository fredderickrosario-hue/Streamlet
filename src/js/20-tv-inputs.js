/*@tv*/
/* ---------- TV: a text box only opens the keyboard when you press OK on it, not when the focus merely passes over it ---------- */
(function(){
  const TEXT = /^(text|search|url|email|password|number|tel)?$/i;
  const lockable = el => el && ((el.tagName === 'INPUT' && TEXT.test(el.getAttribute('type') || '')) || el.tagName === 'TEXTAREA');
  const lock = el => { if (!lockable(el) || el._tvArmed) return; el.readOnly = true; el.setAttribute('inputmode', 'none'); el._tvLocked = true; };
  const arm = el => {
    if (!el || !el._tvLocked || el._tvArmed) return;
    el._tvArmed = true; el.readOnly = false; el.setAttribute('inputmode', el._tvMode || 'text');
    el._tvKeep = true; el.blur(); el.focus(); el._tvKeep = false;                                                   // focus again, now editable: the keyboard opens
    try { const n = el.value.length; el.setSelectionRange(n, n); } catch {}
  };
  const scan = root => { if (!root.querySelectorAll) return; if (lockable(root)) { root._tvMode = root._tvMode || root.getAttribute('inputmode'); lock(root); } root.querySelectorAll('input,textarea').forEach(el => { el._tvMode = el._tvMode || el.getAttribute('inputmode'); lock(el); }); };
  const start = () => {
    if (!document.body.classList.contains('tv')) return;
    scan(document.body);
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }); }).observe(document.body, {childList:true, subtree:true});
    document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('input,textarea'); if (el) arm(el); }, true);
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.keyCode === 23) && document.activeElement && document.activeElement._tvLocked && !document.activeElement._tvArmed) { e.preventDefault(); arm(document.activeElement); } }, true);
    document.addEventListener('focusout', e => { const el = e.target; if (el && el._tvArmed && !el._tvKeep) { el._tvArmed = false; el.readOnly = true; el.setAttribute('inputmode', 'none'); } }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
/*@end*/
