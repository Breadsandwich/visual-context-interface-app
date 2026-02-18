# Visual Context Interface

A Dockerized development tool that enables visual DOM inspection and screenshot capture for any React application without requiring code changes to the target app.

## Features

- **Non-Invasive Inspection**: Wrap any React app in an iframe via proxy—no target app modifications needed
- **DOM Element Selection**: Hover highlighting and click-to-select with full element metadata capture
- **Screenshot Capture**: Region-based screenshot capture using html2canvas
- **Structured Output**: Generates JSON payloads with route, element context, visual data, and user instructions
- **Headless Agent**: One-click "Send to ADOM" triggers a Claude-powered agent that reads your visual context and edits source files automatically
- **CLI & MCP Integration**: Pipe formatted context to Claude Code via CLI or register as an MCP tool for automatic context retrieval

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────┐    ┌──────────────────────┐      │
│  │   visual-context-tool     │    │   dummy-target       │      │
│  │                           │    │                      │      │
│  │  ┌─────────────────────┐  │    │  React App  :3001    │      │
│  │  │  React Frontend     │  │    │  FastAPI    :8002    │      │
│  │  │  Port 5173          │  │    │  SQLite DB           │      │
│  │  └──────────┬──────────┘  │    │  (uvicorn --reload)  │      │
│  │             │              │    └───────────▲──────────┘      │
│  │  ┌──────────▼──────────┐  │                │                  │
│  │  │  FastAPI Proxy      │◄─┼────────────────┘                  │
│  │  │  Port 8000          │  │  Proxies & injects inspector.js  │
│  │  └──────────┬──────────┘  │                                  │
│  │             │ POST        │         Shared Volume             │
│  │  ┌──────────▼──────────┐  │     ┌──────────────────┐         │
│  │  │  Agent Service      │  │     │   vci-output      │         │
│  │  │  Port 8001 (internal)│──┼────►│   /output ↔ /app  │         │
│  │  │  Claude API → tools │  │     │  (agent writes    │         │
│  │  └─────────────────────┘  │     │   trigger reload) │         │
│  └───────────────────────────┘     └──────────────────┘         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
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

2. **Set your Anthropic API key** (required for the headless agent)

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Start all services**

   ```bash
   docker-compose up --build
   ```

4. **Access the application**

   - **Frontend UI**: http://localhost:5173
   - **Proxy API**: http://localhost:8000
   - **Dummy Target** (test app): http://localhost:3001

5. **Stop services**

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
| `ANTHROPIC_API_KEY` | — | API key for the headless agent (required for "Send to ADOM") |
| `ANTHROPIC_AGENT_MODEL` | `claude-sonnet-4-5-20250929` | Claude model used by the agent |
| `VCI_OUTPUT_DIR` | `/output` | Directory the agent reads/writes (mounted project root) |
| `VCI_PROJECT_DIR` | `.` | Host path mounted as `/output` in Docker |

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
├── proxy/                 # FastAPI proxy + agent service
│   ├── main.py            # Proxy application (port 8000)
│   ├── agent.py           # Headless agent service (port 8001, internal)
│   ├── agent_tools.py     # Sandboxed file tools for the agent
│   ├── formatter.py       # Python port of the prompt formatter
│   ├── injection.py       # HTML injection logic
│   └── requirements.txt
├── cli/                   # CLI and MCP integration
│   ├── vci-format.js      # CLI prompt formatter
│   ├── lib/
│   │   └── formatter.js   # Shared formatting logic
│   └── mcp/
│       └── server.js      # MCP server for Claude Code
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
   - **Interact**: Normal browsing — click through the target app
   - **Inspect**: Hover to highlight elements, click to select
   - **Screenshot**: Drag to capture a region
3. **Select elements** by clicking in Inspect mode (multi-select supported, up to 10)
4. **Upload reference images** (optional) — design mockups, screenshots, etc.
5. **Add instructions** in the text input (e.g., "Change the button color to blue")
6. **Click "Send to ADOM"** — the agent picks up the context and edits your source files

The UI shows a "Working..." spinner while the agent runs. When complete, a "Work done" toast appears and the iframe auto-reloads to show the changes.

### Alternative: CLI & MCP

If you prefer to use Claude Code directly instead of the built-in agent:

```bash
# Pipe formatted context to Claude Code
claude "$(node cli/vci-format.js)"

# Or register as an MCP tool (auto-detected by Claude Code)
claude mcp add vci-context -- node cli/mcp/server.js
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, TypeScript, Vite, Zustand |
| Proxy | Python, FastAPI, httpx, BeautifulSoup4 |
| Agent | Python, Anthropic SDK (AsyncAnthropic), Claude Sonnet |
| CLI/MCP | Node.js, @modelcontextprotocol/sdk |
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

**First attempt — client-side image codemaps**: Replace raw image data with lightweight structured metadata generated entirely in the browser via canvas pixel analysis. A Sobel edge detector extracted edge maps, dominant colors were clustered from sampled pixels, and a decision tree classified content type (screenshot, photo, icon, etc.). The resulting codemap gave the LLM semantic understanding of the image without seeing pixels — dimensions, colors, complexity, text prominence, and layout.

This worked for simple cases but had a fundamental limitation: the codemap was a lossy abstraction that couldn't capture what a designer actually cares about. A button's hover state, the spacing between elements, a gradient direction — these visual details were lost in the edge-detection pipeline. The LLM was working from a description of an image rather than the image itself.

**Pivot — Claude Vision API**: Instead of trying to compress images into text metadata, send the actual image to Claude's vision model and let it describe what it sees. The proxy forwards base64 image data to Claude Haiku's vision endpoint, which returns structured JSON: a natural-language description, identified UI elements, transcribed text, dominant colors, layout observations, and accessibility notes.

The key difference is that vision analysis captures semantic meaning that pixel analysis cannot. "A primary call-to-action button with low contrast against its background" is more useful to an agent than "dominant color: #4361EE, edge complexity: 0.72, text prominence: high." The vision response also adapts to context — it describes UI screenshots differently from design mockups or icons.

Both the drag-to-select screenshot and uploaded reference images go through the vision pipeline. Results are included in the formatted prompt sent to the agent, so it understands the visual intent behind the user's instructions.

**Code locations**: `proxy/vision.py`, `frontend/src/utils/imageAnalyzer.ts` (original codemap, still used as fallback)

### From Copy-Paste JSON to Automated Agent

**Problem**: The original VCI workflow required the user to manually copy a JSON payload from the UI, switch to a terminal, paste it into Claude Code, wait for a response, then switch back to VCI to verify the changes. This context-switching loop was slow and broke the visual feedback cycle that made VCI useful in the first place.

The JSON payload was also designed for human-readable clipboard output — raw element metadata, base64 image data, and flat key-value pairs. It wasn't structured for an LLM to act on. Claude Code would receive a blob of JSON and have to infer which files to edit, what the user wanted changed, and how the elements mapped to source code. The user became the integration layer between two tools.

**Why the pivot**: The core insight was that VCI already had everything an agent needs to act autonomously — source file paths (from React Fiber's `_debugSource`), CSS selectors, element HTML, user instructions, and design reference images. The missing piece wasn't more data; it was a loop that could read the context, call Claude, execute file edits, and report results without the user leaving the browser.

Three integration approaches were evaluated:

1. **Clipboard + manual paste** (original) — zero infrastructure but maximum friction. Every edit required a full context switch
2. **CLI pipe / MCP tool** — `claude "$(vci format)"` or an MCP server. Eliminated the paste step but still required a terminal. Good for power users who want control over the agent invocation
3. **Headless agent inside Docker** — fully automated. Click "Send to ADOM" and the agent runs in the background. The UI polls for status and auto-reloads the iframe when done

The headless approach was chosen as the primary path because it closes the feedback loop entirely: select elements, describe the change, click, see the result. The CLI and MCP integrations were kept as alternatives for users who want to pipe context into their own Claude Code sessions.

**How it works under the hood**:

```
User clicks "Send to ADOM"
       │
       ▼
Proxy writes .vci/context.json (with timestamped backup)
       │
       ▼
Proxy POSTs to localhost:8001/agent/run (fire-and-forget, internal only)
       │
       ▼
Agent reads context.json → formatter builds a structured prompt
       │
       ▼
Prompt sent to Claude API with four sandboxed tools:
  • read_file   — read source files (max 1MB)
  • write_file  — write changes (max 500KB, 20 writes/run)
  • list_directory — explore project structure
  • search_files — glob search for files
       │
       ▼
Claude responds with tool_use → agent executes → sends tool_result
  (repeats up to 15 turns until Claude sends end_turn)
       │
       ▼
Agent writes .vci/agent-result.json with status + changed files
       │
       ▼
Frontend polls /api/agent-status every 2s
  → shows "Working..." spinner during run
  → shows "Work done" toast on success
  → auto-reloads iframe to display the changes
```

### Live Backend & Database Changes

When the agent modifies backend files (models, routes), the changes take effect immediately without a container rebuild. This is possible because of three pieces working together:

**Shared volume mount**: Both the VCI container and the dummy-target container mount the same Docker volume (`vci-output`). The agent writes files to `/output` in the VCI container, which is the same filesystem as `/app` in the dummy-target container.

**Uvicorn hot-reload**: The FastAPI backend runs with `--reload --reload-dir api` (see `entrypoint.sh`). When the agent writes to `api/models.py` or `api/routes/tasks.py`, uvicorn detects the file change and restarts the server process automatically.

**Dev auto-migration**: On every server restart, the FastAPI `lifespan` handler calls `create_db_and_tables()`, which runs `auto_migrate()`. This compares the SQLModel class definitions against the live SQLite schema and applies changes:
- New columns → `ALTER TABLE ADD COLUMN` (existing data preserved)
- Removed or type-changed columns → table drop + recreate (data reset, acceptable for dev)

```
Agent writes api/models.py    (e.g. adds a new field)
       │
       ▼
Uvicorn detects file change   (--reload watches api/ directory)
       │
       ▼
Server restarts               (lifespan hook fires)
       │
       ▼
auto_migrate() runs           (compares model metadata vs SQLite schema)
       │
       ▼
ALTER TABLE ADD COLUMN         (schema updated, data preserved)
       │
       ▼
VCI iframe auto-reloads       (user sees the new field immediately)
```

The user experience is seamless: click "Send to ADOM", the agent edits both frontend and backend files, the API server hot-reloads with the new schema, and the iframe refreshes to show everything working together.

The prompt formatter uses a multi-pass budget strategy to fit within token limits. It starts with full fidelity (HTML + vision analysis), then progressively strips detail — first HTML, then vision summaries, then images and screenshots, and finally hard-truncates as a last resort. Source file paths, CSS selectors, and user instructions are always preserved since those are what the agent needs to locate and edit code.

All file operations are sandboxed to `VCI_OUTPUT_DIR` via `Path.is_relative_to()` containment checks. The agent cannot write dotfiles (`.env`, `.bashrc`), executable scripts (`.sh`, `.bat`), or files outside the mounted project directory. Port 8001 is internal to the Docker network and not exposed to the host.

**Code locations**: `proxy/agent.py`, `proxy/agent_tools.py`, `proxy/formatter.py`, `frontend/src/components/PayloadPreview.tsx`
