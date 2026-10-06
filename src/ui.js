/* Shared RatioFill UI for desktop and web. RatioFillBridge owns platform I/O. */
const bridge = window.RatioFillBridge;
const $ = (s) => document.querySelector(s);

const { PRESETS, computeLayout: layoutOf, ratioText, backgroundMode } = window.RatioFillLayout;

const state = {
  video: null,            // { path, width, height, duration, fps, hasAudio, playable }
  outW: 1080, outH: 1080,
  pos: 0.5,               // 자유 축 위치 0..1
  videoScale: 1,
  bg: '#000000',
  background: { image: null, img: null, fit: 'contain', mode: 'auto', transparentCenter: false, inspected: false, inspectPromise: null },
  exporting: false,
};

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const videoEl = $('#video');

/* ---------- 레이아웃 ---------- */
function computeLayout() { return layoutOf(state); }
function resolvedBackgroundMode(L) {
  const img = state.background.img;
  if (state.background.mode === 'auto' && state.videoScale < 1 && !state.background.transparentCenter) return 'canvas';
  return backgroundMode(state.background.mode, L.outW, L.outH,
    img && img.naturalWidth, img && img.naturalHeight, state.pos,
    state.background.transparentCenter);
}

/* ---------- 그리기 ---------- */
function drawFitted(img, m, fit) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (fit === 'stretch') { ctx.drawImage(img, m.x, m.y, m.w, m.h); return; }
  if (fit === 'contain') {
    const s = Math.min(m.w / iw, m.h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, m.x + (m.w - dw) / 2, m.y + (m.h - dh) / 2, dw, dh);
    return;
  }
  const s = Math.max(m.w / iw, m.h / ih);
  const sw = m.w / s, sh = m.h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, m.x, m.y, m.w, m.h);
}

function drawLabel(text, cx, cy, size, maxW) {
  const lines = String(text).split('\n');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  if (maxW) {
    ctx.font = `${size}px sans-serif`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest > maxW) size = Math.max(8, size * maxW / widest);
  }
  ctx.font = `${size}px sans-serif`;
  const lh = size * 1.25, y0 = cy - lh * (lines.length - 1) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + i * lh));
}

function draw() {
  const L = computeLayout();
  if (canvas.width !== L.outW || canvas.height !== L.outH) {
    canvas.width = L.outW; canvas.height = L.outH; fitCanvas();
  }
  const base = Math.max(14, Math.round(Math.min(L.outW, L.outH) / 32));
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, L.outW, L.outH);

  const bg = state.background;
  const imageReady = bg.img && bg.img.complete && bg.img.naturalWidth;
  const imageMode = imageReady ? resolvedBackgroundMode(L) : null;
  if (imageReady && imageMode !== 'overlay') {
    if (imageMode === 'canvas') {
      drawFitted(bg.img, { x: 0, y: 0, w: L.outW, h: L.outH }, bg.fit);
    } else {
      for (const m of L.margins) {
        ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();
        drawFitted(bg.img, m, bg.fit);
        ctx.restore();
      }
    }
  } else if (!imageReady && L.video) {
    for (const m of L.margins) {
      ctx.save();
      ctx.setLineDash([base / 2, base / 2]); ctx.lineWidth = Math.max(2, base / 8);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.strokeRect(m.x + 4, m.y + 4, m.w - 8, m.h - 8);
      ctx.restore();
      drawLabel('+ 배경 이미지 (클릭)', m.x + m.w / 2, m.y + m.h / 2, Math.min(base, m.h / 3), m.w * 0.85);
    }
  }

  if (L.video) {
    const v = L.video;
    if (state.video.playable && videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, v.x, v.y, v.w, v.h);
    } else {
      ctx.fillStyle = '#3a3b44'; ctx.fillRect(v.x, v.y, v.w, v.h);
      drawLabel(state.video.playable ? '불러오는 중…' : '미리보기 불가 (내보내기는 가능)', v.x + v.w / 2, v.y + v.h / 2, base);
    }
  } else {
    ctx.fillStyle = '#26272e'; ctx.fillRect(0, 0, L.outW, L.outH);
    drawLabel('+ 영상 추가 (클릭 또는 끌어다 놓기)', L.outW / 2, L.outH / 2, base * 1.4);
  }

  if (imageMode === 'overlay') {
    drawFitted(bg.img, { x: 0, y: 0, w: L.outW, h: L.outH }, bg.fit);
  }

  $('#ratioLabel').textContent = '= ' + ratioText(L.outW, L.outH);
  const sizes = !L.video ? '영상 선택 후 여백 크기가 표시됩니다.'
    : L.margins.length ? '남은 여백: ' + L.margins.map((m) => `${m.name.replace(' 여백', '')} ${m.w}×${m.h}px`).join(' · ')
      : '남은 여백: 없음';
  if ($('#layoutSizes').textContent !== sizes) $('#layoutSizes').textContent = sizes;
}

