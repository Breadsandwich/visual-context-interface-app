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
