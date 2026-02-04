# Multi-stage Dockerfile for Visual Context Interface Tool
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
# Don't build in dev mode - Vite will serve

# Python proxy service
FROM python:3.12-slim

WORKDIR /app

# Install Node.js for frontend dev server
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install
COPY proxy/requirements.txt /app/proxy/
RUN pip install --no-cache-dir -r /app/proxy/requirements.txt

# Copy application code
COPY proxy/ /app/proxy/
COPY inspector/ /app/inspector/
COPY --from=frontend-builder /app/frontend /app/frontend

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm install

WORKDIR /app

# Expose ports
EXPOSE 5173 8000

# Start both services
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
