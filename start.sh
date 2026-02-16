#!/bin/sh

# Start agent service in background
cd /app/proxy
uvicorn agent:app --host 127.0.0.1 --port 8001 --reload &
AGENT_PID=$!

# Start FastAPI proxy in background
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
PROXY_PID=$!

# Start Vite frontend dev server
cd /app/frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

# Function to handle shutdown
cleanup() {
    kill $AGENT_PID $PROXY_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for all processes - if any exits, the script continues
wait $AGENT_PID $PROXY_PID $FRONTEND_PID
