# Streamlet for Android / Android TV

A thin Android shell around the Streamlet web app:

* the app loads **https://fredderickrosario-hue.github.io/Streamlet/** (live mode), so every web change you push
  shows up on the next launch, with no new APK needed;
* playback is handed to a native **ExoPlayer (Media3)** screen: MKV/HEVC/AV1, AC3/EAC3, multiple audio tracks,
  embedded and external subtitles, remote-control friendly;
* it shows up in the **Android TV / Google TV launcher** (banner + Leanback) as well as on phones.

## Getting the APK
GitHub Actions builds it on every push that touches `android-app/` (Actions tab → "Build Android APK" → Run workflow
to build on demand). The finished file is published at

    https://github.com/fredderickrosario-hue/Streamlet/releases/download/apk-latest/Streamlet.apk

Sideload: on the TV install **Downloader**, enter that URL, and install. On a phone just open the link.

## Notes
* Signing: by default each build generates a one-off key, so installing a *new* APK over an old one needs an uninstall first
  (rarely needed: web changes go live without a new APK). To keep one key forever, create a keystore (alias `streamlet`,
  store/key password `streamlet`), base64 it and save it as the repository secret `ANDROID_KEYSTORE_B64`.
* Google sign-in does not work inside Android WebViews; use email + password in the app.
* Native code lives in `android/app/src/main/java/app/streamlet/tv/` (`ExoPlayerPlugin`, `PlayerActivity`).
