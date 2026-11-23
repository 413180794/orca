import { describe, expect, it } from 'vitest'
import type {
  AutomationRun,
  AutomationRunStatus
} from '../../../shared/automations/history/automation-run'
import { listActiveAutomationRuns } from './automation-active-runs'

function run(id: string, status: AutomationRunStatus): AutomationRun {
  return {
    id,
    automationId: 'automation-1',
    title: id,
    scheduledFor: 20,
    status,
    trigger: 'manual',
    workspaceId: 'wt',
    workspaceDisplayName: 'wt',
    sessionKind: 'chat',
    chatSessionId: 'chat-1',
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    error: null,
    startedAt: 20,
    dispatchedAt: 20,
    createdAt: 20,
    runNumber: 1
  }
}

describe('runs not yet final', () => {
  it('walks a run history once, and again only once it is replaced', () => {
    const state = { automationRuns: [run('done', 'completed'), run('going', 'dispatched')] }
    const first = listActiveAutomationRuns(state)
    expect(first.map(({ id }) => id)).toEqual(['going'])
    expect(listActiveAutomationRuns(state)).toBe(first)

    state.automationRuns = state.automationRuns.map((entry) =>
      entry.id === 'going' ? { ...entry, status: 'completed' as const } : entry
    )
    expect(listActiveAutomationRuns(state)).toEqual([])
  })
})
