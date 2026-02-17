# Backend Behavior v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a FastAPI backend to the dummy-target app and update the agent to handle full-stack (frontend + backend) edits seamlessly.

**Architecture:** Monolith approach — FastAPI backend lives inside `dummy-target/api/`, runs on port 8002 alongside Vite on 3001. A new AST-based backend scanner generates a backend map at export time, which the formatter injects into the agent prompt. The agent system prompt is updated to auto-detect scope.

**Tech Stack:** FastAPI, SQLModel, SQLite, Python ast module, React (existing)

---

## Task 1: Backend Foundation — Database and Models

**Files:**
- Create: `dummy-target/api/__init__.py`
- Create: `dummy-target/api/database.py`
- Create: `dummy-target/api/models.py`
- Create: `dummy-target/requirements.txt`

**Step 1: Create requirements.txt**

```
# dummy-target/requirements.txt
fastapi>=0.115.0
uvicorn[standard]>=0.34.0
sqlmodel>=0.0.22
```

**Step 2: Create database.py**

```python
# dummy-target/api/database.py
"""SQLite database engine and session factory using SQLModel."""

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DB_PATH = Path(__file__).parent / "data.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables() -> None:
    """Create all tables from SQLModel metadata. Safe to call multiple times."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Yield a database session for FastAPI dependency injection."""
    with Session(engine) as session:
        yield session
```

**Step 3: Create models.py**

```python
# dummy-target/api/models.py
"""Task model for the task manager API."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskBase(SQLModel):
    """Shared fields for create/update operations."""
    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None)
    status: TaskStatus = Field(default=TaskStatus.todo)
    priority: TaskPriority = Field(default=TaskPriority.medium)
    due_date: Optional[datetime] = Field(default=None)


class Task(TaskBase, table=True):
    """Task database table."""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TaskCreate(TaskBase):
    """Schema for creating a task. Title is required, rest have defaults."""
    pass


class TaskUpdate(SQLModel):
    """Schema for updating a task. All fields optional."""
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
```

**Step 4: Create empty __init__.py**

```python
# dummy-target/api/__init__.py
```

**Step 5: Commit**

```bash
git add dummy-target/api/__init__.py dummy-target/api/database.py dummy-target/api/models.py dummy-target/requirements.txt
git commit -m "feat: add SQLModel database and Task model for dummy-target backend"
```

---

## Task 2: Backend API — FastAPI App and CRUD Routes

**Files:**
- Create: `dummy-target/api/main.py`
- Create: `dummy-target/api/routes/__init__.py`
- Create: `dummy-target/api/routes/tasks.py`

**Step 1: Create routes/__init__.py**

```python
# dummy-target/api/routes/__init__.py
```

**Step 2: Create routes/tasks.py**

```python
# dummy-target/api/routes/tasks.py
"""CRUD endpoints for tasks."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from api.database import get_session
from api.models import Task, TaskCreate, TaskPriority, TaskStatus, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/")
def list_tasks(
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    session: Session = Depends(get_session),
) -> list[Task]:
    """List all tasks, optionally filtered by status and/or priority."""
    statement = select(Task)
    if status is not None:
        statement = statement.where(Task.status == status)
    if priority is not None:
        statement = statement.where(Task.priority == priority)
    statement = statement.order_by(Task.created_at.desc())
    return list(session.exec(statement).all())


@router.get("/{task_id}")
def get_task(task_id: int, session: Session = Depends(get_session)) -> Task:
    """Get a single task by ID."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/", status_code=201)
def create_task(body: TaskCreate, session: Session = Depends(get_session)) -> Task:
    """Create a new task."""
    task = Task.model_validate(body)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.put("/{task_id}")
def update_task(
    task_id: int, body: TaskUpdate, session: Session = Depends(get_session)
) -> Task:
    """Update an existing task. Only provided fields are changed."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, session: Session = Depends(get_session)) -> None:
    """Delete a task by ID."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
```

