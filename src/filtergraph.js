/* ffmpeg 필터 그래프 생성 (순수 함수). 데스크톱(ffmpeg.js)과 웹(web/bridge.js)이 함께 쓴다.
 *
 * job: { input, output, outW, outH, bg, crf, preset,
 *        video: {x,y,w,h}, background: {image,fit,mode}, margins: [{x,y,w,h}] }
 *   input / output / image 는 파일 이름 (데스크톱은 실제 경로, 웹은 ffmpeg.wasm 가상 FS 이름)
 *
 * 미리보기(src/ui.js drawFitted)와 같은 맞춤 규칙을 쓴다.
 *   cover   : scale(increase) 후 중앙 crop
 *   contain : scale(decrease) 후 영역 중앙에 overlay
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
    const W = job.outW, H = job.outH;
    const margins = (job.margins || []).filter((m) => m.w > 0 && m.h > 0);
    const bg = job.background && job.background.image ? job.background : null;
    const mode = bg && bg.mode;
    const scaled = `[0:v]scale=${v.w}:${v.h}:flags=lanczos,setsar=1`;
    const fitImage = (source, label, w, h) => {
      let f;
      if (bg.fit === 'stretch') f = `scale=${w}:${h}`;
      else if (bg.fit === 'cover') f = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
      else f = `scale=${w}:${h}:force_original_aspect_ratio=decrease`;
      filters.push(`${source}${f},format=rgba[${label}]`);
    };
    if (bg && (mode !== 'margins' || margins.length)) {
      inputs.push('-i', bg.image);
      if (mode === 'margins') {
        filters.push(`${scaled},pad=${W}:${H}:${v.x}:${v.y}:color=${hexColor(job.bg)}[base0]`);
        if (margins.length > 1) filters.push(`[1:v]split=${margins.length}${margins.map((_, i) => `[source${i}]`).join('')}`);
        let cur = 'base0';
        margins.forEach((m, i) => {
          fitImage(margins.length > 1 ? `[source${i}]` : '[1:v]', `image${i}`, m.w, m.h);
          filters.push(`[${cur}][image${i}]overlay=x=${m.x}+(${m.w}-w)/2:y=${m.y}+(${m.h}-h)/2:format=auto[base${i + 1}]`);
          cur = `base${i + 1}`;
        });
        filters.push(`[${cur}]format=yuv420p[out]`);
      } else if (mode === 'overlay') {
        filters.push(`${scaled},pad=${W}:${H}:${v.x}:${v.y}:color=${hexColor(job.bg)}[videoBase]`);
        fitImage('[1:v]', 'banner', W, H);
        filters.push('[videoBase][banner]overlay=x=(W-w)/2:y=(H-h)/2:format=auto,format=yuv420p[out]');
      } else {
        filters.push(`${scaled},split[canvasVideo][foreground]`);
        filters.push(`[canvasVideo]pad=${W}:${H}:${v.x}:${v.y}:color=${hexColor(job.bg)}[canvas]`);
        fitImage('[1:v]', 'backgroundImage', W, H);
        filters.push('[canvas][backgroundImage]overlay=x=(W-w)/2:y=(H-h)/2:format=auto[background]');
        filters.push(`[background][foreground]overlay=x=${v.x}:y=${v.y}:shortest=1:format=auto,format=yuv420p[out]`);
      }
    } else {
      filters.push(`${scaled},pad=${W}:${H}:${v.x}:${v.y}:color=${hexColor(job.bg)},format=yuv420p[out]`);
    }
    return [
      ...inputs,
      '-filter_complex', filters.join(';'),
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', ['ultrafast', 'veryfast', 'fast', 'medium'].includes(job.preset) ? job.preset : 'veryfast', '-crf', String(job.crf || 18),
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      job.output,
    ];
  }

  return { hexColor, buildFilterArgs };
});
