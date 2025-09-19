#!/bin/bash

# AI Interview Preparation App - Development Startup Script

echo "🚀 Starting AI Interview Preparation App in development mode..."
echo ""

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ Port $1 is already in use. Please stop the service using port $1 first."
        return 1
    else
        return 0
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
echo "✅ Ports 3000, 5000, and 5001 are available"
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

# Start Flask mock-interview-service
echo "🤖 Starting Flask mock interview service..."
cd backend/mock-interview-service
python app.py &
MOCK_PID=$!
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
echo "🔧 Backend:  http://localhost:5000"
echo "🧠 Resume Analysis Service (Flask): http://localhost:5001 or as configured"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit

cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $FLASK_PID 2>/dev/null
    kill $MOCK_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait 