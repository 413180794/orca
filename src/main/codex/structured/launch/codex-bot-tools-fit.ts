import { withoutCodexMcpConflicts } from '../../../bots/bot-tools-codex'
import type { StructuredAgentSessionLogger } from '../../../native-chat/agent-session-wire/host/structured-agent-session-logger'
import type { CodexAppServerRpc } from '../../app-server/codex-app-server-session'

/**
 * The launch without the bot servers Codex can't add over its own same-named ones, so the chat
 * still starts; the owner's server keeps the name and the bot's tools row says why.
 */
export async function withCodexBotToolsFitted<
  T extends { cwd: string; threadConfig?: Record<string, unknown> }
>(
  connection: Pick<CodexAppServerRpc, 'request'>,
  launch: T,
  log: { logger?: StructuredAgentSessionLogger; sessionId: string }
): Promise<T> {
  if (!launch.threadConfig) {
    return launch
  }
  const { threadConfig, leftOut } = await withoutCodexMcpConflicts(
    connection,
    launch.cwd,
    launch.threadConfig
  )
  if (leftOut.length === 0) {
    return launch
  }
  log.logger?.warn('codex config has its own server under a bot tool name; the tool is left out', {
    scope: 'botTools.codex',
    sessionId: log.sessionId,
    names: leftOut
  })
  return { ...launch, threadConfig }
}
