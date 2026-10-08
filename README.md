# 프레임핏 (FrameFit)

영상의 출력 비율(16:9 / 9:16 / 1:1 / 4:5 …)을 바꾸고, 그때 생기는 여백에 이미지를 채워 MP4로 내보내는 도구.
광고 소재 하나를 여러 플랫폼 규격으로 변환하는 용도. 데스크톱 앱(Windows / macOS)과 웹 버전이 같은 코드를 쓴다.

| 쓰는 방법 | 어디서 | 비고 |
|---|---|---|
| 웹 버전 | https://hmwillow.github.io/ratiofill/ | 설치 없음. 변환은 브라우저 안에서만 일어나고 영상은 업로드되지 않음 |
| 데스크톱 앱 | https://github.com/HMwillow/ratiofill/releases | Windows `Setup.exe` / 포터블 `exe`, Mac `arm64.dmg`(Apple Silicon) / `.dmg`(Intel) |

## 사용법

1. 미리보기의 영상 영역 클릭(또는 영상 파일 끌어다 놓기) → 영상 선택
2. 출력 비율 프리셋 선택. 가로/세로 픽셀을 직접 입력해도 됨(임의 비율)
3. 영상 위치 슬라이더로 영상을 위/아래(또는 좌/우)로 이동 → 반대쪽에 여백이 생김
4. 배경 영역 클릭(또는 이미지 끌어다 놓기) → 이미지 한 장 선택. 배치(자동/여백/전체 화면/영상 위)와 맞춤(안에 맞추기/꽉 채우기/늘리기) 조정. 자동 배치는 PNG에서 가장 큰 직사각형 투명 영역을 찾아 영상을 그 안에 맞추고, 영상 비율이 다르면 중앙을 잘라 채운다. 위치나 크기를 직접 조절하면 수동 배치로 전환되며 `투명 영역에 다시 맞추기`로 복원할 수 있다. 투명 영역이 없는 배너는 기존 수동 배치를 사용한다.
   - 이미지 URL 을 붙여넣고 `가져오기` 를 눌러도 된다 (웹 버전은 그 서버가 CORS 를 허용해야 함)
5. `MP4로 내보내기` → 저장 위치 선택 → 진행률 표시 → 완료 시 Finder/탐색기에서 파일 표시 (웹은 바로 내려받기)

출력: H.264(libx264, CRF 16/18/23 선택) + AAC 192k, `+faststart`. 원본 해상도·fps·오디오 유지.

웹 버전 한계: 브라우저 안에서 ffmpeg.wasm 으로 인코딩하므로 데스크톱보다 느리고(1080p 10초 영상 기준 수십 초), 긴 영상·4K 는 메모리 한계로 어렵다. Chrome / Edge 권장.

## 개발

```bash
npm install        # electron, electron-builder, ffmpeg-static(현재 OS 바이너리), ffmpeg.wasm
npm start          # 데스크톱 앱 실행
npm run web        # 웹 버전 빌드(dist-web/) + http://localhost:8080 에서 띄우기
npm test           # 레이아웃 단위 테스트 (node:test)
npm run test:ffmpeg -- <영상> <이미지> [출력.mp4]   # 실제 ffmpeg 로 필터 그래프 검증
npx electron test/web-smoke.js http://127.0.0.1:8080/   # 웹 번들 스모크 테스트 (dist-web/_test/sample.mp4·png 필요)
```

### 개발용 환경변수

| 변수 | 효과 |
|---|---|
| `RATIOFILL_OPEN=<영상경로>` | 실행 직후 영상 자동 열기 |
| `RATIOFILL_IMAGE=<이미지경로>` | 첫 여백(a)에 이미지 자동 지정 |
| `RATIOFILL_SHOT=<png경로>` | 3.5초 뒤 창을 캡처해 저장하고 종료 (UI 확인용) |
| `RATIOFILL_DEBUG=1` | 렌더러 콘솔을 터미널에 출력 |
| `RATIOFILL_FFMPEG=<경로>` | ffmpeg-static 대신 쓸 ffmpeg (테스트 스크립트용) |

예: `RATIOFILL_OPEN=~/a.mp4 RATIOFILL_IMAGE=~/b.png RATIOFILL_SHOT=/tmp/ui.png npm start`

## 배포

### 한 번에 (권장)

```bash
npm run release -- "무엇을 바꿨는지"        # 커밋 → 버전 올림(1.0.0→1.0.1) → push → Actions 완료까지 대기 → 링크 출력
npm run release -- "설명" --minor            # 1.0.0 → 1.1.0
npm run release -- --local                   # 추가로 이 PC 에서 빌드해 release/v<버전>/ 에 설치 파일 4개 + 웹 zip + 소스 zip
npm run release -- --dry-run                 # 실행할 단계만 확인
```

