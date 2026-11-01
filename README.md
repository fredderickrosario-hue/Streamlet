# Streamlet

Addon-powered media app (PWA) with themed "spaces". Streamlet ships with no content: you install addons by URL (Stremio-style manifests), assign catalog addons to each space, and stream addons are shared across all spaces.

- Open `index.html` via GitHub Pages and install it to your home screen.
- `sample-addon/` is a tiny static addon you can host yourself; `node gen-sample-addon.js` regenerates it.
- Torrent-only streams (`infoHash`) need a debrid-enabled addon or a backend; browsers can't play them directly.

## Two apps (TV and phone)

`index.html` is the shared source. Run `node build.js` after changing it: it writes `tv/index.html` and `phone/index.html` (what the two Android apps load from GitHub Pages) and the plain `index.html` still works as the web app. The workflow builds two APKs: `apk-latest` (TV, `Streamlet.apk`) and `apk-latest-phone` (`Streamlet-phone.apk`).

## Sign in with your phone (TV)

The TV shows a QR code that opens `pair.html` on the phone. The phone signs in (Google or email) and passes the login to the TV through a short-lived, encrypted Firestore document (`pairings/{id}`); the key is only in the QR code. It needs these Firestore rules added once in the Firebase console (keep your existing `users` rules):

```
match /pairings/{pid} {
  allow get, create, update, delete: if true;
  allow list: if false;
}
```
