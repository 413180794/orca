import type { AgentDotState } from '@/components/agent/status/AgentStateDot'
import type {
  WorkerDockEntry,
  WorkerDockResult
} from '../../../../../../../shared/orchestration/dock/worker-dock'

/** The app-wide agent glyph for a dock state, so a running worker spins in the same amber as the
 *  sidebar and bot panel instead of a dock-only gray. */
export function workerDockDotState(
  state: WorkerDockEntry['state'],
  retired = false
): AgentDotState {
  if (retired) {
    return 'done'
  }
  switch (state) {
    case 'starting':
    case 'running':
    case 'stopping':
    case 'saving':
      return 'working'
    case 'needs-you':
      return 'permission'
    case 'waiting':
    case 'coordinator':
      return 'waiting'
    case 'idle':
      return 'idle'
    case 'failed':
    case 'unexpected':
      return 'failed'
    case 'unavailable':
      return 'unverifiable'
  }
}

export function workerDockResultDotState(
  outcome: WorkerDockResult['outcome'] | undefined
): AgentDotState {
  switch (outcome) {
    case 'failed':
    case 'unexpected':
      return 'failed'
    case 'stopped':
      return 'interrupted'
    case 'succeeded':
    case undefined:
      return 'done'
  }
}
