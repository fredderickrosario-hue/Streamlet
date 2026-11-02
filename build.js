// Source lives in src/ (head.html, css/*.css, body.html, js/*.js, tail.html, joined in file-name order).
//   node build.js   ->  index.html (the web app / PWA), tv/index.html and phone/index.html
// Edit the files in src/, never index.html itself (it is regenerated).
// Builds the two app flavors from the assembled index.html:
// - sets FLAVOR ('tv' or 'phone')
// - drops code wrapped in /*@tv*/ ... /*@end*/ (when building phone) or /*@phone*/ ... /*@end*/ (when building tv)
// - phone build: drops every one-line `body.tv ...{}` CSS rule (the TV layout), TV build: forced TV mode
// - both: relative asset links point one folder up, no service worker (the apps load the page from the network)
const fs = require('fs');
const read = f => fs.readFileSync(f, 'utf8');
const dir = d => fs.readdirSync(d).filter(f => !f.startsWith('.')).sort().map(f => read(`${d}/${f}`)).join('');
const src = read('src/head.html') + dir('src/css') + read('src/body.html') + dir('src/js') + read('src/tail.html');
fs.writeFileSync('index.html', src);
for (const f of ['tv', 'phone']) {
  let s = src.replace("const FLAVOR = 'auto';", `const FLAVOR = '${f}';`);
  const other = f === 'tv' ? 'phone' : 'tv';
  s = s.replace(new RegExp(`/\\*@${other}\\*/[\\s\\S]*?/\\*@end\\*/`, 'g'), '');
  s = s.replace(new RegExp(`<!--@${other}-->[\\s\\S]*?<!--@end-->`, 'g'), '');
  s = s.replace(/<!--@(tv|phone)-->|<!--@end-->/g, '');
  s = s.replace(/\/\*@(tv|phone)\*\//g, '').replace(/\/\*@end\*\//g, '');
  if (f === 'phone') {
    s = s.split('\n').filter(l => {
      const m = /^\s*([^{}@]+)\{.*\}\s*$/.exec(l);
      return !(m && m[1].split(',').every(x => /^\s*body\.tv(?![\w-])/.test(x)));
    }).join('\n');
  }
  if (f === 'tv') {                                              // the TV page is laid out 1280 CSS px wide and scaled by the web view (no per-frame zoom), without the GPU-heavy blur
    s = s.replace(/-webkit-backdrop-filter:[^;}]*;?/g, '').replace(/backdrop-filter:[^;}]*;?/g, '');
  }
  s = s.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');
  for (const a of ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'logo.svg']) s = s.split(`"${a}"`).join(`"../${a}"`);
  s = s.replace(/^if \('serviceWorker' in navigator[^\n]*\n/m, '');
  fs.mkdirSync(f, { recursive: true });
  fs.writeFileSync(`${f}/index.html`, s);
  console.log(f, (s.length / 1024).toFixed(0) + ' KB (source ' + (src.length / 1024).toFixed(0) + ' KB)');
}
