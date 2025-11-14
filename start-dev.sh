#!/bin/bash

# AI Interview Preparation App - Development Startup Script

echo "🚀 Starting AI Interview Preparation App in development mode..."
echo ""

# Function to check if a port is in use (portable: tries lsof, then netstat, then python)
check_port() {
    PORT=$1
    # If lsof exists, prefer it
    if command -v lsof >/dev/null 2>&1; then
        if lsof -Pi :"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo "❌ Port $PORT is already in use. Please free it first."
            return 1
        else
            return 0
        fi
    elif command -v netstat >/dev/null 2>&1; then
        # Works in Git Bash on Windows (uses Windows netstat)
        if netstat -ano 2>/dev/null | grep -E "[:\.]${PORT}[[:space:]]" | grep LISTEN >/dev/null 2>&1; then
            echo "❌ Port $PORT is already in use. Please free it first."
            return 1
        else
            return 0
        fi
    else
        # Fallback: attempt to bind with python
        python - <<PY $PORT
import socket, sys
port = int(sys.argv[1])
s = socket.socket()
try:
    s.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
sys.exit(0)
PY
        if [ $? -ne 0 ]; then
            echo "❌ Port $PORT is already in use. Please free it first."
            return 1
        else
            return 0
        fi
    fi
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
if ! check_port 8000; then
    exit 1
fi
if ! check_port 8001; then
    exit 1
fi
if ! check_port 11434; then
    echo "⚠️ Port 11434 is already in use. Checking if it's the mock interview service..."
    # Try a lightweight HTTP probe (adjust path if your service exposes a health endpoint)
    if command -v curl >/dev/null 2>&1; then
        if curl -s --max-time 2 http://localhost:11434/ >/dev/null 2>&1; then
            echo "✅ Existing mock interview service detected on port 11434. Will reuse it."
            MOCK_ALREADY_RUNNING=1
        else
            echo "❌ Port 11434 is occupied by an unknown process. Please free it or set SKIP_11434=1 to bypass."
            echo "   To find & kill on Windows (PowerShell):"
            echo "     netstat -ano | findstr :11434"
            echo "     taskkill /PID <PID> /F"
            echo "   Git Bash: netstat -ano | grep 11434"
            exit 1
        fi
    else
        echo "ℹ️ curl not available; assuming existing service is valid. Reusing port 11434."
        MOCK_ALREADY_RUNNING=1
    fi
fi
echo "✅ Ports 3000, 5000, 5001, 8000, 8001 are available (11434 reused if already running)"
echo ""

# Start backend
echo "🔧 Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..


# Start Flask resume-analysis-service
echo "🧠 Starting Flask resume analysis service..."
cd backend/resume-analysis-service
python app.py &
FLASK_PID=$!
cd ../..

# Start Flask mock-interview-service (only if not already running)
if [ -z "$MOCK_ALREADY_RUNNING" ]; then
    echo "🤖 Starting Flask mock interview service..."
    cd backend/mock-interview-service
    python app.py &
    MOCK_PID=$!
    cd ../..
else
    echo "🤖 Mock interview service already running; skipping start."
fi

# Start Flask resume-analysis-service history API
echo "📚 Starting Flask resume history service..."
cd backend/resume-analysis-service
python history_api.py &
HISTORY_PID=$!
cd ../..

# Start Flask posture-analysis-service
echo "🧘 Starting Flask posture analysis service..."
cd backend/posture-analysis-service
python yolo_posture_service.py &
POSTURE_PID=$!
cd ../..

# Wait a moment for backend and Flask to start
sleep 3

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
echo "🔧 Backend (Express): http://localhost:5000"
echo "🧠 Resume Analysis Service: http://localhost:8000"
echo "📚 Resume History Service: http://localhost:8001"
echo "🧘 Posture Analysis Service: http://localhost:5001 (Flask)"
echo "🤖 Mock Interview Service: http://localhost:11434"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit

cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $FLASK_PID 2>/dev/null
    if [ -n "$MOCK_PID" ]; then
        kill $MOCK_PID 2>/dev/null
    else
        echo "ℹ️ Mock interview service was pre-existing; not stopping it."
    fi
    kill $HISTORY_PID 2>/dev/null
    kill $POSTURE_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait 