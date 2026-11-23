import { describe, expect, it } from 'vitest'
import {
  AgentSessionTabTable,
  agentSessionTabTableFromStored,
  storedAgentSessionBackground
} from './agent-session-tab-index'

describe('AgentSessionTabTable ended chats', () => {
  it('ends a background chat until it is shown again', () => {
    const table = new AgentSessionTabTable([], ['s1', 's2'])
    table.end('s1')
    expect(table.isEnded('s1')).toBe(true)
    expect(table.isInBackground('s1')).toBe(false)
    expect(table.tabIdFor('s1')).toBeUndefined()

    table.show('s1')
    expect(table.isEnded('s1')).toBe(false)
  })

  it('keeps an ended chat ended when a late legacy close holds it in the background', () => {
    const table = new AgentSessionTabTable([['tab-a', 'a']], ['b'])
    table.end('a')
    table.end('b')
    // A legacy `agentSession.close` captured before End lands its background write afterwards.
    table.holdInBackground('a')
    table.holdInBackground('b')
    for (const id of ['a', 'b']) {
      expect(table.isEnded(id)).toBe(true)
      expect(table.isInBackground(id)).toBe(false)
    }
    const restored = agentSessionTabTableFromStored([], storedAgentSessionBackground(table))
    expect(restored.isEnded('b')).toBe(true)
    expect(restored.isInBackground('b')).toBe(false)
  })

  it('keeps ended chats across storage and clones', () => {
    const table = new AgentSessionTabTable([['tab-a', 'a']], ['b'])
    table.end('a')
    const restored = agentSessionTabTableFromStored(
      table.entries(),
      storedAgentSessionBackground(table)
    )
    expect(restored.isEnded('a')).toBe(true)
    expect(restored.isInBackground('b')).toBe(true)
    expect(restored.clone().isEnded('a')).toBe(true)
    expect(restored.equals(table)).toBe(true)
  })

  it('never stores a chat as ended and listed at once', () => {
    const restored = agentSessionTabTableFromStored([['tab-a', 'a']], {
      ids: ['b'],
      backfilled: false,
      ended: ['a', 'b', 'c']
    })
    expect(restored.isEnded('a')).toBe(false)
    expect(restored.isEnded('b')).toBe(false)
    expect(restored.isEnded('c')).toBe(true)
  })
})
