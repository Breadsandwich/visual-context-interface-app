import { useInspectorStore } from '../stores/inspectorStore'
import { AgentToast } from './AgentToast'
import './AgentToast.css'

export function AgentToastStack() {
  const agentWorkers = useInspectorStore((s) => s.agentWorkers)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const orchestratorStatus = useInspectorStore((s) => s.orchestratorStatus)

  const workers = Object.entries(agentWorkers)

  if (workers.length === 0) return null

  return (
    <div className={`agent-toast-stack ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {workers.map(([id, worker]) => {
        const latestProgress = worker.progress[worker.progress.length - 1]
        return (
          <AgentToast
            key={id}
            agentName={worker.agentName}
            status={worker.status}
            summary={latestProgress?.summary ?? ''}
            task={worker.task}
          />
        )
      })}
      {orchestratorStatus === 'reviewing' && (
        <AgentToast
          agentName="Reviewer"
          status="running"
          summary="Reviewing changes..."
          task="Security & code review"
        />
      )}
    </div>
  )
}
