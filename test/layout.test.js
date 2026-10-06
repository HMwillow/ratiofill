// 레이아웃 계산 단위 테스트: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout, ratioText, backgroundMode, PRESETS } = require('../src/layout');

test('9:16 영상 → 1:1 출력: 좌우 여백, 가운데 정렬', () => {
  const L = computeLayout({ video: { width: 1080, height: 1920 }, outW: 1080, outH: 1080, pos: 0.5 });
  assert.equal(L.axis, 'h');
  assert.deepEqual(L.video, { x: 236, y: 0, w: 608, h: 1080 });
  assert.equal(L.margins.length, 2);
  assert.deepEqual(L.margins.map((m) => m.key), ['a', 'b']);
  assert.equal(L.margins[0].w + L.video.w + L.margins[1].w, 1080);
});

test('9:16 영상 → 16:9 출력, 오른쪽 끝: 왼쪽 여백 하나', () => {
  const L = computeLayout({ video: { width: 1080, height: 1920 }, outW: 1920, outH: 1080, pos: 1 });
  assert.equal(L.video.x + L.video.w, 1920);
  assert.equal(L.margins.length, 1);
  assert.equal(L.margins[0].name, '왼쪽 여백');
  assert.equal(L.margins[0].w, 1312);
});

test('16:9 영상 → 9:16 출력, 위쪽 끝: 아래 여백 하나', () => {
  const L = computeLayout({ video: { width: 1920, height: 1080 }, outW: 1080, outH: 1920, pos: 0 });
  assert.equal(L.axis, 'v');
  assert.deepEqual(L.video, { x: 0, y: 0, w: 1080, h: 608 });
  assert.equal(L.margins.length, 1);
  assert.equal(L.margins[0].key, 'b');
  assert.equal(L.margins[0].h, 1920 - 608);
});

test('비율이 같으면 여백 없음', () => {
  const L = computeLayout({ video: { width: 1920, height: 1080 }, outW: 1280, outH: 720, pos: 0.5 });
  assert.equal(L.margins.length, 0);
  assert.deepEqual(L.video, { x: 0, y: 0, w: 1280, h: 720 });
});

test('홀수 출력 치수는 짝수로 보정', () => {
  const L = computeLayout({ video: { width: 1080, height: 1920 }, outW: 1081, outH: 1081, pos: 0.5 });
  assert.equal(L.outW % 2, 0); assert.equal(L.outH % 2, 0);
  assert.equal(L.video.w % 2, 0); assert.equal(L.video.h % 2, 0);
});

test('영상 없으면 빈 레이아웃', () => {
  const L = computeLayout({ video: null, outW: 1080, outH: 1080, pos: 0.5 });
  assert.equal(L.video, null); assert.equal(L.margins.length, 0);
});

test('ratioText / PRESETS', () => {
  assert.equal(ratioText(1920, 1080), '16:9');
  assert.equal(ratioText(1080, 1350), '4:5');
  assert.ok(PRESETS.length >= 6);
});

test('배너 비율에 따라 전체 배경 또는 보이는 여백을 선택', () => {
  assert.equal(backgroundMode('auto', 1920, 1080, 3840, 2160, 0.5), 'canvas');
  assert.equal(backgroundMode('auto', 1920, 1080, 3840, 2160, 0), 'margins');
  assert.equal(backgroundMode('auto', 1920, 1080, 3840, 2160, 1), 'margins');
  assert.equal(backgroundMode('auto', 1080, 1080, 1080, 1920, 0.5), 'margins');
  assert.equal(backgroundMode('auto', 1080, 1080, 1080, 1080, 0.5), 'margins');
  assert.equal(backgroundMode('auto', 1080, 1920, 1080, 1920, 0.5, true), 'overlay');
  assert.equal(backgroundMode('auto', 1920, 1080, 1920, 1080, 0.5, true), 'overlay');
  assert.equal(backgroundMode('margins', 1080, 1920, 1080, 1920, 0.5, true), 'margins');
  assert.equal(backgroundMode('margins', 1920, 1080, 3840, 2160), 'margins');
});

test('같은 비율의 영상도 크기를 줄여 배너가 보일 공간을 만든다', () => {
  const L = computeLayout({ video: { width: 1080, height: 1920 }, outW: 1080, outH: 1920, pos: 0.5, videoScale: 0.62 });
  assert.ok(L.video.w < L.outW && L.video.h < L.outH);
  assert.ok(L.margins.length >= 2);
  assert.equal(L.video.x + L.video.w / 2, L.outW / 2);
  assert.equal(L.video.y + L.video.h / 2, L.outH / 2);
});
