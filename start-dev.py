#!/usr/bin/env python3
"""
AI Interview Preparation App - Development Startup Script
Cross-platform Python version for Windows/Linux/Mac
"""

import os
import sys
import subprocess
import time
import signal
import socket
from pathlib import Path

# Color codes for terminal (works in Windows Terminal, Git Bash, Linux)
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
BLUE = '\033[94m'
RESET = '\033[0m'

processes = []

def check_port(port):
    """Check if a port is available"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result != 0  # True if port is free
    except Exception:
        return True

def cleanup(signum=None, frame=None):
    """Kill all child processes"""
    print(f"\n{YELLOW}🛑 Stopping services...{RESET}")
    for proc in processes:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    print(f"{GREEN}✅ Services stopped{RESET}")
    sys.exit(0)

def main():
    # Set up signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    print(f"{BLUE}🚀 Starting AI Interview Preparation App in development mode...{RESET}\n")
    
    # Check port availability
    print(f"{BLUE}🔍 Checking port availability...{RESET}")
    required_ports = {
        3000: "Frontend",
        5000: "Backend (Express)",
        5001: "Posture Analysis",
        5002: "Dressing Analysis",
        5003: "Resume Analysis",
        5004: "Mock Interview"
    }
    
    for port, service in required_ports.items():
        if not check_port(port):
            print(f"{RED}❌ Port {port} ({service}) is already in use. Please free it first.{RESET}")
            sys.exit(1)
    
    print(f"{GREEN}✅ All required ports are available{RESET}\n")
    
    # Get base directory
    base_dir = Path(__file__).parent
    
    # Start services
    try:
        # 1. Dressing Analysis Service (Gemini)
        print(f"{BLUE}👗 Starting dressing analysis service (Gemini Vision API)...{RESET}")
        dress_dir = base_dir / "backend" / "dressing-analysis-service"
        proc = subprocess.Popen(
            [sys.executable, "gemini_dressing_service.py"],
            cwd=dress_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # 2. Backend (Express proxy)
        print(f"{BLUE}🔧 Starting backend server (Express proxy)...{RESET}")
        backend_dir = base_dir / "backend"
        env = os.environ.copy()
        env["DRESS_ANALYZE_URL"] = "http://localhost:5002/api/analyze-dress"
        env["MOCK_INTERVIEW_URL"] = "http://localhost:5004"
        proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=backend_dir,
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # 3. Resume Analysis Service
        print(f"{BLUE}🧠 Starting resume analysis service (5003)...{RESET}")
        print(f"{YELLOW}   (Note: First startup may take 1-2 minutes due to ML model initialization){RESET}")
        resume_dir = base_dir / "backend" / "resume-analysis-service"
        proc = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=resume_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # 4. Posture Analysis Service
        print(f"{BLUE}🧘 Starting posture analysis service (5001)...{RESET}")
        posture_dir = base_dir / "backend" / "posture-analysis-service"
        proc = subprocess.Popen(
            [sys.executable, "yolo_posture_service.py"],
            cwd=posture_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # 5. Mock Interview Service
        print(f"{BLUE}🤖 Starting mock interview service (5004)...{RESET}")
        mock_dir = base_dir / "backend" / "mock-interview-service"
        proc = subprocess.Popen(
            [sys.executable, "app.py", "--port", "5004"],
            cwd=mock_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # Wait for backend services to start
        print(f"\n{YELLOW}⏳ Waiting 8 seconds for backend services to initialize...{RESET}")
        time.sleep(8)
        
        # 6. Frontend
        print(f"{BLUE}🎨 Starting frontend development server...{RESET}")
        frontend_dir = base_dir / "frontend"
        proc = subprocess.Popen(
            ["npm", "start"],
            cwd=frontend_dir,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
        processes.append(proc)
        
        # Print status
        print(f"\n{GREEN}🎉 All services are starting up!{RESET}\n")
        print(f"{BLUE}📱 Frontend:{RESET}                    http://localhost:3000")
        print(f"{BLUE}🔧 Backend (Express Proxy):{RESET}     http://localhost:5000")
        print(f"{BLUE}🧠 Resume Analysis Service:{RESET}     http://localhost:5003")
        print(f"{BLUE}🤖 Mock Interview Service:{RESET}      http://localhost:5004")
        print(f"{BLUE}🧘 Posture Analysis Service:{RESET}    http://localhost:5001")
        print(f"{BLUE}👗 Dressing Analysis Service:{RESET}   http://localhost:5002")
        print(f"\n{YELLOW}Press Ctrl+C to stop all services{RESET}\n")
        
        # Wait for processes
        while True:
            time.sleep(1)
            # Check if any critical process died
            for proc in processes:
                if proc.poll() is not None:
                    print(f"{RED}⚠️ A service has stopped unexpectedly{RESET}")
            
    except KeyboardInterrupt:
        cleanup()
    except Exception as e:
        print(f"{RED}❌ Error: {e}{RESET}")
        cleanup()

if __name__ == "__main__":
    main()