push 가 끝나면 GitHub Actions 가 Windows exe 2개·Mac dmg 2개를 Releases 에 올리고 웹을 GitHub Pages 에 배포한다(10~15분). 스크립트는 그동안 진행 상황을 보여 주고 끝나면 다운로드 링크를 출력한다. 변경 사항이 없으면 설명 없이 `npm run release` 만 실행해도 된다.

### 자동 (GitHub Actions 세부)

- **웹**: `main` 에 push 하면 `.github/workflows/pages.yml` 이 `dist-web` 을 만들어 GitHub Pages 에 올린다. 몇 분 뒤 https://hmwillow.github.io/ratiofill/ 에 반영.
- **설치 파일**: 버전 태그를 push 하면 `.github/workflows/release.yml` 이 Windows(x64)·Mac(arm64, x64) 빌드를 만들어 Releases 에 올린다. (`npm run release` 가 하는 일이 바로 이것)

### 수동 (코드를 받아 내 PC 에서 바로 재설치)

```bash
git clone https://github.com/HMwillow/ratiofill.git && cd ratiofill
./scripts/update-and-build.sh        # Mac: pull → install → test → 빌드 → /Applications 설치 → 실행
scripts\update-and-build.cmd         # Windows: pull → install → test → 빌드 → Setup.exe 실행
```

사전 준비는 git 과 Node.js LTS 뿐이다. 이후 코드를 고친 뒤 같은 스크립트를 다시 실행하면 재설치된다.

### Mac 한 대에서 모든 설치 파일 만들기

```bash
npm run ffmpeg:win   # Windows용 ffmpeg.exe 추가 다운로드 (최초 1회)
npm run dist:all     # dist/ 에 mac(dmg, zip: arm64 + x64) 과 win(설치형 Setup.exe + 포터블 exe, x64)
npm run dist:mac     # mac 만
npm run dist:win     # win 만
```

- `ffmpeg-static` 은 `npm install` 시 현재 OS 바이너리만 받는다. Windows 빌드 전에 `npm run ffmpeg:win` 을 한 번 실행하면 `ffmpeg.exe` 가 추가된다. 패키지에는 OS별로 필요한 바이너리만 들어간다(`package.json` → `build.mac.files` / `build.win.files`).
- ffmpeg 는 asar 밖(`app.asar.unpacked`)에 풀려야 실행된다 → `build.asarUnpack`. 경로 치환은 `ffmpeg.js` 의 `ffmpegPath()`.
- 코드 서명·공증 없이 빌드하면 macOS 는 첫 실행 시 우클릭 → 열기, Windows 는 SmartScreen 경고에서 "추가 정보 → 실행" 이 필요하다.
- 앱 아이콘: `build/icon.icns`(mac), `build/icon.ico`(win) 를 두면 electron-builder 가 자동 사용.

## 구조

```
src/                  공용 (데스크톱·웹 둘 다 그대로 씀)
  index.html          마크업, CSP. layout.js → filtergraph.js → bridge.js → ui.js 순서로 로드
  ui.js               UI 상태, 캔버스 미리보기, 배너 배치, 클릭/드롭, 내보내기 흐름. 플랫폼 일은 RatioFillBridge 에 위임
  layout.js           레이아웃 계산 순수 함수. 영상 배치·여백 영역 산출
  filtergraph.js      ffmpeg 필터 그래프 생성 순수 함수
  style.css
  bridge.js           데스크톱 브리지 (window.api → RatioFillBridge)
web/
  bridge.js           웹 브리지 (ffmpeg.wasm, File 객체, 내려받기). 빌드 시 src/bridge.js 자리에 들어감
  coi-serviceworker.js  멀티스레드 실험용(?mt=1) COOP/COEP 우회 서비스워커
main.js               Electron main: 창, 파일 대화상자, ffmpeg 실행·URL 이미지 다운로드 IPC, 개발용 env 훅
preload.js            렌더러에 노출하는 API (contextBridge)
ffmpeg.js             데스크톱 ffmpeg 실행: 경로 해석, probe, runExport(진행률)
scripts/
  build-web.js        dist-web/ 조립 (src 공용 파일 + web/bridge.js + node_modules 의 ffmpeg.wasm)
  serve-web.js        dist-web 로컬 서버
  update-and-build.*  코드 받아 재빌드·재설치 (Mac .sh / Windows .ps1 + .cmd)
  release.js          한 번에 배포: 커밋 → 버전 → push → Actions(설치 파일+웹) 완료 대기 → 링크 출력 (--local 로 로컬 빌드 묶음)
test/
  layout.test.js      레이아웃 단위 테스트
  filter.test.js      실제 ffmpeg 로 내보내기 검증 (수동)
  web-smoke.js        Electron 으로 웹 번들을 열어 드롭→변환까지 검증 (수동)
.github/workflows/
  pages.yml           main push → GitHub Pages 배포
  release.yml         v* 태그 → Win/Mac 설치 파일 빌드 → Releases 업로드
```

