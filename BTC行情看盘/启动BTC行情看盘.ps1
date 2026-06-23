$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4288

Set-Location $AppDir

if (-not (Test-Path (Join-Path $AppDir "node_modules\lightweight-charts"))) {
  npm install
}

$logDir = Join-Path $AppDir "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  $outLog = Join-Path $logDir "server.out.log"
  $errLog = Join-Path $logDir "server.err.log"
  Start-Process -FilePath "node" -ArgumentList "server.mjs $Port" -WorkingDirectory $AppDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

Start-Process "http://127.0.0.1:$Port"
