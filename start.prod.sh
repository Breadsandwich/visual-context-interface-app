#!/bin/sh

# Initialize /output with sample project if empty (first deploy)
if [ ! -f /output/package.json ]; then
    echo "Initializing /output with dummy-target source..."
    cp -r /app/dummy-target-src/* /output/
fi

# Start agent service (internal only)
cd /app/proxy
uvicorn agent:app --host 127.0.0.1 --port 8001 &
AGENT_PID=$!

# Start FastAPI proxy
uvicorn main:app --host 0.0.0.0 --port 8000 &
PROXY_PID=$!

# Start Vite frontend dev server
cd /app/frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

cleanup() {
    kill $AGENT_PID $PROXY_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGTERM SIGINT

wait $AGENT_PID $PROXY_PID $FRONTEND_PID
