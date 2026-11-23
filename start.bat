@echo off
setlocal
cd /d "%~dp0"
title Page Clone Engine v0.4

echo.
echo Iniciando Page Clone Engine v0.4...
echo.

start "Page Clone Engine Server" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4317"

exit /b 0
