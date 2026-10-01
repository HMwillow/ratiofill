/* RatioFill renderer: 상태, 레이아웃, 캔버스 미리보기, 내보내기 */
const bridge = window.api;
const $ = (s) => document.querySelector(s);

const { PRESETS, computeLayout: layoutOf, ratioText } = window.RatioFillLayout;
const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mpg', 'mpeg'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];

const newMargin = () => ({ image: null, img: null, fit: 'cover', ax: 0.5, ay: 0.5 });
const state = {
  video: null,            // { path, width, height, duration, fps, hasAudio, playable }
  outW: 1080, outH: 1080,
  pos: 0.5,               // 자유 축 위치 0..1
  bg: '#000000',
  margins: { a: newMargin(), b: newMargin() }, // a = 위/왼쪽, b = 아래/오른쪽
  exporting: false,
};

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const videoEl = $('#video');

/* ---------- 레이아웃 ---------- */
function computeLayout() { return layoutOf(state); }

/* ---------- 그리기 ---------- */
function drawFitted(img, m, mg) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (mg.fit === 'stretch') { ctx.drawImage(img, m.x, m.y, m.w, m.h); return; }
  if (mg.fit === 'contain') {
    const s = Math.min(m.w / iw, m.h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, m.x + (m.w - dw) * mg.ax, m.y + (m.h - dh) * mg.ay, dw, dh);
    return;
  }
  const s = Math.max(m.w / iw, m.h / ih);
  const sw = m.w / s, sh = m.h / s;
  ctx.drawImage(img, (iw - sw) * mg.ax, (ih - sh) * mg.ay, sw, sh, m.x, m.y, m.w, m.h);
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

let lastSig = '';
function draw() {
  const L = computeLayout();
  if (canvas.width !== L.outW || canvas.height !== L.outH) {
    canvas.width = L.outW; canvas.height = L.outH; fitCanvas();
  }
  const base = Math.max(14, Math.round(Math.min(L.outW, L.outH) / 32));
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, L.outW, L.outH);

  for (const m of L.margins) {
    const mg = state.margins[m.key];
    if (mg.img && mg.img.complete && mg.img.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();
      drawFitted(mg.img, m, mg);
      ctx.restore();
    } else {
      ctx.save();
      ctx.setLineDash([base / 2, base / 2]); ctx.lineWidth = Math.max(2, base / 8);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.strokeRect(m.x + 4, m.y + 4, m.w - 8, m.h - 8);
      ctx.restore();
      drawLabel(`+ 이미지\n${m.name} (클릭)`, m.x + m.w / 2, m.y + m.h / 2, Math.min(base, m.h / 3), m.w * 0.85);
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

  // 여백 패널 갱신 (구성 바뀔 때만 재생성)
  const sig = L.margins.map((m) => m.key + m.name).join('|');
  if (sig !== lastSig) { lastSig = sig; buildMarginPanels(L); }
  for (const m of L.margins) {
    const el = document.querySelector(`#margins .panel[data-key="${m.key}"] .size`);
    if (el) el.textContent = `${m.w}×${m.h}`;
  }
  $('#noMargin').hidden = !(state.video && L.margins.length === 0);
  $('#ratioLabel').textContent = '= ' + ratioText(L.outW, L.outH);
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

/* ---------- 여백 패널 ---------- */
function buildMarginPanels(L) {
  const host = $('#margins');
  host.innerHTML = '';
  L.margins.forEach((m, i) => {
    const mg = state.margins[m.key];
    const p = document.createElement('section');
    p.className = 'panel'; p.dataset.key = m.key;
    p.innerHTML = `
      <h3><span>4-${i + 1}. ${m.name}</span><span class="size dim"></span></h3>
      <div class="row">
        <button data-act="pick">이미지 선택</button>
        <span class="file">${mg.image ? baseName(mg.image) : '없음'}</span>
        <button data-act="clear" ${mg.image ? '' : 'disabled'}>제거</button>
      </div>
      <div class="row">
        <label>맞춤
          <select data-field="fit">
            <option value="cover">꽉 채우기 (넘치면 잘림)</option>
            <option value="contain">안에 맞추기 (여백 남음)</option>
            <option value="stretch">늘리기 (비율 무시)</option>
          </select>
        </label>
        <span class="dim">정렬</span>
        <div class="align-grid"></div>
      </div>`;
    p.querySelector('[data-field="fit"]').value = mg.fit;
    const grid = p.querySelector('.align-grid');
    for (let ay = 0; ay <= 1; ay += 0.5) for (let ax = 0; ax <= 1; ax += 0.5) {
      const b = document.createElement('button');
      b.dataset.ax = ax; b.dataset.ay = ay; b.title = alignName(ax, ay);
      if (mg.ax === ax && mg.ay === ay) b.classList.add('on');
      b.onclick = () => { mg.ax = ax; mg.ay = ay; grid.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
      grid.appendChild(b);
    }
    p.querySelector('[data-act="pick"]').onclick = () => pickMarginImage(m.key);
    p.querySelector('[data-act="clear"]').onclick = () => setMarginImage(m.key, null);
    p.querySelector('[data-field="fit"]').onchange = (e) => { mg.fit = e.target.value; draw(); };
    host.appendChild(p);
  });
}
function alignName(ax, ay) {
  const X = ['왼쪽', '가운데', '오른쪽'][ax * 2], Y = ['위', '가운데', '아래'][ay * 2];
  return `${Y} ${X}`;
}
function baseName(p) { return p.split(/[\\/]/).pop(); }

async function pickMarginImage(key) {
  const p = await bridge.pickImage();
  if (p) setMarginImage(key, p);
}
function setMarginImage(key, p) {
  const mg = state.margins[key];
  mg.image = p; mg.img = null;
  if (p) {
    const img = new Image();
    img.onload = () => draw();
    img.onerror = () => { toast('이미지를 열 수 없습니다: ' + baseName(p)); mg.image = null; mg.img = null; lastSig = ''; draw(); };
    img.src = bridge.toFileUrl(p);
    mg.img = img;
  }
  lastSig = ''; // 패널 다시 그리기
  draw();
}

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
  b.onclick = () => { state.outW = p.w; state.outH = p.h; syncSizeInputs(); draw(); };
  presetHost.appendChild(b);
});
function syncSizeInputs() {
  $('#outW').value = state.outW; $('#outH').value = state.outH;
  presetHost.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', PRESETS[i].w === state.outW && PRESETS[i].h === state.outH));
}
$('#outW').onchange = (e) => { state.outW = clampInt(e.target.value, 16, 7680, 1080); syncSizeInputs(); draw(); };
$('#outH').onchange = (e) => { state.outH = clampInt(e.target.value, 16, 7680, 1080); syncSizeInputs(); draw(); };
function clampInt(v, lo, hi, def) { v = parseInt(v, 10); if (isNaN(v)) return def; return Math.min(hi, Math.max(lo, v)); }

$('#pos').oninput = (e) => { state.pos = e.target.value / 100; draw(); };
document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { state.pos = b.dataset.pos / 100; $('#pos').value = b.dataset.pos; draw(); }; });
$('#bg').oninput = (e) => { state.bg = e.target.value; draw(); };

