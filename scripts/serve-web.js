// dist-web 을 로컬에서 띄운다. node scripts/serve-web.js [port] [--coi]
//   --coi : COOP/COEP 헤더 추가 (멀티스레드 코어 실험용, 페이지는 ?mt=1 로 연다)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dist-web');
const args = process.argv.slice(2);
const coi = args.includes('--coi');
const port = +(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

if (!fs.existsSync(root)) { console.error('dist-web 이 없습니다. 먼저: node scripts/build-web.js'); process.exit(1); }

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    ...(coi ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } : {}),
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/`));
