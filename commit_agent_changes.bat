@echo off
setlocal

REM Commits ONLY the four files Claude edited and pushes to origin/main.
REM Run this from anywhere by double-clicking, or from PowerShell with .\commit_agent_changes.bat

cd /d "%~dp0"

echo.
echo === Repo location ===
cd
echo.

echo === Current branch ===
git rev-parse --abbrev-ref HEAD
echo.

echo === Files about to be staged ===
git status --short artifacts/grocery-app/src/pages/agent/Dashboard.tsx artifacts/grocery-app/src/pages/agent/CallLog.tsx artifacts/grocery-app/src/pages/agent/Complaints.tsx artifacts/grocery-app/src/pages/agent/CreateOrder.tsx
echo.

echo === Staging ===
git add artifacts/grocery-app/src/pages/agent/Dashboard.tsx artifacts/grocery-app/src/pages/agent/CallLog.tsx artifacts/grocery-app/src/pages/agent/Complaints.tsx artifacts/grocery-app/src/pages/agent/CreateOrder.tsx
if errorlevel 1 goto :err

echo.
echo === Committing ===
git commit -m "feat(agent): full-width pages + port admin order creation (single/bulk/third-party)" -m "- Dashboard, CallLog, Complaints, CreateOrder now span the full content area (removed max-w-* wrappers)" -m "- CreateOrder rewritten with Tabs (Single / Bulk / Third-Party) mirroring AdminLayout's CreateOrder, with agentId attached so calls are still attributed"
if errorlevel 1 goto :err

echo.
echo === Pushing to origin/main ===
git push origin main
if errorlevel 1 goto :err

echo.
echo === Done. Vercel should pick up the push and start a new deployment within a minute. ===
echo.
pause
exit /b 0

:err
echo.
echo *** Something went wrong. Scroll up to see the error. Nothing was force-pushed. ***
echo.
pause
exit /b 1