### 데이터 흐름

```
ui.js state {video, outW, outH, pos, videoScale, bg, background}
   → layout.computeLayout()  → {video:{x,y,w,h}, margins:[{key,x,y,w,h}]}
   → (미리보기) canvas 에 동일 규칙으로 그림
   → (내보내기) job = {input, output, outW, outH, bg, crf, video, background, margins}
   → bridge.export(job)
        데스크톱: IPC → ffmpeg.js → filtergraph.buildFilterArgs → spawn ffmpeg → '-progress pipe:1'
        웹:       파일을 ffmpeg.wasm 가상 FS 에 쓰고 같은 인자로 exec → 결과 blob 내려받기
```

브리지 계약(`RatioFillBridge`)은 `src/ui.js` 머리말에 적혀 있다. 새 플랫폼(예: Tauri)은 이 계약만 구현하면 된다.

미리보기(`ui.js drawFitted`)와 ffmpeg 필터(`filtergraph.js`)는 같은 규칙을 각각 구현한다. 맞춤/정렬 규칙을 바꾸면 **두 곳을 같이** 고쳐야 한다.

- `cover`   : `scale=W:H:force_original_aspect_ratio=increase, crop=W:H:(iw-ow)*ax:(ih-oh)*ay`
- `contain` : `scale=W:H:force_original_aspect_ratio=decrease` 후 overlay 위치 `x+(W-w)*ax`
- `stretch` : `scale=W:H`

### 확장 포인트

- **비율 프리셋 추가**: `src/layout.js` 의 `PRESETS` 에 `{label, w, h}` 추가. UI 버튼은 자동 생성(`.presets` 는 6열 그리드이므로 7개 이상이면 `style.css` 의 `grid-template-columns` 조정).
- **여백 맞춤 모드 추가**: `ui.js` `drawFitted` + `filtergraph.js` 양쪽에 분기 추가, `buildMarginPanels` 의 `<select data-field="fit">` 에 옵션 추가.
- **인코딩 옵션(코덱·비트레이트·해상도 상한)**: `filtergraph.js` 의 출력 인자. 화질 선택 UI 는 `index.html` 의 `#crf`. 웹은 `?preset=` 로 x264 preset 을 바꿔 볼 수 있다.
- **영상 크기 축소(여백 4면)**: 현재는 영상이 한 축을 꽉 채운다. 축소를 허용하려면 `computeLayout` 에 scale 을 넣고 여백을 최대 4개(또는 위·아래·좌·우 통합 1개)로 산출하도록 바꾼다.
- **여러 비율 일괄 내보내기**: `ui.js` 의 내보내기 핸들러를 프리셋 배열 순회로 바꾸고, 여백 이미지 상태를 비율별로 분리 저장.
- **웹 멀티스레드**: `@ffmpeg/core-mt` 는 인코딩 중 멈추는 문제가 있어 기본 꺼짐. `?mt=1` + COOP/COEP(또는 coi-serviceworker) 로 실험 가능. 되면 `web/bridge.js` 의 `WANT_MT` 기본값만 바꾸면 된다.

### 주의한 점

- `<video>` 를 `display:none` 으로 숨기면 Chromium 이 프레임을 그리지 않아 캔버스가 검게 나온다 → 화면 밖(`position:fixed; left:-10000px`)으로 배치.
- contextBridge 로 노출한 `api` 는 전역 식별자가 되므로 최상위에서 `const api` 로 다시 선언하면 SyntaxError → IIFE 안에서 받는다.
- 사용자 Chrome 에서 로컬 서버(localhost) 접속이 막힌 환경이 있어, 웹 스모크 테스트는 Electron 내장 Chromium 으로 돌린다(`test/web-smoke.js`).
- 샌드박스 preload 에서는 `url.pathToFileURL` 이 없어 `toFileUrl` 을 직접 구현(Windows 드라이브 경로 포함).
- yuv420p 출력은 모든 치수가 짝수여야 한다 → `layout.even()`.