function fitCanvas() {
  const stage = $('#stage');
  const cw = stage.clientWidth - 32, ch = stage.clientHeight - 32;
  const s = Math.min(cw / canvas.width, ch / canvas.height);
  canvas.style.width = Math.floor(canvas.width * s) + 'px';
  canvas.style.height = Math.floor(canvas.height * s) + 'px';
}
new ResizeObserver(fitCanvas).observe($('#stage'));

let rafId = 0;
function loop() { draw(); rafId = requestAnimationFrame(loop); }
function startLoop() { if (!rafId) loop(); }
function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

/* ---------- 배경 이미지 ---------- */
function baseName(p) { return bridge.displayName(p); }

async function pickBackgroundImage() {
  const p = await bridge.pickImage();
  if (p) setBackgroundImage(p);
}
function setBackgroundImage(p) {
  const bg = state.background;
  bg.image = p; bg.img = null;
  bg.transparentCenter = false;
  bg.inspected = false;
  bg.inspectPromise = null;
  $('#imageName').textContent = p ? baseName(p) : '없음';
  $('#btnClearImage').disabled = !p;
  if (p) {
    const img = new Image();
    bg.img = img;
    img.onload = () => { if (bg.img === img) draw(); };
    img.onerror = () => {
      if (bg.img !== img) return;
      toast('이미지를 열 수 없습니다: ' + baseName(p));
      setBackgroundImage(null);
    };
    img.src = bridge.toFileUrl(p);
    bg.inspectPromise = inspectImage(img).then((info) => {
      if (bg.img === img) {
        bg.transparentCenter = !!info.transparentCenter;
        bg.inspected = true;
        autoRevealBanner();
        draw();
      }
    }).catch(() => { if (bg.img === img) { bg.inspected = true; autoRevealBanner(); draw(); } });
  }
  draw();
}
function autoRevealBanner() {
  const bg = state.background;
  if (!state.video || !bg.img || !bg.img.complete || !bg.img.naturalWidth || !bg.inspected || bg.transparentCenter || state.videoScale < 1) return;
  const L = computeLayout();
  if (L.margins.length === 0) {
    state.videoScale = 0.62;
    $('#videoScale').value = 62;
    $('#videoScaleValue').textContent = '62%';
  }
}
async function inspectImage(img) {
  if (!img.complete) await new Promise((resolve, reject) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', reject, { once: true }); });
  const sample = document.createElement('canvas'); sample.width = 64; sample.height = 64;
  const c = sample.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, 64, 64);
  return { transparentCenter: c.getImageData(32, 32, 1, 1).data[3] < 64 };
}
$('#btnImage').onclick = pickBackgroundImage;
$('#btnClearImage').onclick = () => setBackgroundImage(null);
if (bridge.imageFromUrl) {
  const fetchUrl = async () => {
    const url = $('#imageUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) return toast('http:// 또는 https:// 로 시작하는 이미지 주소를 넣으세요.');
    setStatus('이미지 가져오는 중…');
    try { setBackgroundImage(await bridge.imageFromUrl(url)); setStatus(''); }
    catch (e) { setStatus(''); toast(e.message || String(e)); }
  };
  $('#btnImageUrl').onclick = fetchUrl;
  $('#imageUrl').onkeydown = (e) => { if (e.key === 'Enter') fetchUrl(); };
}
$('#imageFit').onchange = (e) => { state.background.fit = e.target.value; draw(); };
$('#imageMode').onchange = (e) => { state.background.mode = e.target.value; draw(); };

/* ---------- 영상 ---------- */
async function pickVideo() {
  const p = await bridge.pickVideo();
  if (p) loadVideo(p);
}
async function loadVideo(p) {
  setStatus('영상 정보를 읽는 중…');
  const info = await bridge.probe(p);
  if (!info.ok) { setStatus(''); toast(info.error); return; }
  state.video = { path: p, ...info, playable: true };
  $('#videoName').textContent = baseName(p);
  $('#videoInfo').textContent = `${info.width}×${info.height} · ${fmtTime(info.duration)} · ${info.fps}fps${info.hasAudio ? ' · 오디오' : ''}`;
  setStatus('');
  videoEl.src = bridge.toFileUrl(p);
  videoEl.load();
  $('#btnPlay').disabled = false; $('#seek').disabled = false;
  autoRevealBanner();
  draw();
}
videoEl.addEventListener('loadeddata', () => {
  updateTime();
  if (videoEl.requestVideoFrameCallback) videoEl.requestVideoFrameCallback(() => draw());
  videoEl.currentTime = 0.001; // 첫 프레임 디코드 유도 → seeked 에서 그림
  draw();
});
videoEl.addEventListener('error', () => { if (state.video) { state.video.playable = false; draw(); } });
videoEl.addEventListener('seeked', draw);
videoEl.addEventListener('timeupdate', updateTime);
videoEl.addEventListener('play', () => { $('#btnPlay').textContent = '일시정지'; startLoop(); });
videoEl.addEventListener('pause', () => { $('#btnPlay').textContent = '재생'; stopLoop(); draw(); });
videoEl.addEventListener('ended', () => { $('#btnPlay').textContent = '재생'; stopLoop(); draw(); });

$('#btnPlay').onclick = () => { if (videoEl.paused) videoEl.play().catch(() => {}); else videoEl.pause(); };
$('#seek').oninput = (e) => { if (videoEl.duration) videoEl.currentTime = (e.target.value / 1000) * videoEl.duration; };
function updateTime() {
  const d = videoEl.duration || (state.video && state.video.duration) || 0;
  if (d && !$('#seek').matches(':active')) $('#seek').value = Math.round((videoEl.currentTime / d) * 1000);
  $('#time').textContent = `${fmtTime(videoEl.currentTime || 0)} / ${fmtTime(d)}`;
}
function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/* ---------- 비율/위치/배경 ---------- */
const presetHost = $('#presets');
PRESETS.forEach((p) => {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.onclick = () => { state.outW = p.w; state.outH = p.h; syncSizeInputs(); autoRevealBanner(); draw(); };
  presetHost.appendChild(b);
});
function syncSizeInputs() {
  $('#outW').value = state.outW; $('#outH').value = state.outH;
  presetHost.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', PRESETS[i].w === state.outW && PRESETS[i].h === state.outH));
}
$('#outW').onchange = (e) => { state.outW = clampInt(e.target.value, 16, 7680, 1080); syncSizeInputs(); autoRevealBanner(); draw(); };
$('#outH').onchange = (e) => { state.outH = clampInt(e.target.value, 16, 7680, 1080); syncSizeInputs(); autoRevealBanner(); draw(); };
function clampInt(v, lo, hi, def) { v = parseInt(v, 10); if (isNaN(v)) return def; return Math.min(hi, Math.max(lo, v)); }

$('#pos').oninput = (e) => { state.pos = e.target.value / 100; draw(); };
document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { state.pos = b.dataset.pos / 100; $('#pos').value = b.dataset.pos; draw(); }; });
$('#bg').oninput = (e) => { state.bg = e.target.value; draw(); };
$('#videoScale').oninput = (e) => {
  state.videoScale = e.target.value / 100;
  $('#videoScaleValue').textContent = e.target.value + '%';
  draw();
};

