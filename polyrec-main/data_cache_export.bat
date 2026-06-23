@echo off
cd /d "%~dp0"
echo 正在导出 Polymarket BTC 本地数据到 CSV...
echo.
python data_cache.py export
pause
