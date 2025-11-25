#!/usr/bin/env bash

# AI Interview Preparation App - Development Startup Script

echo "🚀 Starting AI Interview Preparation App in development mode..."
echo ""

# Simple port check function for Windows Git Bash
check_port() {
    local PORT=$1
    if command -v netstat >/dev/null 2>&1; then
        if netstat -ano 2>/dev/null | grep ":${PORT}" | grep "LISTENING" >/dev/null 2>&1; then
            echo "❌ Port $PORT is already in use. Please free it first."
            return 1
        fi
    fi
    return 0
}

# Check if ports are available
echo "🔍 Checking port availability..."
if ! check_port 3000; then
    exit 1
fi
if ! check_port 5000; then
    exit 1
fi
if ! check_port 5001; then
    exit 1
fi
if ! check_port 5002; then
    exit 1
fi
if ! check_port 5003; then
    exit 1
fi
if ! check_port 5004; then
    exit 1
fi
if ! check_port 8000; then
    exit 1
fi
if ! check_port 8001; then
    exit 1
fi
if ! check_port 11434; then
    echo "⚠️ Port 11434 is already in use. Checking if it's the Ollama service..."
    if command -v curl >/dev/null 2>&1; then
        if curl -s --max-time 2 http://localhost:11434/ >/dev/null 2>&1; then
            echo "✅ Existing Ollama service detected on port 11434. Will reuse it."
            OLLAMA_ALREADY_RUNNING=1
        else
            echo "❌ Port 11434 is occupied by an unknown process. Please free it."
            exit 1
        fi
    else
        echo "ℹ️ curl not available; assuming existing service is valid. Reusing port 11434."
        OLLAMA_ALREADY_RUNNING=1
    fi
fi
echo "✅ Ports 3000, 5000, 5001, 5002, 5003, 5004, 8000, 8001 are available (11434 reused if already running)"
echo ""

# Start Flask dressing-analysis-service (Gemini)
echo "👗 Starting dressing analysis service (Gemini Vision API)..."
cd backend/dressing-analysis-service
python gemini_dressing_service.py &
DRESS_PID=$!
cd ../..

# Start backend (Express proxy)
echo "🔧 Starting backend server (Express proxy)..."
export DRESS_ANALYZE_URL="http://localhost:5002/api/analyze-dress"
export MOCK_INTERVIEW_URL="http://localhost:5004" # <-- New setting for Express to proxy to
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Start Flask resume-analysis-service
echo "🧠 Starting Flask resume analysis service (5003)..."
echo "   (Note: First startup may take 1-2 minutes due to ML model initialization)"
cd backend/resume-analysis-service
python app.py &
FLASK_PID=$!
cd ../..

# Start Flask posture-analysis-service
echo "🧘 Starting Flask posture analysis service (5001)..."
cd backend/posture-analysis-service
python yolo_posture_service.py &
POSTURE_PID=$!
cd ../..

# Start Flask mock-interview-service on dedicated port 5004
echo "🤖 Starting Flask mock interview service (5004)..."
cd backend/mock-interview-service
# The Flask run command must accept a port argument or use an environment variable
python app.py --port 5004 & 
MOCK_PID=$!
cd ../..


# Wait a moment for backend and Flask to start (increased to reduce race conditions)
sleep 8

# Start frontend
echo "🎨 Starting frontend development server..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "🎉 All services are starting up!"
echo ""
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend (Express Proxy): http://localhost:5000"
echo "🧠 Resume Analysis Service: http://localhost:5003"
echo "🤖 Mock Interview Service: http://localhost:5004"
echo "🧘 Posture Analysis Service: http://localhost:5001"
echo "👗 Dressing Analysis Service: http://localhost:5002"
echo "---"
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit

cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $FLASK_PID 2>/dev/null
    kill $MOCK_PID 2>/dev/null
    kill $POSTURE_PID 2>/dev/null
    kill $DRESS_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for all processes
wait