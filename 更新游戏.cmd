@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "GAME_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%GAME_NODE%" scripts\update.mjs
pause
