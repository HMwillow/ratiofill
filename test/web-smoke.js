// 웹 번들 스모크 테스트 (Electron 의 Chromium 으로 dist-web 을 열어 드롭 → 변환까지 실행)
//   node scripts/build-web.js && node scripts/serve-web.js 8787 &   (서버 먼저)
//   npx electron test/web-smoke.js <url> [screenshot.png] [video] [image]
// video/image 를 주면 그 파일을 페이지에 주입하고, 없으면 서버 루트의 _test/sample.mp4, _test/sample.png 를 fetch 로 읽는다.
// 배포된 사이트 검증: npx electron test/web-smoke.js https://hmwillow.github.io/ratiofill/ shot.png ~/a.mp4 ~/b.png
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const [url = 'http://127.0.0.1:8787/', shot = '', videoPath = '', imagePath = ''] = process.argv.slice(2);
const b64 = (p) => (p ? fs.readFileSync(p).toString('base64') : '');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1320, height: 860, show: false });
  const log = (...a) => { process.stdout.write(a.join(' ') + '\n'); };
  win.webContents.on('console-message', (ev) => { if (['warning', 'error', 2, 3].includes(ev.level)) log('[page]', String(ev.message).slice(0, 300)); });
  await win.loadURL(url);
  const result = await win.webContents.executeJavaScript(`(async () => {
    const out = { isolated: window.crossOriginIsolated, bridge: !!window.RatioFillBridge };
    const $ = (s) => document.querySelector(s);
    const samples = { video: '${b64(videoPath)}', image: '${b64(imagePath)}' };
    const fromB64 = (s, name, type) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name, { type }); };
    const toFile = async (p, name, type) => samples[name.startsWith('sample.mp4') ? 'video' : 'image']
      ? fromB64(samples[name.startsWith('sample.mp4') ? 'video' : 'image'], name, type)
      : new File([await fetch(p).then((r) => r.blob())], name, { type });
    const drop = (file, fx, fy) => {
      const dt = new DataTransfer(); dt.items.add(file);
      const c = $('#canvas').getBoundingClientRect();
      $('#stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: c.left + c.width * fx, clientY: c.top + c.height * fy }));
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const say = (m) => console.warn('[smoke] ' + m);
    // 1) 영상 드롭
    drop(await toFile('_test/sample.mp4', 'sample.mp4', 'video/mp4'), 0.5, 0.5);
    await sleep(2500);
    say('video dropped: ' + $('#videoInfo').textContent);
    out.videoInfo = $('#videoInfo').textContent;
    out.posButtons = [...document.querySelectorAll('[data-pos]')].map((b) => b.textContent).join('/');
    out.margins = [...document.querySelectorAll('#margins .panel h3')].map((h) => h.textContent.replace(/\\s+/g, ' ')).join(' | ');
    // 2) 왼쪽 여백에 이미지 드롭 (1:1 출력, 9:16 영상 → 좌우 여백; 왼쪽은 x=10%)
    drop(await toFile('_test/sample.png', 'sample.png', 'image/png'), 0.08, 0.5);
    await sleep(1500);
    say('image dropped');
    out.marginFiles = [...document.querySelectorAll('#margins .file')].map((e) => e.textContent).join(' | ');
    // 3) 내보내기: 다운로드 대신 blob 을 가로채 검사
    let captured = null, lastBlob = null;
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { if (b instanceof Blob && b.type === 'video/mp4') lastBlob = b; return origCreate(b); };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) captured = { href: this.href, name: this.download, blob: lastBlob }; else origClick.call(this); };
    const t0 = Date.now();
    say('export click');
    $('#btnExport').click();
    for (let i = 0; i < 360 && !captured && !$('#status').textContent.startsWith('실패'); i++) {
      await sleep(500);
      if (i % 20 === 19) console.warn('[smoke] ' + Math.round((Date.now() - t0) / 1000) + 's ' + $('#status').textContent);
    }
    out.exportMs = Date.now() - t0;
    out.status = $('#status').textContent;
    say('export loop done: ' + out.status + ' captured=' + !!captured);
    if (captured) {
      const blob = captured.blob;
      out.download = { name: captured.name, bytes: blob ? blob.size : -1, type: blob ? blob.type : '' };
      // 결과 영상의 해상도 확인
      const v = document.createElement('video'); v.src = captured.href; v.muted = true; v.preload = 'metadata';
      await Promise.race([new Promise((res) => { v.onloadedmetadata = res; v.onerror = res; }), sleep(10000)]);
      out.download.size = v.videoWidth + 'x' + v.videoHeight + ' ' + v.duration.toFixed(2) + 's';
    }
    return out;
  })()`);
  log(JSON.stringify(result, null, 1));
  if (shot) { try { const img = await win.webContents.capturePage(); fs.writeFileSync(shot, img.toPNG()); } catch (e) { log('shot failed', e.message); } }
  log('exiting');
  app.exit(result.download ? 0 : 1);
});
