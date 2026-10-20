@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where.exe node >nul 2>&1
if errorlevel 1 (
  set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "GAME_NODE=node"
)
if not "%GAME_NODE%"=="node" if not exist "%GAME_NODE%" (
  echo 未找到 Node.js。请先安装 Node.js 24 或更新版本。
  pause
  exit /b 1
)
"%GAME_NODE%" "%~dp0scripts\host.mjs" --stop
echo.
pause
