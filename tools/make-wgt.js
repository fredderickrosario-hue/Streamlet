// Builds tizen/Streamlet.wgt (unsigned) from tizen/config.xml, index.html and icon.png.
// A Samsung TV only installs a signed .wgt: sign it with your own Samsung certificate (Tizen Studio, or an installer that signs for you).
const {execFileSync} = require('child_process'), path = require('path'), fs = require('fs');
const dir = path.join(__dirname, '..', 'tizen'), out = path.join(dir, 'Streamlet.wgt');
try { fs.unlinkSync(out); } catch {}
execFileSync('zip', ['-q', '-X', out, 'config.xml', 'index.html', 'icon.png'], {cwd:dir});
console.log('built', out, fs.statSync(out).size, 'bytes');
