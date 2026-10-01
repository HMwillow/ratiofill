// 웹 버전 정적 사이트 조립: dist-web/ = src 공용 파일 + web/bridge.js + ffmpeg.wasm vendor
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist-web');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of ['index.html', 'style.css', 'layout.js', 'filtergraph.js', 'ui.js']) {
  copy(path.join(root, 'src', f), path.join(out, f));
}
copy(path.join(root, 'web', 'bridge.js'), path.join(out, 'bridge.js'));
copy(path.join(root, 'web', 'coi-serviceworker.js'), path.join(out, 'coi-serviceworker.js'));

const nm = path.join(root, 'node_modules', '@ffmpeg');
copy(path.join(nm, 'ffmpeg/dist/umd/ffmpeg.js'), path.join(out, 'vendor/ffmpeg/ffmpeg.js'));
copy(path.join(nm, 'ffmpeg/dist/umd/814.ffmpeg.js'), path.join(out, 'vendor/ffmpeg/814.ffmpeg.js'));
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']) {
  copy(path.join(nm, 'core-mt/dist/umd', f), path.join(out, 'vendor/core-mt', f));
}
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copy(path.join(nm, 'core/dist/umd', f), path.join(out, 'vendor/core', f));
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`dist-web 준비 완료 (${(size(out) / 1048576).toFixed(1)} MB)`);
