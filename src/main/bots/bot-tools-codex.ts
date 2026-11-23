// A Codex bot's own tools reach its threads as thread config, so they need no folder trust, and a
// thread started anywhere else never sees them.
import type { BotLaunchTools } from './bot-launch-tools'
import type { BotToolsCli } from './bot-tools-host'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { BotFailureError, botFailure, botFailureEnglish } from '../../shared/bots/bot-failure-copy'
import type { BotToolProblem, BotToolServer } from '../../shared/bot-tools'
import { isPlainObject } from '../agent-hooks/installation/configuration/hooks-json-read'
import type { CodexAppServerRpc } from '../codex/app-server/codex-app-server-session'
import { readMcpServerTomlOwnership } from '../codex/configuration/toml/config-toml-mcp-servers'

/** A bot url server that Codex would merge into the owner's stdio server of the same name. */
export function isTakenByCodexStdio(
  server: BotToolServer,
  ownerStdioNames: readonly string[]
): boolean {
  return 'url' in server && ownerStdioNames.includes(server.name)
}

/**
 * The servers as a thread's config: dotted keys add to the owner's servers instead of replacing them.
 * Codex merges a server into the owner's of the same name, and a url merged into the owner's stdio
 * server stops every thread from starting, so such a server is left out and theirs runs instead.
 */
export function codexBotToolsThreadConfig(
  tools: BotLaunchTools,
  ownerStdioNames: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(
    tools.servers.flatMap((server): [string, unknown][] => {
      if (isTakenByCodexStdio(server, ownerStdioNames)) {
        return []
      }
      const key = `mcp_servers.${server.name}`
      if ('url' in server) {
        const entries: [string, unknown][] = [[`${key}.url`, server.url]]
        if (server.headers) {
          entries.push([`${key}.http_headers`, server.headers])
        }
        return entries
      }
      const entries: [string, unknown][] = [
        [`${key}.command`, server.command],
        [`${key}.args`, server.args]
      ]
      return server.env ? [...entries, [`${key}.env`, server.env]] : entries
    })
  )
}

const StartedThread = z.object({ thread: z.object({ id: z.string() }) })

/**
 * A thread in the bot folder with the bot's own servers, as its turns start one. `leftOut` are the
 * ones Codex's loaded config has under the same name as the other kind, which the thread can't add.
 */
export async function codexThread(
  rpc: Pick<CodexAppServerRpc, 'request'>,
  cli: Pick<BotToolsCli, 'folder'>,
  tools: BotLaunchTools,
  ownerStdioNames: readonly string[]
): Promise<{ threadId: string; leftOut: string[] }> {
  const { threadConfig, leftOut } = await withoutCodexMcpConflicts(
    rpc,
    cli.folder,
    codexBotToolsThreadConfig(tools, ownerStdioNames)
  )
  const started = await rpc.request('thread/start', {
    cwd: cli.folder,
    ephemeral: true,
    config: threadConfig
  })
  const id = StartedThread.safeParse(started).data?.thread.id
  if (!id) {
    throw new BotFailureError('toolCodexNoThread')
  }
  return { threadId: id, leftOut }
}

async function readCodexOwnerServers(
  codexHome: string
): Promise<ReturnType<typeof readMcpServerTomlOwnership>> {
  try {
    return readMcpServerTomlOwnership(await readFile(join(codexHome, 'config.toml'), 'utf8'))
  } catch {
    return readMcpServerTomlOwnership('')
  }
}

/** The owner's own servers in their account's config.toml, which every Codex thread loads. */
export async function readCodexInheritedToolNames(codexHome: string): Promise<string[]> {
  return [...(await readCodexOwnerServers(codexHome)).names]
}

/** The owner's stdio servers in that config.toml, which a bot's url server of the same name breaks. */
export async function readCodexStdioToolNames(codexHome: string): Promise<string[]> {
  return [...(await readCodexOwnerServers(codexHome)).commandNames]
}

/** Each bot url server named like an owner's stdio server: its threads run the owner's server instead. */
export function codexTakenToolProblems(
  servers: readonly BotToolServer[],
  ownerStdioNames: readonly string[]
): Record<string, BotToolProblem> {
  return Object.fromEntries(
    servers
      .filter((server) => isTakenByCodexStdio(server, ownerStdioNames))
      .map(({ name }): [string, BotToolProblem] => [name, codexTakenToolProblem(name)])
  )
}

