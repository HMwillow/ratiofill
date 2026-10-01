/* ffmpeg 필터 그래프 생성 (순수 함수). 데스크톱(ffmpeg.js)과 웹(web/bridge.js)이 함께 쓴다.
 *
 * job: { input, output, outW, outH, bg, crf, preset,
 *        video: {x,y,w,h},
 *        margins: [{ image, x, y, w, h, fit:'cover'|'contain'|'stretch', ax:0|.5|1, ay:0|.5|1 }] }
 *   input / output / image 는 파일 이름 (데스크톱은 실제 경로, 웹은 ffmpeg.wasm 가상 FS 이름)
 *
 * 미리보기(src/ui.js drawFitted)와 같은 규칙이어야 한다. 맞춤/정렬 규칙을 바꾸면 두 곳을 같이 고친다.
 *   cover   : scale(increase) 후 crop, 잘리는 위치는 ax/ay
 *   contain : scale(decrease) 후 여백 안에서 ax/ay 위치에 overlay
 *   stretch : 여백 크기로 scale
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RatioFillFilter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function hexColor(c) { return '0x' + String(c).replace('#', '').slice(0, 6); }

  function buildFilterArgs(job) {
    const v = job.video;
    const inputs = ['-i', job.input];
    const filters = [];
    filters.push(
      `[0:v]scale=${v.w}:${v.h}:flags=lanczos,setsar=1,` +
      `pad=${job.outW}:${job.outH}:${v.x}:${v.y}:color=${hexColor(job.bg)}[base0]`
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
      filters.push(f + `,format=rgba[${label}]`);
      filters.push(
        `[${cur}][${label}]overlay=x=${m.x}+(${m.w}-w)*${ax}:y=${m.y}+(${m.h}-h)*${ay}:format=auto[o${idx}]`
      );
      cur = `o${idx}`;
      idx++;
    }
    filters.push(`[${cur}]format=yuv420p[out]`);
    return [
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', job.preset || 'medium', '-crf', String(job.crf || 18),
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      job.output,
    ];
  }

  return { hexColor, buildFilterArgs };
});
