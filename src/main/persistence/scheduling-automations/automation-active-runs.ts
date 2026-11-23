// The runs not yet final, read without walking or sorting the whole history each time: every
// mutation replaces the run array, so one pass per array serves every read until the next change.
import {
  isFinalAutomationRunStatus,
  type AutomationRun
} from '../../../shared/automations/history/automation-run'
import type { PersistedState } from '../../../shared/orca-profiles/persisted-state-types'

const activeByHistory = new WeakMap<readonly AutomationRun[], readonly AutomationRun[]>()

/** Retention never prunes a run that is not final, so this is all of them. */
export function listActiveAutomationRuns(
  state: Pick<PersistedState, 'automationRuns'>
): readonly AutomationRun[] {
  const history = state.automationRuns ?? []
  let active = activeByHistory.get(history)
  if (!active) {
    active = history.filter((run) => !isFinalAutomationRunStatus(run.status))
    activeByHistory.set(history, active)
  }
  return active
}
