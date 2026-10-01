const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { probe, runExport } = require('./ffmpeg');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1000, minHeight: 640,
    title: 'RatioFill',
    backgroundColor: '#17181c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 개발용: RATIOFILL_OPEN=<영상경로> 자동 열기, RATIOFILL_SHOT=<png경로> 창 캡처 후 종료
  win.webContents.on('console-message', (ev) => { if (process.env.RATIOFILL_SHOT || process.env.RATIOFILL_DEBUG) console.log(`[renderer:${ev.level}] ${ev.message} (${String(ev.sourceId).split('/').pop()}:${ev.lineNumber})`); });
  win.webContents.on('did-finish-load', () => {
    if (process.env.RATIOFILL_OPEN) win.webContents.send('open-video', process.env.RATIOFILL_OPEN);
    if (process.env.RATIOFILL_PRESET) setTimeout(() => win.webContents.send('dev-preset', process.env.RATIOFILL_PRESET), 600);
    if (process.env.RATIOFILL_IMAGE) setTimeout(() => win.webContents.send('dev-image', process.env.RATIOFILL_IMAGE), 800);
    if (process.env.RATIOFILL_SHOT) {
      setTimeout(async () => {
        try { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.RATIOFILL_SHOT, img.toPNG()); } catch (e) { console.error('capture failed:', e.message); }
        app.quit();
      }, 3500);
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('pick-video', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: '영상', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mpg', 'mpeg'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('pick-output', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: [{ name: 'MP4', extensions: ['mp4'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('probe', (_e, file) => probe(file));

ipcMain.handle('export', (_e, job) =>
  runExport(job, (p) => { if (win && !win.isDestroyed()) win.webContents.send('export-progress', p); })
);

ipcMain.handle('cancel-export', () => {
  if (runExport.current) { try { runExport.current.kill('SIGKILL'); } catch (_) {} }
  return true;
});

// URL 의 이미지를 임시 폴더에 내려받아 경로를 돌려준다 (여백 이미지로 사용)
ipcMain.handle('fetch-image', async (_e, url) => {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`이미지를 받지 못했습니다 (HTTP ${res.status})`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error('이미지가 아닙니다: ' + (type || '알 수 없는 형식'));
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (type.split('/')[1] || 'png').split(';')[0].replace('jpeg', 'jpg');
  const dir = path.join(app.getPath('temp'), 'ratiofill');
  fs.mkdirSync(dir, { recursive: true });
  const name = (decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image').replace(/[^\w.-]/g, '_').replace(/\.[^.]+$/, '') || 'image')
    + '-' + crypto.createHash('md5').update(url).digest('hex').slice(0, 8) + '.' + ext;
  const file = path.join(dir, name);
  fs.writeFileSync(file, buf);
  return file;
});

ipcMain.handle('show-in-folder', (_e, p) => { shell.showItemInFolder(p); return true; });
