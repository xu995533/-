@echo off
cd /d "%~dp0"
echo 正在查看 Polymarket BTC 本地数据状态...
echo.
python data_cache.py status
pause
