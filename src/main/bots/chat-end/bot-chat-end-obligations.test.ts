// What a side chat owes from orchestration: a Run it coordinated never ends in PR 1; a Dispatch holds
// it only while that Dispatch is open, so a finished one leaves an otherwise idle chat endable.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../../runtime/orchestration/db/orchestration-db'
import { formatOrcaSessionAddress } from '../../../shared/agent-session/identity/orca-session-address'
import { botChatEndObligations } from './bot-chat-end-obligations'

const CHAT = '00000000-0000-4000-8000-0000000000c1'
const OTHER = '00000000-0000-4000-8000-0000000000c2'

let db: OrchestrationDb

function owes(): ReturnType<typeof botChatEndObligations> {
  return botChatEndObligations(
    { db, automations: () => [], runsOf: () => new Map(), deliveryPending: () => false },
    'bot-1',
    [CHAT]
  )
}

function dispatch(id: string, status: string, columns: Record<string, string>): void {
  const names = Object.keys(columns)
  db.db
    .prepare(
      `INSERT INTO dispatch_contexts (id, task_id, status, ${names.join(', ')})
       VALUES (?, 'task', ?, ${names.map(() => '?').join(', ')})`
    )
    .run(id, status, ...Object.values(columns))
}

beforeEach(() => {
  db = new OrchestrationDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('orchestration a side chat took part in', () => {
  it.each([
    ['given', { assignee_orca_session_id: CHAT }],
    ['given by handle', { assignee_handle: formatOrcaSessionAddress(CHAT) }],
    ['created', { creator_orca_session_id: CHAT }]
  ])('holds it while a Dispatch it was %s is open, and not once that is final', (_, columns) => {
    dispatch('d-open', 'dispatched', columns)
    expect(owes()).toEqual([{ kind: 'dispatch' }])

    db.db.prepare("UPDATE dispatch_contexts SET status = 'completed' WHERE id = 'd-open'").run()
    expect(owes()).toEqual([])
  })

  it("never counts another chat's Dispatch", () => {
    dispatch('d-other', 'dispatched', { assignee_orca_session_id: OTHER })
    expect(owes()).toEqual([])
  })

  it('refuses a chat that coordinated a Run for good, finished or not', () => {
    db.createRun({
      objective: 'ship',
      coordinatorHandle: null,
      coordinatorPaneKey: null,
      coordinatorOrcaSessionId: CHAT
    })
    expect(owes()).toEqual([{ kind: 'ran-workers' }])
  })
})
