// Builds the two app flavors from index.html:  tv/index.html  and  phone/index.html
//   node build.js
// - sets FLAVOR ('tv' or 'phone')
// - drops code wrapped in /*@tv*/ ... /*@end*/ (when building phone) or /*@phone*/ ... /*@end*/ (when building tv)
// - phone build: drops every one-line `body.tv ...{}` CSS rule (the TV layout), TV build: forced TV mode
// - both: relative asset links point one folder up, no service worker (the apps load the page from the network)
const fs = require('fs');
const src = fs.readFileSync('index.html', 'utf8');
for (const f of ['tv', 'phone']) {
  let s = src.replace("const FLAVOR = 'auto';", `const FLAVOR = '${f}';`);
  const other = f === 'tv' ? 'phone' : 'tv';
  s = s.replace(new RegExp(`/\\*@${other}\\*/[\\s\\S]*?/\\*@end\\*/`, 'g'), '');
  s = s.replace(/\/\*@(tv|phone)\*\//g, '').replace(/\/\*@end\*\//g, '');
  if (f === 'phone') {
    s = s.split('\n').filter(l => {
      const m = /^\s*([^{}@]+)\{.*\}\s*$/.exec(l);
      return !(m && m[1].split(',').every(x => /^\s*body\.tv(?![\w-])/.test(x)));
    }).join('\n');
  }
  for (const a of ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'logo.svg']) s = s.split(`"${a}"`).join(`"../${a}"`);
  s = s.replace(/^if \('serviceWorker' in navigator[^\n]*\n/m, '');
  fs.mkdirSync(f, { recursive: true });
  fs.writeFileSync(`${f}/index.html`, s);
  console.log(f, (s.length / 1024).toFixed(0) + ' KB (source ' + (src.length / 1024).toFixed(0) + ' KB)');
}
