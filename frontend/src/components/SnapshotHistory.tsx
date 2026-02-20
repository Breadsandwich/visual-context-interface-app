import { useState, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import './SnapshotHistory.css'

interface SnapshotManifest {
  run_id: string
  timestamp: string
  files: string[]
  context_summary: string
  status: 'success' | 'error' | 'pruned' | 'in_progress'
}

export function SnapshotHistory() {
  const [snapshots, setSnapshots] = useState<SnapshotManifest[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const lastSnapshotRunId = useInspectorStore((s) => s.lastSnapshotRunId)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const { showToast, reloadIframe } = useInspectorStore.getState()

  const fetchSnapshots = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/snapshots')
      const data = await resp.json()
      setSnapshots(data.snapshots ?? [])
    } catch {
      setSnapshots([])
    } finally {
      setLoading(false)
    }
  }

  // Refetch on mount, when a new snapshot is created, or when sidebar opens
  useEffect(() => {
    fetchSnapshots()
  }, [lastSnapshotRunId, isSidebarOpen])

  const handleRestore = async (runId: string) => {
    setRestoring(runId)
    try {
      const resp = await fetch(`/api/snapshots/${runId}/restore`, { method: 'POST' })
      if (resp.ok) {
        showToast('Changes reverted')
        reloadIframe()
      } else {
        const data = await resp.json()
        showToast(data.error ?? 'Restore failed')
      }
    } catch {
      showToast('Restore failed')
    } finally {
      setRestoring(null)
    }
  }

  const formatTimestamp = (iso: string): string => {
    try {
      const date = new Date(iso)
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const formatFiles = (files: string[]): string => {
    const short = files.map((f) => f.split('/').pop() ?? f)
    if (short.length <= 2) return short.join(', ')
    return `${short[0]}, ${short[1]} +${short.length - 2} more`
  }

  if (loading) {
    return <div className="snapshot-history-loading">Loading snapshots...</div>
  }

  if (snapshots.length === 0) {
    return <div className="snapshot-history-empty">No snapshots yet</div>
  }

  return (
    <div className="snapshot-history">
      <div className="snapshot-history-list">
        {snapshots.map((snap) => (
          <div key={snap.run_id} className={`snapshot-item snapshot-item--${snap.status}`}>
            <div className="snapshot-item-header">
              <span className="snapshot-item-time">{formatTimestamp(snap.timestamp)}</span>
              {snap.status === 'pruned' && (
                <span className="snapshot-item-badge">history only</span>
              )}
              {snap.status !== 'pruned' && snap.status !== 'in_progress' && (
                <button
                  className="snapshot-item-restore"
                  onClick={() => handleRestore(snap.run_id)}
                  disabled={restoring === snap.run_id}
                >
                  {restoring === snap.run_id ? 'Restoring...' : 'Restore'}
                </button>
              )}
            </div>
            {snap.context_summary && (
              <p className="snapshot-item-summary">{snap.context_summary}</p>
            )}
            {snap.files.length > 0 && (
              <span className="snapshot-item-files">{formatFiles(snap.files)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
