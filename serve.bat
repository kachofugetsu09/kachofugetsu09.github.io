@echo off
chcp 65001 >nul
echo [94m启动本地开发服务器...[0m
echo.
echo [93m请在浏览器中访问: http://localhost:8000[0m
echo [93m按 Ctrl+C 停止服务器[0m
echo.

REM 检查是否安装了Python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [92m使用Python启动服务器...[0m
    python -m http.server 8000
    goto :end
)

REM 检查是否安装了Node.js
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [92m使用Node.js启动服务器...[0m
    echo 如果没有安装http-server，将自动安装...
    npm install -g http-server 2>nul
    http-server -p 8000
    goto :end
)

REM 如果都没有安装
echo [91m错误: 需要安装Python或Node.js才能启动本地服务器[0m
echo.
echo [94m安装选项:[0m
echo 1. Python: https://www.python.org/downloads/
echo 2. Node.js: https://nodejs.org/
echo.
pause

:end
