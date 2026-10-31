# Streamlet

Addon-powered media app (PWA) with themed "spaces". Streamlet ships with no content: you install addons by URL (Stremio-style manifests), assign catalog addons to each space, and stream addons are shared across all spaces.

- Open `index.html` via GitHub Pages and install it to your home screen.
- `sample-addon/` is a tiny static addon you can host yourself; `node gen-sample-addon.js` regenerates it.
- Torrent-only streams (`infoHash`) need a debrid-enabled addon or a backend; browsers can't play them directly.
