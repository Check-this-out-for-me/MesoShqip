@echo off
title Meso Shqip me AI - Startup
echo Duke kontrolluar portin 5001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5001') do (
    echo Duke mbyllur procesin e vjeter ne portin 5001 (PID: %%a)...
    taskkill /f /pid %%a >nul 2>&1
)

echo Duke nisur serverin...
start /b node server.js > server_log.txt 2>&1

echo Duke prit 3 sekonda...
timeout /t 3 >nul

echo Duke kontrolluar nese serveri eshte aktiv...
netstat -aon | findstr :5001 >nul
if %errorlevel% neq 0 (
    echo GABIM: Serveri nuk u nis dot!
    echo Shiko 'server_log.txt' per detaje.
    type server_log.txt
    pause
    exit /b
)

echo Po hapim aplikacionin ne browser...
start http://localhost:5001

echo.
echo ==================================================
echo MesoShqip po punon! 
echo MOS E MBYLL KETE DRITARE!
echo ==================================================
pause