function updatePosLabels() {
  const L = computeLayout();
  const vertical = L.axis === 'v' || (!L.axis && state.outW < state.outH);
  $('#posStart').textContent = vertical ? '위' : '왼쪽';
  $('#posEnd').textContent = vertical ? '아래' : '오른쪽';
  document.querySelector('[data-pos="0"]').textContent = vertical ? '상단' : '좌측';
  document.querySelector('[data-pos="50"]').textContent = '중앙';
  document.querySelector('[data-pos="100"]').textContent = vertical ? '하단' : '우측';
}
const _draw = draw;
draw = function () { _draw(); updatePosLabels(); };

/* ---------- 캔버스 클릭 / 드롭 ---------- */
function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const px = (clientX - r.left) * canvas.width / r.width;
  const py = (clientY - r.top) * canvas.height / r.height;
  const L = computeLayout();
  if (!L.video || px < L.video.x || px >= L.video.x + L.video.w || py < L.video.y || py >= L.video.y + L.video.h) return { type: 'background' };
  return { type: 'video' };
}
canvas.addEventListener('click', (e) => {
  if (state.exporting) return;
  const h = hitTest(e.clientX, e.clientY);
  if (h.type === 'background' && state.video) pickBackgroundImage(); else pickVideo();
});
$('#btnVideo').onclick = pickVideo;

