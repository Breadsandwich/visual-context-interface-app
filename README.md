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

To point the tool at a local app running on your machine (e.g. a Vite React app on port 3000):

1. **Start your app** as you normally would (`npm run dev`, etc.) and confirm it loads in your browser

2. **Start the tool** with two environment variables:

   ```bash
   TARGET_HOST=host.docker.internal TARGET_PORT=3000 docker-compose up --build
   ```

   Replace `3000` with whatever port your app runs on.

3. **Open** http://localhost:5173 — your app should appear inside the iframe with inspection tools available

**How it works:**

- `host.docker.internal` is a special DNS name that lets the Docker container reach your Mac's localhost
- The proxy detects an external target and strips the `/proxy/` path prefix so requests forward cleanly to your app's root
- The iframe loads cross-origin (`http://localhost:8000`) to isolate ES module caches between the VCI frontend and your app, preventing framework collisions
- A catch-all route on the proxy forwards Vite module requests (`/@vite/client`, `/node_modules/.vite/deps/...`) to your app so ES imports resolve correctly

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

### Dual React Collision When Proxying External Vite Apps

**Problem**: When pointing the tool at an external Vite React app (e.g. `TARGET_HOST=host.docker.internal`), the target app crashed with "Invalid hook call" errors. React hooks require exactly one copy of React, but two were loading simultaneously.

**Root cause**: The iframe was loaded same-origin through Vite's dev proxy (`/proxy/`), which made it share the browser's ES module cache with the VCI frontend. Both apps use Vite, so when the target app's JavaScript imported React from `/node_modules/.vite/deps/react.js`, the browser served the VCI frontend's React instead of the target's. Two React instances collided, breaking hooks.

The HTML `rewrite_asset_paths` function only rewrites `href`/`src` attributes in HTML tags. It cannot rewrite ES `import` statements inside JavaScript modules (e.g. `import React from "/node_modules/.vite/deps/react.js"`), so path-rewriting alone could not solve this.

**Solution**: Load the iframe cross-origin to completely isolate module caches.

- When `VITE_PROXY_URL` is set (via docker-compose), the iframe loads from `http://localhost:8000/proxy/` instead of `/proxy/`, giving it a different origin and its own ES module cache
- A `__INSPECTOR_PARENT_ORIGIN__` global is injected into the target HTML so the inspector script can send postMessages to the correct parent origin
- A catch-all route on the FastAPI proxy forwards Vite module requests (e.g. `/@vite/client`, `/node_modules/.vite/deps/react.js`) from the iframe's origin to the target app without HTML injection
- When `VITE_PROXY_URL` is unset, the iframe falls back to same-origin `/proxy/`, maintaining backward compatibility with the bundled dummy-target

**Code locations**: `frontend/src/components/Viewport.tsx`, `frontend/src/hooks/usePostMessage.ts`, `proxy/injection.py`, `proxy/main.py`, `inspector/inspector.js`

### Image Data URI Size

**Problem**: Uploaded external images (especially PNG screenshots) produced base64 data URIs too large for Claude Code's context window, preventing the AI from working with the generated prompt.

**Solution**: Replace raw image data with lightweight "image codemaps" — structured metadata generated entirely client-side via canvas pixel analysis.

- A Sobel edge detector extracts horizontal/vertical edge maps from a downscaled canvas (max 300px)
- Dominant colors are clustered using greedy nearest-neighbor grouping on sampled pixels
- Text regions are detected by scanning for strips where horizontal edge energy significantly exceeds vertical edge energy, then merged and filtered by aspect ratio
- Font scale and weight are estimated from text region height ratios and stroke thickness sampling
- A decision tree classifies content type (screenshot, photo, illustration, icon, chart, text-heavy) using edge sharpness, color count, complexity, transparency, and geometric patterns
- The resulting codemap includes dimensions, aspect ratio, dominant colors, brightness, transparency, complexity, visual weight distribution, text prominence, font hints, and content type — giving the LLM semantic understanding of the image without seeing pixels

**Code location**: `frontend/src/utils/imageAnalyzer.ts`