**Step 3: Create api/main.py**

```python
# dummy-target/api/main.py
"""FastAPI application for the dummy-target task manager backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.database import create_db_and_tables
from api.routes.tasks import router as tasks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup via SQLModel create_all."""
    create_db_and_tables()
    yield


app = FastAPI(title="DummyApp Task Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "dummy-target-api"}
```

**Step 4: Test manually (after Docker changes in Task 3)**

```bash
# From dummy-target directory:
cd dummy-target && pip install -r requirements.txt
uvicorn api.main:app --port 8002
# Then: curl http://localhost:8002/api/health
# Expected: {"status":"healthy","service":"dummy-target-api"}
# Then: curl -X POST http://localhost:8002/api/tasks/ -H "Content-Type: application/json" -d '{"title":"Test task"}'
# Expected: 201 with task JSON including id, created_at, etc.
```

**Step 5: Commit**

```bash
git add dummy-target/api/main.py dummy-target/api/routes/__init__.py dummy-target/api/routes/tasks.py
git commit -m "feat: add FastAPI task manager CRUD routes for dummy-target"
```

---

## Task 3: Docker and Infrastructure

**Files:**
- Create: `dummy-target/entrypoint.sh`
- Modify: `dummy-target/Dockerfile` (full replacement)
- Modify: `dummy-target/vite.config.js:4-12` (add proxy)
- Modify: `docker-compose.yml:39-41` (add port 8002)

**Step 1: Create entrypoint.sh**

```sh
#!/bin/sh
# Start FastAPI backend in background
uvicorn api.main:app --host 0.0.0.0 --port 8002 &

# Start Vite dev server in foreground
npm run dev
```

**Step 2: Update Dockerfile**

Replace the entire `dummy-target/Dockerfile`:

```dockerfile
FROM node:20-alpine

# Add Python for the FastAPI backend
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 3001 8002

CMD ["./entrypoint.sh"]
```

**Step 3: Update vite.config.js**

Add the `/api` proxy to the server config:

```js
// dummy-target/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/proxy/',
  server: {
    port: 3001,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 4: Update docker-compose.yml**

Add port 8002 to the dummy-target service ports:

```yaml
  dummy-target:
    build:
      context: ./dummy-target
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
      - "8002:8002"
    volumes:
      - ./dummy-target:/app
      - /app/node_modules
    networks:
      - vci-network
```

**Step 5: Verify Docker build**

```bash
docker-compose build dummy-target
# Expected: Build succeeds, both Node and Python dependencies installed
```

**Step 6: Verify both services start**

```bash
docker-compose up dummy-target
# Expected in logs:
#   - "Uvicorn running on http://0.0.0.0:8002"
#   - "VITE v5.x.x  ready in XX ms"
# Then: curl http://localhost:8002/api/health
# Expected: {"status":"healthy","service":"dummy-target-api"}
```

**Step 7: Commit**

```bash
git add dummy-target/entrypoint.sh dummy-target/Dockerfile dummy-target/vite.config.js docker-compose.yml
git commit -m "feat: add Docker infra for dual Vite + FastAPI in dummy-target"
```

---

## Task 4: Frontend — useTasks Hook

**Files:**
- Create: `dummy-target/src/hooks/useTasks.js`

**Step 1: Create the hook**

```jsx
// dummy-target/src/hooks/useTasks.js
import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api/tasks'

