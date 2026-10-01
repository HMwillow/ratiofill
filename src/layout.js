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

  function computeLayout({ video, outW, outH, pos }) {
    outW = even(outW); outH = even(outH);
    pos = Math.min(1, Math.max(0, +pos || 0));
    const L = { outW, outH, axis: null, video: null, margins: [] };
    if (!video || !video.width || !video.height) return L;
    const outA = outW / outH, vidA = video.width / video.height;
    let w, h, x, y;
    if (vidA >= outA) {
      w = outW; h = Math.min(outH, even(outW / vidA)); x = 0;
      y = Math.round((outH - h) * pos); L.axis = 'v';
    } else {
      h = outH; w = Math.min(outW, even(outH * vidA)); y = 0;
      x = Math.round((outW - w) * pos); L.axis = 'h';
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

  return { PRESETS, even, computeLayout, ratioText };
});
