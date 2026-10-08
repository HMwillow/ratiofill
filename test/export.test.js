const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArgs } = require('../ffmpeg');

const base = {
  input: 'video.mp4', output: 'output.mp4', outW: 1920, outH: 1080,
  bg: '#000000', crf: 18, video: { x: 656, y: 0, w: 608, h: 1080 },
};

test('one banner covers the full canvas behind a centered video', () => {
  const args = buildArgs({ ...base, background: { image: 'banner.png', fit: 'contain' } });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.deepEqual(args.filter((x) => x === '-i').length, 2);
  assert.match(filter, /\[1:v\]scale=1920:1080:force_original_aspect_ratio=decrease/);
  assert.match(filter, /\[canvas\]\[backgroundImage\]overlay=x=\(W-w\)\/2:y=\(H-h\)\/2/);
  assert.match(filter, /\[background\]\[foreground\]overlay=x=656:y=0:shortest=1/);
});

test('cover is opt-in and crops to the full output dimensions', () => {
  const args = buildArgs({ ...base, background: { image: 'banner.png', fit: 'cover' } });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /force_original_aspect_ratio=increase,crop=1920:1080/);
});

test('plain color still works without an image', () => {
  const args = buildArgs({ ...base, background: null });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.deepEqual(args.filter((x) => x === '-i').length, 1);
  assert.match(filter, /pad=1920:1080:656:0:color=0x000000/);
});

test('fast encoding is the default and can be changed', () => {
  const defaultArgs = buildArgs({ ...base, background: null });
  const mediumArgs = buildArgs({ ...base, background: null, preset: 'medium' });
  assert.equal(defaultArgs[defaultArgs.indexOf('-preset') + 1], 'veryfast');
  assert.equal(mediumArgs[mediumArgs.indexOf('-preset') + 1], 'medium');
});

test('image moves into the visible side as the video moves', () => {
  const left = buildArgs({
    ...base, outW: 1080, outH: 1080, video: { x: 0, y: 0, w: 608, h: 1080 },
    margins: [{ x: 608, y: 0, w: 472, h: 1080 }],
    background: { image: 'portrait.png', fit: 'contain', mode: 'margins' },
  });
  const right = buildArgs({
    ...base, outW: 1080, outH: 1080, video: { x: 472, y: 0, w: 608, h: 1080 },
    margins: [{ x: 0, y: 0, w: 472, h: 1080 }],
    background: { image: 'portrait.png', fit: 'contain', mode: 'margins' },
  });
  const leftFilter = left[left.indexOf('-filter_complex') + 1];
  const rightFilter = right[right.indexOf('-filter_complex') + 1];
  assert.match(leftFilter, /overlay=x=608\+\(472-w\)\/2:y=0\+\(1080-h\)\/2/);
  assert.match(rightFilter, /overlay=x=0\+\(472-w\)\/2:y=0\+\(1080-h\)\/2/);
  assert.match(leftFilter, /scale=472:1080:force_original_aspect_ratio=decrease/);
});

test('one image feeds both margins when video is centered', () => {
  const args = buildArgs({
    ...base, outW: 1080, outH: 1080, video: { x: 236, y: 0, w: 608, h: 1080 },
    margins: [
      { x: 0, y: 0, w: 236, h: 1080 },
      { x: 844, y: 0, w: 236, h: 1080 },
    ],
    background: { image: 'portrait.png', fit: 'contain', mode: 'margins' },
  });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.equal(args.filter((x) => x === '-i').length, 2);
  assert.match(filter, /\[1:v\]split=2\[source0\]\[source1\]/);
  assert.match(filter, /overlay=x=0\+\(236-w\)\/2/);
  assert.match(filter, /overlay=x=844\+\(236-w\)\/2/);
});

test('transparent banner overlays a same-ratio video', () => {
  const args = buildArgs({
    ...base, outW: 1080, outH: 1920, video: { x: 0, y: 0, w: 1080, h: 1920 },
    margins: [],
    background: { image: 'banner.png', fit: 'contain', mode: 'overlay' },
  });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /\[0:v\]scale=1080:1920:flags=lanczos,setsar=1,pad=1080:1920:0:0/);
  assert.match(filter, /\[1:v\]scale=1080:1920:force_original_aspect_ratio=decrease,format=rgba\[banner\]/);
  assert.match(filter, /\[videoBase\]\[banner\]overlay=x=\(W-w\)\/2:y=\(H-h\)\/2/);
});

test('transparent PNG slot crops a wide video to its tall opening', () => {
  const args = buildArgs({ ...base, video: { x: 690, y: 60, w: 540, h: 960, crop: true },
    background: { image: 'banner.png', fit: 'contain', mode: 'overlay' }, margins: [] });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /scale=540:960:force_original_aspect_ratio=increase:flags=lanczos,crop=540:960,setsar=1/);
  assert.match(filter, /pad=1920:1080:690:60/);
});
