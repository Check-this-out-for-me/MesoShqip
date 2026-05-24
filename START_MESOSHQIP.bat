@echo off
title Meso Shqip me AI - Startup
echo Po niset serveri per MesoShqip...
start /min cmd /c "node server.js"
echo Po hapet aplikacioni ne browser...
timeout /t 2 >nul
start http://localhost:5001
echo.
echo MesoShqip po punon! Mos e mbyll kete dritare nese deshiron te ruhen te dhenat.
pause
