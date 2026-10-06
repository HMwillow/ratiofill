// 데스크톱용 ffmpeg 실행: 경로 해석, 프로브, 내보내기 (main 프로세스 / test 스크립트 공용)
const { spawn } = require('child_process');
const fs = require('fs');
const { buildFilterArgs } = require('./src/filtergraph');

function ffmpegPath() {
  let p = null;
  try { p = require('ffmpeg-static'); } catch (_) { p = null; }
  if (!p || !fs.existsSync(p)) return process.env.RATIOFILL_FFMPEG || 'ffmpeg';
  return p.replace('app.asar', 'app.asar.unpacked');
}

// ffmpeg -i 의 stderr 에서 영상 정보 추출 (회전 메타데이터 반영)
function parseProbe(err) {
  const m = err.match(/Video:[^\n]*?\s(\d{2,5})x(\d{2,5})/);
  const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const r = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
  const f = err.match(/(\d+(?:\.\d+)?)\s*fps/);
  if (!m) return { ok: false, error: '영상 스트림을 찾지 못했습니다.\n' + err.trim().split('\n').slice(-3).join('\n') };
  let width = +m[1], height = +m[2];
  const rot = r ? Math.abs(Math.round(+r[1])) % 180 : 0;
  if (rot === 90) [width, height] = [height, width];
  return {
    ok: true, width, height,
    duration: d ? (+d[1] * 3600 + +d[2] * 60 + +d[3]) : 0,
    fps: f ? +f[1] : 30,
    hasAudio: /Audio:/.test(err),
  };
}

function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-i', file]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
    p.on('close', () => resolve(parseProbe(err)));
  });
}

function buildArgs(job) {
  return ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', ...buildFilterArgs(job)];
}

function parseTime(s) {
  const m = String(s).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

function runExport(job, onProgress) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), buildArgs(job));
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

module.exports = { ffmpegPath, parseProbe, probe, buildArgs, runExport };
