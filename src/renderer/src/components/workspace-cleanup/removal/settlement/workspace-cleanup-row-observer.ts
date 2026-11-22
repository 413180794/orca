import type { WorkspaceCleanupCandidate } from '../../../../../../shared/workspace-cleanup/workspace-cleanup'

/** Row observers only drive progress UI; their errors must never read as removal failures. */
export function notifyWorkspaceCleanupRowObserver(
  observer: ((candidate: WorkspaceCleanupCandidate) => void) | undefined,
  candidate: WorkspaceCleanupCandidate
): void {
  try {
    observer?.(candidate)
  } catch (callbackError) {
    console.error('Workspace cleanup row callback failed', callbackError)
  }
}
