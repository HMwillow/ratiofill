// 실제 ffmpeg 로 필터 그래프 검증 (수동 실행):
//   node test/filter.test.js <영상> <이미지> [출력.mp4]
// 9:16 영상을 16:9 로 바꿔 오른쪽에 두고, 왼쪽 여백에 이미지를 cover 로 채운다.
const path = require('path');
const { probe, buildArgs, runExport } = require('../ffmpeg');
const { computeLayout } = require('../src/layout');

(async () => {
  const [input, image, out] = process.argv.slice(2);
  if (!input || !image) { console.error('usage: node test/filter.test.js <video> <image> [out.mp4]'); process.exit(2); }
  const output = out || path.join(__dirname, 'out_test.mp4');
  const info = await probe(input);
  if (!info.ok) { console.error(info.error); process.exit(1); }
  const L = computeLayout({ video: info, outW: 1920, outH: 1080, pos: 1 });
  const job = {
    input, output, outW: L.outW, outH: L.outH, bg: '#1e2a44', crf: 23, video: L.video,
    margins: L.margins,
    background: { image, fit: 'cover', mode: 'margins' },
  };
  console.log('args:', buildArgs(job).join(' '));
  const t = Date.now();
  const r = await runExport(job, (p) => process.stdout.write(`\r${p.seconds.toFixed(1)}s`));
  console.log('\nresult:', r, `${((Date.now() - t) / 1000).toFixed(1)}s →`, output);
  process.exit(r.ok ? 0 : 1);
})();
