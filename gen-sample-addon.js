// Generates a static, hostable copy of the demo addon in ./sample-addon from the DEMO object in index.html.
// Usage: node gen-sample-addon.js   (then host the folder anywhere with CORS, e.g. GitHub Pages)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = src.split('// DEMO-START')[1].split('// DEMO-END')[0];
const DEMO = new Function(code + '; return DEMO;')();
for (const [rel, data] of Object.entries(DEMO)) {
  const d = JSON.parse(JSON.stringify(data));
  if (rel === 'manifest.json') d.catalogs.forEach(c => delete c.extra); // static hosting can't do search
  const out = path.join(__dirname, 'sample-addon', rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(d, null, 2));
}
console.log('wrote sample-addon/');
