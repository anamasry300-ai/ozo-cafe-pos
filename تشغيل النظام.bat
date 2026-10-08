@echo off
title نظام أوزو OZO POS
cd /d "%~dp0"
start "نظام أوزو OZO" cmd /k "npm start"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000"