#!/usr/bin/env node
/* 한 번에 배포: 변경 커밋 → 버전 올리기 → push(태그 포함)
 *   → GitHub Actions 가 설치 파일 4개(Releases)와 웹(GitHub Pages)을 자동 빌드·배포 → 완료까지 대기 후 링크 출력
 *
 * 사용:
 *   npm run release -- "변경 설명"           patch 버전 (1.0.0 → 1.0.1)
 *   npm run release -- "변경 설명" --minor   minor 버전 (1.0.0 → 1.1.0)
 *   npm run release -- --local               추가로 이 PC 에서 설치 파일·웹을 빌드해 release/v<버전>/ 폴더에 모은다
 *   npm run release -- --no-wait             Actions 완료를 기다리지 않는다
 *   npm run release -- --dry-run             실행할 단계만 보여 준다
 * 변경 사항이 없으면 "변경 설명" 은 생략해도 된다. 사전 준비: git push 권한(SSH 또는 로그인), Node.js
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repo = String(pkg.repository || '').replace(/^github:/, '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
if (!/^[^/]+\/[^/]+$/.test(repo)) { console.error('package.json 의 repository 가 "github:owner/repo" 형식이어야 합니다.'); process.exit(1); }
const [owner, name] = repo.split('/');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const bump = flag('--major') ? 'major' : flag('--minor') ? 'minor' : 'patch';
const message = args.find((a) => !a.startsWith('--')) || '';
const dry = flag('--dry-run');

const sh = (cmd, opts = {}) => {
  console.log(`$ ${cmd}`);
  if (dry) return '';
  return execSync(cmd, { cwd: root, stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8' }) || '';
};
const out = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ratiofill-release', Accept: 'application/vnd.github+json' } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 0) 상태 확인
  const branch = out('git rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') { console.error(`main 브랜치에서 실행하세요 (현재: ${branch})`); process.exit(1); }
  const dirty = out('git status --porcelain');
  if (dirty && !message) {
    console.error('커밋되지 않은 변경이 있습니다. 변경 설명을 함께 주세요:\n  npm run release -- "무엇을 바꿨는지"\n\n' + dirty);
    process.exit(1);
  }

  console.log(`\n▶ 저장소 ${repo}, 현재 v${pkg.version}, ${bump} 버전 올림${dry ? ' (dry-run)' : ''}\n`);

  // 1) 변경 커밋
  if (dirty) {
    sh('git add -A');
    sh(`git commit -m ${JSON.stringify(message)}`);
  }

  // 2) 테스트
  sh('npm test');

  // 3) 버전 올리기 (package.json 수정 + 커밋 + 태그)
  sh(`npm version ${bump} -m "chore(release): v%s"`);
  const version = dry ? pkg.version + '+next' : JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const tag = `v${version}`;

  // 4) push (브랜치 + 태그)
  sh('git push origin main --follow-tags');

  console.log(`
▶ push 완료. GitHub Actions 가 자동으로 진행합니다.
   진행 상황  https://github.com/${repo}/actions
   설치 파일  https://github.com/${repo}/releases/tag/${tag}   (Windows exe 2개, Mac dmg 2개)
   웹 버전    https://${owner}.github.io/${name}/
`);

  // 5) --local: 이 PC 에서도 빌드해 폴더로 모음
  if (flag('--local')) {
    const dest = path.join(root, 'release', tag);
    if (!fs.existsSync(path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe'))) sh('npm run ffmpeg:win');
    sh('npm run dist:all');
    sh('node scripts/build-web.js');
    if (!dry) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.join(dest, '프로그램'), { recursive: true });
      for (const f of fs.readdirSync(path.join(root, 'dist'))) {
        if (/\.(dmg|exe)$/.test(f)) fs.copyFileSync(path.join(root, 'dist', f), path.join(dest, '프로그램', f));
      }
      sh(`git archive --format=zip -o ${JSON.stringify(path.join(dest, `source-${tag}.zip`))} HEAD`);
      const zip = process.platform === 'win32'
        ? `powershell -NoProfile -Command "Compress-Archive -Path dist-web\\* -DestinationPath ${JSON.stringify(path.join(dest, `web-${tag}.zip`))} -Force"`
        : `cd dist-web && zip -rq ${JSON.stringify(path.join(dest, `web-${tag}.zip`))} . -x "_test/*"`;
      sh(zip);
      console.log(`▶ 로컬 산출물: ${dest}`);
    }
  }

  // 6) Actions 완료 대기
  if (flag('--no-wait') || dry) return;
  console.log('▶ Actions 완료를 기다립니다 (보통 10~15분). Ctrl+C 로 중단해도 배포는 계속됩니다.');
  const headSha = out('git rev-parse HEAD');
  const want = { release: null, pages: null };
  for (let i = 0; i < 90; i++) {
    await sleep(20000);
    let runs;
    try { runs = (await getJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=20`)).workflow_runs || []; } catch (_) { continue; }
    want.release = runs.find((r) => r.name === 'release' && r.head_branch === tag) || want.release;
    want.pages = runs.find((r) => r.name === 'pages' && r.head_sha === headSha) || want.pages;
    const line = Object.entries(want).map(([k, r]) => `${k}: ${r ? r.status + (r.conclusion ? '/' + r.conclusion : '') : '대기'}`).join('  ');
    process.stdout.write(`\r   ${line}        `);
    if (want.release && want.pages && want.release.status === 'completed' && want.pages.status === 'completed') break;
  }
  console.log('\n');
  const ok = want.release && want.release.conclusion === 'success' && want.pages && want.pages.conclusion === 'success';
  if (!ok) { console.log(`▶ 일부 작업이 실패했거나 아직 진행 중입니다: https://github.com/${repo}/actions`); process.exit(1); }
  try {
    const rel = await getJson(`https://api.github.com/repos/${repo}/releases/tags/${tag}`);
    console.log(`▶ 완료 ${tag}\n   웹  https://${owner}.github.io/${name}/\n   설치 파일 (${rel.html_url})`);
    for (const a of rel.assets || []) console.log(`     - ${a.name}  ${(a.size / 1048576).toFixed(0)}MB  ${a.browser_download_url}`);
  } catch (_) { console.log(`▶ 완료 ${tag}  https://github.com/${repo}/releases/tag/${tag}`); }
})().catch((e) => { console.error('\n실패:', e.message); process.exit(1); });
