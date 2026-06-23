@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo 正在创建 Python 虚拟环境...
  python -m venv .venv
)
echo 正在检查依赖...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
echo.
echo 启动 Polyrec 网页监控台...
echo 浏览器地址: http://127.0.0.1:8791
echo.
".venv\Scripts\python.exe" web_app.py
pause
