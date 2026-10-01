# RatioFill

영상의 출력 비율(16:9 / 9:16 / 1:1 / 4:5 …)을 바꾸고, 그때 생기는 여백에 이미지를 채워 MP4로 내보내는 데스크톱 앱 (Windows / macOS).
광고 소재 하나를 여러 플랫폼 규격으로 변환하는 용도.

## 사용법

1. 미리보기의 영상 영역 클릭(또는 영상 파일 끌어다 놓기) → 영상 선택
2. 출력 비율 프리셋 선택. 가로/세로 픽셀을 직접 입력해도 됨(임의 비율)
3. 영상 위치 슬라이더로 영상을 위/아래(또는 좌/우)로 이동 → 반대쪽에 여백이 생김
4. 여백 클릭(또는 이미지 끌어다 놓기) → 이미지 선택, 맞춤(꽉 채우기 / 안에 맞추기 / 늘리기)과 정렬(3×3) 조정
5. `MP4로 내보내기` → 저장 위치 선택 → 진행률 표시 → 완료 시 Finder/탐색기에서 파일 표시

출력: H.264(libx264, CRF 16/18/23 선택) + AAC 192k, `+faststart`. 원본 해상도·fps·오디오 유지.

## 개발

```bash
npm install        # electron, electron-builder, ffmpeg-static(현재 OS 바이너리)
npm start          # 앱 실행
npm test           # 레이아웃 단위 테스트 (node:test)
npm run test:ffmpeg -- <영상> <이미지> [출력.mp4]   # 실제 ffmpeg 로 필터 그래프 검증
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

## 배포 빌드 (Mac 한 대에서 둘 다 가능)

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
main.js            Electron main: 창 생성, 파일 대화상자, ffmpeg 실행 IPC, 개발용 env 훅
preload.js         렌더러에 노출하는 API (contextBridge) — IPC 호출, 파일 경로→URL
ffmpeg.js          ffmpeg 경로 해석, probe(영상 정보), buildArgs(필터 그래프), runExport(진행률)
src/layout.js      레이아웃 계산 순수 함수 (브라우저/Node 공용). 영상 배치·여백 영역 산출
src/renderer.js    UI 상태, 캔버스 미리보기, 여백 패널, 클릭/드롭, 내보내기 흐름
src/index.html     마크업, CSP
src/style.css      스타일
test/layout.test.js   레이아웃 단위 테스트
test/filter.test.js   실제 ffmpeg 로 내보내기 검증 (수동)
```

### 데이터 흐름

```
renderer state {video, outW, outH, pos, bg, margins{a,b}}
   → layout.computeLayout()  → {video:{x,y,w,h}, margins:[{key,x,y,w,h}]}
   → (미리보기) canvas 에 동일 규칙으로 그림
   → (내보내기) job = {input, output, outW, outH, bg, crf, video, margins[+image,fit,ax,ay]}
   → IPC 'export' → ffmpeg.buildArgs(job) → spawn ffmpeg → '-progress pipe:1' 로 진행률
```

미리보기(`drawFitted`)와 ffmpeg 필터(`buildArgs`)는 같은 규칙을 각각 구현한다. 맞춤/정렬 규칙을 바꾸면 **두 곳을 같이** 고쳐야 한다.

- `cover`   : `scale=W:H:force_original_aspect_ratio=increase, crop=W:H:(iw-ow)*ax:(ih-oh)*ay`
- `contain` : `scale=W:H:force_original_aspect_ratio=decrease` 후 overlay 위치 `x+(W-w)*ax`
- `stretch` : `scale=W:H`

### 확장 포인트

- **비율 프리셋 추가**: `src/layout.js` 의 `PRESETS` 에 `{label, w, h}` 추가. UI 버튼은 자동 생성(`.presets` 는 6열 그리드이므로 7개 이상이면 `style.css` 의 `grid-template-columns` 조정).
- **여백 맞춤 모드 추가**: `renderer.js` `drawFitted` + `ffmpeg.js` `buildArgs` 양쪽에 분기 추가, `buildMarginPanels` 의 `<select data-field="fit">` 에 옵션 추가.
- **인코딩 옵션(코덱·비트레이트·해상도 상한)**: `ffmpeg.js` `buildArgs` 의 출력 인자. 화질 선택 UI 는 `index.html` 의 `#crf`.
- **영상 크기 축소(여백 4면)**: 현재는 영상이 한 축을 꽉 채운다. 축소를 허용하려면 `computeLayout` 에 scale 을 넣고 여백을 최대 4개(또는 위·아래·좌·우 통합 1개)로 산출하도록 바꾼다.
- **여러 비율 일괄 내보내기**: `renderer.js` 의 내보내기 핸들러를 프리셋 배열 순회로 바꾸고, 여백 이미지 상태를 비율별로 분리 저장.
- **웹 버전**: `src/layout.js` 와 미리보기 그리기는 브라우저 코드 그대로 재사용 가능. 인코딩만 ffmpeg.wasm 또는 WebCodecs 로 대체하면 정적 호스팅으로 동작.

### 주의한 점

- `<video>` 를 `display:none` 으로 숨기면 Chromium 이 프레임을 그리지 않아 캔버스가 검게 나온다 → 화면 밖(`position:fixed; left:-10000px`)으로 배치.
- contextBridge 로 노출한 `api` 는 전역 식별자가 되므로 렌더러에서 `const api` 로 다시 선언하면 SyntaxError → `bridge` 로 받는다.
- 샌드박스 preload 에서는 `url.pathToFileURL` 이 없어 `toFileUrl` 을 직접 구현(Windows 드라이브 경로 포함).
- yuv420p 출력은 모든 치수가 짝수여야 한다 → `layout.even()`.
