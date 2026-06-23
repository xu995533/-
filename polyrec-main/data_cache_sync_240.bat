@echo off
cd /d "%~dp0"
echo 正在下载/更新 Polymarket BTC 本地数据...
echo 下面会显示进度：已保存 / 跳过 / 没找到。
echo.
python data_cache.py sync --limit 240
pause