function updatePosLabels() {
  const L = computeLayout();
  const v = L.axis === 'h';
  $('#posStart').textContent = v ? '왼쪽' : '위';
  $('#posEnd').textContent = v ? '오른쪽' : '아래';
}
const _draw = draw;
draw = function () { _draw(); updatePosLabels(); };

/* ---------- 캔버스 클릭 / 드롭 ---------- */
function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const px = (clientX - r.left) * canvas.width / r.width;
  const py = (clientY - r.top) * canvas.height / r.height;
  const L = computeLayout();
  for (const m of L.margins) if (px >= m.x && px < m.x + m.w && py >= m.y && py < m.y + m.h) return { type: 'margin', key: m.key };
  return { type: 'video' };
}
canvas.addEventListener('click', (e) => {
  if (state.exporting) return;
  const h = hitTest(e.clientX, e.clientY);
  if (h.type === 'margin') pickMarginImage(h.key); else pickVideo();
});
$('#btnVideo').onclick = pickVideo;

const stage = $('#stage');
['dragenter', 'dragover'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.add('drop'); }));
['dragleave', 'drop'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.remove('drop'); }));
stage.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const p = bridge.pathForFile(f);
  const ext = p.split('.').pop().toLowerCase();
  if (VIDEO_EXT.includes(ext)) return loadVideo(p);
  if (IMAGE_EXT.includes(ext)) {
    const L = computeLayout();
    if (!L.margins.length) return toast('이미지를 넣을 여백이 없습니다. 영상과 비율을 먼저 정하세요.');
    const h = hitTest(e.clientX, e.clientY);
    const key = h.type === 'margin' ? h.key : L.margins[0].key;
    return setMarginImage(key, p);
  }
  toast('지원하지 않는 파일입니다: ' + baseName(p));
});

/* ---------- 내보내기 ---------- */
$('#btnExport').onclick = async () => {
  if (!state.video) return toast('먼저 영상을 선택하세요.');
  const L = computeLayout();
  const inName = baseName(state.video.path).replace(/\.[^.]+$/, '');
  const out = await bridge.pickOutput(`${inName}_${L.outW}x${L.outH}.mp4`);
  if (!out) return;
  const job = {
    input: state.video.path, output: out,
    outW: L.outW, outH: L.outH, bg: state.bg, crf: +$('#crf').value,
    video: L.video,
    margins: L.margins.filter((m) => state.margins[m.key].image).map((m) => {
      const mg = state.margins[m.key];
      return { x: m.x, y: m.y, w: m.w, h: m.h, image: mg.image, fit: mg.fit, ax: mg.ax, ay: mg.ay };
    }),
  };
  videoEl.pause();
  setExporting(true);
  setStatus('내보내는 중…');
  const r = await bridge.export(job);
  setExporting(false);
  if (r.ok) {
    setStatus('완료: ' + out);
    toast('내보내기 완료');
    bridge.showInFolder(out);
  } else {
    setStatus('실패\n' + r.error);
  }
};
$('#btnCancel').onclick = () => bridge.cancelExport();
bridge.onProgress(({ seconds }) => {
  const d = state.video ? state.video.duration : 0;
  const pct = d ? Math.min(100, Math.round((seconds / d) * 100)) : 0;
  $('#progressBar').style.width = pct + '%';
  setStatus(`내보내는 중… ${pct}% (${fmtTime(seconds)} / ${fmtTime(d)})`);
});
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
bridge.onOpenVideo((p) => loadVideo(p));
bridge.onDevImage((p) => setMarginImage('a', p));
syncSizeInputs();
fitCanvas();
draw();
