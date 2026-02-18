#!/bin/sh
# Start FastAPI backend in background
uvicorn api.main:app --host 0.0.0.0 --port 8002 --reload --reload-dir api &

# Start Vite dev server in foreground
npm run dev
