// The item's waiting ask in chat's own answer card, docked where the comment box is: each open question
// with its options (detail, Recommended, pick several where the agent asked so), Other… for your own
// words, one question at a time when there are several. The answers post as one comment naming the ask,
// so the agent wakes once; lines left unanswered close as skipped. Not now folds it to the chat's strip.
import { useState } from 'react'
import {
  botItemQuestionLine,
  type BotItemQuestionShape
} from '../../../../src/shared/bots/bot-item-ask'
import { botItemAnswersText } from '../../../../src/shared/bots/bot-item-answer-lines'
import { botItemWaitingAsk } from '../../../../src/shared/bots/bot-item-question-answers'
import type { BotItem, BotItemEvent } from '../../../../src/shared/bots/bot-items'
import type { AskAnswerSelection } from '../../../../src/shared/native-chat/input/questions/native-chat-ask-answer'
import type { AskPrompt } from '../../../../src/shared/native-chat/input/questions/native-chat-ask-types'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { MobileNativeChatAsk } from '../../session/native-chat/input/prompts/MobileNativeChatAsk'
import type { MobileNativeChatCollapsedPrompt } from '../../session/native-chat/input/prompts/MobileNativeChatPromptStrip'

type OpenAsk = { askId: string; shape: BotItemQuestionShape; open: number[] }

/** The waiting ask's lines no comment answered yet; the item's own copy of its question stands in until
 *  its event is read. */
export function botItemOpenAsk(item: BotItem, events: readonly BotItemEvent[]): OpenAsk | null {
  const waiting = botItemWaitingAsk(item, events)
  if (waiting) {
    const open = waiting.answers.flatMap((answer, index) => (answer ? [] : [index]))
    return open.length > 0 ? { askId: waiting.askId, shape: waiting.shape, open } : null
  }
  const { question } = item
  const decisions = question?.decisions
  if (
    item.status !== 'needs_you' ||
    !question ||
    !decisions?.length ||
    events.some((event) => event.id === question.eventId)
  ) {
    return null
  }
  return {
    askId: question.eventId,
    shape: { body: '', decisions },
    open: decisions.map((_, index) => index)
  }
}

function askPrompt({ shape, open }: OpenAsk): AskPrompt {
  return {
    questions: open.map((index) => {
      const decision = shape.decisions[index]!
      return {
        question: decision.question,
        multiSelect: decision.multi === true,
        options: decision.replies.map((reply) => ({
          label: reply.label,
          ...(reply.detail ? { description: reply.detail } : {}),
          ...(reply.recommended ? { recommended: true as const } : {})
        }))
      }
    })
  }
}

/** One comment for the card's answers, each line as a quick reply of its ask writes it, and the open
 *  lines it leaves unanswered. */
function answerOf(
  { shape, open }: OpenAsk,
  selections: readonly AskAnswerSelection[]
): { text: string; skipped: number[] } {
  const answers = shape.decisions.map((): string | null => null)
  selections.forEach((selection, at) => {
    const index = open[at]!
    const labels = selection.indices.map((pick) => shape.decisions[index]!.replies[pick]!.label)
    const words = [...labels, selection.other?.trim() ?? ''].filter(Boolean).join(', ')
    answers[index] = words || null
  })
  return {
    // One question takes the words alone, as a quick reply sends them.
    text: shape.decisions.length > 1 ? botItemAnswersText(shape, answers) : (answers[0] ?? ''),
    skipped: open.filter((index) => !answers[index])
  }
}

export function useMobileBotItemAskSlot({
  ask,
  online,
  send
}: {
  /** Null while nothing waits. */
  ask: OpenAsk | null
  online: boolean
  send: (text: string, answering: { askId: string; skipped: readonly number[] }) => void
}): {
  card: React.JSX.Element | null
  /** Not now, or offline: the strip shows in its place, and the card stays mounted so its picks stay. */
  folded: boolean
  strip: MobileNativeChatCollapsedPrompt | null
} {
  const t = useMobileTranslation()
  const [folded, setFolded] = useState<string | null>(null)
  if (!ask) {
    return { card: null, folded: false, strip: null }
  }
  // One card per ask: a line answered elsewhere leaves it, and the other lines keep their picks.
  const key = ask.askId
  const first = ask.shape.decisions[ask.open[0]!]!
  const fold = (): void => setFolded(key)
  return {
    // Offline it folds too, so the comment box says why; its picks stay for when the host is back.
    folded: folded === key || !online,
    strip: { title: botItemQuestionLine(first.question), expand: () => setFolded(null) },
    card: (
      <MobileNativeChatAsk
        key={key}
        prompt={askPrompt(ask)}
        questionKeys={ask.open.map(String)}
        answerPending={!online}
        onAnswer={async (selections) => {
          const { text, skipped } = answerOf(ask, selections)
          if (!text) {
            return false
          }
          send(text, { askId: key, skipped })
          return true
        }}
        onCancel={async () => {
          fold()
          return true
        }}
        cancelLabel={t('bots.items.ask.notNow', 'Not now')}
        onCollapse={fold}
      />
    )
  }
}
