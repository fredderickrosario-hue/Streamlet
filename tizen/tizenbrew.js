// TizenBrew module script: injected into the Streamlet TV site. Streamlet already handles the Samsung remote (Back = 10009, media keys),
// so this only marks the page as running inside TizenBrew.
try { document.documentElement.classList.add('tizenbrew'); window.__tizenbrew = true; } catch (e) {}
