@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Polyrec BTC 实时看板
echo   安全模式：仅看盘，不交易
echo   需要：网络连接
echo ========================================
echo 正在启动 BTC 看板...
echo 按 Ctrl+C 停止
uv run --no-project --python 3.10 --with-requirements requirements.txt python dash.py
pause
