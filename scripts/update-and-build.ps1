# Windows: 저장소 최신화 → 의존성 설치 → 테스트 → 빌드 → 설치 프로그램 실행
# 사전 준비: Git for Windows, Node.js LTS (https://nodejs.org)
# 사용: scripts\update-and-build.cmd 더블클릭, 또는 PowerShell 에서 .\scripts\update-and-build.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '▶ 저장소 최신화'
git pull --ff-only

Write-Host '▶ 의존성 설치'
npm install

Write-Host '▶ 테스트'
npm test

Write-Host '▶ 빌드 (x64 설치형)'
npx electron-builder --win nsis --x64

$setup = Get-ChildItem dist -Filter 'RatioFill Setup *.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "▶ 설치 프로그램 실행: $($setup.FullName)"
Start-Process $setup.FullName
