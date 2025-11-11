@echo off
chcp 65001 >nul
echo ====================================
echo LexDiff 개발 서버 완전 클린 재시작
echo ====================================
echo.

:: 1단계: 모든 Node.js 프로세스 강제 종료
echo [1단계] 모든 Node.js 프로세스 강제 종료...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo 모든 Node.js 프로세스 종료 완료
    timeout /t 2 /nobreak >nul
) else (
    echo Node.js 프로세스 없음
)

echo.
echo [2단계] 포트 3000 사용 중인 프로세스 확인 및 종료...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo   포트 3000 사용 중 (PID: %%a^) 종료 중...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo 포트 정리 완료

echo.
echo [3단계] 캐시 파일 완전 삭제...
:: .next 캐시 삭제
if exist .next (
    echo   - .next 폴더 삭제 중...
    rd /s /q .next 2>nul
    timeout /t 1 /nobreak >nul
    if exist .next (
        echo   [경고] .next 삭제 실패 (일부 파일이 사용 중)
    ) else (
        echo   .next 삭제 완료 ✓
    )
) else (
    echo   - .next 폴더 없음
)

:: node_modules/.cache 삭제 (Turbopack 캐시)
if exist node_modules\.cache (
    echo   - node_modules\.cache 폴더 삭제 중...
    rd /s /q node_modules\.cache 2>nul
    echo   node_modules\.cache 삭제 완료 ✓
) else (
    echo   - node_modules\.cache 폴더 없음
)

:: Turso 로컬 캐시 삭제 (있다면)
if exist .turso (
    echo   - .turso 캐시 폴더 삭제 중...
    rd /s /q .turso 2>nul
    echo   .turso 삭제 완료 ✓
)

echo 모든 캐시 정리 완료

echo.
echo [4단계] 환경 변수 파일 확인...
if exist .env.local (
    echo .env.local 파일 존재 확인 ✓
) else (
    echo [경고] .env.local 파일이 없습니다!
    echo .env.local.example을 복사하여 .env.local을 생성하세요.
    pause
    exit /b 1
)

echo.
echo [5단계] 개발 서버 시작 중...
echo ====================================
echo 완전히 클린한 상태에서 서버를 시작합니다...
echo 첫 컴파일은 시간이 걸릴 수 있습니다.
echo.

:: npm run dev 실행
npm run dev

:: 오류가 발생해도 창이 닫히지 않도록
echo.
echo ====================================
if errorlevel 1 (
    echo [오류] 서버 실행 중 오류 발생!
    echo 위의 로그를 확인하세요.
) else (
    echo 서버가 종료되었습니다.
)
echo.
pause
