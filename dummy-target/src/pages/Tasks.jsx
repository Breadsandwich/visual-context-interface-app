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
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
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
      try {
        await deleteTask(id)
      } catch (err) {
        console.error('Failed to delete task:', err)
        alert('Failed to delete task. Please try again.')
      }
    }
  }

  const handleFlagClick = (task) => {
    if (task.issue_flagged && !task.issue_resolved) {
      // If flagged but not resolved, mark as resolved
      updateTask(task.id, { issue_resolved: true })
    } else if (task.issue_flagged && task.issue_resolved) {
      // If flagged and resolved, unflag completely
      updateTask(task.id, { issue_flagged: false, issue_resolved: false, issue_description: null })
    } else {
      // If not flagged, show modal to input issue
      setSelectedTask(task)
      setShowFlagModal(true)
    }
  }

  const handleFlagSubmit = async (issueDescription) => {
    if (selectedTask) {
      await updateTask(selectedTask.id, { 
        issue_flagged: true, 
        issue_resolved: false,
        issue_description: issueDescription 
      })
      setShowFlagModal(false)
      setSelectedTask(null)
    }
  }

  const handleAssigneeChange = async (taskId, newAssignee) => {
    await updateTask(taskId, { assignee: newAssignee || null })
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
            <TaskCard 
              key={task.id} 
              task={task}
              onStatusCycle={handleStatusCycle}
              onDelete={handleDelete}
              onFlagClick={handleFlagClick}
              onAssigneeChange={handleAssigneeChange}
            />
          ))}
        </div>
      )}

      {showForm && (
        <CreateTaskModal
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {showFlagModal && (
        <FlagIssueModal
          onSubmit={handleFlagSubmit}
          onClose={() => {
            setShowFlagModal(false)
            setSelectedTask(null)
          }}
        />
      )}
    </div>
  )
}

function TaskCard({ task, onStatusCycle, onDelete, onFlagClick, onAssigneeChange }) {
  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [assigneeValue, setAssigneeValue] = useState(task.assignee || '')

  const handleAssigneeClick = () => {
    setIsEditingAssignee(true)
    setAssigneeValue(task.assignee || '')
  }

  const handleAssigneeSave = async () => {
    const trimmed = assigneeValue.trim()
    if (trimmed !== (task.assignee || '')) {
      await onAssigneeChange(task.id, trimmed)
    }
    setIsEditingAssignee(false)
  }

  const handleAssigneeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAssigneeSave()
    } else if (e.key === 'Escape') {
      setIsEditingAssignee(false)
      setAssigneeValue(task.assignee || '')
    }
  }

  return (
    <div className={`task-card ${task.issue_flagged && !task.issue_resolved ? 'task-flagged' : ''} ${task.issue_resolved ? 'task-resolved' : ''}`}>
      <div className="task-card-header">
        <h3 className="task-title">{task.title}</h3>
        <div className="task-actions">
          <button 
            className={`flag-btn ${task.issue_flagged ? 'flagged' : ''}`}
            onClick={() => onFlagClick(task)}
            title={task.issue_flagged && !task.issue_resolved ? 'Mark issue as resolved' : task.issue_resolved ? 'Clear flag' : 'Flag issue'}
          >
            {task.issue_flagged && !task.issue_resolved ? '🚩' : task.issue_resolved ? '✓' : '⚑'}
          </button>
          <button onClick={() => onStatusCycle(task)}>
            {task.status === 'done' ? 'Reopen' : task.status === 'in_progress' ? 'Done' : 'Start'}
          </button>
          <button className="delete-btn" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      </div>
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      {task.issue_flagged && task.issue_description && (
        <div className="task-issue-section">
          <div className="task-issue-header">
            <span className="issue-icon">⚠️</span>
            <strong>Flagged Issue:</strong>
          </div>
          <p className="task-issue-description">{task.issue_description}</p>
        </div>
      )}
      <div className="task-meta">
        <span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
        {task.category && (
          <span className="badge badge-category">{task.category}</span>
        )}
        {task.issue_flagged && !task.issue_resolved && (
          <span className="badge badge-issue">issue flagged</span>
        )}
        {task.issue_resolved && (
          <span className="badge badge-issue-resolved">issue resolved</span>
        )}
        {task.due_date && (
          <span className="task-due">
            Due: {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      {/* Assignee Section */}
      <div className="task-assignee-section">
        {isEditingAssignee ? (
          <input
            type="text"
            className="assignee-inline-edit"
            value={assigneeValue}
            onChange={(e) => setAssigneeValue(e.target.value)}
            onBlur={handleAssigneeSave}
            onKeyDown={handleAssigneeKeyDown}
            placeholder="Assign to..."
            autoFocus
          />
        ) : (
          <div className="task-assignee" onClick={handleAssigneeClick}>
            <span className="assignee-icon">👤</span>
            <span className="assignee-name">
              {task.assignee || 'Unassigned'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateTaskModal({ onSubmit, onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('')
  const [assignee, setAssignee] = useState('')
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
        category: category.trim() || null,
        assignee: assignee.trim() || null,
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
            <label>Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g., Work, Personal, Urgent..."
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label>Assignee</label>
            <input
              type="text"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              placeholder="Assign to..."
              maxLength={100}
            />
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

function FlagIssueModal({ onSubmit, onClose }) {
  const [issueDescription, setIssueDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!issueDescription.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(issueDescription.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Flag Issue</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Issue Description</label>
            <textarea
              value={issueDescription}
              onChange={e => setIssueDescription(e.target.value)}
              placeholder="Describe the issue with this task..."
              rows={4}
              required
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={submitting || !issueDescription.trim()}>
              {submitting ? 'Flagging...' : 'Flag Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Tasks