const stage = $('#stage');
['dragenter', 'dragover'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.add('drop'); }));
['dragleave', 'drop'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.remove('drop'); }));
stage.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const p = bridge.handleFromDrop(f);
  const kind = bridge.kindOf(p);
  if (kind === 'video') return loadVideo(p);
  if (kind === 'image') return setBackgroundImage(p);
  toast('지원하지 않는 파일입니다: ' + baseName(p));
});

/* ---------- 내보내기 ---------- */
$('#btnExport').onclick = async () => {
  if (!state.video) return toast('먼저 영상을 선택하세요.');
  const L = computeLayout();
  const inName = baseName(state.video.path).replace(/\.[^.]+$/, '');
  const out = await bridge.pickOutput(`${inName}_${L.outW}x${L.outH}.mp4`);
  if (!out) return;
  if (state.background.inspectPromise) await state.background.inspectPromise;
  const job = {
    input: state.video.path, output: out,
    outW: L.outW, outH: L.outH, bg: state.bg, crf: +$('#crf').value,
    preset: $('#speed').value,
    video: L.video,
    background: state.background.image ? {
      image: state.background.image,
      fit: state.background.fit,
      mode: resolvedBackgroundMode(L),
    } : null,
    margins: L.margins,
  };
  videoEl.pause();
  setExporting(true);
  setStatus('내보내는 중…');
  const dur = state.video.duration;
  const r = await bridge.export(job, (d) => {
    if (d.status) { setStatus(d.status); return; }
    const pct = Math.max(0, Math.min(100, Math.round(100 * (typeof d.ratio === 'number' ? d.ratio : d.seconds && dur ? d.seconds / dur : 0))));
    $('#progressBar').style.width = pct + '%';
    setStatus(`내보내는 중… ${pct}%`);
  });
  setExporting(false);
  if (r.ok) {
    setStatus('완료: ' + out);
    toast('내보내기 완료');
    if (bridge.afterExport) bridge.afterExport(out);
  } else {
    setStatus('실패\n' + r.error);
  }
};
$('#btnCancel').onclick = () => bridge.cancelExport();
function setExporting(on) {
  state.exporting = on;
  $('#btnExport').disabled = on; $('#btnCancel').hidden = !on; $('#progressWrap').hidden = !on;
  if (on) $('#progressBar').style.width = '0%';
}
function setStatus(t) { $('#status').textContent = t; }

/* ---------- 토스트 ---------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ---------- 초기화 ---------- */
if (bridge.onOpenVideo) bridge.onOpenVideo((p) => loadVideo(p));
if (bridge.onDevImage) bridge.onDevImage((p) => setBackgroundImage(p));
if (bridge.onDevPreset) bridge.onDevPreset((label) => { const b = [...presetHost.querySelectorAll('button')].find((x) => x.textContent === label); if (b) b.click(); });
if (bridge.labels) {
  if (bridge.labels.export) $('#btnExport').textContent = bridge.labels.export;
  if (bridge.labels.hint) $('#hint').textContent = bridge.labels.hint;
}
syncSizeInputs();
fitCanvas();
draw();
