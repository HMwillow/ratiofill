/* 웹 브리지: src/ui.js 계약(RatioFillBridge)을 브라우저 + ffmpeg.wasm 으로 구현한다.
 * handle = File 객체. 변환은 전부 브라우저 안에서 일어나고 서버로 올라가지 않는다.
 * 빌드(scripts/build-web.js)가 이 파일을 dist-web/bridge.js 로 복사하고 vendor/ 에 ffmpeg.wasm 을 넣는다. */
(function () {
  const ABS = (p) => new URL(p, location.href).href;
  const VENDOR = {
    ffmpeg: 'vendor/ffmpeg/ffmpeg.js',          // @ffmpeg/ffmpeg UMD (워커 814.ffmpeg.js 는 같은 폴더에서 자동 로드)
    coreMt: 'vendor/core-mt/ffmpeg-core',       // 멀티스레드 코어 (crossOriginIsolated 필요)
    core: 'vendor/core/ffmpeg-core',            // 단일스레드 코어 (폴백)
  };

  // 기본은 단일 스레드 코어. 멀티스레드 코어(core-mt)는 -threads 를 제한하면 단순 변환은 되지만
  // 여백 합성(filter_complex overlay)에서는 멈춘다(ffmpeg.wasm 0.12 결함). ?mt=1 로만 실험한다.
  // 멀티스레드는 crossOriginIsolated 가 필요해서, 헤더를 못 주는 호스팅(GitHub Pages)에서는 coi-serviceworker 로 우회한다.
  // ?preset= 으로 x264 preset, ?crf= 로 화질, ?threads= 로 스레드 수(mt 전용)를 바꿀 수 있다.
  const params = new URLSearchParams(location.search);
  const WANT_MT = params.get('mt') === '1';
  const THREADS = Math.max(1, Math.min(+(params.get('threads') || 4), (navigator.hardwareConcurrency || 4) - 1));
  const PRESET_PARAM = params.get('preset');
  if (WANT_MT && location.protocol.startsWith('http') && !window.crossOriginIsolated) {
    const s = document.createElement('script'); s.src = 'coi-serviceworker.js'; document.head.appendChild(s);
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = res; s.onerror = () => rej(new Error('스크립트 로드 실패: ' + src));
      document.head.appendChild(s);
    });
  }

  let ffmpeg = null, loading = null;
  let logs = [];
  async function ensureFfmpeg(onStatus) {
    if (ffmpeg) return ffmpeg;
    if (loading) return loading;
    loading = (async () => {
      onStatus && onStatus('변환 엔진 불러오는 중… (최초 1회 약 30MB)');
      if (!window.FFmpegWASM) await loadScript(VENDOR.ffmpeg);
      const ff = new window.FFmpegWASM.FFmpeg();
      ff.on('log', ({ message }) => { logs.push(message); if (logs.length > 300) logs.shift(); });
      const mt = WANT_MT && !!(window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
      const base = mt ? VENDOR.coreMt : VENDOR.core;
      await ff.load({
        coreURL: ABS(base + '.js'),
        wasmURL: ABS(base + '.wasm'),
        workerURL: mt ? ABS(base + '.worker.js') : undefined,
      });
      ff.multiThread = mt;
      ffmpeg = ff;
      return ff;
    })().finally(() => { loading = null; });
    return loading;
  }

  const ext = (name, def) => { const m = String(name).match(/\.([A-Za-z0-9]+)$/); return m ? m[1].toLowerCase() : def; };
  const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mpg', 'mpeg'];
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];

  function kindOf(f) {
    if (!f) return null;
    if (f.type.startsWith('video/')) return 'video';
    if (f.type.startsWith('image/')) return 'image';
    const e = ext(f.name, '');
    return VIDEO_EXT.includes(e) ? 'video' : IMAGE_EXT.includes(e) ? 'image' : null;
  }

  function pickFile(accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.style.display = 'none';
      i.onchange = () => { res(i.files[0] || null); i.remove(); };
      i.oncancel = () => { res(null); i.remove(); };
      document.body.appendChild(i);
      i.click();
    });
  }

  const urls = new WeakMap();
  function toFileUrl(f) {
    if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
    return urls.get(f);
  }

  // ffmpeg.js(데스크톱)의 parseProbe 와 같은 규칙
  function parseProbe(err) {
    const m = err.match(/Video:[^\n]*?\s(\d{2,5})x(\d{2,5})/);
    const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const r = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
    const f = err.match(/(\d+(?:\.\d+)?)\s*fps/);
    if (!m) return { ok: false, error: '영상 스트림을 찾지 못했습니다.' };
    let width = +m[1], height = +m[2];
    const rot = r ? Math.abs(Math.round(+r[1])) % 180 : 0;
    if (rot === 90) [width, height] = [height, width];
    return { ok: true, width, height, duration: d ? (+d[1] * 3600 + +d[2] * 60 + +d[3]) : 0, fps: f ? +f[1] : 0, hasAudio: /Audio:/.test(err) };
  }

  // 1차: <video> 메타데이터 (빠름). 브라우저가 못 여는 코덱이면 2차: ffmpeg.wasm 으로 -i
  function probe(file) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      let settled = false;
      const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(r); };
      const fallback = () => probeWithFfmpeg(file).then(done);
      v.onloadedmetadata = () => {
        const d = isFinite(v.duration) ? v.duration : 0;
        if (v.videoWidth && v.videoHeight && d) done({ ok: true, width: v.videoWidth, height: v.videoHeight, duration: d, fps: 0, hasAudio: undefined });
        else fallback();
      };
      v.onerror = fallback;
      // 백그라운드 탭에서는 브라우저가 미디어 로드를 미루므로 일정 시간 뒤 ffmpeg 로 읽는다
      const timer = setTimeout(fallback, 8000);
      v.src = toFileUrl(file);
    });
  }
  async function probeWithFfmpeg(file) {
    try {
      const ff = await ensureFfmpeg();
      const name = 'probe.' + ext(file.name, 'mp4');
      await ff.writeFile(name, new Uint8Array(await file.arrayBuffer()));
      logs = [];
      await ff.exec(['-hide_banner', '-i', name]);
      const r = parseProbe(logs.join('\n'));
      await ff.deleteFile(name).catch(() => {});
      return r;
    } catch (e) {
      return { ok: false, error: '영상 정보를 읽지 못했습니다: ' + e.message };
    }
  }

  async function exportJob(job, onProgress) {
    const status = (t) => onProgress && onProgress({ status: t });
    let ff;
    try { ff = await ensureFfmpeg(status); }
    catch (e) { return { ok: false, error: '변환 엔진을 불러오지 못했습니다: ' + e.message }; }

    const written = [];
    try {
      status('파일 준비 중…');
      const inName = 'in.' + ext(job.input.name, 'mp4');
      await ff.writeFile(inName, new Uint8Array(await job.input.arrayBuffer())); written.push(inName);
      const margins = [];
      let i = 1;
      for (const m of job.margins) {
        const n = `img${i++}.${ext(m.image.name, 'png')}`;
        await ff.writeFile(n, new Uint8Array(await m.image.arrayBuffer())); written.push(n);
        margins.push({ ...m, image: n });
      }
      const outName = 'out.mp4';
      // 브라우저 인코딩은 느려서 속도 우선 preset. ultrafast 는 veryfast 보다 약 1.7배 빠르지만 같은 CRF 에서 용량이 커지므로 CRF 를 올려 보정
      const crf = +(params.get('crf') || (job.crf <= 16 ? 20 : job.crf <= 18 ? 22 : 26));
      const args = window.RatioFillFilter.buildFilterArgs({
        ...job, input: inName, output: outName, margins, crf,
        preset: PRESET_PARAM || 'ultrafast',
      });
      if (ff.multiThread) args.push('-threads', String(THREADS));
      logs = [];
      const onP = ({ progress, time }) => onProgress && onProgress({
        ratio: isFinite(progress) ? Math.max(0, Math.min(1, progress)) : undefined,
        seconds: isFinite(time) && time >= 0 ? time / 1e6 : undefined,
      });
      ff.on('progress', onP);
      let code;
      try { code = await ff.exec(['-y', '-hide_banner', ...(ff.multiThread ? ['-threads', String(THREADS)] : []), ...args]); }
      finally { ff.off('progress', onP); }
      if (code !== 0) return { ok: false, error: `ffmpeg 종료 코드 ${code}\n` + logs.slice(-6).join('\n') };

      const data = await ff.readFile(outName); written.push(outName);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = job.output;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      return { ok: true };
    } catch (e) {
      if (!ffmpeg) return { ok: false, error: '취소됨' };
      return { ok: false, error: e.message + '\n' + logs.slice(-4).join('\n') };
    } finally {
      if (ffmpeg) for (const n of written) await ffmpeg.deleteFile(n).catch(() => {});
    }
  }

  // URL 에서 이미지 가져오기: 상대 서버가 CORS 를 허용해야 한다.
  async function imageFromUrl(url) {
    let res;
    try { res = await fetch(url, { mode: 'cors' }); }
    catch (e) { throw new Error('이 주소는 브라우저에서 직접 가져올 수 없습니다(CORS 차단). 이미지를 내려받아 파일로 선택하세요.'); }
    if (!res.ok) throw new Error(`이미지를 받지 못했습니다 (HTTP ${res.status})`);
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image') || 'image';
    return new File([blob], /\.[a-z0-9]+$/i.test(name) ? name : name + '.' + type.split('/')[1], { type });
  }

  function cancelExport() {
    if (ffmpeg) { try { ffmpeg.terminate(); } catch (_) {} }
    ffmpeg = null; loading = null;
  }

  window.RatioFillBridge = {
    pickVideo: () => pickFile('video/*,' + VIDEO_EXT.map((e) => '.' + e).join(',')),
    pickImage: () => pickFile('image/*'),
    pickOutput: (name) => Promise.resolve(name),
    probe,
    export: exportJob,
    cancelExport,
    imageFromUrl,
    toFileUrl,
    displayName: (f) => (f && f.name) || String(f),
    handleFromDrop: (f) => f,
    kindOf,
    labels: {
      export: 'MP4 만들어 내려받기',
      hint: '영상 영역을 클릭하면 영상을, 여백을 클릭하면 이미지를 고릅니다. 파일을 끌어다 놓아도 됩니다. 변환은 이 브라우저 안에서만 일어나고 어디에도 업로드되지 않습니다.',
    },
  };
})();
