@echo off
echo 🚀 Starting AI Interview Preparation App in development mode...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js and npm are available
echo.

REM Start backend Express server
echo 🔧 Starting backend Express server...
start "Backend Express Server" cmd /k "cd backend && npm run dev"

REM Start Flask services
echo 🧠 Starting resume analysis service...
start "Resume Analysis Service" cmd /k "cd backend\resume-analysis-service && python app.py"

echo 📚 Starting resume history service...  
start "Resume History Service" cmd /k "cd backend\resume-analysis-service && python history_api.py"

echo 🤖 Starting mock interview service...
start "Mock Interview Service" cmd /k "cd backend\mock-interview-service && python app.py"

echo 🧘 Starting posture analysis service...
start "Posture Analysis Service" cmd /k "cd backend\posture-analysis-service && python yolo_posture_service.py"

REM Wait for services to start
timeout /t 5 /nobreak >nul

REM Start frontend
echo 🎨 Starting frontend development server...
start "Frontend Server" cmd /k "cd frontend && npm start"

echo.
echo 🎉 All services are starting up!
echo.
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend (Express): http://localhost:5000
echo 🧠 Resume Analysis: http://localhost:8000
echo 📚 Resume History: http://localhost:8001
echo 🧘 Posture Analysis: http://localhost:5001 (Flask)
echo 🤖 Mock Interview: http://localhost:11434
echo.
echo 💡 Close the command windows to stop the services
echo.
pause 