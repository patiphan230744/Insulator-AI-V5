@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 apply_v5_update.py
) else (
  python apply_v5_update.py
)
echo.
pause
