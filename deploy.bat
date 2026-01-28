@echo off
echo Starting Git deployment...
echo.

REM Add all changes to staging
git add .
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to add files to staging
    pause
    exit /b 1
)
echo Files added to staging

REM Commit with message
git commit -m "feat: add company switch link and deploy updates"
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to commit changes
    pause
    exit /b 1
)
echo Changes committed

REM Switch to main branch
git checkout main
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to checkout main branch
    pause
    exit /b 1
)
echo Switched to main branch

REM Merge backup/janeiro_2026 into main
git merge backup/janeiro_2026
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to merge backup/janeiro_2026
    pause
    exit /b 1
)
echo Merged backup/janeiro_2026 into main

REM Push to origin (triggers Vercel deploy)
git push origin main
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to push to origin
    pause
    exit /b 1
)
echo Pushed to origin main - Vercel deployment triggered!
echo.
echo Deployment completed successfully!
pause