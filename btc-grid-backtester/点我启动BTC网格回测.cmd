@echo off
cd /d "%~dp0"
set "APPDIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer.
  echo Please install Node.js LTS first, then run this file again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$script = Join-Path $env:APPDIR 'start-btc-grid-backtester.ps1'; if (-not (Test-Path -LiteralPath $script)) { Write-Host 'Startup script not found.'; pause; exit 1 }; & $script"
