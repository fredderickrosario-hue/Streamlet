// Builds every app picture from logo.svg: web icons, Android launcher icons (bigger logo), splash screens,
// the player's loading ring, and the TV / Fire TV banner (logo + name, like the end of the boot animation).
//   node tools/make-icons.js      (needs playwright, rsvg-convert, ImageMagick)
const fs = require('fs'), { execSync } = require('child_process'), { chromium } = require('playwright');
const RES = 'android-app/android/app/src/main/res';
const logo = fs.readFileSync('logo.svg', 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const BG1 = '#24150f', BG2 = '#0d0908';
const nest = (x, y, s) => `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="120 130 780 780">${logo}</svg>`;
const bgDefs = `<defs><linearGradient id="ibg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BG1}"/><stop offset="1" stop-color="${BG2}"/></linearGradient>
  <radialGradient id="iglw" cx="50%" cy="46%" r="50%"><stop offset="0" stop-color="#ff7a3d" stop-opacity=".22"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient></defs>`;
/* shape: 'round' (rounded square), 'circle', 'full' (edge to edge), 'none' (transparent); k: logo size as a share of the canvas */
function iconSvg(shape, k){
  const S = 1024, l = S * k, o = (S - l) / 2 + S * .012;                // the plug pulls the eye up-right: nudge the whole mark a hair down-right
  const bg = shape === 'round' ? `<rect width="1024" height="1024" rx="228" fill="url(#ibg)"/><rect width="1024" height="1024" rx="228" fill="url(#iglw)"/><rect x="3" y="3" width="1018" height="1018" rx="226" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="6"/>`
    : shape === 'circle' ? `<circle cx="512" cy="512" r="512" fill="url(#ibg)"/><circle cx="512" cy="512" r="512" fill="url(#iglw)"/>`
    : shape === 'full' ? `<rect width="1024" height="1024" fill="url(#ibg)"/><rect width="1024" height="1024" fill="url(#iglw)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${bgDefs}${bg}${nest(o - S * .012, o, l)}</svg>`;
}
const png = (svg, out, w, h = w) => { fs.writeFileSync('/tmp/_i.svg', svg); execSync(`rsvg-convert -w ${w} -h ${h} /tmp/_i.svg -o ${out}`); };
// web
fs.writeFileSync('icon.svg', iconSvg('round', .88));
png(iconSvg('round', .88), 'icon-192.png', 192); png(iconSvg('round', .88), 'icon-512.png', 512);
png(iconSvg('full', .78), 'apple-touch-icon.png', 180); png(iconSvg('full', .66), 'icon-maskable-512.png', 512);
// Android launcher
for (const [d, s] of Object.entries({mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192})) {
  png(iconSvg('round', .88), `${RES}/mipmap-${d}/ic_launcher.png`, s);
  png(iconSvg('circle', .8), `${RES}/mipmap-${d}/ic_launcher_round.png`, s);
  png(iconSvg('none', .64), `${RES}/mipmap-${d}/ic_launcher_foreground.png`, s * 2.25);   // adaptive icon layer (108 dp): the launcher masks it
}
fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#170F0C</color>\n</resources>\n');
// the player's loading ring: the ring and plug of the loading overlay, no play mark
const body = fs.readFileSync('src/body.html', 'utf8'), lo = /<svg viewBox="0 0 1024 1024" class="lo-logo"[^>]*>([\s\S]*?)<\/svg>/.exec(body)[1];
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${lo}</svg>`, `${RES}/drawable-nodpi/ld_logo.png`, 512);
(async () => {
  const b = await chromium.launch();
  const shoot = async (w, h, html, out) => {
    const p = await b.newPage({viewport:{width:w, height:h}});
    await p.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:radial-gradient(circle at 50% 46%,#2c1712,#0c0909 72%)">${html}</body></html>`);
    await p.waitForTimeout(150); await p.screenshot({path:out, omitBackground:false}); await p.close();
  };
  const word = (fs_) => `<span style="font:800 ${fs_}px Inter,'Inter Display',Roboto,system-ui,sans-serif;letter-spacing:.5px;color:#fff;white-space:nowrap">Stream<span style="background:linear-gradient(90deg,#ffd56b 0%,#ff9b3d 30%,#ff5b4f 72%,#ef3a6e 100%);-webkit-background-clip:text;background-clip:text;color:transparent">let</span></span>`;
  const mark = s => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 130 780 780" width="${s}" height="${s}" style="flex:0 0 auto">${logo}</svg>`;
  // banner (Android TV / Fire TV): logo + name, sitting close together like the end of the boot animation
  const banner = (w, h, out) => shoot(w, h, `<div style="display:flex;align-items:center;justify-content:center;gap:${w * .012}px;height:100%">${mark(h * .46)}${word(h * .185)}</div>`, out);
  await banner(1280, 720, '/tmp/banner-big.png');
  execSync(`convert /tmp/banner-big.png -resize 320x180 ${RES}/drawable-xhdpi/banner.png`);
  fs.mkdirSync(`${RES}/drawable-xxxhdpi`, {recursive:true}); execSync(`convert /tmp/banner-big.png -resize 640x360 ${RES}/drawable-xxxhdpi/banner.png`);
  // splash screens: the app icon in the middle
  const splash = [['drawable', 480, 320]];
  for (const f of fs.readdirSync(RES).filter(d => /^drawable-(land|port)-/.test(d))) { const s = execSync(`identify -format '%w %h' ${RES}/${f}/splash.png`).toString().split(' ').map(Number); splash.push([f, s[0], s[1]]); }
  fs.writeFileSync('/tmp/_icon.svg', iconSvg('round', .88));
  const icon = fs.readFileSync('/tmp/_icon.svg', 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
  for (const [d, w, h] of splash) { const s = Math.round(Math.min(w, h) * .3); await shoot(w, h, `<div style="display:flex;align-items:center;justify-content:center;height:100%"><div style="width:${s}px;height:${s}px">${icon}</div></div>`, `${RES}/${d}/splash.png`); }
  await b.close();
  console.log('icons, banner and splash screens written');
})();
