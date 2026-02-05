# Visual Context Interface

A Dockerized development tool that enables visual DOM inspection and screenshot capture for any React application without requiring code changes to the target app.

## Features

- **Non-Invasive Inspection**: Wrap any React app in an iframe via proxy—no target app modifications needed
- **DOM Element Selection**: Hover highlighting and click-to-select with full element metadata capture
- **Screenshot Capture**: Region-based screenshot capture using html2canvas
- **Structured Output**: Generates JSON payloads with route, element context, visual data, and user instructions
- **Clipboard Integration**: One-click copy for use with AI coding assistants like Claude Code

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │   visual-context-    │      │   dummy-target       │        │
│  │   tool               │      │   (React App)        │        │
│  │                      │      │                      │        │
│  │  ┌────────────────┐  │      │  localhost:3001      │        │
│  │  │ React Frontend │  │      │                      │        │
│  │  │ Port 5173      │  │      └──────────────────────┘        │
│  │  └───────┬────────┘  │                │                     │
│  │          │           │                │                     │
│  │  ┌───────▼────────┐  │                │                     │
│  │  │ FastAPI Proxy  │◄─┼────────────────┘                     │
│  │  │ Port 8000      │  │   Proxies & injects inspector.js    │
│  │  └────────────────┘  │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **Node.js** (v18+) — for local development only
- **Python** (3.11+) — for local development only

## Quick Start (Docker)

1. **Clone the repository**

   ```bash
   git clone https://github.com/Breadsandwich/visual-context-interface-app.git
   cd visual-context-interface-app
   ```

2. **Start all services**

   ```bash
   docker-compose up --build
   ```

3. **Access the application**

   - **Frontend UI**: http://localhost:5173
   - **Proxy API**: http://localhost:8000
   - **Dummy Target** (test app): http://localhost:3001

4. **Stop services**

   ```bash
   docker-compose down
   ```

### Inspecting Your Own App

To inspect a different React application instead of the dummy target:

```bash
TARGET_HOST=host.docker.internal TARGET_PORT=3000 docker-compose up
```

Replace `3000` with your app's port. Use `host.docker.internal` to reference apps running on your host machine.

**Note**: The proxy automatically strips `Content-Security-Policy` and `X-Frame-Options` headers from proxied responses, allowing your app to be embedded in the inspector's iframe regardless of its original security headers.

## Local Development Setup

### 1. Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:5173

### 2. Proxy (FastAPI)

```bash
cd proxy
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The proxy runs at http://localhost:8000

### 3. Dummy Target (Test App)

```bash
cd dummy-target
npm install
npm run dev
```

The dummy target runs at http://localhost:3001

### Environment Variables

For local development, set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_HOST` | `localhost` | Host of the target React app |
| `TARGET_PORT` | `3001` | Port of the target React app |
| `VITE_PROXY_URL` | `http://localhost:8000` | Proxy URL for frontend |

Example:

```bash
# Terminal 1 - Proxy
cd proxy
TARGET_HOST=localhost TARGET_PORT=3000 uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
VITE_PROXY_URL=http://localhost:8000 npm run dev
```

## Project Structure

```
visual-context-interface-app/
├── frontend/              # React parent application (Vite + TypeScript)
│   ├── src/
│   │   ├── components/    # UI components (Viewport, ControlPanel, etc.)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── stores/        # Zustand state management
│   │   ├── types/         # TypeScript interfaces
│   │   └── utils/         # Utility functions
│   └── package.json
├── proxy/                 # FastAPI proxy service
│   ├── main.py            # Main application
│   ├── injection.py       # HTML injection logic
│   └── requirements.txt
├── inspector/             # Injected browser scripts
│   ├── inspector.js       # DOM inspection logic
│   └── html2canvas.min.js # Screenshot library
├── dummy-target/          # Test React application
├── docker-compose.yml
├── Dockerfile
└── start.sh
```

## Usage

1. **Open the tool** at http://localhost:5173
2. **Toggle Mode**:
   - **Interact**: Normal browsing—click through the target app
   - **Inspect**: Hover to highlight elements, click to select
   - **Screenshot**: Drag to capture a region
3. **Select an element** by clicking in Inspect mode
4. **Add instructions** in the text input (e.g., "Move this button 10px left")
5. **Export** the payload to clipboard or console

### Output Payload Format

```json
{
  "route": "/about",
  "context": {
    "html": "<button class=\"btn primary\">Click me</button>",
    "selector": "button.btn.primary",
    "tagName": "BUTTON",
    "id": "",
    "classes": ["btn", "primary"]
  },
  "visual": "data:image/webp;base64,...",
  "prompt": "Move this button 10px to the left"
}
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, TypeScript, Vite, Zustand |
| Proxy | Python, FastAPI, httpx, BeautifulSoup4 |
| Screenshots | html2canvas |
| Containerization | Docker, Docker Compose |

## Challenges

### Screenshot Payload Size

**Problem**: PNG format screenshots produced base64 data too large for Claude's context window.

**Solution**: Switched to WebP format with JPEG fallback.

- WebP offers better compression than PNG
- Quality set to 0.8 for balance of size vs clarity
- Max dimensions capped at 1920x1080
- Fallback to JPEG for browsers without WebP support

**Code location**: `inspector/inspector.js:340-341`

## Troubleshooting

### Proxy Cannot Connect to Your Target App

**Problem**: When using Docker to inspect your own app running on the host machine, you get connection errors or the proxy fails to reach the target.

**Cause**: Most dev servers (Vite, Next.js, Create React App, etc.) bind to `localhost` (127.0.0.1) by default. This means they only accept connections from the same machine. Docker containers are isolated, so even with `host.docker.internal`, the connection is refused because the server isn't listening on the network interface Docker uses.

**Solution**: Start your target app with the host flag to bind to all network interfaces:

```bash
# Vite
npm run dev -- --host 0.0.0.0

# Next.js
npm run dev -- -H 0.0.0.0

# Create React App
HOST=0.0.0.0 npm start
```

Then run the visual context tool:

```bash
TARGET_HOST=host.docker.internal TARGET_PORT=3000 docker-compose up
```

**When to use `0.0.0.0`**:
- You're running Docker and your target app is on the host machine
- You want to access your dev server from other devices on your network
- You're using `host.docker.internal` as the `TARGET_HOST`

**Security note**: Binding to `0.0.0.0` exposes your dev server to your local network. This is fine for development but should not be used in production.