/** A bot server whose name Codex's own config already runs as the other kind (command or URL). */
export const codexTakenToolProblem = (name: string): BotToolProblem => ({
  kind: 'failed',
  detail: botFailureEnglish(botFailure('toolNameTakenByCodexStdio', { name }))
})

const CONFIG_READ_TIMEOUT_MS = 10_000
/** The key that says how a thread's server runs: a command (stdio) or a URL. */
const SERVER_KIND_KEY = /^mcp_servers\.([^.]+)\.(command|url)$/

function loadedKind(server: unknown): 'command' | 'url' | null {
  if (!isPlainObject(server)) {
    return null
  }
  if (typeof server.command === 'string') {
    return 'command'
  }
  return typeof server.url === 'string' ? 'url' : null
}

/**
 * `threadConfig` without the servers Codex would still refuse, read from Codex itself: every layer
 * it loads at `cwd` (any config.toml form, a project's .codex/config.toml, managed config), which the
 * account config.toml read above can't see. Codex adds a thread's server keys to the server it
 * already has under that name and no thread key removes one, so a URL over a command, or a command
 * over a URL, fails the whole thread ("url is not supported for stdio"). Such a server is left out
 * and the loaded one keeps the name; one of the same kind merges as before. A config that can't be
 * read leaves the thread config as it is.
 */
export async function withoutCodexMcpConflicts(
  rpc: Pick<CodexAppServerRpc, 'request'>,
  cwd: string,
  threadConfig: Record<string, unknown>
): Promise<{ threadConfig: Record<string, unknown>; leftOut: string[] }> {
  const added = new Map<string, string>()
  for (const key of Object.keys(threadConfig)) {
    const match = SERVER_KIND_KEY.exec(key)
    if (match) {
      added.set(match[1], match[2])
    }
  }
  const unchanged = { threadConfig, leftOut: [] }
  if (added.size === 0) {
    return unchanged
  }
  let answer: unknown
  try {
    answer = await rpc.request('config/read', { cwd }, { timeoutMs: CONFIG_READ_TIMEOUT_MS })
  } catch {
    return unchanged
  }
  const config = isPlainObject(answer) ? answer.config : undefined
  const loaded = isPlainObject(config) ? config.mcp_servers : undefined
  if (!isPlainObject(loaded)) {
    return unchanged
  }
  const leftOut = [...added]
    .filter(([name, kind]) => {
      const own = loadedKind(loaded[name])
      return own !== null && own !== kind
    })
    .map(([name]) => name)
  if (leftOut.length === 0) {
    return unchanged
  }
  const prefixes = leftOut.map((name) => `mcp_servers.${name}.`)
  return {
    threadConfig: Object.fromEntries(
      Object.entries(threadConfig).filter(([key]) => !prefixes.some((at) => key.startsWith(at)))
    ),
    leftOut
  }
}

const StatusList = z.object({
  data: z.array(
    z.looseObject({
      name: z.string(),
      runtimeStatus: z.string().optional(),
      toolsError: z.string().nullish()
    })
  )
})

/** What app-server's `mcpServerStatus/list` says is wrong with each of `names`. */
export function codexToolProblems(
  answer: unknown,
  names: readonly string[]
): Map<string, BotToolProblem> {
  const problems = new Map<string, BotToolProblem>(
    names.map((name) => [name, { kind: 'unconfirmed' }])
  )
  for (const server of StatusList.safeParse(answer).data?.data ?? []) {
    if (!names.includes(server.name)) {
      continue
    }
    if (server.runtimeStatus === 'connected') {
      problems.delete(server.name)
    } else if (server.runtimeStatus === 'authenticationRequired') {
      problems.set(server.name, { kind: 'sign-in' })
    } else if (
      server.runtimeStatus === 'failed' ||
      (server.toolsError && server.runtimeStatus !== 'connected')
    ) {
      problems.set(server.name, {
        kind: 'failed',
        ...(server.toolsError ? { detail: server.toolsError.slice(0, 400) } : {})
      })
    }
  }
  return problems
}
