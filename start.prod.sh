#!/bin/sh

# Sync dummy-target source to shared volume on every startup.
# Always overwrite config/infra files so deploys pick up changes.
# Preserve api/data.db (the SQLite database) across restarts.
if [ ! -f /output/package.json ]; then
    echo "Initializing /output with dummy-target source..."
    cp -r /app/dummy-target-src/* /output/
else
    echo "Syncing dummy-target config files..."
    cp /app/dummy-target-src/package.json /output/package.json
    cp /app/dummy-target-src/vite.config.js /output/vite.config.js
    cp /app/dummy-target-src/entrypoint.sh /output/entrypoint.sh
    cp /app/dummy-target-src/requirements.txt /output/requirements.txt
    cp -r /app/dummy-target-src/api/*.py /output/api/
    cp -r /app/dummy-target-src/src/ /output/src/
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