export function useTasks(filters = {}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.priority) params.set('priority', filters.priority)
      const query = params.toString()
      const url = query ? `${API_BASE}/?${query}` : `${API_BASE}/`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`)
      const data = await res.json()
      setTasks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.priority])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const createTask = useCallback(async (taskData) => {
    const res = await fetch(`${API_BASE}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    })
    if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
    const created = await res.json()
    setTasks(prev => [created, ...prev])
    return created
  }, [])

  const updateTask = useCallback(async (id, updates) => {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error(`Failed to update task: ${res.status}`)
    const updated = await res.json()
    setTasks(prev => prev.map(t => (t.id === id ? updated : t)))
    return updated
  }, [])

  const deleteTask = useCallback(async (id) => {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  return { tasks, loading, error, createTask, updateTask, deleteTask, refetch: fetchTasks }
}
```

**Step 2: Commit**

```bash
git add dummy-target/src/hooks/useTasks.js
git commit -m "feat: add useTasks hook for task manager API calls"
```

---

## Task 5: Frontend — Tasks Page and Routing

**Files:**
- Create: `dummy-target/src/pages/Tasks.jsx`
- Create: `dummy-target/src/pages/Tasks.css`
- Modify: `dummy-target/src/App.jsx:1-35` (add Tasks route + nav link)

**Step 1: Create Tasks.css**

Style to match the existing dummy-target pages (gradient hero, card grid, clean typography):

```css
/* dummy-target/src/pages/Tasks.css */
.tasks {
  padding: 2rem 0;
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.tasks-header h1 {
  font-size: 2rem;
}

.add-task-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.add-task-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 0.5rem 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 2rem;
  background: var(--card-background, #fff);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.filter-chip:hover {
  border-color: #667eea;
  color: #667eea;
}

.filter-chip.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  background: var(--card-background, #fff);
  border: 1px solid #e0e0e0;
  border-radius: 0.75rem;
  padding: 1.5rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.task-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.task-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

.task-actions button {
  background: none;
  border: 1px solid #e0e0e0;
  border-radius: 0.375rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.task-actions .delete-btn:hover {
  border-color: #e53e3e;
  color: #e53e3e;
}

.task-description {
  color: #666;
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.task-meta {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-todo { background: #e2e8f0; color: #4a5568; }
.badge-in_progress { background: #bee3f8; color: #2b6cb0; }
.badge-done { background: #c6f6d5; color: #276749; }
.badge-low { background: #e2e8f0; color: #4a5568; }
.badge-medium { background: #fefcbf; color: #975a16; }
.badge-high { background: #fed7d7; color: #c53030; }

.task-due {
  font-size: 0.8rem;
  color: #888;
}

/* Create form modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--card-background, #fff);
  border-radius: 1rem;
  padding: 2rem;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-weight: 600;
  font-size: 0.875rem;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.form-actions button {
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: none;
  border: 1px solid #e0e0e0;
}

.submit-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #888;
}

.empty-state p {
  font-size: 1.1rem;
  margin-bottom: 1rem;
}

.error-banner {
  background: #fed7d7;
  color: #c53030;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #888;
}
```

**Step 2: Create Tasks.jsx**

```jsx
// dummy-target/src/pages/Tasks.jsx
import { useState } from 'react'
import { useTasks } from '../hooks/useTasks'
import './Tasks.css'

const STATUS_OPTIONS = [
  { value: null, label: 'All' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS = ['low', 'medium', 'high']

function Tasks() {
  const [statusFilter, setStatusFilter] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const { tasks, loading, error, createTask, updateTask, deleteTask } = useTasks({
    status: statusFilter,
  })

  const handleCreate = async (formData) => {
    await createTask(formData)
    setShowForm(false)
  }

  const handleStatusCycle = async (task) => {
    const cycle = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
    await updateTask(task.id, { status: cycle[task.status] })
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this task?')) {
      await deleteTask(id)
    }
  }

  return (
    <div className="tasks">
      <div className="tasks-header">
        <h1>Tasks</h1>
        <button className="add-task-btn" onClick={() => setShowForm(true)}>
          + New Task
        </button>
      </div>

      <div className="filters">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.label}
            className={`filter-chip ${statusFilter === opt.value ? 'active' : ''}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <p>No tasks yet</p>
          <button className="add-task-btn" onClick={() => setShowForm(true)}>
            Create your first task
          </button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map(task => (
            <div key={task.id} className="task-card">
              <div className="task-card-header">
                <h3 className="task-title">{task.title}</h3>
                <div className="task-actions">
                  <button onClick={() => handleStatusCycle(task)}>
                    {task.status === 'done' ? 'Reopen' : task.status === 'in_progress' ? 'Done' : 'Start'}
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(task.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {task.description && (
                <p className="task-description">{task.description}</p>
              )}
              <div className="task-meta">
                <span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span>
                <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                {task.due_date && (
                  <span className="task-due">
                    Due: {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CreateTaskModal
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function CreateTaskModal({ onSubmit, onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>New Task</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional details..."
            />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={submitting || !title.trim()}>
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Tasks
```

**Step 3: Update App.jsx**

Add the Tasks import, route, and nav link. The modified `App.jsx`:

```jsx
// dummy-target/src/App.jsx
import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import Contact from './pages/Contact'
import Tasks from './pages/Tasks'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <nav className="nav">
          <div className="logo">DummyApp</div>
          <ul className="nav-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/tasks">Tasks</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>&copy; 2024 DummyApp. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default App
```

**Step 4: Verify in browser**

```bash
docker-compose up dummy-target
# Navigate to http://localhost:3001/proxy/tasks
# Expected: Tasks page renders, "No tasks yet" empty state shown
# Click "New Task", create a task
# Expected: Task appears in the list with status/priority badges
```

**Step 5: Commit**

```bash
git add dummy-target/src/pages/Tasks.jsx dummy-target/src/pages/Tasks.css dummy-target/src/hooks/useTasks.js dummy-target/src/App.jsx
git commit -m "feat: add Tasks page with CRUD UI for dummy-target"
```

---

## Task 6: Backend Map Scanner

**Files:**
- Create: `proxy/backend_scanner.py`

**Step 1: Create backend_scanner.py**

This module uses Python's `ast` module to parse FastAPI route files and SQLModel definitions without importing them.

```python
# proxy/backend_scanner.py
"""AST-based scanner for FastAPI backend structure.

Parses Python source files to extract route definitions, SQLModel classes,
and database configuration without importing the target modules.
"""

import ast
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# HTTP methods that correspond to FastAPI/APIRouter decorators
_HTTP_METHODS = frozenset({"get", "post", "put", "delete", "patch", "options", "head"})


def _extract_routes(tree: ast.Module, file_path: str) -> list[dict[str, Any]]:
    """Extract route definitions from @router.method('/path') or @app.method('/path') decorators."""
    routes: list[dict[str, Any]] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            # Match: @router.get("/path") or @app.post("/path")
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            if not isinstance(func, ast.Attribute):
                continue
            method = func.attr
            if method not in _HTTP_METHODS:
                continue
            # Extract the path argument (first positional arg)
            path = ""
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                path = str(decorator.args[0].value)
            routes.append({
                "method": method.upper(),
                "path": path,
                "function": node.name,
                "file": file_path,
                "line": node.lineno,
            })

    return routes


def _extract_models(tree: ast.Module, file_path: str) -> list[dict[str, Any]]:
    """Extract SQLModel class definitions with their fields."""
    models: list[dict[str, Any]] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        # Check if any base class name contains 'SQLModel'
        is_sqlmodel = any(
            (isinstance(base, ast.Name) and "SQLModel" in base.id)
            or (isinstance(base, ast.Attribute) and "SQLModel" in base.attr)
            for base in node.bases
        )
        if not is_sqlmodel:
            continue
        # Check for table=True in keywords (only table models, not schemas)
        is_table = any(
            isinstance(kw.value, ast.Constant) and kw.value.value is True
            for kw in node.keywords
            if kw.arg == "table"
        )
        if not is_table:
            continue

        fields: list[dict[str, str]] = []
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                type_str = ast.unparse(item.annotation) if item.annotation else "Any"
                fields.append({"name": item.target.id, "type": type_str})

        models.append({
            "name": node.name,
            "file": file_path,
            "line": node.lineno,
            "fields": fields,
        })

    return models


def _find_router_prefix(tree: ast.Module) -> str | None:
    """Find APIRouter(prefix=...) in the module."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = ""
        if isinstance(func, ast.Name):
            name = func.id
        elif isinstance(func, ast.Attribute):
            name = func.attr
        if name != "APIRouter":
            continue
        for kw in node.keywords:
            if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                return str(kw.value.value)
    return None


def scan_backend(api_dir: str | Path) -> dict[str, Any]:
    """Scan a FastAPI backend directory and return a structured map.

    Args:
        api_dir: Path to the backend API directory (e.g., 'dummy-target/api')

    Returns:
        Dict with 'endpoints', 'models', and 'database' keys.
    """
    api_path = Path(api_dir)
    if not api_path.is_dir():
        return {"endpoints": [], "models": [], "database": None}

    all_routes: list[dict[str, Any]] = []
    all_models: list[dict[str, Any]] = []
    db_info: dict[str, str] | None = None

    for py_file in sorted(api_path.rglob("*.py")):
        if py_file.name.startswith("__"):
            continue

        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except (SyntaxError, UnicodeDecodeError) as exc:
            logger.warning("Failed to parse %s: %s", py_file, exc)
            continue

        # Use relative path from api_dir's parent for cleaner references
        rel_path = str(py_file.relative_to(api_path.parent))

        # Extract routes — resolve prefix from APIRouter
        prefix = _find_router_prefix(tree) or ""
        routes = _extract_routes(tree, rel_path)
        for route in routes:
            if prefix and not route["path"].startswith(prefix):
                route["path"] = prefix + route["path"]
        all_routes.extend(routes)

        # Extract models
        all_models.extend(_extract_models(tree, rel_path))

        # Look for database URL (sqlite reference)
        if "create_engine" in source:
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if "sqlite" in node.value:
                        db_info = {"engine": "sqlite", "url": node.value}
                        break

    return {
        "endpoints": all_routes,
        "models": all_models,
        "database": db_info,
    }
```

**Step 2: Commit**

```bash
git add proxy/backend_scanner.py
git commit -m "feat: add AST-based backend scanner for agent context"
```

---

## Task 7: Formatter — Backend Section

**Files:**
- Modify: `proxy/formatter.py` (add `_build_backend_section`, update `format_payload` and `validate_payload`)

**Step 1: Add `_build_backend_section()` to formatter.py**

Add after the existing `_build_files_to_modify` function (after line 207):

```python
def _build_backend_section(backend_map: dict | None) -> str:
    """Format backend structure map for the agent prompt."""
    if not backend_map:
        return ""

    endpoints = backend_map.get("endpoints", [])
    models = backend_map.get("models", [])
    db = backend_map.get("database")

    if not endpoints and not models:
        return ""

    lines = ["### Backend Structure\n"]

    if endpoints:
        lines.append("**Endpoints:**")
        for ep in endpoints:
            method = ep.get("method", "?")
            path = ep.get("path", "?")
            file = ep.get("file", "?")
            line = ep.get("line", "")
            loc = f"{file}:{line}" if line else file
            lines.append(f"- {method} `{path}` -> `{loc}`")
        lines.append("")

    if models:
        lines.append("**Models:**")
        for model in models:
            name = model.get("name", "?")
            file = model.get("file", "?")
            line = model.get("line", "")
            loc = f"{file}:{line}" if line else file
            fields = model.get("fields", [])
            field_summary = ", ".join(
                f"{f['name']} ({f['type']})" for f in fields
            )
            lines.append(f"- **{name}** (`{loc}`): {field_summary}")
        lines.append("")

    if db:
        engine = db.get("engine", "unknown")
        lines.append(f"**Database:** {engine}")
        lines.append("")

    return "\n".join(lines) + "\n"
```

**Step 2: Update `validate_payload` to include `backendMap`**

In `validate_payload` (around line 260), add the backendMap key:

```python
def validate_payload(raw: Any) -> dict:
    """Validate and normalize a raw payload object."""
    if not isinstance(raw, dict):
        raise ValueError("Invalid payload: must be a JSON object")

    return {
        "route": raw.get("route") if isinstance(raw.get("route"), str) else None,
        "prompt": raw.get("prompt") if isinstance(raw.get("prompt"), str) else None,
        "contexts": raw.get("contexts") if isinstance(raw.get("contexts"), list) else [],
        "externalImages": raw.get("externalImages") if isinstance(raw.get("externalImages"), list) else [],
        "visualAnalysis": raw.get("visualAnalysis") or None,
        "visualPrompt": raw.get("visualPrompt") if isinstance(raw.get("visualPrompt"), str) else None,
        "timestamp": raw.get("timestamp"),
        "backendMap": raw.get("backendMap") if isinstance(raw.get("backendMap"), dict) else None,
    }
```

**Step 3: Update `format_payload` to include backend section**

In `format_payload` (around line 212), add the backend section to the multi-pass strategy. The backend section should be included in passes 1 and 2 (it's small, ~500 chars):

```python
def format_payload(payload: dict, budget: int = DEFAULT_TOKEN_BUDGET) -> str:
    max_chars = budget * CHARS_PER_TOKEN

    header = _build_header(payload)
    elements_full = _build_elements(payload.get("contexts"), True)
    elements_lite = _build_elements(payload.get("contexts"), False)
    images_full = _build_images(payload.get("externalImages"), True)
    images_lite = _build_images(payload.get("externalImages"), False)
    screenshot = _build_screenshot(payload)
    files_to_modify = _build_files_to_modify(payload.get("contexts"))
    backend = _build_backend_section(payload.get("backendMap"))

    full = header + elements_full + images_full + screenshot + backend + files_to_modify
    if len(full) <= max_chars:
        return full

    pass2 = header + elements_lite + images_full + screenshot + backend + files_to_modify
    if len(pass2) <= max_chars:
        return pass2

    pass3 = header + elements_lite + images_lite + screenshot + backend + files_to_modify
    if len(pass3) <= max_chars:
        return pass3

    pass4 = header + elements_lite + backend + files_to_modify
    if len(pass4) <= max_chars:
        return pass4

    pass5 = header + elements_lite + files_to_modify
    if len(pass5) <= max_chars:
        return pass5

    return truncate_to_token_budget(pass5, budget)
```

Note: backend is dropped in pass 5 (after images and screenshot) since it's less critical than element selectors and file paths for the agent's core editing work.

**Step 4: Commit**

```bash
git add proxy/formatter.py
git commit -m "feat: add backend structure section to agent prompt formatter"
```

---

## Task 8: Proxy Integration — Call Scanner During Export

**Files:**
- Modify: `proxy/main.py:131-206` (update `export_context` endpoint)

**Step 1: Add import at top of main.py**

Add after existing imports (around line 24):

```python
from backend_scanner import scan_backend
```

**Step 2: Update export_context to inject backend map**

In the `export_context` function, after writing context.json (around line 183-184), add backend scanning. The key change is to scan the backend, inject the map into the payload, and write the enriched version:

Between building `payload_json` and writing to disk, insert the backend scan:

```python
@app.post("/api/export-context")
async def export_context(request_body: ExportContextRequest):
    """Export VCI context payload to .vci/context.json on disk."""
    if not VCI_OUTPUT_DIR:
        # ... existing error handling unchanged ...

    try:
        # ... existing path validation unchanged ...

        vci_dir = output_base / ".vci"
        history_dir = vci_dir / "history"

        # ... existing traversal check unchanged ...

        vci_dir.mkdir(exist_ok=True)
        history_dir.mkdir(exist_ok=True)

        # Scan backend structure and inject into payload
        payload = request_body.payload
        api_dir = output_base / "dummy-target" / "api"
        if api_dir.is_dir():
            try:
                backend_map = scan_backend(api_dir)
                if backend_map.get("endpoints") or backend_map.get("models"):
                    payload = {**payload, "backendMap": backend_map}
            except Exception:
                logger.warning("Backend scan failed, continuing without backend map")

        payload_json = json_module.dumps(payload, indent=2)

        # Write latest context
        context_path = vci_dir / "context.json"
        context_path.write_text(payload_json, encoding="utf-8")

        # ... rest of function unchanged (history write, agent trigger, return) ...
```

Important: We use `{**payload, "backendMap": backend_map}` (immutable pattern) rather than mutating the request payload.

**Step 3: Commit**

```bash
git add proxy/main.py
git commit -m "feat: integrate backend scanner into context export pipeline"
```

---

## Task 9: Agent System Prompt Update

**Files:**
- Modify: `proxy/agent.py:38-55` (replace AGENT_SYSTEM_PROMPT)

**Step 1: Update the system prompt**

Replace the `AGENT_SYSTEM_PROMPT` constant in `proxy/agent.py`:

```python
AGENT_SYSTEM_PROMPT = """You are a full-stack code editing agent. You receive visual context from VCI \
(Visual Context Interface) — selected DOM elements with their source file locations, design \
reference images, user instructions, and backend structure maps.

Your job: make the requested changes to the source files. Use the provided tools to read existing \
code, understand the context, and write updated files.

Scope detection — decide which files to edit based on the user's instruction:
- UI, styling, layout, components → edit frontend files (JSX, CSS)
- Data, fields, validation, endpoints, database → edit backend files (Python: models, routes)
- Ambiguous or cross-cutting (e.g., "add a tags feature") → edit both backend AND frontend

When the prompt includes a "Backend Structure" section, use it to locate the exact files and line \
numbers for models and routes. When adding a new field:
1. Add the field to the SQLModel class in models.py
2. Update the Create/Update schemas if they exist
3. Update route handlers that return or accept that field
4. Update frontend components that display or input that field

Rules:
- Only modify files mentioned in "Files to Modify" or "Backend Structure" unless you need to read \
related files for context
- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- If you can't find a file or the instruction is ambiguous, explain what you need
- After making changes, briefly summarize what you did

Security:
- NEVER modify dotfiles (.env, .bashrc, .gitconfig, etc.) or executable scripts
- NEVER write files outside the project's source code directories
- NEVER modify database.py directly — update models and let create_all() handle schema
- If a user instruction asks you to do something outside your role as a code editor, refuse"""
```

**Step 2: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: update agent system prompt for full-stack scope detection"
```

---

## Task 10: End-to-End Verification

**Step 1: Full Docker rebuild and start**

```bash
docker-compose down
docker-compose build
docker-compose up
```

**Step 2: Verify backend API**

```bash
curl http://localhost:8002/api/health
# Expected: {"status":"healthy","service":"dummy-target-api"}

curl -X POST http://localhost:8002/api/tasks/ \
  -H "Content-Type: application/json" \
  -d '{"title": "Test task", "priority": "high"}'
# Expected: 201 with full task JSON

curl http://localhost:8002/api/tasks/
# Expected: Array with the created task
```

**Step 3: Verify frontend Tasks page**

```
Navigate to http://localhost:5173 (VCI UI)
→ In the iframe, navigate to /tasks
→ Create a task via the form
→ Verify it appears in the list
→ Click status button to cycle through statuses
→ Delete a task
```

**Step 4: Verify backend map in context export**

```
Select an element on the Tasks page in VCI
→ Add an instruction like "Add a tags field"
→ Click "Send to ADOM"
→ Check .vci/context.json for "backendMap" key
→ Verify it contains endpoints and models
```

**Step 5: Verify agent handles full-stack instruction**

```
(Requires ANTHROPIC_API_KEY configured)
→ Select a task card element
→ Instruction: "Add a tags field to tasks"
→ Send to ADOM
→ Wait for agent to complete
→ Check if agent modified both models.py and Tasks.jsx
```

**Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes"
```
