/* ---------- diagnostics: remembers app errors so a problem on the TV can be read later (Settings > Diagnostics) ---------- */
(() => {
  const add = (kind, msg) => {
    try {
      const a = JSON.parse(localStorage.getItem('streamlet.syslog') || '[]');
      if (a[0] && a[0].m === msg) { a[0].n = (a[0].n || 1) + 1; a[0].t = Date.now(); }
      else a.unshift({t:Date.now(), k:kind, m:String(msg).slice(0, 300)});
      localStorage.setItem('streamlet.syslog', JSON.stringify(a.slice(0, 60)));
    } catch {}
  };
  addEventListener('error', e => { if (e.message) add('JS', `${e.message} @ ${String(e.filename || '').split('/').pop()}:${e.lineno}`); });
  addEventListener('unhandledrejection', e => add('PROMISE', (e.reason && (e.reason.stack || e.reason.message)) || e.reason));
  window.sysLog = add;
})();
