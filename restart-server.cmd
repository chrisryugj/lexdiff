@echo off
chcp 65001 >nul
echo ====================================
echo LexDiff 개발 서버 재시작
echo ====================================
echo.

:: 포트 3000을 사용 중인 프로세스 확인
echo [1단계] 포트 3000 사용 중인 프로세스 확인...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    set PID=%%a
)

:: 프로세스가 있으면 종료
if defined PID (
    echo 프로세스 발견 (PID: %PID%)
    echo 프로세스 종료 중...
    taskkill /F /PID %PID%
    if errorlevel 1 (
        echo [경고] 프로세스 종료 실패
    ) else (
        echo 프로세스 종료 완료
    )
    timeout /t 2 /nobreak >nul
) else (
    echo 실행 중인 프로세스 없음
)

echo.
echo [2단계] .next 캐시 정리...
if exist .next (
    rd /s /q .next 2>nul
    if errorlevel 1 (
        echo [경고] 캐시 정리 실패 (프로세스가 사용 중일 수 있음)
    ) else (
        echo 캐시 정리 완료
    )
) else (
    echo 캐시 폴더 없음
)

echo.
echo [3단계] 환경 변수 파일 확인...
if exist .env.local (
    echo .env.local 파일 존재 확인 ✓
) else (
    echo [경고] .env.local 파일이 없습니다!
    echo .env.local.example을 복사하여 .env.local을 생성하세요.
)

echo.
echo [4단계] 개발 서버 시작 중...
echo ====================================
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
