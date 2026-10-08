/* 레이아웃 계산 (순수 함수). 렌더러(브라우저)와 Node 테스트가 함께 쓴다.
 *
 * 입력: { video: {width,height} | null, outW, outH, pos(0..1) }
 * 출력: { outW, outH, axis: 'v'|'h'|null, video: {x,y,w,h}|null,
 *         margins: [{ key:'a'|'b', name, x, y, w, h }] }
 *   - axis 'v' : 영상이 가로를 꽉 채우고 위/아래(a/b)에 여백
 *   - axis 'h' : 영상이 세로를 꽉 채우고 왼쪽/오른쪽(a/b)에 여백
 *   - 모든 치수는 짝수(yuv420p 인코딩 요구)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RatioFillLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PRESETS = [
    { label: '16:9', w: 1920, h: 1080 },
    { label: '9:16', w: 1080, h: 1920 },
    { label: '1:1', w: 1080, h: 1080 },
    { label: '4:5', w: 1080, h: 1350 },
    { label: '4:3', w: 1440, h: 1080 },
    { label: '3:4', w: 1080, h: 1440 },
  ];

  function even(n) { return Math.max(2, Math.round(n / 2) * 2); }

  // Return the largest fully transparent rectangle in a sampled RGBA image.
  function findTransparentRect(rgba, width, height) {
    const heights = new Int32Array(width);
    let best = null, bestArea = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        heights[x] = rgba[(y * width + x) * 4 + 3] < 32 ? heights[x] + 1 : 0;
      }
      const stack = [];
      for (let x = 0; x <= width; x++) {
        const current = x === width ? 0 : heights[x];
        while (stack.length && heights[stack[stack.length - 1]] > current) {
          const h = heights[stack.pop()];
          const left = stack.length ? stack[stack.length - 1] + 1 : 0;
          const w = x - left;
          const area = w * h;
          if (area > bestArea) { bestArea = area; best = { x: left, y: y - h + 1, w, h }; }
        }
        stack.push(x);
      }
    }
    if (!best || bestArea < width * height * 0.03 || best.w < width * 0.08 || best.h < height * 0.08) return null;
    return { x: best.x / width, y: best.y / height, w: best.w / width, h: best.h / height };
  }

  // Map a normalized image rectangle into the canvas using the same fit rule as drawFitted.
  function mapImageRect(slot, imageW, imageH, outW, outH, fit) {
    if (!slot || !imageW || !imageH) return null;
    let drawW = outW, drawH = outH;
    if (fit !== 'stretch') {
      const scale = fit === 'cover' ? Math.max(outW / imageW, outH / imageH) : Math.min(outW / imageW, outH / imageH);
      drawW = imageW * scale; drawH = imageH * scale;
    }
    const left = Math.max(0, (outW - drawW) / 2 + slot.x * drawW);
    const top = Math.max(0, (outH - drawH) / 2 + slot.y * drawH);
    const right = Math.min(outW, (outW - drawW) / 2 + (slot.x + slot.w) * drawW);
    const bottom = Math.min(outH, (outH - drawH) / 2 + (slot.y + slot.h) * drawH);
    const x = Math.round(left / 2) * 2, y = Math.round(top / 2) * 2;
    const w = Math.round((right - x) / 2) * 2, h = Math.round((bottom - y) / 2) * 2;
    return w >= 16 && h >= 16 ? { x, y, w, h } : null;
  }

  function computeLayout({ video, outW, outH, pos, videoScale = 1, slot = null }) {
    outW = even(outW); outH = even(outH);
    pos = Math.min(1, Math.max(0, +pos || 0));
    const L = { outW, outH, axis: null, video: null, margins: [] };
    if (!video || !video.width || !video.height) return L;
    if (slot) {
      const x = Math.max(0, Math.round(slot.x / 2) * 2), y = Math.max(0, Math.round(slot.y / 2) * 2);
      const w = Math.min(outW - x, even(slot.w)), h = Math.min(outH - y, even(slot.h));
      if (w >= 16 && h >= 16) {
        L.video = { x, y, w, h, crop: true };
        return L;
      }
    }
    const outA = outW / outH, vidA = video.width / video.height;
    let w, h, x, y;
    if (vidA >= outA) {
      w = outW; h = Math.min(outH, even(outW / vidA)); x = 0;
      y = Math.round((outH - h) * pos); L.axis = 'v';
    } else {
      h = outH; w = Math.min(outW, even(outH * vidA)); y = 0;
      x = Math.round((outW - w) * pos); L.axis = 'h';
    }
    videoScale = Math.min(1, Math.max(0.3, +videoScale || 1));
    if (videoScale < 1) {
      w = even(w * videoScale); h = even(h * videoScale);
      if (L.axis === 'v') {
        x = Math.round((outW - w) / 2);
        y = Math.round((outH - h) * pos);
      } else {
        x = Math.round((outW - w) * pos);
        y = Math.round((outH - h) / 2);
      }
      L.video = { x, y, w, h };
      const push = (key, name, x, y, w, h) => { if (w >= 2 && h >= 2) L.margins.push({ key, name, x, y, w, h }); };
      push('top', '위쪽 여백', 0, 0, outW, y);
      push('bottom', '아래쪽 여백', 0, y + h, outW, outH - y - h);
      push('left', '왼쪽 여백', 0, y, x, h);
      push('right', '오른쪽 여백', x + w, y, outW - x - w, h);
      return L;
    }
    L.video = { x, y, w, h };
    if (L.axis === 'v') {
      if (y >= 2) L.margins.push({ key: 'a', name: '위쪽 여백', x: 0, y: 0, w: outW, h: y });
      if (outH - (y + h) >= 2) L.margins.push({ key: 'b', name: '아래쪽 여백', x: 0, y: y + h, w: outW, h: outH - (y + h) });
    } else {
      if (x >= 2) L.margins.push({ key: 'a', name: '왼쪽 여백', x: 0, y: 0, w: x, h: outH });
      if (outW - (x + w) >= 2) L.margins.push({ key: 'b', name: '오른쪽 여백', x: x + w, y: 0, w: outW - (x + w), h: outH });
    }
    return L;
  }

  function ratioText(w, h) {
    const g = (a, b) => (b ? g(b, a % b) : a);
    const d = g(w, h);
    return `${w / d}:${h / d}`;
  }

  // 화면과 비율이 같은 배너는 전체 배경으로, 다른 비율은 보이는 여백에 배치한다.
  function backgroundMode(mode, outW, outH, imageW, imageH, pos, transparentCenter) {
    if (mode === 'canvas' || mode === 'margins' || mode === 'overlay') return mode;
    if (transparentCenter) return 'overlay';
    if (!imageW || !imageH) return 'margins';
    const outputRatio = outW / outH;
    const imageRatio = imageW / imageH;
    const landscapeBanner = Math.abs(outputRatio - 16 / 9) / (16 / 9) <= 0.03;
    return landscapeBanner && pos === 0.5 && Math.abs(imageRatio - outputRatio) / outputRatio <= 0.03
      ? 'canvas' : 'margins';
  }

  return { PRESETS, even, computeLayout, ratioText, backgroundMode, findTransparentRect, mapImageRect };
});
