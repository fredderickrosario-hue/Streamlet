// Renders the boot sound (synthesized in index.html, nothing sampled) into boot.mp3 so the TV just plays a file.
//   node build.js && python3 -m http.server 8125 &   then   node tools/make-boot-sound.js   (needs playwright + ffmpeg)
const {chromium} = require('playwright'); const fs = require('fs'); const {execSync} = require('child_process');
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto('http://localhost:8125/tv/index.html'); await p.waitForTimeout(600);
  const b64 = await p.evaluate(async () => {
    const sr = 44100; window.__sfxCtx = new OfflineAudioContext(2, sr * 8.2, sr); sfx.bootFull();
    const buf = await window.__sfxCtx.startRendering(), ch = buf.getChannelData(0), n = ch.length, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    const ws = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
    let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s);
  });
  fs.writeFileSync('/tmp/boot.wav', Buffer.from(b64, 'base64'));
  execSync('ffmpeg -y -loglevel error -i /tmp/boot.wav -af "afade=t=out:st=7.4:d=0.8" -ac 2 -b:a 160k boot.mp3');
  await b.close(); console.log('boot.mp3 written');
})();
