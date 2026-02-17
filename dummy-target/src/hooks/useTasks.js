import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/proxy/api/tasks'

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
