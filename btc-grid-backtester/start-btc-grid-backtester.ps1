$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4177
$Url = "http://127.0.0.1:$Port"
$LogDir = Join-Path $AppDir 'logs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $listener) {
    $node = (Get-Command node -ErrorAction Stop).Source
    $stdout = Join-Path $LogDir 'server.out.log'
    $stderr = Join-Path $LogDir 'server.err.log'
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue

    Start-Process `
        -FilePath $node `
        -ArgumentList @('server.mjs', "$Port") `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr

    Start-Sleep -Seconds 2
}

Start-Process $Url
