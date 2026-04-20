# YouTube → NotebookLM 크롤러 Windows 작업 스케줄러 설치 스크립트
# 관리자 권한으로 실행하세요: Run as Administrator

param(
    [string]$ProjectPath = $PSScriptRoot,
    [string]$ScheduleTime = "07:00",
    [string]$TaskName = "YouTubeNotebookLMCrawler"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 YouTube → NotebookLM 크롤러 작업 스케줄러 설치" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Node.js 경로 확인
$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodePath) {
    Write-Error "❌ Node.js를 찾을 수 없습니다. https://nodejs.org 에서 설치해주세요."
    exit 1
}

Write-Host "✅ Node.js 경로: $nodePath" -ForegroundColor Green

# 프로젝트 경로 확인
$crawlerScript = Join-Path $ProjectPath "crawler\index.ts"
if (-not (Test-Path $crawlerScript)) {
    Write-Error "❌ 크롤러 스크립트를 찾을 수 없습니다: $crawlerScript"
    exit 1
}

# 실행 스크립트 생성
$runScriptPath = Join-Path $ProjectPath "run-crawler.ps1"
$envFile = Join-Path $ProjectPath ".env"

@"
# 자동 생성된 크롤러 실행 스크립트 — 직접 수정하지 마세요
Set-Location "$ProjectPath"

# 환경 변수 로드
if (Test-Path "$envFile") {
    Get-Content "$envFile" | ForEach-Object {
        if (`$_ -match '^([^#=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable(`$matches[1].Trim(), `$matches[2].Trim(), 'Process')
        }
    }
}

# 로그 파일
`$logFile = Join-Path "$ProjectPath" "logs\crawler-`$(Get-Date -Format 'yyyy-MM-dd').log"
`$logDir = Split-Path `$logFile
if (-not (Test-Path `$logDir)) { New-Item -ItemType Directory -Path `$logDir | Out-Null }

# 크롤러 실행
`$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"`n=== 크롤러 시작: `$timestamp ===" | Tee-Object -FilePath `$logFile -Append

npx ts-node "$ProjectPath\crawler\index.ts" 2>&1 | Tee-Object -FilePath `$logFile -Append

`$exitCode = `$LASTEXITCODE
"=== 크롤러 종료: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (코드: `$exitCode) ===" | Tee-Object -FilePath `$logFile -Append
"@ | Set-Content $runScriptPath -Encoding UTF8

Write-Host "✅ 실행 스크립트 생성: $runScriptPath" -ForegroundColor Green

# 기존 작업 제거
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "🗑️  기존 작업 제거됨" -ForegroundColor Yellow
}

# 새 작업 등록
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$runScriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "YouTube 채널 영상을 NotebookLM에 자동으로 추가하는 크롤러" | Out-Null

Write-Host ""
Write-Host "✅ 작업 스케줄러 등록 완료!" -ForegroundColor Green
Write-Host "   📋 작업 이름: $TaskName" -ForegroundColor Cyan
Write-Host "   ⏰ 실행 시간: 매일 $ScheduleTime" -ForegroundColor Cyan
Write-Host "   📁 프로젝트: $ProjectPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 지금 바로 테스트하려면:" -ForegroundColor Yellow
Write-Host "   Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host ""
Write-Host "💡 작업 제거하려면:" -ForegroundColor Yellow
Write-Host "   Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor White
