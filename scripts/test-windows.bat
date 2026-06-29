@echo off
REM Double-click to run the Grimoire daemon test on Windows.
REM It downloads the binary (if needed) and runs start/status/hot-reload/restart/stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-windows.ps1" %*
echo.
pause
