/* 데스크톱(Electron) 브리지: preload 가 노출한 window.api 를 src/ui.js 계약(RatioFillBridge)으로 감싼다.
 * 웹 버전은 web/bridge.js 가 같은 계약을 구현한다. 계약 정의는 src/ui.js 머리말 참고. */
(function () {
  const api = window.api;
  const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mpg', 'mpeg'];
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];
  const ext = (p) => String(p).split('.').pop().toLowerCase();

  let progressCb = null;
  api.onProgress((d) => { if (progressCb) progressCb(d); });

  window.RatioFillBridge = {
    pickVideo: () => api.pickVideo(),
    pickImage: () => api.pickImage(),
    pickOutput: (name) => api.pickOutput(name),
    probe: (p) => api.probe(p),
    export: (job, onProgress) => {
      progressCb = onProgress;
      return api.export(job).finally(() => { progressCb = null; });
    },
    cancelExport: () => api.cancelExport(),
    imageFromUrl: (url) => api.imageFromUrl(url),
    afterExport: (out) => api.showInFolder(out),
    toFileUrl: (p) => api.toFileUrl(p),
    displayName: (p) => String(p).split(/[\\/]/).pop(),
    handleFromDrop: (f) => api.pathForFile(f),
    kindOf: (p) => (VIDEO_EXT.includes(ext(p)) ? 'video' : IMAGE_EXT.includes(ext(p)) ? 'image' : null),
    onOpenVideo: (cb) => api.onOpenVideo(cb),
    onDevImage: (cb) => api.onDevImage(cb),
    labels: { export: 'MP4로 내보내기' },
  };
})();
