@echo off
rem Bấm đúp file này để chạy MMO Market trên Windows (chỉ cần cài Node.js)
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)
if not exist "node_modules\embedded-postgres" (
  echo Dang cai thu vien lan dau, vui long doi vai phut...
  call npm install
  if errorlevel 1 (
    echo [!] Cai thu vien bi loi. Kiem tra ket noi mang roi thu lai.
    pause
    exit /b 1
  )
)
call npm run quick
pause
