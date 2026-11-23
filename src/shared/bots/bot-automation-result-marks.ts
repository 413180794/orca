// A bot's automation results ride a person's next message to the agent; these mark the notes whose
// row must not read as told: a refused send owes them again, and a later /clear drops them for good.
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../agent-session/journal/agent-session-journal-types'
import { agentJournalSubmissionKey } from '../agent-session/journal/agent-session-journal-item-key'
import { refusedBeforeWrite } from '../agent-session/lifecycle/stopping/agent-session-stopped-history'
import { latestAgentSessionContextClearSequence } from '../agent-session/conversation-context/agent-session-context-clear'
import type { NativeChatMessage } from '../native-chat/native-chat-types'
import { automationResultNoteOf } from './bot-automation-result-note'

/** By row id: `owed`, its carrier was refused before the agent read it, so it rides again; `cleared`,
 *  unread when a later /clear left it out of the agent's context, so it never rides. */
type AutomationResultMarks = Map<string, 'owed' | 'cleared'>

export function automationResultMarks(
  items: readonly AgentJournalRenderItem[],
  /** Sends by the row id of the message each wrote. */
  submissions: ReadonlyMap<string, AgentJournalSubmission>
): AutomationResultMarks {
  const marks: AutomationResultMarks = new Map()
  const owedAgain = (carrierId: string) => {
    const carrier = submissions.get(agentJournalSubmissionKey(carrierId))
    return carrier !== undefined && refusedBeforeWrite(carrier)
  }
  const floor = latestAgentSessionContextClearSequence(items)
  for (const { body, itemId, sequence } of items) {
    const note = body.kind === 'status' ? automationResultNoteOf(body) : null
    if (!note || (note.readWith !== undefined && !owedAgain(note.readWith))) {
      continue
    }
    if (sequence < floor) {
      marks.set(itemId, 'cleared')
    } else if (note.readWith !== undefined) {
      marks.set(itemId, 'owed')
    }
  }
  return marks
}

export function withAutomationResultMarks(
  message: NativeChatMessage,
  marks: AutomationResultMarks
): NativeChatMessage {
  const mark = marks.get(message.id)
  if (!mark) {
    return message
  }
  return {
    ...message,
    blocks: message.blocks.map((block) => {
      if (block.type !== 'text' || !block.automationResult) {
        return block
      }
      const { readWith: _owed, ...unread } = block.automationResult
      return mark === 'cleared'
        ? { ...block, automationResult: unread, automationResultCleared: true as const }
        : { ...block, automationResult: unread }
    })
  }
}
