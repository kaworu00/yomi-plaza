@echo off
setlocal

cd /d "%~dp0"
title Yomi Plaza Launcher

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo node_modules was not found.
  echo Please run npm install in this folder first.
  pause
  exit /b 1
)

echo Starting Yomi Plaza at http://localhost:3000/gallery
start "Yomi Plaza Dev Server" cmd /k "pushd ""%~dp0"" && npm run dev -- --port 3000"

timeout /t 4 /nobreak >nul
start "" "http://localhost:3000/gallery"

exit /b 0
