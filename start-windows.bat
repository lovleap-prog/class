@echo off
chcp 65001 >nul
title 학교 교육활동 관리
cd /d "%~dp0"

echo.
echo   학교 교육활동 관리 - 로컬 실행
echo   ------------------------------------
echo.

set PORT=8000

rem 파이썬 -> 파이썬(구버전 명령) -> 노드 순서로 찾는다.
where py >nul 2>nul
if %errorlevel%==0 (
  echo   파이썬으로 실행합니다.  http://localhost:%PORT%
  start "" http://localhost:%PORT%
  py -3 -m http.server %PORT% --directory app
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo   파이썬으로 실행합니다.  http://localhost:%PORT%
  start "" http://localhost:%PORT%
  python -m http.server %PORT% --directory app
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  echo   Node.js 로 실행합니다.  http://localhost:%PORT%
  start "" http://localhost:%PORT%
  node tools\serve.mjs %PORT%
  goto :eof
)

echo   [안내] 이 컴퓨터에 파이썬도 Node.js 도 없습니다.
echo.
echo   둘 중 하나를 설치하시거나(둘 다 무료),
echo   앱을 인터넷 주소로 올려서 쓰는 방법을 권합니다.
echo   자세한 내용: docs\START-LOCAL.md
echo.
pause
