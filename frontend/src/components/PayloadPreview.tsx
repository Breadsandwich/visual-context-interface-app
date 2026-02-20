import { useRef, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { exportToFile } from '../utils/payloadBuilder'
import './PayloadPreview.css'

const AGENT_POLL_INTERVAL = 2000
const AGENT_POLL_MAX_ATTEMPTS = 150 // 5 minutes max
const IDLE_GRACE_POLLS = 3 // Exit after 3 consecutive idle polls (~6s)
const UNAVAILABLE_MAX_POLLS = 15 // Give up after ~30s of backend unreachable

interface AgentStatusResponse {
  status: 'idle' | 'analyzing' | 'clarifying' | 'running' | 'success' | 'error' | 'unavailable'
  filesChanged?: string[]
  message?: string | null
  error?: string | null
  clarification?: { question: string; context: string } | null
  progress?: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  plan?: string | null
  run_id?: string | null
}

async function fetchAgentStatus(): Promise<AgentStatusResponse> {
  try {
    const resp = await fetch('/api/agent-status')
    return await resp.json()
  } catch {
    return { status: 'unavailable' }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export function PayloadPreview() {
  const { generatePayload, selectedElements, screenshotData, userPrompt, uploadedImages, showToast, showPersistentToast, reloadIframe, setAgentProgress, setAgentClarification, setAgentPlan, clearAgentState, dismissToast, setLastSnapshotRunId } = useInspectorStore()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      clearAgentState()
    }
  }, [clearAgentState])

  const hasContent = selectedElements.length > 0 || screenshotData || userPrompt || uploadedImages.length > 0

  const pollAgentStatus = async () => {
    if (abortRef.current && !abortRef.current.signal.aborted) return

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    try {
      let idleCount = 0
      let unavailableCount = 0

      for (let attempt = 0; attempt < AGENT_POLL_MAX_ATTEMPTS; attempt++) {
        await delay(AGENT_POLL_INTERVAL, signal)

        const status = await fetchAgentStatus()

        if (signal.aborted) return

        if (status.status === 'unavailable') {
          unavailableCount++
          if (unavailableCount > UNAVAILABLE_MAX_POLLS) {
            clearAgentState()
            dismissToast()
            showToast('Agent is not responding — please try again')
            return
          }
          continue
        }

        unavailableCount = 0

        if (status.status === 'success') {
          if (status.run_id) {
            setLastSnapshotRunId(status.run_id)
          }
          clearAgentState()
          dismissToast()
          showToast('Work done')
          reloadIframe()
          return
        }

        if (status.status === 'error') {
          clearAgentState()
          dismissToast()
          showToast(`Agent error: ${status.error ?? 'Unknown error'}`)
          return
        }

        if (status.status === 'analyzing') {
          showPersistentToast('Analyzing your request...')
          continue
        }

        if (status.status === 'clarifying' && status.clarification) {
          dismissToast()
          setAgentClarification(status.clarification)
          if (status.plan) setAgentPlan(status.plan)
          continue
        }

        if (status.status === 'running') {
          setAgentClarification(null)

          if (status.progress && status.progress.length > 0) {
            setAgentProgress(status.progress)
            if (status.plan) setAgentPlan(status.plan)
          } else {
            showPersistentToast('Working...')
          }
          continue
        }

        if (status.status === 'idle') {
          idleCount++
          if (idleCount >= IDLE_GRACE_POLLS) {
            clearAgentState()
            dismissToast()
            return
          }
          continue
        }

        idleCount = 0
      }

      clearAgentState()
      showToast('Agent is still running — check back later')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    } finally {
      abortRef.current = null
      const { isToastPersistent } = useInspectorStore.getState()
      if (isToastPersistent) {
        clearAgentState()
        dismissToast()
      }
    }
  }

  const handleSendToAdom = async () => {
    const payload = generatePayload()

    const fileResult = await exportToFile(payload)

    if (fileResult.success) {
      showPersistentToast('Working...')
      pollAgentStatus()
      return
    }

    showToast('File export unavailable')
  }

  return (
    <div className="payload-preview">
      <button
        className="send-to-adom-button"
        onClick={handleSendToAdom}
        disabled={!hasContent}
      >
        Send to ADOM
      </button>
    </div>
  )
}
