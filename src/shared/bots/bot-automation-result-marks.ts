// A bot's automation results ride a person's next message to the agent; a later /clear leaves the
// unread ones out of the agent's context for good, and these mark which.
import type { AgentJournalRenderItem } from '../agent-session/journal/agent-session-journal-types'
import { latestAgentSessionContextClearSequence } from '../agent-session/conversation-context/agent-session-context-clear'
import type { NativeChatMessage } from '../native-chat/native-chat-types'
import { automationResultNoteOf } from './bot-automation-result-note'

/** Unread notes, by row id, that a later /clear left out of the agent's context: they never ride. */
export function automationResultMarks(items: readonly AgentJournalRenderItem[]): Set<string> {
  const cleared = new Set<string>()
  const floor = latestAgentSessionContextClearSequence(items)
  for (const { body, itemId, sequence } of items) {
    const note = body.kind === 'status' ? automationResultNoteOf(body) : null
    if (note && note.readWith === undefined && sequence < floor) {
      cleared.add(itemId)
    }
  }
  return cleared
}

export function withAutomationResultMarks(
  message: NativeChatMessage,
  cleared: ReadonlySet<string>
): NativeChatMessage {
  if (!cleared.has(message.id)) {
    return message
  }
  return {
    ...message,
    blocks: message.blocks.map((block) =>
      block.type === 'text' && block.automationResult
        ? { ...block, automationResultCleared: true as const }
        : block
    )
  }
}
