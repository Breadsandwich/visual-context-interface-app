#!/bin/sh

# Start FastAPI proxy in background
cd /app/proxy
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
PROXY_PID=$!

# Start Vite frontend dev server
cd /app/frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

# Function to handle shutdown
cleanup() {
    kill $PROXY_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for both processes - if either exits, the script continues
wait $PROXY_PID $FRONTEND_PID
