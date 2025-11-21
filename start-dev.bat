@echo off
echo 🚀 Starting AI Interview Preparation App in development mode...
echo.

REM Check if Node.js/npm is installed (omitted for brevity, assume check is here)
echo ✅ Node.js and npm are available
echo.

REM --- Service Startup ---

REM Start Flask dressing-analysis-service (Port 5002) - Gemini
echo 👗 Starting dressing analysis service with Gemini Vision API (Port 5002)...
start "Dressing Analysis Service" cmd /k "cd backend\dressing-analysis-service && set FLASK_RUN_PORT=5002 && python gemini_dressing_service.py"

REM Start Flask posture-analysis-service (Port 5001)
echo 🧘 Starting posture analysis service (Port 5001)...
start "Posture Analysis Service" cmd /k "cd backend\posture-analysis-service && set FLASK_RUN_PORT=5001 && python yolo_posture_service.py"

REM Start Flask mock interview service (Port 5004)
echo 🤖 Starting mock interview service (Port 5004)...
start "Mock Interview Service" cmd /k "cd backend\mock-interview-service && python app.py --port 5004"

REM Start Flask resume analysis service (Port 5003)
echo 🧠 Starting resume analysis service (Port 5003)...
start "Resume Analysis Service" cmd /k "cd backend\resume-analysis-service && set PORT=5003 && python app.py"

REM --- Express Proxy and Frontend ---

REM Start backend Express server (Port 5000)
echo 🔧 Starting backend Express server (Port 5000)...
REM Express needs to know where the mock service runs to proxy requests
set MOCK_INTERVIEW_URL=http://localhost:5004 
start "Backend Express Server" cmd /k "cd backend && npm run dev"

REM Wait for services to start
timeout /t 5 /nobreak >nul

REM Start frontend (Port 3000)
echo 🎨 Starting frontend development server...
start "Frontend Server" cmd /k "cd frontend && npm start"

REM --- Output ---

echo.
echo 🎉 All services are starting up!
echo.
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend (Express Proxy): http://localhost:5000
echo 🧠 Resume Analysis: http://localhost:5003
echo 🤖 Mock Interview: http://localhost:5004
echo 🧘 Posture Analysis: http://localhost:5001
echo 👗 Dressing Analysis: http://localhost:5002
echo 💡 Remember to manually start the Ollama server on http://localhost:11434
echo.
pause