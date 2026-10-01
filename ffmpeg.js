// ffmpeg 경로 해석 + 프로브 + 내보내기 인자 생성 (main 프로세스/테스트 공용)
const { spawn } = require('child_process');

function ffmpegPath() {
  let p = null;
  try { p = require('ffmpeg-static'); } catch (_) { p = null; }
  if (!p) return process.env.RATIOFILL_FFMPEG || 'ffmpeg';
  return p.replace('app.asar', 'app.asar.unpacked');
}

function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-i', file]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
    p.on('close', () => {
      const m = err.match(/Video:[^\n]*?\s(\d{2,5})x(\d{2,5})/);
      const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const r = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
      const f = err.match(/(\d+(?:\.\d+)?)\s*fps/);
      if (!m) return resolve({ ok: false, error: '영상 스트림을 찾지 못했습니다.\n' + err.trim().split('\n').slice(-3).join('\n') });
      let width = +m[1], height = +m[2];
      const rot = r ? Math.abs(Math.round(+r[1])) % 180 : 0;
      if (rot === 90) [width, height] = [height, width];
      resolve({
        ok: true, width, height,
        duration: d ? (+d[1] * 3600 + +d[2] * 60 + +d[3]) : 0,
        fps: f ? +f[1] : 30,
        hasAudio: /Audio:/.test(err),
      });
    });
  });
}

function hex(c) { return '0x' + String(c).replace('#', '').slice(0, 6); }

// job: { input, output, outW, outH, bg, crf, video:{x,y,w,h}, margins:[{image,x,y,w,h,fit,ax,ay}] }
function buildArgs(job) {
  const v = job.video;
  const inputs = ['-i', job.input];
  const filters = [];
  filters.push(
    `[0:v]scale=${v.w}:${v.h}:flags=lanczos,setsar=1,` +
    `pad=${job.outW}:${job.outH}:${v.x}:${v.y}:color=${hex(job.bg)}[base0]`
  );
  let cur = 'base0';
  let idx = 1;
  for (const m of job.margins || []) {
    if (!m.image) continue;
    inputs.push('-i', m.image);
    const label = `img${idx}`;
    const ax = +m.ax, ay = +m.ay;
    let f;
    if (m.fit === 'stretch') {
      f = `[${idx}:v]scale=${m.w}:${m.h}`;
    } else if (m.fit === 'contain') {
      f = `[${idx}:v]scale=${m.w}:${m.h}:force_original_aspect_ratio=decrease`;
    } else {
      f = `[${idx}:v]scale=${m.w}:${m.h}:force_original_aspect_ratio=increase,` +
          `crop=${m.w}:${m.h}:(iw-ow)*${ax}:(ih-oh)*${ay}`;
    }
    f += `,format=rgba[${label}]`;
    filters.push(f);
    filters.push(
      `[${cur}][${label}]overlay=x=${m.x}+(${m.w}-w)*${ax}:y=${m.y}+(${m.h}-h)*${ay}:format=auto[o${idx}]`
    );
    cur = `o${idx}`;
    idx++;
  }
  filters.push(`[${cur}]format=yuv420p[out]`);
  return [
    '-y', '-hide_banner', '-nostats', '-progress', 'pipe:1',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[out]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(job.crf || 18),
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    job.output,
  ];
}

function parseTime(s) {
  const m = String(s).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

function runExport(job, onProgress) {
  return new Promise((resolve) => {
    const args = buildArgs(job);
    const p = spawn(ffmpegPath(), args);
    let err = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const t = line.match(/^out_time=(.+)/);
        if (t && onProgress) onProgress({ seconds: parseTime(t[1]) });
      }
    });
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: `ffmpeg 종료 코드 ${code}\n` + err.trim().split('\n').slice(-6).join('\n') });
    });
    runExport.current = p;
  });
}
runExport.current = null;

module.exports = { ffmpegPath, probe, buildArgs, runExport };
