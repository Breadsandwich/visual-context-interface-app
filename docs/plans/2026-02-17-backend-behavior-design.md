# Backend Behavior v2 — Design Document

**Date**: 2026-02-17
**Branch**: `feat/backend-behavior-v2`
**Status**: Approved

## Goal

Build a working FastAPI backend for the dummy-target app and update the agent's magic wand behavior so it can make both frontend and backend changes seamlessly. The AI agent auto-detects whether an instruction requires frontend, backend, or full-stack modifications.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Monolith (backend inside dummy-target) | Agent already operates on dummy-target files; co-location is simplest |
| Backend framework | FastAPI + SQLModel + SQLite | Matches existing Python stack; SQLModel gives auto-migrate via create_all() |
| Domain | Task manager (CRUD) | Classic demo, easy to understand, rich surface for agent edits |
| Scope detection | AI auto-detects | No extra UI friction; agent reasons about scope from instruction + context |
| Backend context | Include backend map in payload | Proactive context beats expensive agent discovery |
| DB mutations | Code + auto-migrate | SQLModel create_all() on startup; no Alembic needed for demo |

## Section 1: Backend Structure

```
dummy-target/
├── api/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, lifespan (create_all)
│   ├── database.py           # SQLite engine + session factory
│   ├── models.py             # Task SQLModel
│   └── routes/
│       ├── __init__.py
│       └── tasks.py          # CRUD endpoints
├── requirements.txt          # fastapi, uvicorn, sqlmodel
├── entrypoint.sh             # Starts both Vite + Uvicorn
```

### Task Model (SQLModel)

| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | auto-increment |
| title | str | required, max 200 chars |
| description | str | optional |
| status | enum | "todo", "in_progress", "done" |
| priority | enum | "low", "medium", "high" |
| due_date | datetime | optional |
| created_at | datetime | auto-set |
| updated_at | datetime | auto-updated |

### API Endpoints (port 8002)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tasks | List tasks (filter by status, priority) |
| GET | /api/tasks/{id} | Get single task |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/{id} | Update task |
| DELETE | /api/tasks/{id} | Delete task |
| GET | /api/health | Health check |

## Section 2: Docker & Infrastructure

- **Dockerfile**: Add Python (apk add python3 py3-pip) to existing node:20-alpine
- **entrypoint.sh**: Start Uvicorn (port 8002) in background, Vite (port 3001) in foreground
- **vite.config.js**: Add proxy `/api` -> `http://localhost:8002`
- **docker-compose.yml**: Expose port 8002 alongside 3001

## Section 3: Frontend Integration

New files:
- `dummy-target/src/pages/Tasks.jsx` — Task list with create form, filter chips, inline edit
- `dummy-target/src/pages/Tasks.css` — Styling matching existing pages
- `dummy-target/src/hooks/useTasks.js` — Custom hook (fetch, create, update, delete, refetch)
- `dummy-target/src/App.jsx` — Add /tasks route + nav link

## Section 4: Backend Map Generator

New file: `proxy/backend_scanner.py`

- Uses Python `ast` module to parse backend .py files
- Extracts: route decorators (method, path, file, line), SQLModel classes (name, fields, types), database config
- Returns structured dict added to context.json as `backendMap`
- Called during `/api/export-context` in proxy/main.py

### Formatter Addition

New `_build_backend_section()` in `proxy/formatter.py`:
- Renders endpoints with file:line references
- Renders models with field summaries
- Included in pass 1 and 2 of multi-pass budget (small footprint, ~500 chars)

## Section 5: Agent System Prompt

Update `AGENT_SYSTEM_PROMPT` in `proxy/agent.py`:
- Change identity from "frontend code editing agent" to "full-stack code editing agent"
- Add scope auto-detection framework (UI → frontend, data/fields/endpoints → backend, ambiguous → both)
- Add backend-specific rules (model field → update model + routes + frontend, new endpoint → follow existing route pattern)
- Keep existing security rules (no dotfiles, no scripts, sandbox only)

## Section 6: What Changes vs. What Doesn't

### Changes
| Component | Change |
|-----------|--------|
| `dummy-target/api/` | New FastAPI backend |
| `dummy-target/Dockerfile` | Add Python, entrypoint |
| `dummy-target/vite.config.js` | Add /api proxy |
| `dummy-target/src/` | New Tasks page + hook |
| `docker-compose.yml` | Expose port 8002 |
| `proxy/backend_scanner.py` | New — AST backend scanner |
| `proxy/main.py` | Call scanner during export |
| `proxy/formatter.py` | New _build_backend_section() |
| `proxy/agent.py` | Updated system prompt |

### No Changes
- Inspector behavior (selection, highlighting, screenshots)
- Export endpoint signature (POST /api/export-context)
- Agent tools (read_file, write_file, etc.)
- Polling mechanism (/api/agent-status)
- Frontend Zustand store
