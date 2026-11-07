// Renders the boot animation frame by frame from the page's own intro code, and joins it with boot.mp3 into boot.mp4.
// The TV then just plays a video (hardware decoded): perfectly smooth picture and sound, however busy the page is while it loads.
//   node build.js && python3 -m http.server 8125 &   then   node tools/make-boot-video.js   (needs playwright + ffmpeg)
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const FPS = 60, MS = 5600, W = 1280, H = 720;
(async () => {
  fs.rmSync('/tmp/bootf', { recursive: true, force: true }); fs.mkdirSync('/tmp/bootf');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto('http://localhost:8125/tv/index.html?intro'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const v = document.querySelector('#ivid'); if (v) v.remove(); document.querySelector('#intro').classList.remove('vid'); });   // draw the live animation, not the previous video
  await p.addStyleTag({ content: '#intro{background:radial-gradient(circle closest-side at 50% 48%,#2c1712 0%,#0c0909 100%) !important;transition:none !important}' });
  const N = Math.round(MS / 1000 * FPS);
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => window.__introSet(t), i * 1000 / FPS);
    await p.screenshot({ path: `/tmp/bootf/f${String(i).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: W, height: H } });
  }
  await b.close();
  // picture (the last frame is held until the sound has faded out) + the sound, trimmed to the same length
  execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i /tmp/bootf/f%04d.png -i boot.mp3 -vf "tpad=stop_mode=clone:stop_duration=3,format=yuv420p" -c:v libx264 -preset slow -crf 19 -tune animation -profile:v main -level 4.0 -r ${FPS} -g 120 -c:a aac -b:a 160k -shortest -movflags +faststart boot.mp4`, { stdio: 'inherit' });
  console.log('boot.mp4', (fs.statSync('boot.mp4').size / 1024).toFixed(0) + ' KB');
})();
