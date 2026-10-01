#!/usr/bin/env bash
# macOS: 저장소 최신화 → 의존성 설치 → 테스트 → 내 Mac 칩에 맞게 빌드 → /Applications 에 설치 → 실행
# 사전 준비: git, Node.js LTS (https://nodejs.org)
# 사용: ./scripts/update-and-build.sh            (처음이면 git clone 후 실행)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ 저장소 최신화"
git pull --ff-only

echo "▶ 의존성 설치"
npm install

echo "▶ 테스트"
npm test

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then FLAG=--arm64; DIR=dist/mac-arm64; else FLAG=--x64; DIR=dist/mac; fi
echo "▶ 빌드 ($ARCH)"
npx electron-builder --mac --dir "$FLAG"

echo "▶ /Applications 에 설치"
rm -rf /Applications/RatioFill.app
cp -R "$DIR/RatioFill.app" /Applications/
xattr -dr com.apple.quarantine /Applications/RatioFill.app 2>/dev/null || true

echo "▶ 실행"
open /Applications/RatioFill.app
echo "완료: /Applications/RatioFill.app"
